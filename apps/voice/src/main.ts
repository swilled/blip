// Voice window wiring: start gate, typed input, log, earcons, socket, tts.
// The window never matches a confirm phrase; that lives in server code.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/hanken-grotesk";
import { applyArmed, applyCleared, applyClose, applyState, createBannerModel, renderBanner } from "./banner";
import { createEarcons } from "./earcons";
import { createHoldClient } from "./hold-client";
import { createHoldOwner } from "./hold-owner";
import { createDockClient, type DockEdge } from "./dock-client";
import {
  createOutputModeController,
  statusAriaLive,
  type VoiceOutputMode,
} from "./output-mode";
import { createSocket, type VoiceSocket } from "./socket";
import { createSpeakBridge } from "./speak-bridge";
import { createSpeechRate, createRateCommandController, parseSpeechRateCommand } from "./speech-rate";
import { createVoiceState } from "./state";
import { openPcmMicrophone, summarizePcm } from "./recorded-stt";
import { createMoonshineStt, loadMoonshineTranscriber } from "./moonshine-stt";
import { createTalkController } from "./talk-controller";
import { checkMicrophone, createSpeechDiagnostics } from "./speech-diagnostics";
import { createTts } from "./tts";
import { createNativeSynth } from "./native-synth";
import { createKokoroSynth } from "./kokoro-synth";
import { microphoneConstraints, microphoneLevelHint } from "./microphone";
import { appendExchange, clearCaption, renderCaption, setStatus } from "./ui-log";

const CLIENT_VERSION = "0.0.0";
const CAPTION_CLEAR_MS = 8000;
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
const recognitionTestButton = el<HTMLButtonElement>("test-recognition");
const recognitionTestStatus = el("recognition-test-status");
let voiceStt: ReturnType<typeof createMoonshineStt> | null = null;
let recognitionTest: AbortController | null = null;
window.addEventListener("pagehide", () => recognitionTest?.abort());
recognitionTestButton.addEventListener("click", async () => {
  if (recognitionTest) { recognitionTest.abort(); return; }
  const controller = new AbortController();
  recognitionTest = controller;
  el<HTMLButtonElement>("check-microphone").disabled = true;
  recognitionTestButton.textContent = "Cancel speech test";
  recognitionTestStatus.textContent = "Opening the selected microphone…";
  let recording: Awaited<ReturnType<typeof openPcmMicrophone>> | undefined;
  try {
    const generation = ++nativeRecognitionId;
    recording = await openPcmMicrophone(controller.signal, { constraints: selectedMicrophoneConstraints(), onLevel: level => {
      el<HTMLMeterElement>("microphone-level").value = Math.min(1, level.rms * 5);
      el("microphone-level-hint").textContent = microphoneLevelHint(level.rms, level.peak);
    } });
    if (controller.signal.aborted) return;
    recognitionTestStatus.textContent = 'Listening for five seconds. Say “read the form.” This test will not send a command.';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, 5000);
      const cancel = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (controller.signal.aborted) cancel();
    });
    if (controller.signal.aborted) return;
    const chunks = await recording.stop();
    const summary = summarizePcm(chunks, recording.sampleRate, recording.inputSettings);
    el("microphone-capture-summary").textContent = `Test recorded ${summary.durationSeconds.toFixed(1)} seconds. ${microphoneLevelHint(summary.rms, summary.peak)} ${captureSettingsText(summary.sampleRate, summary.inputSettings)}`;
    recordSpeechEvent({ event: "capture-summary", generation, durationSeconds: summary.durationSeconds, rms: summary.rms, peak: summary.peak,
      inputChannels: summary.inputSettings?.channels, inputSampleRate: summary.inputSettings?.sampleRate, captureSampleRate: summary.sampleRate,
      echoCancellation: summary.inputSettings?.echoCancellation, noiseSuppression: summary.inputSettings?.noiseSuppression, autoGainControl: summary.inputSettings?.autoGainControl });
    recording = undefined;
    recognitionTestStatus.textContent = "Transcribing locally… no command will be sent.";
    const text = await voiceStt?.transcribeRecorded(chunks, summary.sampleRate);
    if (!controller.signal.aborted) recognitionTestStatus.textContent = text
      ? `Local test heard: “${text}”. No command was sent.`
      : "The microphone recorded, but Moonshine heard no words. No command was sent.";
  } catch (error) {
    if (controller.signal.aborted) recognitionTestStatus.textContent = "Speech test cancelled. No command was sent.";
    else {
      const name = error instanceof Error ? error.name : "";
      recognitionTestStatus.textContent = name === "NotAllowedError"
        ? "Microphone access is blocked. Allow it for this Blip window, then retry."
        : name === "NotFoundError" ? "No microphone was found. Choose a connected microphone, then retry."
        : "The local speech test failed. Check the microphone status and restart Blip if local recognition is unavailable.";
    }
  } finally {
    recording?.cancel();
    if (recognitionTest === controller) recognitionTest = null;
    el<HTMLButtonElement>("check-microphone").disabled = false;
    recognitionTestButton.textContent = "Test speech recognition (5 seconds)";
  }
});

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

