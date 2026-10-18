import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TranscribeAudio = ((wav: Buffer, signal: AbortSignal) => Promise<string>) & { engine?: string };
export const MAX_WAV_BYTES = 44 + 16000 * 2 * 10;

/** Accept exactly our bounded 16 kHz mono PCM format. Reject silence before model decoding. */
export function validateWav(wav: Buffer): boolean {
  if (wav.length < 44 + 6400 || wav.length > MAX_WAV_BYTES || (wav.length - 44) % 2) throw new Error("invalid-audio");
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 16) !== "WAVEfmt "
    || wav.readUInt32LE(4) !== wav.length - 8 || wav.readUInt32LE(16) !== 16
    || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16000
    || wav.readUInt32LE(28) !== 32000 || wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16
    || wav.toString("ascii", 36, 40) !== "data" || wav.readUInt32LE(40) !== wav.length - 44) throw new Error("invalid-audio");
  let energy = 0;
  for (let i = 44; i < wav.length; i += 2) energy += (wav.readInt16LE(i) / 32768) ** 2;
  return Math.sqrt(energy / ((wav.length - 44) / 2)) >= 0.003;
}

export async function discoverLocalWhisper(options: { model?: "base.en" | "small.en" | "medium.en-q5_0"; beamSize?: number } = {}): Promise<TranscribeAudio | undefined> {
  if (process.platform !== "win32" || process.arch !== "x64") return undefined;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const executable = path.join(root, ".local-stt/bin/Release/whisper-cli.exe");
  const configured = options.model ?? process.env["BLIP_STT_MODEL"];
  if (configured !== undefined && !["base.en", "small.en", "medium.en-q5_0"].includes(configured)) throw new Error("Unsupported BLIP_STT_MODEL. Use base.en, small.en or medium.en-q5_0.");
  let selected = configured;
  if (!selected) {
    try { await access(path.join(root, ".local-stt/ggml-small.en.bin")); selected = "small.en"; }
    catch { selected = "base.en"; }
  }
  const model = path.join(root, `.local-stt/ggml-${selected}.bin`);
  try { await Promise.all([access(executable), access(model)]); } catch { return undefined; }
  const transcribe: TranscribeAudio = (wav, signal) => new Promise<string>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    // WAV goes through stdin; stdout is only the transcript. No recordings or transcript files.
    // No command grammar/prompt may bias a recognition into an authorization phrase.
    // Override the output basename only: stdin's default '-' disables the live stdout callback.
    // No --output-* flag is enabled, so this basename never creates a file (Windows /dev/stdout is unsupported).
    const child = spawn(executable, ["-m", model, "-f", "-", "-of", "blip-memory", "-l", "en", "-np", "-nt", "-ng", "-sns", "-t", "4", "-bs", String(options.beamSize ?? 5), "-bo", "5", "-nf"], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let output = "", settled = false;
    const finish = (error?: Error) => {
      if (settled) return; settled = true;
      clearTimeout(deadline); signal.removeEventListener("abort", abort);
      child.kill();
      if (error) reject(error);
      else {
        const text = output.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
        if (text.length > 500) reject(new Error("transcript-too-long"));
        else resolve(text);
      }
    };
    const abort = () => finish(new Error("cancelled"));
    const deadline = setTimeout(() => finish(new Error("recognition-timeout")), 20000);
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () => finish(new Error("recognizer-unavailable")));
    child.stdin.on("error", () => finish(new Error("recognizer-input-failed")));
    child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 4096) finish(new Error("transcript-too-long")); });
    child.on("close", code => finish(code === 0 ? undefined : new Error("recognizer-failed")));
    child.stdin.end(wav);
  });
  transcribe.engine = `whisper.cpp ${selected}`;
  return transcribe;
}
