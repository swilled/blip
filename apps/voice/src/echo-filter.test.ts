import { describe, it, expect } from "vitest";
import {
  isStopPhrase,
  isEchoOfSpeech,
  heardDuringSpeech,
  mayArmDuringSpeech,
  isBargeInUtterance,
} from "./echo-filter";
import { effectiveBargeInMode, GATE_08_PRESENT, GUARD_MS } from "./config";

describe("isStopPhrase", () => {
  it("accepts stop variants", () => {
    for (const t of ["stop", "Stop.", "stop it", "please stop", "Stop it, please"]) {
      expect(isStopPhrase(t)).toBe(true);
    }
  });
  it("rejects sentences containing the word", () => {
    for (const t of ["don't stop the form", "stopwatch", "stop the form", ""]) {
      expect(isStopPhrase(t)).toBe(false);
    }
  });
});

describe("isEchoOfSpeech", () => {
  const spoken = "Contact form. What's here: 3 fields, 2 required, 1 action.";
  it("is true when most heard words appear in order", () => {
    expect(isEchoOfSpeech("what's here", spoken)).toBe(true);
    expect(isEchoOfSpeech("contact form what's here 3 fields", spoken)).toBe(true);
  });
  it("is false for unrelated words", () => {
    expect(isEchoOfSpeech("fill the email with bob", spoken)).toBe(false);
    expect(isEchoOfSpeech("", spoken)).toBe(false);
    expect(isEchoOfSpeech("what's here", "")).toBe(false);
  });
  it("requires order", () => {
    expect(isEchoOfSpeech("action required fields", spoken)).toBe(false);
  });
});

describe("heardDuringSpeech", () => {
  it("is true while speaking and within the guard window", () => {
    expect(heardDuringSpeech(true, 99999)).toBe(true);
    expect(heardDuringSpeech(false, GUARD_MS - 1)).toBe(true);
    expect(heardDuringSpeech(false, GUARD_MS)).toBe(true);
    expect(heardDuringSpeech(false, GUARD_MS + 1)).toBe(false);
  });
});

describe("barge-in mode", () => {
  it("ptt-only never arms recognition during speech and never yields a barge-in", () => {
    expect(mayArmDuringSpeech("ptt-only")).toBe(false);
    expect(isBargeInUtterance("open the menu", "contact form", "ptt-only")).toBe(false);
  });
  it("voice mode arms, and passes only non-echo results", () => {
    expect(mayArmDuringSpeech("voice")).toBe(true);
    expect(isBargeInUtterance("open the menu", "contact form", "voice")).toBe(true);
    expect(isBargeInUtterance("contact form", "contact form", "voice")).toBe(false);
  });
  it("effective mode is forced to ptt-only while GATE_08_PRESENT is false", () => {
    expect(GATE_08_PRESENT).toBe(false);
    expect(effectiveBargeInMode()).toBe("ptt-only");
    expect(mayArmDuringSpeech()).toBe(false);
  });
});

describe("effectiveBargeInMode parameters", () => {
  it("returns the spike mode only when the gate is present", () => {
    expect(effectiveBargeInMode(false, "voice")).toBe("ptt-only");
    expect(effectiveBargeInMode(true, "voice")).toBe("voice");
    expect(effectiveBargeInMode(true, "ptt-only")).toBe("ptt-only");
  });
});
