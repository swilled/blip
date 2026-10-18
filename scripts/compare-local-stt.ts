// Offline controlled comparison. Synthetic speech/noise is not evidence of a user's accent accuracy.
import { discoverLocalWhisper } from "../apps/server/src/voice/local-whisper";
import { encodeWav } from "../apps/voice/src/recorded-stt";
import { syntheticSpeech } from "./check-local-stt";

const models = ["base.en", "small.en", "medium.en-q5_0"] as const;
const phrases = ["read the form", "what is required", "My name is Rowan Example and I heard about this survey from a friend", "submit form", "submit survey"];
const engines = await Promise.all(models.map(model => discoverLocalWhisper({ model, beamSize: model === "base.en" ? 1 : 5 })));
if (engines.some(engine => !engine)) throw new Error("Install all three comparison models first.");
const summary = models.map(model => ({ model, words: 0, errors: 0, ms: [] as number[], exact: 0, cases: 0 }));
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
function distance(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, n) => n);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(row[j + 1] + 1, next[j] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length];
}
for (const phrase of phrases) {
  const raw = await syntheticSpeech(phrase);
  const original = new Float32Array(raw.length / 2);
  let energy = 0;
  for (let n = 0; n < original.length; n++) { original[n] = raw.readInt16LE(n * 2) / 32768; energy += original[n] ** 2; }
  for (const condition of ["clean", "6dB-noise"] as const) {
    const samples = original.slice(); let seed = 94821;
    const amplitude = Math.sqrt(energy / samples.length) / (10 ** (6 / 20)) * Math.sqrt(3);
    if (condition !== "clean") for (let n = 0; n < samples.length; n++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[n] = Math.max(-1, Math.min(1, samples[n] + (seed / 4294967296 * 2 - 1) * amplitude));
    }
    const wav = Buffer.from(encodeWav([samples], 16000));
    for (let index = 0; index < engines.length; index++) {
      const started = performance.now();
      const result = await engines[index]!(wav, new AbortController().signal);
      const ms = Math.round(performance.now() - started), errors = distance(words(phrase), words(result));
      const stats = summary[index]; stats.words += words(phrase).length; stats.errors += errors; stats.cases++; stats.exact += errors === 0 ? 1 : 0; stats.ms.push(ms);
      console.log(JSON.stringify({ model: models[index], condition, expected: phrase, result, errors, ms }));
    }
  }
}
for (const stats of summary) {
  const sorted = stats.ms.sort((a, b) => a - b);
  console.log(JSON.stringify({ summary: true, ...stats, ms: undefined, medianMs: sorted[Math.floor(sorted.length / 2)], wordErrorRate: stats.errors / stats.words }));
}
