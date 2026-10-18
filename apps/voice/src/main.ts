// Voice window wiring: start gate, typed input, log, earcons, socket, tts.
// The window never matches a confirm phrase; that lives in server code.
import { STT_ENABLED_WHEN_UNFOCUSED } from "./config";
import { applyArmed, applyCleared, applyClose, applyState, createBannerModel, renderBanner } from "./banner";
import { createEarcons } from "./earcons";
import { createHoldClient } from "./hold-client";
import { createHoldOwner } from "./hold-owner";
import {
  createOutputModeController,
  shouldSpeakLocalAcknowledgement,
  statusAriaLive,
  type VoiceOutputMode,
} from "./output-mode";
import { createSocket, type VoiceSocket } from "./socket";
import { createSpeakBridge } from "./speak-bridge";
import { adjustSpeechRate, createSpeechRate, parseSpeechRateCommand, type SpeechRateDirection } from "./speech-rate";
import { createVoiceState } from "./state";
import { createStt, type RecognitionLike } from "./stt";
import { createTalkController } from "./talk-controller";
import { checkMicrophone, createSpeechDiagnostics, observeRecognition } from "./speech-diagnostics";
import { createTts, type Synth } from "./tts";
import { appendExchange, clearCaption, renderCaption, setStatus } from "./ui-log";

const CLIENT_VERSION = "0.0.0";
const CAPTION_CLEAR_MS = 1000;
const LOCAL_RATE_ACK_ID = "local-speech-rate-ack";
declare const __BLIP_BUILD_ID__: string;
const diagnostics = createSpeechDiagnostics();
let nativeRecognitionId = 0;
const diagnosticDetails = document.getElementById("speech-diagnostics") as HTMLDetailsElement;
diagnosticDetails.addEventListener("toggle", () => {
  diagnostics.enable(diagnosticDetails.open);
  document.getElementById("speech-events")!.textContent = "";
});
function recordSpeechEvent(event: Parameters<typeof diagnostics.record>[0]): void {
  diagnostics.record(event);
  if (diagnosticDetails.open) document.getElementById("speech-events")!.textContent = JSON.stringify(diagnostics.snapshot(), null, 2);
}
document.getElementById("build-identity")!.textContent = `Voice build: ${__BLIP_BUILD_ID__}`;
const microphoneCheckOwner = new AbortController();
window.addEventListener("pagehide", () => microphoneCheckOwner.abort());
document.getElementById("check-microphone")!.addEventListener("click", async () => {
  const button = el<HTMLButtonElement>("check-microphone");
  button.disabled = true;
  el("microphone-check-status").textContent = "Allow microphone access if Chrome asks.";
  el("microphone-check-status").textContent = await checkMicrophone(
    () => navigator.mediaDevices.getUserMedia({ audio: true }),
    microphoneCheckOwner.signal,
  );
  button.disabled = false;
});

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

function makeSynth(): Synth {
  const ss = window.speechSynthesis;
  return {
    speak(text, handlers, rate) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      const voices = ss.getVoices();
      const v = voices.find((x) => x.localService && /^Microsoft/.test(x.name) && x.lang.startsWith("en"));
      if (v) u.voice = v;
      u.onend = () => handlers.onend();
      u.onerror = (ev) => handlers.onerror(ev.error);
      ss.speak(u);
    },
    cancel() {
      ss.cancel();
    },
  };
}

const earcons = createEarcons();
let connectionExtra = "";
let replaced = false;
let socket: VoiceSocket | null = null;
let bannerModel = createBannerModel();
let speechRate = createSpeechRate();
let talk!: ReturnType<typeof createTalkController>;

// Per-exchange bookkeeping for the log.
let pendingUser = "";
let outstanding = 0;
let replyParts: string[] = [];
let replyInterrupted = false;
let pendingSource: "speech" | "typed" = "typed";
let captionTimer: ReturnType<typeof setTimeout> | null = null;

