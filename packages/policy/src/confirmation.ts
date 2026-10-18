import type { ActionKind } from "@blip/protocol";

/** Fixed, core-selected phrase contexts. The page-task phrase is local pending written voice-owner review. */
export type ConfirmationPhraseKind = ActionKind | "email-message-send";

const CONFIRMATION_PHRASES: Readonly<Partial<Record<ConfirmationPhraseKind, string>>> = {
  submit: "submit survey",
  pay: "confirm payment",
  delete: "confirm deletion",
  send: "confirm sending",
  "email-message-send": "send this email",
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
export function phraseForKind(kind: ConfirmationPhraseKind): string | undefined {
  return CONFIRMATION_PHRASES[kind];
}

/** Match a core-selected phrase exactly after only the established case/space/punctuation normalization. */
export function matchesExactConfirmationPhrase(expectedPhrase: string, text: string): boolean {
  const isApprovedPhrase = Object.values(CONFIRMATION_PHRASES).some((phrase) => phrase === expectedPhrase);
  return isApprovedPhrase && normalizeConfirmation(text) === expectedPhrase;
}

/** Match only the fixed phrase for this kind after the allowed normalization. */
export function matchesConfirmationPhrase(kind: ActionKind, text: string): boolean {
  const phrase = phraseForKind(kind);
  return phrase !== undefined && matchesExactConfirmationPhrase(phrase, text);
}
