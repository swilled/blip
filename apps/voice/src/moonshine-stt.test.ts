import { describe, expect, it, vi } from "vitest";
import { createMoonshineStt, type MoonshineStream, type MoonshineTranscriber } from "./moonshine-stt";
import type { PcmRecording } from "./recorded-stt";

const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

class FakeStream implements MoonshineStream {
  listener: Parameters<MoonshineStream["addListener"]>[0] | null = null;
  added: number[] = [];
  started = false;
  stopped = false;
  addListener(listener: Parameters<MoonshineStream["addListener"]>[0]) { this.listener = listener; }
  start() { this.started = true; }
  addAudio(samples: Float32Array, sampleRate: number) {
    this.added.push(samples.length);
    this.listener?.onLineTextChanged?.({ line: { id: "line-1", text: "read the", startTime: 0 } });
    expect(sampleRate).toBe(16000);
  }
  stop() {
    this.stopped = true;
    this.listener?.onLineCompleted?.({ line: { id: "line-1", text: "read the form", startTime: 0 } });
  }
  close() {}
}

class FakeTranscriber implements MoonshineTranscriber {
  streams: FakeStream[] = [];
  createStream() { const stream = new FakeStream(); this.streams.push(stream); return stream; }
  close() {}
}

function fixture(loader: () => Promise<MoonshineTranscriber> = async () => new FakeTranscriber()) {
  const transcriber = new FakeTranscriber();
  const recording: PcmRecording = {
    sampleRate: 16000,
    inputSettings: { channels: 1 },
    stop: vi.fn(async () => [new Float32Array(16000).fill(0.1)]),
    cancel: vi.fn(),
  };
  const options = {
    loadTranscriber: vi.fn(loader),
    open: vi.fn(async (_signal: AbortSignal, onSamples: (samples: Float32Array, rate: number) => void) => {
      onSamples(new Float32Array(16000).fill(0.1), 16000);
      return recording;
    }),
    summarize: vi.fn(() => ({ durationSeconds: 1, rms: 0.1, peak: 0.1, sampleRate: 16000 })),
    onCapture: vi.fn(), onStage: vi.fn(), onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(),
  };
  const stt = createMoonshineStt(options);
  return { stt, transcriber, recording, options };
}

describe("Moonshine streaming push-to-talk", () => {
  it("streams microphone chunks while held and sends only the flushed final transcript on release", async () => {
    const f = fixture(async () => f.transcriber);
    f.stt.press(); await tick();
    expect(f.options.open).toHaveBeenCalledTimes(1);
    expect(f.transcriber.streams[0]!.started).toBe(true);
    expect(f.transcriber.streams[0]!.added).toEqual([16000]);
    expect(f.options.onInterim).toHaveBeenCalledWith("read the");
    expect(f.options.onFinal).not.toHaveBeenCalled();
    f.stt.release(); await tick();
    expect(f.transcriber.streams[0]!.stopped).toBe(true);
    expect(f.options.onFinal).toHaveBeenCalledWith({ text: "read the form", alternatives: [] });
    expect(f.options.onCapture).toHaveBeenCalledTimes(1);
    expect(f.stt.isActive()).toBe(false);
  });

  it("cancels a late model load without opening the mic or dispatching stale speech", async () => {
    let resolve!: (transcriber: MoonshineTranscriber) => void;
    const f = fixture(() => new Promise<MoonshineTranscriber>(done => { resolve = done; }));
    f.stt.press(); await tick();
    f.stt.cancel();
    resolve(f.transcriber); await tick();
    expect(f.options.open).not.toHaveBeenCalled();
    expect(f.options.onFinal).not.toHaveBeenCalled();
    expect(f.stt.isActive()).toBe(false);
  });

  it("does not impose a capture timer while the user keeps holding", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(async () => f.transcriber);
      f.stt.press(); await tick();
      vi.advanceTimersByTime(60_000);
      expect(f.stt.isActive()).toBe(true);
      expect(f.options.onFinal).not.toHaveBeenCalled();
      f.stt.release(); await tick();
      expect(f.options.onFinal).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