function renderOutputMode(mode: VoiceOutputMode): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="output-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  const statusRegion = document.getElementById("status");
  statusRegion?.setAttribute("aria-live", statusAriaLive(mode));
  const status = document.getElementById("output-mode-status");
  if (status && status.textContent !== "NVDA speech completion is unavailable. Using agent voice.") {
    status.textContent = mode === "agent-voice" ? "Using Blip voice." : "Using NVDA screen reader.";
  }
}

function renderBannerSlot(): void {
  const slot = document.getElementById("banner-slot");
  if (!slot) throw new Error("missing element #banner-slot");
  renderBanner(slot, bannerModel);
}

const state = createVoiceState((s) => {
  setStatus(s);
  refreshConnection();
  renderHoldButton();
});

function refreshConnection(): void {
  const c = el("connection");
  if (replaced) {
    c.textContent = "Another Blip window took over";
    return;
  }
  if (state.get() !== "offline" && connectionExtra) c.textContent = `Connected. ${connectionExtra}`;
}

function commitExchange(): void {
  if (replyParts.length === 0) return;
  appendExchange({
    you: pendingUser,
    blip: replyParts.join(" "),
    source: pendingSource,
    interrupted: replyInterrupted,
  });
  pendingUser = "";
  replyParts = [];
  replyInterrupted = false;
  if (captionTimer) clearTimeout(captionTimer);
  captionTimer = setTimeout(clearCaption, CAPTION_CLEAR_MS);
}

const tts = createTts({
  synth: makeSynth(),
  getRate: () => speechRate,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onDone: (d) => {
    if (d.speakId === LOCAL_RATE_ACK_ID) {
      if (state.get() === "thinking" || state.get() === "speaking") state.speechDone();
      talk.onSpeechEnd();
      return;
    }
    bridge.onTtsDone(d); // sends speak.done for defined speakIds only
    if (d.speakId === undefined) return; // local "One moment." filler
    if (d.interrupted) replyInterrupted = true;
    outstanding = Math.max(0, outstanding - 1);
    if (outstanding === 0) {
      commitExchange();
      if (state.get() === "speaking") state.speechDone(); // a new hold may already own the state
      talk.onSpeechEnd();
    }
  },
});

const bridge = createSpeakBridge({
  tts,
  sendSpeakDone: (p) => socket?.sendSpeakDone(p),
});

socket = createSocket({
  host: location.host,
  makeWebSocket: (url) => new WebSocket(url) as never,
  clientVersion: CLIENT_VERSION,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onOpenClose: (connected) => {
    if (connected) {
      replaced = false;
      state.socketOpened();
    } else {
      connectionExtra = "";
      state.socketClosed();
      bannerModel = applyClose(bannerModel);
      renderBannerSlot();
      // Anything outstanding can never be acknowledged on this connection.
      tts.cancel();
      talk?.cancelCapture();
    }
  },
  onReplaced: () => {
    replaced = true;
    talk?.cancelCapture();
    state.socketClosed();
    bannerModel = applyClose(bannerModel);
    renderBannerSlot();
    setStatus("offline");
    el("status-hint").textContent = "Another Blip window took over.";
    el("connection").textContent = "Another Blip window took over";
  },
  onMessage: (m) => {
    switch (m.type) {
      case "speak": {
        outstanding += 1;
        replyParts.push(m.payload.text);
        state.replyReceived();
        bridge.onSpeak(m.payload);
        talk.onSpeechStart();
        break;
      }
      case "earcon":
        earcons.play(m.payload.name);
        break;
      case "confirm.armed":
        bannerModel = applyArmed(bannerModel, m.payload);
        renderBannerSlot();
        break;
      case "confirm.cleared":
        bannerModel = applyCleared(bannerModel, m.payload);
        renderBannerSlot();
        break;
      case "state": {
        bannerModel = applyState(bannerModel, m.payload);
        renderBannerSlot();
        connectionExtra = m.payload.extensionConnected ? "Browser extension connected." : "Browser extension not connected.";
        if (m.payload.busy && !tts.isSpeaking()) state.messageSent();
        refreshConnection();
        break;
      }
      case "error": {
        if (m.payload.code === "nvda-completion-unavailable") {
          el("status-hint").textContent = m.payload.message;
          outputMode.fallBackToAgentVoice();
          el("output-mode-status").textContent = m.payload.message;
          const screenReader = document.querySelector<HTMLInputElement>('input[name="output-mode"][value="screen-reader"]');
          if (screenReader) screenReader.disabled = true;
        }
        break;
      }
      default:
        // Transcript and other informational frames are not rendered in the voice window.
        break;
    }
  },
});

