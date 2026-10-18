import { ConfirmationReducer, INJECTION_WARNING, makeFrame, SpeechTracker, WarningGate } from "./voice-core.js";

const $ = (id) => document.getElementById(id);
const connection = $("connection");
const pageSummary = $("page-summary");
const pageMark = document.querySelector(".state-mark");
const warning = $("warning");
const warningStatus = $("warning-status");
const confirmation = $("confirmation");
const confirmPhrase = $("confirm-phrase");
const heard = $("heard");
const reply = $("reply");
const form = $("utterance-form");
const input = $("utterance");
const sendButton = $("send");
const talkButton = $("talk");
const enableAudioButton = $("enable-audio");
const stopButton = $("stop");
const repeatButton = $("repeat");

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${wsProtocol}//${location.host}/ws`);
const warningGate = new WarningGate();
const confirmationReducer = new ConfirmationReducer();
const speechTracker = new SpeechTracker(({ speakId, interrupted }) => {
  send("speak.done", { speakId, interrupted });
});

let connected = false;
let hasReceivedState = false;
let warningPending = false;
let warningRequired = false;
let audioEnabled = false;
let recognition = null;
let utteranceNumber = 0;

function setInputLocked(locked) {
  const disabled = !connected || !hasReceivedState || locked;
  input.disabled = disabled;
  sendButton.disabled = disabled;
  talkButton.disabled = disabled || recognition === null;
  stopButton.disabled = disabled;
  repeatButton.disabled = disabled;
  form.setAttribute("aria-busy", locked ? "true" : "false");
}

function send(type, payload) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(makeFrame(type, payload)));
  return true;
}

function renderState(state) {
  hasReceivedState = true;
  const page = state.page;
  const attached = page !== null && state.extensionConnected;
  pageMark.dataset.ready = attached ? "true" : "false";
  pageSummary.textContent = attached
    ? `${page.fieldCount} fields on the current page${page.requiredEmpty > 0 ? ` · ${page.requiredEmpty} required empty` : ""}`
    : state.extensionConnected ? "Connected · waiting for a page" : "Waiting for the browser extension";

  if (warningGate.update(state)) {
    warningRequired = true;
    warningPending = true;
    warning.hidden = false;
    warningStatus.textContent = "Speaking the warning before accepting commands…";
    setInputLocked(true);
    queueSpeech(INJECTION_WARNING, null, { warning: true });
  } else if (warningRequired && page?.untrustedInstructionDetected !== false) {
    // Missing page metadata is not evidence that a previously detected warning cleared.
    warning.hidden = false;
    setInputLocked(warningPending || state.busy === true);
  } else if (page?.untrustedInstructionDetected !== true) {
    warningRequired = false;
    warning.hidden = true;
    warningPending = false;
    if (currentSpeech?.warning === true) cancelCurrent(true);
    const staleWarning = speechQueue.filter((item) => item.warning);
    speechQueue = speechQueue.filter((item) => !item.warning);
    for (const item of staleWarning) finishSpeech(item, true);
    setInputLocked(state.busy === true);
  }
}

let speechQueue = [];
let currentSpeech = null;
let currentUtterance = null;

function finishSpeech(item, interrupted) {
  if (item.serverSpeakId !== null) speechTracker.complete(item.serverSpeakId, interrupted);
  if (item.warning) {
    if (!interrupted) {
      warningPending = false;
      warningStatus.textContent = "Warning heard. Commands are enabled.";
      setInputLocked(false);
      input.focus();
    } else if (warningRequired) {
      warningStatus.textContent = "Warning speech was interrupted. Commands remain blocked.";
      setInputLocked(true);
    }
  }
}

function cancelCurrent(interrupted = true) {
  if (currentSpeech === null) return;
  const item = currentSpeech;
  currentSpeech = null;
  currentUtterance = null;
  window.speechSynthesis.cancel();
  finishSpeech(item, interrupted);
}

function queueSpeech(text, serverSpeakId, options = {}) {
  if (typeof text !== "string") return;
  const item = { text, serverSpeakId, warning: options.warning === true };
  reply.textContent = text;
  if (options.interrupt === true) {
    cancelCurrent(true);
    for (const queued of speechQueue) finishSpeech(queued, true);
    speechQueue = [];
  }
  speechQueue.push(item);
  startNextSpeech();
}

function startNextSpeech() {
  if (!audioEnabled || currentSpeech !== null || speechQueue.length === 0) return;
  const item = speechQueue.shift();
  if (item === undefined) return;
  if (typeof window.speechSynthesis === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") {
    finishSpeech(item, true);
    if (item.warning) warningStatus.textContent = "Speech is unavailable. Commands remain blocked.";
    return;
  }
  const spoken = new SpeechSynthesisUtterance(item.text);
  currentSpeech = item;
  currentUtterance = spoken;
  if (item.serverSpeakId !== null) speechTracker.start(item.serverSpeakId);
  spoken.onend = () => {
    if (currentSpeech !== item) return;
    currentSpeech = null;
    currentUtterance = null;
    finishSpeech(item, false);
    startNextSpeech();
  };
  spoken.onerror = () => {
    if (currentSpeech !== item) return;
    currentSpeech = null;
    currentUtterance = null;
    finishSpeech(item, true);
    startNextSpeech();
  };
  try {
    window.speechSynthesis.speak(spoken);
  } catch {
    currentSpeech = null;
    currentUtterance = null;
    finishSpeech(item, true);
    if (item.warning) warningStatus.textContent = "Speech could not start. Commands remain blocked.";
    startNextSpeech();
  }
}

