import { describe, expect, it, vi } from "vitest";
import { startServer } from "../src/server";
import { validateWav } from "../src/voice/local-whisper";
import { encodeWav } from "../../voice/src/recorded-stt";

function wav(amplitude = 0.1) { return Buffer.from(encodeWav([new Float32Array(16000).fill(amplitude)], 16000)); }
describe("bounded local transcription endpoint", () => {
  it("validates canonical PCM, rejects invalid input and detects silence", () => {
    expect(validateWav(wav())).toBe(true); expect(validateWav(wav(0))).toBe(false);
    for (const audio of [Buffer.alloc(10), Buffer.alloc(400000), Buffer.from("RIFF-not-a-wave")]) expect(() => validateWav(audio)).toThrow();
    const wrong = wav(); wrong.writeUInt32LE(48000, 24); expect(() => validateWav(wrong)).toThrow();
  });
  it("transcribes only same-origin, token-authorized bounded WAV and never executes an action", async () => {
    const transcribe = vi.fn(async () => "read the form");
    const server = await startServer({ port: 0, transcribeAudio: transcribe }); server.session.voiceConnected = true;
    const origin = `http://127.0.0.1:${server.port}`;
    try {
      const status = await fetch(`${origin}/_blip/stt`); const { ready, token } = await status.json() as any;
      expect(ready).toBe(true); expect(status.headers.get("cache-control")).toBe("no-store");
      const post = (headers: Record<string, string>, body: Buffer = wav()) => fetch(`${origin}/_blip/stt`, { method: "POST", headers, body: Uint8Array.from(body) });
      expect((await post({ Origin: "https://hostile.example", "X-Blip-Stt": token, "Content-Type": "audio/wav" })).status).toBe(403);
      expect((await post({ Origin: origin, "X-Blip-Stt": "wrong", "Content-Type": "audio/wav" })).status).toBe(403);
      const headers = { Origin: origin, "X-Blip-Stt": token, "Content-Type": "audio/wav" };
      expect((await post(headers, Buffer.alloc(400000))).status).toBe(413);
      expect((await post(headers, Buffer.alloc(100))).status).toBe(400);
      expect(await (await post(headers, wav(0))).json()).toMatchObject({ text: "" });
      expect(transcribe).not.toHaveBeenCalled();
      expect(await (await post(headers)).json()).toMatchObject({ text: "read the form", engine: "whisper.cpp base.en" });
      expect(transcribe).toHaveBeenCalledTimes(1); expect(server.session.pendingGatedAction).toBeNull();
    } finally { await server.close(); }
  });
  it("rejects old-connection results and serializes native inference", async () => {
    let done!: (text: string) => void;
    const transcribe = vi.fn(() => new Promise<string>(r => { done = r; }));
    const server = await startServer({ port: 0, transcribeAudio: transcribe }); server.session.voiceConnected = true;
    const origin = `http://127.0.0.1:${server.port}`;
    try {
      const { token } = await (await fetch(`${origin}/_blip/stt`)).json() as any;
      const post = () => fetch(`${origin}/_blip/stt`, { method: "POST", headers: { Origin: origin, "X-Blip-Stt": token, "Content-Type": "audio/wav" }, body: wav() });
      const pending = post(); await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
      expect((await post()).status).toBe(409);
      server.session.voiceConnected = true; done("submit survey");
      expect((await pending).status).toBe(409);
    } finally { await server.close(); }
  });
  it("reports an uninstalled recognizer without substituting another engine", async () => {
    const server = await startServer({ port: 0 });
    try { const response = await fetch(`http://127.0.0.1:${server.port}/_blip/stt`); expect(await response.json()).toMatchObject({ ready: false }); }
    finally { await server.close(); }
  });
});
