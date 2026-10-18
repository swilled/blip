import type { Synth, SynthHandlers } from "./tts";
import type { GenerateOptions } from "kokoro-js";

export const KOKORO_DEFAULT_VOICE = "af_heart";
export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICES = new Set<KokoroVoice>(["af_heart", "am_michael"]);

export type KokoroAudio = { audio: Float32Array; sampling_rate: number };
type KokoroVoice = NonNullable<GenerateOptions["voice"]>;
export type KokoroModel = {
  generate(text: string, options: { voice: KokoroVoice; speed: number }): Promise<KokoroAudio>;
};

type AudioContextLike = Pick<AudioContext, "createBuffer" | "createBufferSource" | "destination" | "resume" | "close" | "state">;
type KokoroSynthOptions = {
  native: Synth & { dispose?: () => void; setVoice?: (uri: string | null) => void };
  loadModel?: () => Promise<KokoroModel>;
  createAudioContext?: () => AudioContextLike;
  onStatus?: (message: string) => void;
};

async function loadBrowserModel(): Promise<KokoroModel> {
  const { KokoroTTS } = await import("kokoro-js");
  let tts: InstanceType<typeof KokoroTTS>;
  if ("gpu" in navigator) {
    try {
      tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "fp32", device: "webgpu" });
    } catch {
      // Some drivers expose WebGPU but fail to compile the model. Use the portable WASM path.
      tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8", device: "wasm" });
    }
  } else {
    tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8", device: "wasm" });
  }
  return {
    async generate(text, options) {
      const raw = await tts.generate(text, options);
      const samples = raw.audio;
      return {
        audio: Array.isArray(samples) ? samples[0] ?? new Float32Array() : samples,
        sampling_rate: raw.sampling_rate,
      };
    },
  };
}

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
  const loadModel = options.loadModel ?? loadBrowserModel;
  const createContext = options.createAudioContext ?? makeAudioContext;
  const startupTimeoutMs = 180_000;
  let modelPromise: Promise<KokoroModel> | null = null;
  let context: AudioContextLike | null = null;
  let generation = 0;
  let active: { generation: number; source?: AudioBufferSourceNode; fallback: boolean } | null = null;
  let selectedVoice: KokoroVoice = KOKORO_DEFAULT_VOICE;
  let preferNative = false;
  let modelFailed = false;

  function ensureContext(): AudioContextLike {
    return context ??= createContext();
  }

  function getModel(): Promise<KokoroModel> {
    if (modelFailed) return Promise.reject(new Error("Kokoro model is unavailable."));
    modelPromise ??= loadModel().catch((error: unknown) => {
      modelPromise = null;
      modelFailed = true;
      options.onStatus?.("Kokoro could not load. Using the browser's voice instead.");
      throw error;
    });
    return modelPromise;
  }

  async function warmup(): Promise<void> {
    if (preferNative || modelFailed) return;
    options.onStatus?.("Loading the local Kokoro voice. The first run downloads its voice model.");
    try {
      await getModel();
      if (!modelFailed) options.onStatus?.("Kokoro natural voice is ready on this device.");
    } catch {
      // The speech call falls back to the built-in local voice.
    }
  }

  async function speakKokoro(text: string, handlers: SynthHandlers, rate: number, item: NonNullable<typeof active>): Promise<void> {
    try {
      const audioContext = ensureContext();
      const model = await getModel();
      if (active !== item || generation !== item.generation) return;
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
      options.native.dispose?.();
      if (context !== null && context.state !== "closed") void context.close().catch(() => {});
      context = null;
    },
  };
  return synth;
}
