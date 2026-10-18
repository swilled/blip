import type { Stt, SttError, SttFinal, CaptureStage } from "./stt";
import type { PcmCaptureSummary, PcmRecording } from "./recorded-stt";
import MoonshineSttWorker from "./moonshine-stt.worker?worker";
import type { MoonshineWorkerReply, MoonshineWorkerRequest } from "./moonshine-stt-worker-protocol";

export interface MoonshineLine {
  id: string;
  text: string;
  startTime: number;
}

export interface MoonshineStream {
  addListener(listener: {
    onLineTextChanged?(event: { line: MoonshineLine }): void;
    onLineCompleted?(event: { line: MoonshineLine }): void;
    onError?(event: { error: Error }): void;
  }): void;
  start(): void | Promise<void>;
  addAudio(samples: Float32Array, sampleRate: number): void;
  stop(): void | Promise<void>;
  close(): void | Promise<void>;
}

export interface MoonshineTranscriber {
  createStream(options?: { updateInterval?: number }): MoonshineStream;
  close(): void;
}

type Progress = (fraction: number | undefined, file: string) => void;
type EngineLoader = (onProgress: Progress) => Promise<MoonshineTranscriber>;

let sharedTranscriber: MoonshineTranscriber | null = null;
let sharedLoad: Promise<MoonshineTranscriber> | null = null;

function createWorkerTranscriber(onProgress: Progress): MoonshineTranscriber & { ready: Promise<void> } {
  const worker = new MoonshineSttWorker();
  let requestId = 0, streamId = 0;
  const pending = new Map<number, { resolve(): void; reject(error: Error): void }>();
  const listeners = new Map<string, Parameters<MoonshineStream["addListener"]>[0]>();
  const failAll = (error: Error) => { for (const item of pending.values()) item.reject(error); pending.clear(); };
  worker.onmessage = event => {
    const message = event.data as MoonshineWorkerReply;
    if (message.type === "progress") { onProgress(message.fraction, message.file); return; }
    if (message.type === "line-text") { listeners.get(message.streamId)?.onLineTextChanged?.({ line: message.line }); return; }
    if (message.type === "line-complete") { listeners.get(message.streamId)?.onLineCompleted?.({ line: message.line }); return; }
    if (message.type === "stream-error") { listeners.get(message.streamId)?.onError?.({ error: new Error(message.message) }); return; }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    message.type === "error" ? item.reject(new Error(message.message)) : item.resolve();
  };
  worker.onerror = event => failAll(new Error(event.message || "Moonshine speech worker failed."));
  const request = (message: Exclude<MoonshineWorkerRequest, { type: "audio" } | { type: "close" }>) => new Promise<void>((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id } as MoonshineWorkerRequest);
  });
  const engine: MoonshineTranscriber & { ready: Promise<void> } = {
    ready: request({ type: "load", id: 0 }),
    createStream(options) {
      const id = `blip-ptt-${++streamId}`;
      const ready = request({ type: "create-stream", id: 0, streamId: id, updateInterval: options?.updateInterval ?? 0.4 });
      return {
        addListener: listener => { listeners.set(id, listener); },
        start: async () => { await engine.ready; await ready; await request({ type: "start", id: 0, streamId: id }); },
        addAudio: (samples, sampleRate) => {
          const copy = samples.slice();
          worker.postMessage({ type: "audio", streamId: id, sampleRate, samples: copy.buffer }, [copy.buffer]);
        },
        stop: async () => { await ready; await request({ type: "stop", id: 0, streamId: id }); },
        close: async () => {
          listeners.delete(id);
          await ready.catch(() => {});
          await request({ type: "close-stream", id: 0, streamId: id }).catch(() => {});
        },
      };
    },
    close() { worker.terminate(); failAll(new Error("Moonshine speech worker closed.")); },
  };
  return engine;
}

