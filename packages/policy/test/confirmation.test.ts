import { describe, expect, it } from "vitest";
import type { ActionKind } from "@blip/protocol";
import { matchesConfirmationPhrase, phraseForKind } from "@blip/policy/confirmation";

const phrases: ReadonlyArray<readonly [ActionKind, string]> = [
  ["submit", "submit booking"],
  ["pay", "confirm payment"],
  ["delete", "confirm deletion"],
  ["send", "confirm sending"],
  ["navigate-cross-domain", "leave this site"],
];

describe("confirmation phrases", () => {
  it.each(phrases)("uses the fixed phrase for %s", (kind, phrase) => {
    expect(phraseForKind(kind)).toBe(phrase);
    expect(matchesConfirmationPhrase(kind, phrase)).toBe(true);
  });

  it.each(phrases)("normalizes case, whitespace, and terminal punctuation for %s", (kind, phrase) => {
    const irregular = `  ${phrase.toUpperCase().replace(/ /g, "\t\n   ")}...?!  `;
    expect(matchesConfirmationPhrase(kind, irregular)).toBe(true);
  });

  it.each(phrases)("rejects near matches and unrelated wording for %s", (kind, phrase) => {
    const otherPhrase = phrases.find(([otherKind]) => otherKind !== kind)![1];
    for (const candidate of [
      "",
      "   \t\n",
      "yes",
      "yes, please",
      phrase.split(" ")[0]!,
      `${phrase} now`,
      `please ${phrase}`,
      `confirm ${phrase}`,
      otherPhrase,
      "Place my order",
    ]) {
      expect(matchesConfirmationPhrase(kind, candidate)).toBe(false);
    }
  });
});
