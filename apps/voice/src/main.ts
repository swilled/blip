// Voice window wiring: start gate, typed input, log, earcons, socket, tts.
// The window never matches a confirm phrase; that lives in server code.
import { STT_ENABLED_WHEN_UNFOCUSED } from "./config";
import { applyArmed, applyCleared, applyClose, applyState, createBannerModel, renderBanner } from "./banner";
import { createEarcons } from "./earcons";
import { createHoldClient } from "./hold-client";
import { createSocket, type VoiceSocket } from "./socket";
import { createSpeakBridge } from "./speak-bridge";
import { createVoiceState } from "./state";
import { createStt, type RecognitionLike } from "./stt";
import { createTalkController } from "./talk-controller";
import { createTts, type Synth } from "./tts";
import { appendExchange, clearCaption, renderCaption, setStatus } from "./ui-log";

const CLIENT_VERSION = "0.0.0";
const CAPTION_CLEAR_MS = 1000;

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

function makeSynth(): Synth {
  const ss = window.speechSynthesis;
  return {
    speak(text, handlers) {
      const u = new SpeechSynthesisUtterance(text);
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

// Per-exchange bookkeeping for the log.
let pendingUser = "";
let outstanding = 0;
let replyParts: string[] = [];
let replyInterrupted = false;
let pendingSource: "speech" | "typed" = "typed";
let captionTimer: ReturnType<typeof setTimeout> | null = null;

function renderBannerSlot(): void {
  const slot = document.getElementById("banner-slot");
  if (!slot) throw new Error("missing element #banner-slot");
  renderBanner(slot, bannerModel);
}

const state = createVoiceState((s) => {
  setStatus(s);
  refreshConnection();
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
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onDone: (d) => {
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
    }
  },
  onReplaced: () => {
    replaced = true;
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
      default:
        // Transcript and other informational frames are not rendered in the voice window.
        break;
    }
  },
});

type RecognitionCtor = new () => RecognitionLike;
const RecognitionImpl = ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition) as
  | RecognitionCtor
  | undefined;

const talk = createTalkController({
  socket: {
    sendPtt: (s) => socket?.sendPtt(s),
    sendUtterance: (u) => socket?.sendUtterance(u) ?? null,
  },
  makeStt: (h) =>
    createStt({
      makeRecognition: () => {
        if (!RecognitionImpl) throw new Error("speech recognition unavailable");
        return new RecognitionImpl();
      },
      onInterim: h.onInterim,
      onFinal: h.onFinal,
      onError: h.onError,
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

// Global hold (PTT_DELIVERY B): loopback sidecar next to the hub connection.
createHoldClient({
  makeWebSocket: (url) => new WebSocket(url) as never,
  onHold: (h) => talk.onHold(h),
  setTimer: (fn, ms) => setTimeout(fn, ms),
});

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
