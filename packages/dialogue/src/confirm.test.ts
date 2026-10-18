import { describe, expect, it } from "vitest";

type ConfirmApi = {
  phraseTokens?: (text: string) => string[];
  phraseMatches?: (text: string, phrase: string) => boolean;
  isCancel?: (text: string) => boolean;
  GATE_WINDOW_MS?: number;
  confirmWindowOpen?: (outstandingCount: number, lastDoneAt: number | null, now: number) => boolean;
};

const loaded = await import("./confirm.js").catch(() => null) as ConfirmApi | null;
const phraseTokens = (text: string) => loaded?.phraseTokens?.(text) ?? [];
const phraseMatches = (text: string, phrase: string) => loaded?.phraseMatches?.(text, phrase) ?? false;
const isCancel = (text: string) => loaded?.isCancel?.(text) ?? false;
const GATE_WINDOW_MS = loaded?.GATE_WINDOW_MS ?? 1000;
const confirmWindowOpen = (outstandingCount: number, lastDoneAt: number | null, now: number) => loaded?.confirmWindowOpen?.(outstandingCount, lastDoneAt, now) ?? false;

describe("fail-closed confirm phrase matching", () => {
  it("accepts only the exact requested phrase after edge fillers and punctuation", () => {
    for (const text of ["submit survey", "Submit Survey.", "please submit survey", "um submit survey uh", "submit, survey"]) {
      expect(phraseMatches(text, "submit survey"), text).toBe(true);
    }
  });

  it("rejects affirmatives and near-phrases in a false table", () => {
    const falsePhrases = [
      "yes", "yeah", "yep", "ok", "okay", "sure", "do it", "go ahead", "confirm", "submit", "submit it",
      "yes submit survey", "submit the survey", "submit surveys", "submit survey now", "I confirm", "affirmative",
      "sounds good", "that's right", "let's do it", "please do", "you can submit", "submit the form", "yes please",
      "I agree", "confirmed", "do that", "okay submit survey", "submit survey please now", "submit survey tomorrow",
      "survey submit", "submit survey" + "x".repeat(201),
    ];
    expect(falsePhrases.length).toBeGreaterThanOrEqual(25);
    for (const text of falsePhrases) expect(phraseMatches(text, "submit survey"), text).toBe(false);
  });

  it("tokenizes punctuation and removes only edge fillers", () => {
    expect(phraseTokens("Please, submit-survey, uh!").length).toBe(2);
    expect(phraseTokens("Please, submit-survey, uh!").join(" ")).toBe("submit survey");
    expect(phraseTokens("submit please survey").join(" ")).toBe("submit please survey");
    expect(phraseTokens("x".repeat(201)).length).toBe(0);
  });

  it("treats only the exact cancel phrases as cancel", () => {
    for (const text of ["cancel", "never mind", "nevermind", "forget it", "Cancel!"]) expect(isCancel(text), text).toBe(true);
    for (const text of ["cancel submit", "never", "forget", "cancel it", "x".repeat(201)]) expect(isCancel(text), text).toBe(false);
  });

  it("opens the gate window only after one second with no outstanding speech", () => {
    expect(GATE_WINDOW_MS).toBe(1000);
    expect(confirmWindowOpen(0, 1000, 2000)).toBe(true);
    expect(confirmWindowOpen(0, 1000, 1999)).toBe(false);
    expect(confirmWindowOpen(1, 1000, 2000)).toBe(false);
    expect(confirmWindowOpen(0, null, 2000)).toBe(false);
  });
});