const outputMode = createOutputModeController({
  cancelCurrentSpeech: () => tts.cancel(),
  sendSettings: (mode) => socket?.sendSettings(mode),
  onModeChange: renderOutputMode,
});

function rateAcknowledgement(direction: SpeechRateDirection): string {
  const result = adjustSpeechRate(speechRate, direction);
  speechRate = result.rate;
  el<HTMLOutputElement>("speech-rate-value").value = `${speechRate.toFixed(1)}×`;
  if (result.limit === "fastest") return "Already at the fastest rate.";
  if (result.limit === "slowest") return "Already at the slowest rate.";
  return `Speech rate is now ${speechRate.toFixed(1)}.`;
}

function handleLocalRateUtterance(text: string): boolean {
  const direction = parseSpeechRateCommand(text);
  if (!direction) return false;
  announceRateAcknowledgement(rateAcknowledgement(direction));
  return true;
}

function announceRateAcknowledgement(acknowledgement: string): void {
  el("output-mode-status").textContent = acknowledgement;
  state.messageSent();
  if (shouldSpeakLocalAcknowledgement(outputMode.getMode())) {
    tts.speak(acknowledgement, { speakId: LOCAL_RATE_ACK_ID });
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-speech-rate]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.speechRate;
    if (direction !== "faster" && direction !== "slower") return;
    announceRateAcknowledgement(rateAcknowledgement(direction));
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="output-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    outputMode.select(radio.value as VoiceOutputMode);
  });
});

type RecognitionCtor = new () => RecognitionLike;
const RecognitionImpl = ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition) as
  | RecognitionCtor
  | undefined;

talk = createTalkController({
  socket: {
    sendPtt: (s) => socket?.sendPtt(s),
    sendUtterance: (u) => socket?.sendUtterance(u) ?? null,
  },
  handleLocalUtterance: handleLocalRateUtterance,
  makeStt: (h) =>
    createStt({
      makeRecognition: () => {
        if (!RecognitionImpl) throw new Error("speech recognition unavailable");
        const recognition = new RecognitionImpl();
        const remove = observeRecognition(recognition as unknown as EventTarget, ++nativeRecognitionId, recordSpeechEvent);
        (recognition as unknown as EventTarget).addEventListener("end", remove, { once: true });
        recordSpeechEvent({ event: "capture-request", generation: nativeRecognitionId, focused: document.hasFocus(), visible: document.visibilityState === "visible" });
        return recognition;
      },
      onInterim: h.onInterim,
      onFinal: h.onFinal,
      onError: h.onError,
      onStage: h.onStage,
      canListen: () => STT_ENABLED_WHEN_UNFOCUSED || document.hasFocus(),
    }),
  tts,
  state,
  earcons,
  caption: { render: renderCaption, clear: clearCaption },
  log: {
    markInterrupted: () => {
      replyInterrupted = true;
    },
    showMessage: (text) => {
      el("status-hint").textContent = text;
    },
    userSaid: (text) => {
      pendingUser = text;
      pendingSource = "speech";
      replyParts = [];
      replyInterrupted = false;
    },
  },
  spokenText: () => replyParts.join(" "),
});

