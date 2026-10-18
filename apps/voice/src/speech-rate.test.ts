import { describe, expect, it } from "vitest";
import { adjustSpeechRate, createSpeechRate } from "./speech-rate";

describe("session speech rate", () => {
  it("starts each session at the default rate", () => {
    expect(createSpeechRate()).toBe(1.0);
    expect(createSpeechRate()).toBe(1.0);
  });

  it("increases by two tenths for an audible change", () => {
    expect(adjustSpeechRate(1.0, "faster")).toEqual({ rate: 1.2, limit: null });
    expect(adjustSpeechRate(1.8, "faster")).toEqual({ rate: 2.0, limit: null });
  });

  it("decreases by two tenths for an audible change", () => {
    expect(adjustSpeechRate(1.0, "slower")).toEqual({ rate: 0.8, limit: null });
    expect(adjustSpeechRate(0.7, "slower")).toEqual({ rate: 0.5, limit: null });
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

    expect(changed.rate).toBe(1.2);
    expect(secondSession).toBe(1.0);
  });
});
