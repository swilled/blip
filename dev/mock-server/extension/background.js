// Dev-only MV3 bridge. It is loaded only by the isolated demo Chrome profile and connects only to
// the loopback mock server. Page actions are delegated to content.js; clicks always fail closed.
const SERVER_URL = "ws://127.0.0.1:7777/ws";
const FORM_URL = "http://127.0.0.1:7777/fixtures/forms/broken.html";
const PING_MS = 20_000;
let socket = null;
let reconnectTimer = null;
let pingTimer = null;
let retryMs = 500;
let activeFormTabId = null;

function frame(type, payload, replyTo) {
  return {
    v: 1,
    id: crypto.randomUUID(),
    type,
    ...(replyTo ? { replyTo } : {}),
    ts: Date.now(),
    payload,
  };
}

function send(type, payload, replyTo) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame(type, payload, replyTo)));
  return true;
}

function openSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  socket = new WebSocket(SERVER_URL);
  socket.addEventListener("open", () => {
    retryMs = 500;
    send("hello", { role: "extension", clientVersion: "blip-local-form-bridge", protocolVersion: 1 });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send("ping", {}), PING_MS);
    if (activeFormTabId !== null) notifyTab(activeFormTabId, "tab-activated");
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type === "snapshot.request") void answerSnapshot(message);
    else if (message?.type === "act.request") void answerAct(message);
  });
  socket.addEventListener("close", scheduleReconnect);
  socket.addEventListener("error", () => socket?.close());
}

function scheduleReconnect() {
  clearInterval(pingTimer);
  if (reconnectTimer !== null) return;
  const wait = retryMs;
  retryMs = Math.min(10_000, retryMs * 2);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, wait);
}

function sendPageChanged(tabId, url, reason, structuralHash) {
  if (!url?.startsWith(FORM_URL)) return;
  send("page.changed", {
    tabId,
    url,
    reason,
    ...(structuralHash ? { structuralHash } : {}),
  });
}

function notifyTab(tabId, reason) {
  chrome.tabs.sendMessage(tabId, { kind: "blip.page-status" }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError) sendPageChanged(tabId, tab.url, reason, response.structuralHash);
    });
  });
}

async function targetTab(requestedTabId) {
  const id = Number.isInteger(requestedTabId) ? requestedTabId : activeFormTabId;
  if (id !== null) {
    try {
      const tab = await chrome.tabs.get(id);
      if (tab.url?.startsWith(FORM_URL)) return tab;
    } catch { /* the tab may have closed */ }
  }
  const tabs = await chrome.tabs.query({ url: FORM_URL });
  const tab = tabs.find((candidate) => candidate.id === activeFormTabId) ?? tabs.at(-1);
  if (tab?.id !== undefined) activeFormTabId = tab.id;
  return tab;
}

async function answerSnapshot(request) {
  const tab = await targetTab(request.payload?.tabId);
  if (!tab?.id) {
    send("snapshot.result", {
      ok: false,
      error: { code: "no-form-tab", message: "Open the local demo form in Chrome first." },
    }, request.id);
    return;
  }
  activeFormTabId = tab.id;
  chrome.tabs.sendMessage(tab.id, { kind: "blip.snapshot", tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError || !response?.snapshot) {
      send("snapshot.result", {
        ok: false,
        error: { code: "page-unavailable", message: "The local form page is not ready." },
      }, request.id);
      return;
    }
    send("snapshot.result", { ok: true, snapshot: response.snapshot }, request.id);
  });
}

async function answerAct(request) {
  const tab = await targetTab(request.payload?.tabId);
  if (!tab?.id) {
    send("act.result", { actId: request.payload.actId, ok: false, error: "target-not-found" }, request.id);
    return;
  }
  chrome.tabs.sendMessage(tab.id, { kind: "blip.act", request: request.payload }, (response) => {
    if (chrome.runtime.lastError || !response?.result) {
      send("act.result", { actId: request.payload.actId, ok: false, error: "exception" }, request.id);
      return;
    }
    send("act.result", response.result, request.id);
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.kind === "blip.page-ready" || message?.kind === "blip.page-changed") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId) || !sender.tab?.url?.startsWith(FORM_URL)) return;
    activeFormTabId = tabId;
    sendPageChanged(
      tabId,
      sender.tab.url,
      message.kind === "blip.page-ready" ? "navigation" : (message.reason || "mutation"),
      message.structuralHash,
    );
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === "complete" || changeInfo.url) && tab.url?.startsWith(FORM_URL)) {
    activeFormTabId = tabId;
    notifyTab(tabId, "navigation");
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url?.startsWith(FORM_URL)) return;
    activeFormTabId = tabId;
    notifyTab(tabId, "tab-activated");
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeFormTabId === tabId) activeFormTabId = null;
});

chrome.tabs.query({ url: FORM_URL }, (tabs) => {
  const tab = tabs.find((candidate) => candidate.active) ?? tabs.at(-1);
  if (tab?.id !== undefined) {
    activeFormTabId = tab.id;
    notifyTab(tab.id, "tab-activated");
  }
});

openSocket();
