import type { IncomingMessage, ServerResponse } from "node:http";
import type { Session } from "../session/session";
import { MAX_WAV_BYTES, validateWav, type TranscribeAudio } from "./local-whisper";

export function createTranscriptionHttp(transcribe: TranscribeAudio | undefined, session: Session, token: string) {
  let active = false;
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, value: object) => { if (!res.destroyed) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); } };
    const expectedOrigin = `http://${req.headers.host}`;
    if (req.headers.origin !== expectedOrigin || req.headers["x-blip-stt"] !== token) { reply(403, { code: "forbidden" }); return; }
    if (!transcribe) { reply(503, { code: "recognizer-unavailable" }); return; }
    if (req.headers["content-type"] !== "audio/wav") { reply(415, { code: "invalid-audio" }); return; }
    const length = Number(req.headers["content-length"]);
    if (!Number.isInteger(length) || length < 44 || length > MAX_WAV_BYTES) { req.resume(); reply(413, { code: "audio-too-long" }); return; }
    if (!session.voiceConnected) { reply(409, { code: "voice-disconnected" }); return; }
    if (active) { reply(409, { code: "recognizer-busy" }); return; }
    const epoch = session.voiceEpoch;
    const capture = session.voiceCapture;
    active = true;
    const controller = new AbortController();
    const closed = () => controller.abort();
    res.once("close", closed);
    const deadline = setTimeout(() => { closed(); if (!req.complete) req.destroy(); }, 25000);
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_WAV_BYTES) { reply(413, { code: "audio-too-long" }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const wav = Buffer.concat(chunks);
      let audible: boolean;
      try { audible = validateWav(wav); } catch { reply(400, { code: "invalid-audio" }); return; }
      if (!audible) { reply(200, { text: "", engine: "whisper.cpp base.en" }); return; }
      const text = await transcribe(wav, controller.signal);
      if (controller.signal.aborted || !session.voiceConnected || epoch !== session.voiceEpoch || capture !== session.voiceCapture) { reply(409, { code: "capture-cancelled" }); return; }
      reply(200, { text, engine: "whisper.cpp base.en" });
    } catch { reply(503, { code: controller.signal.aborted ? "capture-cancelled" : "recognition-failed" }); }
    finally { active = false; clearTimeout(deadline); res.removeListener("close", closed); }
  };
}
