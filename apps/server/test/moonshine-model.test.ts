import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../src/server";
import { MOONSHINE_MODEL_PREFIX } from "../src/voice/moonshine-model";

describe("Moonshine model asset proxy", () => {
  it("serves only pinned public model assets through the same origin", async () => {
    const modelFetch = vi.fn(async (input: URL | RequestInfo) => {
      expect(String(input)).toBe("https://download.moonshine.ai/model/medium-streaming-en/quantized_26_07_30/encoder.ort");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-length": "3" },
      });
    });
    const server = await startServer({ port: 0, dev: true, moonshineModelFetch: modelFetch as typeof fetch });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}${MOONSHINE_MODEL_PREFIX}encoder.ort`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
      expect(modelFetch).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });

  it("rejects unknown assets and non-GET methods without fetching arbitrary URLs", async () => {
    const modelFetch = vi.fn<typeof fetch>();
    const server = await startServer({ port: 0, dev: true, moonshineModelFetch: modelFetch });
    try {
      const unknown = await fetch(`http://127.0.0.1:${server.port}${MOONSHINE_MODEL_PREFIX}anything.ort`);
      expect(unknown.status).toBe(404);
      const post = await fetch(`http://127.0.0.1:${server.port}${MOONSHINE_MODEL_PREFIX}encoder.ort`, { method: "POST" });
      expect(post.status).toBe(405);
      expect(modelFetch).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("isolates the voice page so Chrome can use threaded WebAssembly safely", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "blip-voice-isolation-"));
    await writeFile(path.join(root, "index.html"), "<!doctype html><title>voice</title>");
    const server = await startServer({ port: 0, dev: true, staticRoots: [{ urlPrefix: "/voice", dir: root }] });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/voice/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
      expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    } finally {
      await server.close();
      if (root.startsWith(tmpdir())) await rm(root, { recursive: true, force: true });
    }
  });
});