const holdOwner = createHoldOwner((s, reason) => talk.onHold(s, reason));
const holdButton = el<HTMLButtonElement>("hold-to-talk");
function renderHoldButton(): void {
  const owner = holdOwner.get();
  const active = owner !== null;
  holdButton.setAttribute("aria-pressed", String(active));
  const phase = state.get();
  holdButton.textContent = !active ? "Hold to talk" : phase === "starting" ? "Starting microphone…"
    : phase === "recovering" ? "Reconnecting — keep holding"
    : phase === "listening" ? owner === "global" ? "Listening — release both keys to send" : "Listening — release to send"
    : "Release, then try again";
}

function setManualHold(active: boolean, reason?: string): void {
  holdOwner.update("manual", active, reason);
  renderHoldButton();
}

// Global hold (PTT_DELIVERY B): loopback sidecar next to the hub connection.
const holdWire = createHoldClient({
  makeWebSocket: (url) => new WebSocket(url) as never,
  onConnection: connected => {
    el("hold-to-talk-help").textContent = connected
      ? "Hold the button or Right Ctrl + Space. Speak after the cue, then release both keys."
      : "The global shortcut is unavailable. Use Hold to talk, or type a command.";
  },
  onHold: (h, reason) => {
    holdOwner.update("global", h === "start", reason);
    renderHoldButton();
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
});

holdButton.addEventListener("pointerdown", (ev) => {
  if (!ev.isPrimary || ev.button !== 0) return;
  ev.preventDefault();
  holdButton.setPointerCapture(ev.pointerId);
  setManualHold(true);
});
holdButton.addEventListener("pointerup", () => setManualHold(false));
holdButton.addEventListener("pointercancel", () => setManualHold(false, "Recording cancelled. Nothing was sent."));
holdButton.addEventListener("lostpointercapture", () => setManualHold(false, "Recording cancelled. Nothing was sent."));
holdButton.addEventListener("keydown", (ev) => {
  if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) {
    ev.preventDefault();
    setManualHold(true);
  }
});
holdButton.addEventListener("keyup", (ev) => {
  if (ev.key === " " || ev.key === "Enter") {
    ev.preventDefault();
    setManualHold(false);
  }
});
window.addEventListener("blur", () => setManualHold(false, "The Blip window lost focus. Nothing was sent."));
window.addEventListener("pagehide", () => { holdOwner.cancel(); holdWire.close(); talk.cancelCapture(); });

// Typed input.
const input = el<HTMLInputElement>("typed-input");
const form = el<HTMLFormElement>("typed");

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  input.value = "";
  if (!text) return;
  if (handleLocalRateUtterance(text)) return;
  if (normalize(text) === "stop") {
    talk.onStopTyped(); // reports interrupted speak.done per outstanding speak; never sent to the server
    return;
  }
  const id = socket?.sendUtterance({ source: "typed", text });
  if (id === null || id === undefined) return;
  tts.markSent();
  pendingUser = text;
  pendingSource = "typed";
  replyParts = [];
  replyInterrupted = false;
  state.messageSent();
  renderCaption(text, true);
});

input.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") input.value = "";
});

// Start gate: the window's own trusted keydown only. The global Right Ctrl + Space hold
// arrives as a server message (Plan 09), never as a keydown here.
let activated = false;
function activate(): void {
  if (activated) return;
  activated = true;
  talk.activate();
  document.getElementById("start-gate")?.remove();
  el("app").removeAttribute("inert");
  earcons.init();
  input.focus();
}

window.addEventListener("keydown", (ev) => {
  if (activated) return;
  if (!ev.isTrusted || ev.ctrlKey || ev.key !== " ") return;
  ev.preventDefault();
  activate();
});
document.getElementById("start-gate")?.addEventListener("click", (ev) => {
  if (ev.isTrusted) activate();
});
