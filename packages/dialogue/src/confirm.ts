import { normalizeCommand } from "./normalize";

const EDGE_FILLERS = new Set(["um", "uh", "please"]);
const CANCEL_PHRASES = new Set(["cancel", "never mind", "nevermind", "forget it"]);

export const GATE_WINDOW_MS = 1000;

/** Normalize a short utterance into tokens and remove only edge fillers. */
export function phraseTokens(text: string): string[] {
  if (text.length > 200) return [];
  const tokens = normalizeCommand(text).split(" ").filter(Boolean);
  while (tokens.length > 0 && EDGE_FILLERS.has(tokens[0]!)) tokens.shift();
  while (tokens.length > 0 && EDGE_FILLERS.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens;
}

/** Confirmation accepts only an exact token sequence from the requested phrase. */
export function phraseMatches(text: string, phrase: string): boolean {
  if (text.length > 200 || phrase.length > 200) return false;
  const actual = phraseTokens(text);
  const expected = phraseTokens(phrase);
  return expected.length > 0 && actual.length === expected.length && actual.every((token, index) => token === expected[index]);
}

/** Cancellation phrases are exact after punctuation and case normalization. */
export function isCancel(text: string): boolean {
  if (text.length > 200) return false;
  return CANCEL_PHRASES.has(normalizeCommand(text));
}

export function confirmWindowOpen(outstandingCount: number, lastDoneAt: number | null, now: number): boolean {
  return outstandingCount === 0 && lastDoneAt !== null && now - lastDoneAt >= GATE_WINDOW_MS;
}
