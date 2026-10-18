import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

export const MOONSHINE_MODEL_PREFIX = "/_blip/moonshine-model/medium-streaming-en/quantized_26_07_30/";
const UPSTREAM_BASE = "https://download.moonshine.ai/model/medium-streaming-en/quantized_26_07_30/";
const MODEL_FILES = new Set([
  "adapter.ort",
  "cross_kv.ort",
  "decoder_kv.ort",
  "encoder.ort",
  "frontend.ort",
  "streaming_config.json",
  "tokenizer.bin",
]);

/** Same-origin, read-only proxy for the pinned, free Moonshine English model. Never accepts an arbitrary URL. */
export async function serveMoonshineModelFile(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  fetchModel: typeof fetch = fetch,
): Promise<boolean> {
  if (!pathname.startsWith(MOONSHINE_MODEL_PREFIX)) return false;
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
    res.end();
    return true;
  }
  const filename = pathname.slice(MOONSHINE_MODEL_PREFIX.length);
  if (!MODEL_FILES.has(filename) || filename.includes("/") || filename.includes("\\")) {
    res.writeHead(404, { "Cache-Control": "no-store" });
    res.end();
    return true;
  }
  try {
    const upstream = await fetchModel(UPSTREAM_BASE + filename);
    if (!upstream.ok || upstream.body === null) {
      res.writeHead(502, { "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    const size = upstream.headers.get("content-length");
    if (size) headers["Content-Length"] = size;
    res.writeHead(200, headers);
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { "Cache-Control": "no-store" });
      res.end();
    } else res.destroy();
  }
  return true;
}
