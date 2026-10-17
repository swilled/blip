import type { ActionKind } from "@blip/protocol";

const CONFIRMATION_PHRASES: Readonly<Partial<Record<ActionKind, string>>> = {
  submit: "submit survey",
  pay: "confirm payment",
  delete: "confirm deletion",
  send: "confirm sending",
  "navigate-cross-domain": "leave this site",
};

function normalizeConfirmation(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[\p{P}\s]+$/gu, "")
    .trim();
}

/** Return the fixed confirmation phrase for a gated action kind. */
export function phraseForKind(kind: ActionKind): string | undefined {
  return CONFIRMATION_PHRASES[kind];
}

/** Match only the fixed phrase for this kind after the allowed normalization. */
export function matchesConfirmationPhrase(kind: ActionKind, text: string): boolean {
  const phrase = phraseForKind(kind);
  return phrase !== undefined && normalizeConfirmation(text) === phrase;
}
