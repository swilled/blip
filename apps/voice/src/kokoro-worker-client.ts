import KokoroWorker from "./kokoro.worker?worker";
import type { KokoroModel } from "./kokoro-synth";
import type { KokoroWorkerRequest, KokoroWorkerReply } from "./kokoro-worker-protocol";

type VoiceWorker = {
  onmessage: Worker["onmessage"];
  onerror: Worker["onerror"];
  onmessageerror: Worker["onmessageerror"];
  postMessage(message: KokoroWorkerRequest): void;
  terminate(): void;
};

/** All inference happens off the UI thread, and a hung worker is terminated. */
export async function loadKokoroWorker(
  progress: (percent: number) => void,
  signal?: AbortSignal,
  makeWorker: () => VoiceWorker = () => new KokoroWorker(),
): Promise<KokoroModel> {
  signal?.throwIfAborted();
  const worker = makeWorker();
  let nextId = 0, stopped = false, generating = false;
  const pending = new Map<number, {
    resolve(message: KokoroWorkerReply): void; reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  function dispose(): void {
    if (stopped) return;
    stopped = true;
    worker.terminate();
    signal?.removeEventListener("abort", dispose);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Natural voice worker stopped.")); }
    pending.clear();
  }
  signal?.addEventListener("abort", dispose, { once: true });
  worker.onmessage = (event: MessageEvent<KokoroWorkerReply>) => {
    const data = event.data;
    if (stopped) return;
    if (data.type === "progress") { progress(data.percent); return; }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    if (data.type === "error") { entry.reject(new Error("Natural voice generation failed.")); dispose(); }
    else entry.resolve(data);
  };
  worker.onerror = event => { event.preventDefault(); dispose(); };
  worker.onmessageerror = dispose;
  function request(message: KokoroWorkerRequest, timeoutMs: number): Promise<KokoroWorkerReply> {
    if (stopped) return Promise.reject(new Error("Natural voice worker is unavailable."));
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject, timer: setTimeout(dispose, timeoutMs) });
      try { worker.postMessage(message); } catch { dispose(); }
    });
  }
  await request({ type: "load", id: ++nextId }, 120_000);
  return {
    async generate(text, options) {
      if (generating) throw new Error("Natural voice is still generating.");
      generating = true;
      try {
        const reply = await request({ type: "generate", id: ++nextId, text, ...options }, 12_000);
        if (reply.type !== "audio") throw new Error("Natural voice returned no audio.");
        return reply;
      } finally { generating = false; }
    },
    dispose,
  };
}
