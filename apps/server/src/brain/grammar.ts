// Deterministic grammar-first routing (D-24). Every match is an exact lookup of a normalized phrase:
// no regex with nested quantifiers or alternation inside a repetition, so a hostile 500-character
// utterance cannot blow up (linear-time normalization, constant-time lookup).
import type { Intent } from "@blip/protocol";

/**
 * A command the grammar can resolve locally: a safe Intent or `repeat`. Never request_action,
 * click_safe or set_fields, so the grammar cannot request or perform any page action.
 */
export type LocalCommand =
  | Extract<Intent, { type: "describe" | "whats_required" | "read_form" | "stop" }>
  | { type: "what_went_wrong" }
  | { type: "repeat" };

/** Lower-case, drop punctuation (apostrophes included), collapse whitespace. */
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TABLE: ReadonlyArray<readonly [ReadonlySet<string>, LocalCommand]> = [
  [
    new Set(["whats here", "what is here", "describe", "describe the page", "describe this page", "whats on this page", "what is on this page"]),
    { type: "describe" },
  ],
  [new Set(["whats required", "what is required", "which fields are required", "what fields are required"]), { type: "whats_required" }],
  [new Set(["read the form", "read form"]), { type: "read_form" }],
  [new Set(["what went wrong"]), { type: "what_went_wrong" }],
  [new Set(["stop", "be quiet", "quiet", "stop talking"]), { type: "stop" }],
  [new Set(["repeat", "say that again", "repeat that"]), { type: "repeat" }],
];

/** Resolve an utterance to a local command, or null when it needs the model. */
export function matchGrammar(text: string): LocalCommand | null {
  // Anything this long cannot be one of the short phrases, so skip even the linear normalization.
  if (text.length > 200) return null;
  const key = normalizeUtterance(text);
  for (const [phrases, command] of TABLE) {
    if (phrases.has(key)) return { ...command };
  }
  return null;
}
