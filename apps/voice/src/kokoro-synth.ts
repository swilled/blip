import type { Synth, SynthHandlers } from "./tts";
import type { GenerateOptions } from "kokoro-js";
import { loadKokoroWorker } from "./kokoro-worker-client";
export { KOKORO_MODEL_ID } from "./kokoro-worker-protocol";

export const KOKORO_DEFAULT_VOICE = "af_heart";
const KOKORO_VOICES = new Set<KokoroVoice>(["af_heart", "am_michael"]);

export type KokoroAudio = { audio: Float32Array; sampling_rate: number };
type KokoroVoice = NonNullable<GenerateOptions["voice"]>;
export type KokoroModel = {
  generate(text: string, options: { voice: KokoroVoice; speed: number }): Promise<KokoroAudio>;
  dispose?(): void;
};

type AudioContextLike = Pick<AudioContext, "createBuffer" | "createBufferSource" | "destination" | "resume" | "close" | "state">;
type KokoroSynthOptions = {
  native: Synth & { dispose?: () => void; setVoice?: (uri: string | null) => void };
  /** Loads the model; reports overall download progress from 0 to 100 when it is known. */
  loadModel?: (onProgress: (percent: number) => void, signal?: AbortSignal) => Promise<KokoroModel>;
  createAudioContext?: () => AudioContextLike;
  onStatus?: (message: string) => void;
  /** How long a reply waits for a still-loading model before using the Windows voice instead. */
  loadingGraceMs?: number;
};

function makeAudioContext(): AudioContextLike {
  return new AudioContext();
}

