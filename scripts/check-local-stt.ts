// Opt-in real CPU/model check using synthetic Windows speech; never opens the microphone.
import { spawn } from "node:child_process";
import { discoverLocalWhisper, validateWav } from "../apps/server/src/voice/local-whisper";
import { encodeWav } from "../apps/voice/src/recorded-stt";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function syntheticSpeech(text: string): Promise<Buffer> {
  const command = `Add-Type -AssemblyName System.Speech
    $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    $stream = [System.IO.MemoryStream]::new()
    try {
      $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
      $synth.SetOutputToAudioStream($stream, $format)
      $synth.Speak('${text.replaceAll("'", "''")}')
      $synth.SetOutputToNull()
      $data = $stream.ToArray()
      [Console]::OpenStandardOutput().Write($data, 0, $data.Length)
    } finally { $synth.Dispose(); $stream.Dispose() }`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const bytes: Buffer[] = [];
    const deadline = setTimeout(() => { child.kill(); reject(new Error("synthetic-speech-timeout")); }, 15000);
    child.stdout.on("data", b => bytes.push(Buffer.from(b)));
    child.on("error", reject);
    child.on("close", code => { clearTimeout(deadline); code === 0 ? resolve(Buffer.concat(bytes)) : reject(new Error("synthetic-speech-unavailable")); });
  });
}
async function run() {
const transcribe = await discoverLocalWhisper();
if (!transcribe) throw new Error("Run npm.cmd run stt:setup first.");
for (const phrase of ["read the form", "what is required", "My name is Rowan Example and I heard about this survey from a friend", "submit form", "submit survey"]) {
  const pcm = await syntheticSpeech(phrase);
  const samples = new Float32Array(pcm.length / 2);
  for (let n = 0; n < samples.length; n++) samples[n] = pcm.readInt16LE(n * 2) / 32768;
  const wav = Buffer.from(encodeWav([samples], 16000));
  if (!validateWav(wav)) throw new Error("Synthetic sample was silent.");
  const started = performance.now();
  const text = await transcribe(wav, new AbortController().signal);
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const expected = phrase.startsWith("My name") ? "i heard about this survey from a friend" : normalize(phrase);
  const passed = normalize(text).includes(expected);
  console.log(JSON.stringify({ synthetic: true, phrase, recognized: text, elapsedMs: Math.round(performance.now() - started), passed }));
  if (!passed) process.exitCode = 1;
}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
