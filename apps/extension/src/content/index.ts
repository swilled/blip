type BlipContentGlobal = typeof globalThis & { __blipContentShellInstalled?: boolean };

const isolatedWorld = globalThis as BlipContentGlobal;
if (isolatedWorld.__blipContentShellInstalled !== true) {
  isolatedWorld.__blipContentShellInstalled = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || typeof message !== "object" || message === null) return;
    if (!("type" in message) || message.type !== "blip.ping") return;
    sendResponse({ ok: true });
  });
}
