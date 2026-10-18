import { AssetDownloader, ModelArch, Transcriber } from "@moonshine-ai/moonshine-wasm";
import type { Stream } from "@moonshine-ai/moonshine-wasm";
import wasmUrl from "@moonshine-ai/moonshine-wasm/moonshine.wasm?url";
import type { MoonshineWorkerReply, MoonshineWorkerRequest } from "./moonshine-stt-worker-protocol";

type WorkerScope = {
  onmessage: ((event: { data: MoonshineWorkerRequest }) => void) | null;
  postMessage(message: MoonshineWorkerReply): void;
  location: { href: string };
};
const scope = globalThis as unknown as WorkerScope;
let transcriber: Awaited<ReturnType<typeof Transcriber.load>> | null = null;
const streams = new Map<string, Stream>();

function reply(message: MoonshineWorkerReply): void { scope.postMessage(message); }
function fail(id: number, error: unknown): void { reply({ id, type: "error", message: error instanceof Error ? error.message : String(error) }); }

async function handle(message: MoonshineWorkerRequest): Promise<void> {
  try {
    switch (message.type) {
      case "load":
        transcriber = await Transcriber.load({
          language: "en",
          modelArch: ModelArch.MediumStreaming,
          downloader: new AssetDownloader({
            baseUrl: new URL("/_blip/moonshine-model/medium-streaming-en/quantized_26_07_30/", scope.location.href).href,
            onProgress: (loaded, total, file) => reply({ type: "progress", fraction: total ? loaded / total : undefined, file }),
          }),
          moduleOptions: { locateFile: path => path.endsWith(".wasm") ? wasmUrl : new URL(path, scope.location.href).href },
        });
        break;
      case "create-stream": {
        if (!transcriber) throw new Error("Speech model not loaded.");
        const stream = transcriber.createStream({ updateInterval: message.updateInterval });
        stream.addListener({
          onLineTextChanged: event => reply({ type: "line-text", streamId: message.streamId, line: event.line }),
          onLineCompleted: event => reply({ type: "line-complete", streamId: message.streamId, line: event.line }),
          onError: event => reply({ type: "stream-error", streamId: message.streamId, message: event.error.message }),
        });
        streams.set(message.streamId, stream);
        break;
      }
      case "start":
        requireStream(message.streamId).start();
        break;
      case "audio":
        requireStream(message.streamId).addAudio(new Float32Array(message.samples), message.sampleRate);
        break;
      case "stop":
        requireStream(message.streamId).stop();
        break;
      case "close-stream":
        streams.get(message.streamId)?.close();
        streams.delete(message.streamId);
        break;
      case "close":
        for (const stream of streams.values()) stream.close();
        streams.clear();
        transcriber?.close();
        transcriber = null;
        break;
    }
    if ("id" in message) reply({ id: message.id, type: "ok" });
  } catch (error) {
    if ("id" in message) fail(message.id, error);
    else reply({ type: "stream-error", streamId: message.streamId, message: error instanceof Error ? error.message : String(error) });
  }
}

function requireStream(id: string) {
  const stream = streams.get(id);
  if (!stream) throw new Error("Speech stream is not available.");
  return stream;
}

scope.onmessage = event => { void handle(event.data); };
