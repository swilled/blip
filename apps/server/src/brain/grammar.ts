// Deterministic grammar-first routing (D-24). Every pattern is anchored and linear-time: no nested
// quantifiers, no alternation inside a repetition, so a hostile 500-character utterance cannot blow up.

/** A command the grammar can resolve locally. Never a gated kind: request_action/click_safe/set_fields are impossible here. */
export type LocalCommand = { type: "describe" };

/** Lower-case, drop punctuation (apostrophes included), collapse whitespace. */
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TABLE: ReadonlyArray<readonly [ReadonlySet<string>, LocalCommand]> = [
  [new Set(["whats here", "what is here", "describe"]), { type: "describe" }],
];

/** Resolve an utterance to a local command, or null when it needs the model. */
export function matchGrammar(text: string): LocalCommand | null {
  // The normalizer is linear; anything this long cannot be one of the short phrases anyway.
  if (text.length > 200) return null;
  const key = normalizeUtterance(text);
  for (const [phrases, command] of TABLE) {
    if (phrases.has(key)) return { ...command };
  }
  return null;
}
