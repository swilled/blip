import { describe, expect, it } from "vitest";
import type { ActionKind } from "@blip/protocol";
import { matchesConfirmationPhrase, matchesExactConfirmationPhrase, phraseForKind } from "@blip/policy/confirmation";

const phrases: ReadonlyArray<readonly [ActionKind, string]> = [
  ["submit", "submit survey"],
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

  it("keeps existing action phrases and adds the exact email-message send phrase", () => {
    expect(Object.fromEntries(phrases.map(([kind]) => [kind, phraseForKind(kind)]))).toEqual({
      submit: "submit survey",
      pay: "confirm payment",
      delete: "confirm deletion",
      send: "confirm sending",
      "navigate-cross-domain": "leave this site",
    });
    expect(phraseForKind("email-message-send")).toBe("send this email");
    expect(matchesExactConfirmationPhrase("send this email", " SEND   THIS email! ")).toBe(true);
  });

  it.each(["yes", "okay", "yeah", "sure", "confirm sending", "send the email", "send this email now"]) (
    "does not treat %j as the exact email-message send phrase", (text) => {
      expect(matchesExactConfirmationPhrase("send this email", text)).toBe(false);
    },
  );

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
      "submit booking",
      "Place my order",
    ]) {
      expect(matchesConfirmationPhrase(kind, candidate)).toBe(false);
    }
  });
});
