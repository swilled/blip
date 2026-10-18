// Voice window wiring: start gate, typed input, log, earcons, socket, tts.
// The window never matches a confirm phrase; that lives in server code.
import { applyArmed, applyCleared, applyClose, applyState, createBannerModel, renderBanner } from "./banner";
import { createEarcons } from "./earcons";
import { createHoldClient } from "./hold-client";
import { createHoldOwner } from "./hold-owner";
import {
  createOutputModeController,
  statusAriaLive,
  type VoiceOutputMode,
} from "./output-mode";
import { createSocket, type VoiceSocket } from "./socket";
import { createSpeakBridge } from "./speak-bridge";
import { createSpeechRate, createRateCommandController, parseSpeechRateCommand } from "./speech-rate";
import { createVoiceState } from "./state";
import { createRecordedStt, createLocalTranscriber, openPcmMicrophone } from "./recorded-stt";
import { createTalkController } from "./talk-controller";
import { checkMicrophone, createSpeechDiagnostics } from "./speech-diagnostics";
import { createTts } from "./tts";
import { createNativeSynth } from "./native-synth";
import { microphoneConstraints, microphoneLevelHint } from "./microphone";
import { appendExchange, clearCaption, renderCaption, setStatus } from "./ui-log";

const CLIENT_VERSION = "0.0.0";
const CAPTION_CLEAR_MS = 1000;
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
    () => navigator.mediaDevices.getUserMedia(selectedMicrophoneConstraints()),
    microphoneCheckOwner.signal,
  );
  button.disabled = false;
  await refreshMicrophones();
});

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

const nativeSynth = createNativeSynth({ synthesis: window.speechSynthesis, makeUtterance: text => new SpeechSynthesisUtterance(text), record: recordSpeechEvent, warn: message => { el("output-mode-status").textContent = message; } });
function renderVoices(): void {
  const select = el<HTMLSelectElement>("speech-voice");
  const selected = select.value;
  select.replaceChildren(new Option("Automatic local English voice", ""), ...nativeSynth.getVoices().map(voice => new Option(`${voice.name}${voice.localService ? " (local)" : ""}`, voice.voiceURI)));
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}
renderVoices();
window.speechSynthesis.addEventListener("voiceschanged", renderVoices);
el<HTMLSelectElement>("speech-voice").addEventListener("change", event => { nativeSynth.setVoice((event.target as HTMLSelectElement).value || null); el("output-mode-status").textContent = "The selected voice will read the next reply."; });
function selectedMicrophoneConstraints(): MediaStreamConstraints {
  return microphoneConstraints(el<HTMLSelectElement>("microphone-device").value, el<HTMLInputElement>("microphone-filter").checked);
}
async function refreshMicrophones(): Promise<void> {
  try {
    const select = el<HTMLSelectElement>("microphone-device"), selected = select.value;
    const microphones = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput");
    select.replaceChildren(new Option("Windows default microphone", ""), ...microphones.filter(device => device.deviceId !== "default").map((device, index) => new Option(device.label || `Microphone ${index + 1}`, device.deviceId)));
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  } catch { /* Device access can be granted using Check microphone. */ }
}
void refreshMicrophones();
navigator.mediaDevices.addEventListener("devicechange", refreshMicrophones);

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
  localFiller: false,
  synth: nativeSynth,
  onFailure: message => { el("output-mode-status").textContent = message; },
  getRate: () => speechRate,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onDone: (d) => {
    bridge.onTtsDone(d); // sends speak.done for defined speakIds only
    if (d.speakId === undefined) return;
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

const rateCommands = createRateCommandController({
  changed: (rate, acknowledgement) => {
    speechRate = rate;
    el<HTMLOutputElement>("speech-rate-value").value = `${rate.toFixed(2)}×`;
    el("output-mode-status").textContent = acknowledgement;
  },
  acknowledge: announceRateAcknowledgement,
});

function handleLocalRateUtterance(text: string): boolean {
  const direction = parseSpeechRateCommand(text);
  if (!direction) return false;
  state.noTranscript();
  rateCommands.adjust(direction);
  return true;
}

function announceRateAcknowledgement(acknowledgement: string): void {
  el("output-mode-status").textContent = acknowledgement;
  socket?.sendSettings(outputMode.getMode(), speechRate);
}

document.querySelectorAll<HTMLButtonElement>("[data-speech-rate]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.speechRate;
    if (direction !== "faster" && direction !== "slower") return;
    rateCommands.adjust(direction);
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="output-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    outputMode.select(radio.value as VoiceOutputMode);
  });
});

talk = createTalkController({
  socket: {
    sendPtt: (s) => socket?.sendPtt(s),
    sendUtterance: (u) => socket?.sendUtterance(u) ?? null,
  },
  handleLocalUtterance: handleLocalRateUtterance,
  makeStt: (h) =>
    createRecordedStt({
      open: async signal => {
        ++nativeRecognitionId;
        recordSpeechEvent({ event: "capture-request", generation: nativeRecognitionId, focused: document.hasFocus(), visible: document.visibilityState === "visible" });
        const recording = await openPcmMicrophone(signal, { constraints: selectedMicrophoneConstraints(), onLevel: level => {
          el<HTMLMeterElement>("microphone-level").value = Math.min(1, level.rms * 5);
          el("microphone-level-hint").textContent = microphoneLevelHint(level.rms, level.peak);
        } });
        recordSpeechEvent({ event: "audiostart", generation: nativeRecognitionId });
        return recording;
      },
      transcribe: createLocalTranscriber(),
      onCapture: summary => {
        recordSpeechEvent({ event: "capture-summary", generation: nativeRecognitionId, ...summary });
        el("microphone-capture-summary").textContent = `Recorded ${summary.durationSeconds.toFixed(1)} seconds. ${microphoneLevelHint(summary.rms, summary.peak)}`;
      },
      onFinal: final => { recordSpeechEvent({ event: "result", generation: nativeRecognitionId, results: 1 }); h.onFinal(final); },
      onError: error => { recordSpeechEvent({ event: "error", generation: nativeRecognitionId, code: error.kind }); h.onError(error); },
      onStage: h.onStage,
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

const holdOwner = createHoldOwner((s, reason) => {
  if (s === "start" && captionTimer) { clearTimeout(captionTimer); captionTimer = null; }
  if (s === "end") recordSpeechEvent({ event: "release", generation: nativeRecognitionId });
  talk.onHold(s, reason);
});
const holdButton = el<HTMLButtonElement>("hold-to-talk");
for (const id of ["microphone-device", "microphone-filter"]) el(id).addEventListener("change", () => {
  holdOwner.cancel(); talk.cancelCapture();
  el("microphone-level-hint").textContent = "Microphone changed. Start a fresh hold.";
});
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
window.addEventListener("pagehide", () => { rateCommands.cancel(); holdOwner.cancel(); holdWire.close(); talk.cancelCapture(); tts.cancel(); nativeSynth.dispose(); window.speechSynthesis.removeEventListener("voiceschanged", renderVoices); navigator.mediaDevices.removeEventListener("devicechange", refreshMicrophones); });

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
