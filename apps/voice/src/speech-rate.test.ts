import { describe, expect, it } from "vitest";
import { adjustSpeechRate, createSpeechRate, SPEECH_RATES } from "./speech-rate";

describe("session speech rate", () => {
  it("starts each session at the default rate", () => {
    expect(createSpeechRate()).toBe(1.0);
    expect(createSpeechRate()).toBe(1.0);
  });

  it("increases by two tenths for an audible change", () => {
    expect(SPEECH_RATES.map(rate => Math.trunc(10 * Math.log10(rate)))).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(adjustSpeechRate(1.0, "faster")).toEqual({ rate: 1.26, limit: null });
    expect(adjustSpeechRate(1.59, "faster")).toEqual({ rate: 2.0, limit: null });
  });

  it("decreases by two tenths for an audible change", () => {
    expect(adjustSpeechRate(1.0, "slower")).toEqual({ rate: 0.79, limit: null });
    expect(adjustSpeechRate(0.63, "slower")).toEqual({ rate: 0.5, limit: null });
  });

  it("keeps repeated faster attempts bounded at 2.0", () => {
    expect(adjustSpeechRate(2.0, "faster")).toEqual({ rate: 2.0, limit: "fastest" });
    expect(adjustSpeechRate(2.0, "faster")).toEqual({ rate: 2.0, limit: "fastest" });
  });

  it("keeps repeated slower attempts bounded at 0.5", () => {
    expect(adjustSpeechRate(0.5, "slower")).toEqual({ rate: 0.5, limit: "slowest" });
    expect(adjustSpeechRate(0.5, "slower")).toEqual({ rate: 0.5, limit: "slowest" });
  });

  it("keeps independent session values local", () => {
    const firstSession = createSpeechRate();
    const secondSession = createSpeechRate();
    const changed = adjustSpeechRate(firstSession, "faster");

    expect(changed.rate).toBe(1.26);
    expect(secondSession).toBe(1.0);
  });
});