/** Uses Kokoro in the browser by default; if its model fails, gracefully falls back to local browser speech. */
export function createKokoroSynth(options: KokoroSynthOptions): Synth & {
  warmup(): Promise<void>;
  activate(): void;
  setVoice(selection: string): void;
  dispose(): void;
} {
  const loadModel = options.loadModel ?? loadKokoroWorker;
  const lifetime = new AbortController();
  const createContext = options.createAudioContext ?? makeAudioContext;
  const loadingGraceMs = options.loadingGraceMs ?? 1_500;
  const startupTimeoutMs = 180_000;
  let modelPromise: Promise<KokoroModel> | null = null;
  let context: AudioContextLike | null = null;
  let generation = 0;
  let active: { generation: number; source?: AudioBufferSourceNode; fallback: boolean } | null = null;
  let selectedVoice: KokoroVoice = KOKORO_DEFAULT_VOICE;
  let preferNative = false;
  let modelFailed = false;
  let modelReady = false;
  let lastPercent = -1;

  function ensureContext(): AudioContextLike {
    return context ??= createContext();
  }

  function reportProgress(percent: number): void {
    // Only 5% steps, so a screen reader is not flooded with updates.
    if (modelReady || percent === lastPercent || percent % 5 !== 0) return;
    lastPercent = percent;
    options.onStatus?.(`Downloading Blip's natural voice: ${percent}%. The Windows voice speaks until it is ready.`);
  }

  function getModel(): Promise<KokoroModel> {
    if (modelFailed) return Promise.reject(new Error("Kokoro model is unavailable."));
    modelPromise ??= loadModel(reportProgress, lifetime.signal).then((model) => {
      if (lifetime.signal.aborted) { model.dispose?.(); throw new Error("Voice disposed."); }
      modelReady = true;
      return model;
    }, (error: unknown) => {
      modelPromise = null;
      modelFailed = true;
      options.onStatus?.("Kokoro could not load. Using the browser's voice instead.");
      throw error;
    });
    return modelPromise;
  }

  async function warmup(): Promise<void> {
    if (preferNative || modelFailed || modelReady) return;
    options.onStatus?.("Loading Blip's natural voice. The Windows voice speaks until it is ready.");
    try {
      await getModel();
      if (!modelFailed) options.onStatus?.("Blip's natural voice is ready.");
    } catch {
      // The speech call falls back to the built-in local voice.
    }
  }

  /** The model if it is ready now or within the grace period; null while it is still loading. */
  async function modelOrNull(): Promise<KokoroModel | null> {
    const loading = getModel();
    if (modelReady) return loading;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), loadingGraceMs); });
    try {
      return await Promise.race([loading, grace]);
    } finally {
      clearTimeout(timer);
    }
  }

  function speakNative(text: string, handlers: SynthHandlers, rate: number, item: NonNullable<typeof active>): void {
    item.fallback = true;
    options.native.speak(text, {
      onstart: handlers.onstart,
      onend: () => { if (active === item) active = null; handlers.onend(); },
      onerror: (reason) => { if (active === item) active = null; handlers.onerror(reason); },
    }, rate);
  }

  async function speakKokoro(text: string, handlers: SynthHandlers, rate: number, item: NonNullable<typeof active>): Promise<void> {
    try {
      const audioContext = ensureContext();
      const model = await modelOrNull();
      if (active !== item || generation !== item.generation) return;
      if (model === null) {
        // Still downloading: speak now with the Windows voice instead of leaving the user in silence.
        speakNative(text, handlers, rate, item);
        return;
      }
      const audio = await model.generate(text, { voice: selectedVoice, speed: rate });
      if (active !== item || generation !== item.generation) return;
      if (audioContext.state === "suspended") await audioContext.resume();
      if (active !== item || generation !== item.generation) return;
      const buffer = audioContext.createBuffer(1, audio.audio.length, audio.sampling_rate);
      buffer.copyToChannel(new Float32Array(audio.audio), 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      item.source = source;
      source.onended = () => {
        if (active !== item || generation !== item.generation) return;
        active = null;
        source.disconnect();
        handlers.onend();
      };
      source.start();
      handlers.onstart?.();
    } catch {
      if (active !== item || generation !== item.generation) return;
      modelFailed = true;
      void modelPromise?.then(model => model.dispose?.(), () => {});
      active = { generation: item.generation, fallback: true };
      item.fallback = true;
      options.onStatus?.("Kokoro could not play. Using the browser's voice instead.");
      options.native.speak(text, {
        onstart: handlers.onstart,
        onend: () => { if (active?.generation === item.generation) active = null; handlers.onend(); },
        onerror: (reason) => { if (active?.generation === item.generation) active = null; handlers.onerror(reason); },
      }, rate);
    }
  }

  const synth: Synth & {
    warmup(): Promise<void>;
    activate(): void;
    setVoice(selection: string): void;
    dispose(): void;
  } = {
    startupTimeoutMs,
    activate() {
      try {
        const audioContext = ensureContext();
        if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      } catch {
        modelFailed = true;
      }
      void warmup();
    },
    warmup,
    setVoice(selection) {
      if (selection.startsWith("kokoro:")) {
        const requested = selection.slice("kokoro:".length);
        selectedVoice = KOKORO_VOICES.has(requested as KokoroVoice) ? requested as KokoroVoice : KOKORO_DEFAULT_VOICE;
        preferNative = false;
      } else {
        preferNative = true;
        options.native.setVoice?.(selection.startsWith("native:") ? selection.slice("native:".length) || null : null);
      }
    },
    speak(text, handlers, rate) {
      if (active !== null) { handlers.onerror("audio-busy"); return; }
      const item = { generation: ++generation, fallback: preferNative || modelFailed };
      active = item;
      if (item.fallback) {
        options.native.speak(text, {
          onstart: handlers.onstart,
          onend: () => { if (active === item) active = null; handlers.onend(); },
          onerror: reason => { if (active === item) active = null; handlers.onerror(reason); },
        }, rate);
        return;
      }
      void speakKokoro(text, handlers, rate, item);
    },
    cancel() {
      const old = active;
      active = null;
      generation += 1;
      if (old?.source) {
        old.source.onended = null;
        try { old.source.stop(); } catch { /* Audio may already have ended. */ }
        old.source.disconnect();
      }
      options.native.cancel();
    },
    dispose() {
      synth.cancel();
      lifetime.abort();
      void modelPromise?.then(model => model.dispose?.(), () => {});
      options.native.dispose?.();
      if (context !== null && context.state !== "closed") void context.close().catch(() => {});
      context = null;
    },
  };
  return synth;
}