/** Loads the maintained Moonshine Voice WebAssembly model, cached by the library for later offline use. */
export function loadMoonshineTranscriber(onProgress: Progress): Promise<MoonshineTranscriber> {
  if (sharedTranscriber) return Promise.resolve(sharedTranscriber);
  if (!sharedLoad) {
    sharedLoad = (async () => {
      const { AssetDownloader, ModelArch, sttWorkerSupported, Transcriber } = await import("@moonshine-ai/moonshine-wasm");
      if (sttWorkerSupported()) {
        const transcriber = createWorkerTranscriber(onProgress);
        try { await transcriber.ready; } catch (error) { transcriber.close(); throw error; }
        sharedTranscriber = transcriber;
        return transcriber;
      }
      // This fallback is for embedded browsers without module Worker support.
      const transcriber = await Transcriber.load({
        language: "en",
        modelArch: ModelArch.MediumStreaming,
        downloader: new AssetDownloader({
          baseUrl: new URL("/_blip/moonshine-model/medium-streaming-en/quantized_26_07_30/", globalThis.location.href).href,
          onProgress: (loaded, total, file) => onProgress(total ? loaded / total : undefined, file),
        }),
      });
      sharedTranscriber = transcriber;
      return transcriber;
    })().catch(error => {
      sharedLoad = null;
      throw error;
    });
  }
  return sharedLoad;
}

function streamText(lines: Map<string, MoonshineLine>): string {
  return [...lines.values()].sort((a, b) => a.startTime - b.startTime).map(line => line.text.trim()).filter(Boolean).join(" ").trim();
}

function collectStream(transcriber: MoonshineTranscriber, onInterim?: (text: string) => void): { stream: MoonshineStream; lines: Map<string, MoonshineLine>; getText(): string; error?: Error } {
  const lines = new Map<string, MoonshineLine>();
  const stream = transcriber.createStream({ updateInterval: 0.4 });
  const update = (line: MoonshineLine) => {
    lines.set(line.id, line);
    onInterim?.(streamText(lines));
  };
  stream.addListener({
    onLineTextChanged: event => update(event.line),
    onLineCompleted: event => update(event.line),
    onError: event => { result.error = event.error; },
  });
  const result: { stream: MoonshineStream; lines: Map<string, MoonshineLine>; getText(): string; error?: Error } = {
    stream,
    lines,
    getText: () => streamText(lines),
  };
  return result;
}

export interface MoonshineSttOptions {
  loadTranscriber?: EngineLoader;
  open(signal: AbortSignal, onSamples: (samples: Float32Array, sampleRate: number) => void): Promise<PcmRecording>;
  summarize(chunks: Float32Array[], sampleRate: number, inputSettings?: PcmRecording["inputSettings"]): PcmCaptureSummary;
  onCapture?: (summary: PcmCaptureSummary) => void;
  onStage?: (stage: CaptureStage) => void;
  onInterim: (text: string) => void;
  onFinal: (final: SttFinal) => void;
  onError: (error: SttError) => void;
  onProgress?: Progress;
  onReady?: () => void;
  onLoadError?: (error: Error) => void;
}

/**
 * Streams the existing microphone capture into Moonshine while the user holds
 * the talk keys. Only a finalized line is sent to Blip, after release.
 */
