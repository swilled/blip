import { afterEach, expect, it, vi } from "vitest";
import { loadKokoroWorker } from "./kokoro-worker-client";
import type { KokoroWorkerRequest, KokoroWorkerReply } from "./kokoro-worker-protocol";

function harness(signal?: AbortSignal) {
  const sent: KokoroWorkerRequest[] = [];
  const worker = {
    onmessage: null as Worker["onmessage"], onerror: null as Worker["onerror"], onmessageerror: null as Worker["onmessageerror"],
    postMessage: vi.fn((message: KokoroWorkerRequest) => sent.push(message)), terminate: vi.fn(),
  };
  const progress = vi.fn();
  const loading = loadKokoroWorker(progress, signal, () => worker);
  const reply = (data: KokoroWorkerReply) => worker.onmessage?.call(worker as unknown as Worker, { data } as MessageEvent);
  return { worker, sent, progress, loading, reply };
}
afterEach(() => vi.useRealTimers());

it("loads and generates audio in a worker while forwarding progress", async () => {
  const h = harness();
  h.reply({ type: "progress", percent: 50 });
  h.reply({ type: "ready", id: h.sent[0]!.id });
  const model = await h.loading;
  const generated = model.generate("A summary.", { voice: "af_heart", speed: 1 });
  expect(h.sent[1]).toMatchObject({ type: "generate", text: "A summary." });
  const audio = new Float32Array([0.1]);
  h.reply({ type: "audio", id: h.sent[1]!.id, audio, sampling_rate: 24000 });
  expect((await generated).audio).toBe(audio);
  expect(h.progress).toHaveBeenCalledWith(50);
  model.dispose?.();
  expect(h.worker.terminate).toHaveBeenCalledOnce();
});

it("terminates a hung inference and rejects it so speech can fall back", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.reply({ type: "ready", id: h.sent[0]!.id });
  const model = await h.loading;
  const failed = expect(model.generate("Long summary.", { voice: "af_heart", speed: 1 })).rejects.toThrow("worker stopped");
  await vi.advanceTimersByTimeAsync(12000);
  await failed;
  expect(h.worker.terminate).toHaveBeenCalledOnce();
  await expect(model.generate("Retry", { voice: "af_heart", speed: 1 })).rejects.toThrow("unavailable");
});

it("releases a worker when the window closes during model loading", async () => {
  const controller = new AbortController();
  const h = harness(controller.signal);
  const failed = expect(h.loading).rejects.toThrow("worker stopped");
  controller.abort();
  await failed;
  expect(h.worker.terminate).toHaveBeenCalledOnce();
});

it("handles a worker crash without leaving speech promises pending", async () => {
  const h = harness();
  const failed = expect(h.loading).rejects.toThrow("worker stopped");
  const preventDefault = vi.fn();
  h.worker.onerror?.call(h.worker as unknown as Worker, { preventDefault } as unknown as ErrorEvent);
  await failed;
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(h.worker.terminate).toHaveBeenCalledOnce();
});
