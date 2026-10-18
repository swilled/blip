import { KokoroTTS } from "kokoro-js";
import { KOKORO_MODEL_ID, type KokoroWorkerRequest, type KokoroWorkerReply } from "./kokoro-worker-protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: { data: KokoroWorkerRequest }) => void) | null;
  postMessage(message: KokoroWorkerReply, transfer?: Transferable[]): void;
};
let model: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      const files = new Map<string, { loaded: number; total: number }>();
      model = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: "q8", device: "wasm",
        progress_callback: info => {
          if (info.status !== "progress" || !info.total) return;
          files.set(info.file, { loaded: info.loaded, total: info.total });
          let loaded = 0, total = 0;
          for (const file of files.values()) { loaded += file.loaded; total += file.total; }
          if (total) scope.postMessage({ type: "progress", percent: Math.min(100, Math.floor(loaded / total * 100)) });
        },
      });
      scope.postMessage({ type: "ready", id: data.id });
    } else {
      if (!model) throw new Error("Voice not loaded");
      const raw = await model.generate(data.text, { voice: data.voice, speed: data.speed });
      const samples = Array.isArray(raw.audio) ? raw.audio[0] : raw.audio;
      if (!samples?.length) throw new Error("Empty voice output");
      const audio = new Float32Array(samples);
      scope.postMessage({ type: "audio", id: data.id, audio, sampling_rate: raw.sampling_rate }, [audio.buffer]);
    }
  } catch { scope.postMessage({ type: "error", id: data.id }); }
};