function sendUtterance(text, source = "typed", confidence) {
  const trimmed = text.trim();
  if (!connected || warningPending || confirmationReducer.pending?.redeeming === true || trimmed.length === 0 || trimmed.length > 500) return false;
  utteranceNumber += 1;
  const utteranceId = `voice-${crypto.randomUUID()}-${utteranceNumber}`;
  const redemption = confirmationReducer.redeem(trimmed, utteranceId);
  if (redemption !== null) {
    heard.textContent = "Confirmation sent";
    const sent = send("confirm.redeem", redemption);
    if (!sent) confirmationReducer.reset();
    return sent;
  }
  const payload = {
    utteranceId,
    text: trimmed,
    source,
    ...(typeof confidence === "number" && Number.isFinite(confidence) ? { sttConfidence: Math.max(0, Math.min(1, confidence)) } : {}),
  };
  heard.textContent = source === "voice" ? "Voice request sent" : trimmed;
  return send("utterance", payload);
}

function setupRecognition() {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (typeof Recognition !== "function") {
    talkButton.disabled = true;
    talkButton.title = "Speech recognition is not available in this browser; type a command instead.";
    return;
  }
  recognition = new Recognition();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const result = event.results?.[0]?.[0];
    if (result && typeof result.transcript === "string") sendUtterance(result.transcript, "voice", result.confidence);
  };
  recognition.onerror = () => {
    talkButton.dataset.listening = "false";
    talkButton.textContent = "Hold to talk";
    send("ptt", { state: "end" });
  };
  recognition.onend = () => {
    talkButton.dataset.listening = "false";
    talkButton.textContent = "Hold to talk";
    send("ptt", { state: "end" });
  };
  talkButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!connected || warningPending) return;
    talkButton.dataset.listening = "true";
    talkButton.textContent = "Listening… release to send";
    send("ptt", { state: "start" });
    try { recognition.start(); } catch { /* A duplicate start is ignored; onend restores the control. */ }
  });
  const stopListening = () => {
    if (talkButton.dataset.listening !== "true") return;
    try { recognition.stop(); } catch { /* Recognition may already have ended. */ }
  };
  talkButton.addEventListener("pointerup", stopListening);
  talkButton.addEventListener("pointerleave", stopListening);
  talkButton.addEventListener("pointercancel", stopListening);
}

setupRecognition();
setInputLocked(true);

enableAudioButton.addEventListener("click", () => {
  audioEnabled = true;
  try { window.speechSynthesis?.resume(); } catch { /* TTS errors keep gated actions unconfirmed. */ }
  enableAudioButton.textContent = "Voice enabled";
  enableAudioButton.disabled = true;
  startNextSpeech();
});

socket.addEventListener("open", () => {
  send("hello", { role: "voice", clientVersion: "local-voice-ui", protocolVersion: 1 });
});

socket.addEventListener("message", (event) => {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (!message || message.v !== 1 || typeof message.type !== "string" || !message.payload) return;
  switch (message.type) {
    case "welcome":
      connected = true;
      connection.textContent = `Connected · ${message.payload.brain} brain`;
      connection.dataset.connected = "true";
      setInputLocked(warningPending);
      break;
    case "state":
      renderState(message.payload);
      break;
    case "speak":
      queueSpeech(message.payload.text, message.payload.speakId, { interrupt: message.payload.interrupt });
      break;
    case "transcript":
      heard.textContent = message.payload.heardAs;
      break;
    case "confirm.armed":
      confirmationReducer.arm(message.payload);
      confirmPhrase.textContent = message.payload.phrase;
      confirmation.hidden = false;
      break;
    case "confirm.cleared":
      if (confirmationReducer.clear(message.payload)) confirmation.hidden = true;
      break;
    case "error":
      reply.textContent = message.payload.message;
      break;
  }
});

socket.addEventListener("close", () => {
  connected = false;
  hasReceivedState = false;
  confirmationReducer.reset();
  confirmation.hidden = true;
  connection.textContent = "Disconnected · restart the local demo";
  connection.dataset.connected = "false";
  setInputLocked(true);
  cancelCurrent(true);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (sendUtterance(input.value)) input.value = "";
});

stopButton.addEventListener("click", () => send("control", { cmd: "stop" }));
repeatButton.addEventListener("click", () => send("control", { cmd: "repeat" }));