export function createMoonshineStt(options: MoonshineSttOptions): Stt & {
  warmup(): Promise<void>;
  transcribeRecorded(chunks: Float32Array[], sampleRate: number): Promise<string>;
  close(): void;
} {
  type Capture = { abort: AbortController; recording?: PcmRecording; stream?: ReturnType<typeof collectStream>; released: boolean };
  let active: Capture | null = null;
  const load = () => (options.loadTranscriber ?? loadMoonshineTranscriber)(options.onProgress ?? (() => {}));

  async function warmup(): Promise<void> {
    try {
      await load();
      options.onReady?.();
    } catch (error) {
      options.onLoadError?.(error instanceof Error ? error : new Error("Moonshine model failed to load."));
      throw error;
    }
  }

  function settle(capture: Capture, error?: SttError, text?: string): void {
    if (active !== capture) return;
    active = null;
    capture.abort.abort();
    capture.recording?.cancel();
    capture.stream?.stream.close();
    options.onStage?.("idle");
    if (error) options.onError(error);
    else if (text !== undefined) options.onFinal({ text, alternatives: [] });
  }

  async function start(capture: Capture): Promise<void> {
    try {
      const transcriber = await load();
      if (active !== capture) return;
      const streaming = collectStream(transcriber, text => { if (active === capture && text) options.onInterim(text); });
      capture.stream = streaming;
      await streaming.stream.start();
      if (active !== capture) { await streaming.stream.close(); return; }
      const recording = await options.open(capture.abort.signal, (samples, sampleRate) => {
        if (active === capture) streaming.stream.addAudio(samples, sampleRate);
      });
      if (active !== capture) { recording.cancel(); streaming.stream.close(); return; }
      capture.recording = recording;
      options.onStage?.("listening");
    } catch (error) {
      if (active !== capture) return;
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : "";
      settle(capture, name === "NotAllowedError"
        ? { kind: "not-allowed", message: "Microphone access is blocked. Allow it for this Blip window, then hold to talk again." }
        : name === "NotFoundError" ? { kind: "audio-capture", message: "No microphone could be opened. Check your recording device and Windows microphone access." }
        : { kind: "other", message: message === "moonshine-model-load-failed"
          ? "The on-device speech model could not load. Check the connection once, then reload Blip. Your audio is not uploaded."
          : "The microphone or on-device speech recognizer could not start. Check the microphone, then try again." });
    }
  }

  async function release(capture: Capture): Promise<void> {
    if (active !== capture) return;
    if (!capture.recording || !capture.stream) {
      settle(capture, { kind: "other", message: "Blip was still preparing the microphone. Wait for the listening cue, then try again." });
      return;
    }
    options.onStage?.("finalizing");
    try {
      const chunks = await capture.recording.stop();
      if (active !== capture) return;
      const summary = options.summarize(chunks, capture.recording.sampleRate, capture.recording.inputSettings);
      options.onCapture?.(summary);
      await capture.stream.stream.stop(); // flushes the final partial speech line
      const text = capture.stream.getText();
      if (capture.stream.error) throw capture.stream.error;
      if (summary.durationSeconds < 0.2 || summary.rms < 0.003 || !text) {
        settle(capture, { kind: "no-speech", message: "I didn't catch that. Hold the keys and try again, or type it." });
        return;
      }
      if (text.length > 500) {
        settle(capture, { kind: "other", message: "That command is too long. Nothing was sent. Please use a shorter command." });
        return;
      }
      settle(capture, undefined, text);
    } catch {
      settle(capture, { kind: "other", message: "On-device speech recognition could not finish. Nothing was sent. Release the keys and try again." });
    }
  }

  return {
    press() {
      if (active) return;
      const capture: Capture = { abort: new AbortController(), released: false };
      active = capture;
      options.onStage?.("starting");
      void start(capture);
    },
    release() {
      const capture = active;
      if (!capture || capture.released) return;
      capture.released = true;
      options.onStage?.("finalizing");
      void release(capture);
    },
    cancel(reason) {
      if (!active) return;
      settle(active, reason ? { kind: "other", message: reason } : undefined);
    },
    isActive: () => active !== null,
    async warmup() { await warmup(); },
    async transcribeRecorded(chunks, sampleRate) {
      const transcriber = await load();
      const capture = collectStream(transcriber);
      await capture.stream.start();
      try {
        for (const chunk of chunks) capture.stream.addAudio(chunk, sampleRate);
        await capture.stream.stop();
        return capture.getText();
      } finally { await capture.stream.close(); }
    },
    close() {
      if (active) settle(active);
      if (sharedTranscriber) {
        void sharedTranscriber.close();
        sharedTranscriber = null;
        sharedLoad = null;
      }
    },
  };
}