const nativeSynth = createNativeSynth({ synthesis: window.speechSynthesis, makeUtterance: text => new SpeechSynthesisUtterance(text), record: recordSpeechEvent, warn: message => { el("output-mode-status").textContent = message; } });
const speechSynth = createKokoroSynth({
  native: nativeSynth,
  onStatus: message => { el("output-mode-status").textContent = message; },
});
function renderVoices(): void {
  const select = el<HTMLSelectElement>("speech-voice");
  const selected = select.value || "kokoro:af_heart";
  select.replaceChildren(
    new Option("Female — Kokoro Heart (American)", "kokoro:af_heart"),
    new Option("Male — Kokoro Michael (American)", "kokoro:am_michael"),
  );
  select.value = [...select.options].some(option => option.value === selected) ? selected : "kokoro:af_heart";
  speechSynth.setVoice(select.value);
}
renderVoices();
window.speechSynthesis.addEventListener("voiceschanged", renderVoices);
el<HTMLSelectElement>("speech-voice").addEventListener("change", event => { speechSynth.setVoice((event.target as HTMLSelectElement).value); el("output-mode-status").textContent = "The selected voice will read the next reply."; });
function selectedMicrophoneConstraints(): MediaStreamConstraints {
  return microphoneConstraints(el<HTMLSelectElement>("microphone-device").value, el<HTMLInputElement>("microphone-echo-cancel").checked, el<HTMLInputElement>("microphone-auto-gain").checked, el<HTMLInputElement>("microphone-noise-suppress").checked);
}
function captureSettingsText(sampleRate: number, settings: import("./microphone").MicrophoneInputSettings | undefined): string {
  const channelText = settings?.channels === undefined ? "channel count unknown" : `${settings.channels} input channel${settings.channels === 1 ? "" : "s"} (mixed to mono)`;
  const inputRate = settings?.sampleRate === undefined ? "input rate unknown" : `${Math.round(settings.sampleRate / 100) / 10} kHz input`;
  const flag = (name: string, value: boolean | string | undefined) => `${name} ${value === undefined ? "unknown" : typeof value === "boolean" ? value ? "on" : "off" : value}`;
  return `${channelText}; ${inputRate} → ${Math.round(sampleRate / 100) / 10} kHz for recognition; ${flag("echo cancellation", settings?.echoCancellation)}, ${flag("noise suppression", settings?.noiseSuppression)}, ${flag("auto gain", settings?.autoGainControl)}`;
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
  synth: speechSynth,
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
  makeStt: (h) => {
    const stt = createMoonshineStt({
      loadTranscriber: onProgress => loadMoonshineTranscriber(onProgress),
      open: async (signal, onSamples) => {
        ++nativeRecognitionId;
        recordSpeechEvent({ event: "capture-request", generation: nativeRecognitionId, focused: document.hasFocus(), visible: document.visibilityState === "visible" });
        const recording = await openPcmMicrophone(signal, { constraints: selectedMicrophoneConstraints(), onSamples, onLevel: level => {
          el<HTMLMeterElement>("microphone-level").value = Math.min(1, level.rms * 5);
          el("microphone-level-hint").textContent = microphoneLevelHint(level.rms, level.peak);
        } });
        recordSpeechEvent({ event: "audiostart", generation: nativeRecognitionId });
        return recording;
      },
      summarize: summarizePcm,
      onProgress: (fraction, file) => {
        const percent = fraction === undefined ? "" : ` ${Math.round(fraction * 100)}%`;
        el("speech-recognition-status").textContent = `Preparing the on-device speech model${percent} (${file}).`;
      },
      onReady: () => { el("speech-recognition-status").textContent = "On-device Moonshine English recognition is ready. Speech stays on this device."; },
      onLoadError: error => { el("speech-recognition-status").textContent = `The speech model could not load: ${error.message.slice(0, 180)}. Check the connection once, then reload Blip; audio is never uploaded.`; },
      onCapture: summary => {
        recordSpeechEvent({ event: "capture-summary", generation: nativeRecognitionId, durationSeconds: summary.durationSeconds, rms: summary.rms, peak: summary.peak,
          inputChannels: summary.inputSettings?.channels, inputSampleRate: summary.inputSettings?.sampleRate, captureSampleRate: summary.sampleRate,
          echoCancellation: summary.inputSettings?.echoCancellation, noiseSuppression: summary.inputSettings?.noiseSuppression, autoGainControl: summary.inputSettings?.autoGainControl });
        el("microphone-capture-summary").textContent = `Recorded ${summary.durationSeconds.toFixed(1)} seconds. ${microphoneLevelHint(summary.rms, summary.peak)} ${captureSettingsText(summary.sampleRate, summary.inputSettings)}`;
      },
      onFinal: final => { recordSpeechEvent({ event: "result", generation: nativeRecognitionId, results: 1 }); h.onFinal(final); },
      onError: error => { recordSpeechEvent({ event: "error", generation: nativeRecognitionId, code: error.kind }); h.onError(error); },
      onStage: h.onStage,
      onInterim: h.onInterim,
    });
    voiceStt = stt;
    void stt.warmup().catch(() => {});
    return stt;
  },
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
for (const id of ["microphone-device", "microphone-echo-cancel", "microphone-noise-suppress", "microphone-auto-gain"]) el(id).addEventListener("change", () => {
  recognitionTest?.abort();
  holdOwner.cancel(); talk.cancelCapture();
  el("microphone-level-hint").textContent = "Microphone settings changed. Start a fresh hold.";
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
  if (active) recognitionTest?.abort();
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
    if (h === "start") recognitionTest?.abort();
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
window.addEventListener("pagehide", () => { rateCommands.cancel(); holdOwner.cancel(); holdWire.close(); talk.cancelCapture(); voiceStt?.close(); tts.cancel(); speechSynth.dispose(); window.speechSynthesis.removeEventListener("voiceschanged", renderVoices); navigator.mediaDevices.removeEventListener("devicechange", refreshMicrophones); });

// ---------- Layout and docking (Design D) ----------

const app = el("app");
const PILL_MAX_HEIGHT = 140;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// The window shape picks the layout: a short window is the strip or the drag puck.
function applyLayout(): void {
  const next = window.innerHeight <= PILL_MAX_HEIGHT ? "pill" : "sidebar";
  if (app.dataset.layout === next) return;
  const swap = () => { app.dataset.layout = next; };
  if (app.dataset.layout && document.startViewTransition && !reducedMotion.matches) document.startViewTransition(swap);
  else swap();
}
applyLayout();
window.addEventListener("resize", applyLayout);

const DOCK_LABEL: Record<DockEdge, string> = { left: "left", right: "right", top: "top strip" };
const DOCK_FILL: Record<DockEdge, [number, number, number, number]> = { left: [3, 5, 6, 14], right: [15, 5, 6, 14], top: [3, 5, 18, 5] };
const dockButton = el<HTMLButtonElement>("dock-button");
const dockOptions = el("dock-options");
const grip = el<HTMLButtonElement>("dock-grip");
const dragHint = el("drag-hint");
let dockEdge: DockEdge = "right";
let dragging = false;

function readSavedDock(): DockEdge {
  try {
    const saved = localStorage.getItem("blip.dock");
    return saved === "left" || saved === "top" ? saved : "right";
  } catch {
    return "right";
  }
}

function renderDock(edge: DockEdge): void {
  dockEdge = edge;
  try { localStorage.setItem("blip.dock", edge); } catch { /* per-window convenience only */ }
  dockButton.setAttribute("aria-label", `Dock Blip: ${DOCK_LABEL[edge]}. Change`);
  const [x, y, w, h] = DOCK_FILL[edge];
  const fill = dockButton.querySelector(".dock-fill")!;
  fill.setAttribute("x", String(x)); fill.setAttribute("y", String(y));
  fill.setAttribute("width", String(w)); fill.setAttribute("height", String(h));
  for (const b of dockOptions.querySelectorAll<HTMLButtonElement>("[data-dock]")) b.setAttribute("aria-pressed", String(b.dataset.dock === edge));
}

function setDockOptionsOpen(open: boolean): void {
  dockOptions.hidden = !open;
  dockButton.setAttribute("aria-expanded", String(open));
  if (open) {
    el<HTMLDetailsElement>("settings").open = false;
    dockOptions.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }
}

function setDockAvailable(available: boolean): void {
  grip.disabled = !available;
  dockButton.disabled = !available;
  dockButton.title = available ? "" : "Docking needs the Blip server on Windows";
  if (!available) { setDockOptionsOpen(false); endDrag("cancel"); }
}
setDockAvailable(false);

function setZone(zone: DockEdge | null): void {
  if (zone) app.dataset.zone = zone;
  else delete app.dataset.zone;
  dragHint.textContent = zone ? `Let go to dock ${DOCK_LABEL[zone]}` : "Drop on an edge. Esc cancels.";
}

function endDrag(phase: "end" | "cancel"): void {
  if (!dragging) return;
  dragging = false;
  delete app.dataset.dragging;
  setZone(null);
  dock.drag(phase);
}

let dockGreeted = false;
const dock = createDockClient({
  makeWebSocket: (url) => new WebSocket(url) as never,
  onConnection: (connected) => { if (!connected) { dockGreeted = false; setDockAvailable(false); } },
  onEvent: (event) => {
    if (event.kind === "available") setDockAvailable(event.available);
    else if (event.kind === "zone") { if (dragging) setZone(event.zone); }
    else {
      setDockAvailable(true);
      // The server can finish a drag on its own (button released outside the page).
      if (dragging) { dragging = false; delete app.dataset.dragging; setZone(null); }
      if (dockGreeted) {
        renderDock(event.edge);
        return;
      }
      // First contact (the greeting): put Blip where the user left it last time, once started.
      dockGreeted = true;
      const saved = readSavedDock();
      renderDock(saved);
      if (activated) dock.dock(saved);
    }
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
});

dockButton.addEventListener("click", () => setDockOptionsOpen(dockOptions.hasAttribute("hidden")));
dockOptions.addEventListener("click", (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-dock]");
  const edge = target?.dataset.dock;
  if (edge !== "left" && edge !== "right" && edge !== "top") return;
  setDockOptionsOpen(false);
  dockButton.focus();
  if (edge !== dockEdge) dock.dock(edge);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (dragging) { ev.preventDefault(); endDrag("cancel"); }
  else if (!dockOptions.hidden) { setDockOptionsOpen(false); dockButton.focus(); }
});
document.addEventListener("pointerdown", (ev) => {
  if (!dockOptions.hidden && !el("dock-menu").contains(ev.target as Node)) setDockOptionsOpen(false);
});

// Drag the grip: the server folds Blip into a puck that follows the cursor, then snaps on release.
grip.addEventListener("pointerdown", (ev) => {
  if (!ev.isPrimary || ev.button !== 0 || grip.disabled) return;
  ev.preventDefault();
  grip.setPointerCapture(ev.pointerId);
  if (!dock.drag("start")) return;
  dragging = true;
  app.dataset.dragging = "";
  setDockOptionsOpen(false);
  setZone(null);
});
grip.addEventListener("pointerup", () => endDrag("end"));
grip.addEventListener("pointercancel", () => endDrag("cancel"));
grip.addEventListener("lostpointercapture", () => endDrag("end"));
// No mouse: the grip opens the same dock picker.
grip.addEventListener("click", (ev) => { if (ev.detail === 0) setDockOptionsOpen(true); });
window.addEventListener("pagehide", () => dock.close());

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
  speechSynth.activate();
  document.getElementById("start-gate")?.remove();
  el("app").removeAttribute("inert");
  earcons.init();
  input.focus();
  if (dockGreeted) dock.dock(readSavedDock());
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
