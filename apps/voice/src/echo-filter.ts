// Pure text helpers for barge-in. No DOM access.
// The echo filter is a convenience only. It is never a safety control: confirm phrases
// are matched in server code (GATE-08), never in the window.
import { GUARD_MS, effectiveBargeInMode, type BargeInMode } from "./config";

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True only when the whole utterance is a stop request (VOX-06). */
export function isStopPhrase(text: string): boolean {
  const w = words(text).join(" ");
  return /^(please )?stop( it)?( please)?$/.test(w);
}

/** True when at least 70 percent of the heard words appear, in order, in the spoken text. */
export function isEchoOfSpeech(heard: string, spoken: string): boolean {
  const h = words(heard);
  const s = words(spoken);
  if (h.length === 0 || s.length === 0) return false;
  let pos = 0;
  let matched = 0;
  for (const word of h) {
    const idx = s.indexOf(word, pos);
    if (idx !== -1) {
      matched += 1;
      pos = idx + 1;
    }
  }
  return matched / h.length >= 0.7;
}

/** Informational flag: the utterance began while speaking or within GUARD_MS after speech ended. */
export function heardDuringSpeech(isSpeaking: boolean, msSinceSpeechEnd: number): boolean {
  return isSpeaking || msSinceSpeechEnd <= GUARD_MS;
}

/** Recognition may be armed during Blip's speech only in voice barge-in mode. */
export function mayArmDuringSpeech(mode: BargeInMode = effectiveBargeInMode()): boolean {
  return mode === "voice";
}

/** A result received during speech is a barge-in utterance only in voice mode and when not an echo. */
export function isBargeInUtterance(
  heard: string,
  spoken: string,
  mode: BargeInMode = effectiveBargeInMode(),
): boolean {
  if (!mayArmDuringSpeech(mode)) return false;
  return !isEchoOfSpeech(heard, spoken);
}
