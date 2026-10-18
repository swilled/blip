import { describe, expect, it } from "vitest";
import { adjustSpeechRate, createSpeechRate } from "./speech-rate";

describe("session speech rate", () => {
  it("starts each session at the default rate", () => {
    expect(createSpeechRate()).toBe(1.0);
    expect(createSpeechRate()).toBe(1.0);
  });

  it("increases by one tenth and rounds to one decimal place", () => {
    expect(adjustSpeechRate(1.0, "faster")).toEqual({ rate: 1.1, limit: null });
    expect(adjustSpeechRate(1.4, "faster")).toEqual({ rate: 1.5, limit: null });
  });

  it("decreases by one tenth and rounds to one decimal place", () => {
    expect(adjustSpeechRate(1.0, "slower")).toEqual({ rate: 0.9, limit: null });
    expect(adjustSpeechRate(0.9, "slower")).toEqual({ rate: 0.8, limit: null });
  });

  it("keeps repeated faster attempts bounded at 1.5", () => {
    expect(adjustSpeechRate(1.5, "faster")).toEqual({ rate: 1.5, limit: "fastest" });
    expect(adjustSpeechRate(1.5, "faster")).toEqual({ rate: 1.5, limit: "fastest" });
  });

  it("keeps repeated slower attempts bounded at 0.8", () => {
    expect(adjustSpeechRate(0.8, "slower")).toEqual({ rate: 0.8, limit: "slowest" });
    expect(adjustSpeechRate(0.8, "slower")).toEqual({ rate: 0.8, limit: "slowest" });
  });

  it("keeps independent session values local", () => {
    const firstSession = createSpeechRate();
    const secondSession = createSpeechRate();
    const changed = adjustSpeechRate(firstSession, "faster");

    expect(changed.rate).toBe(1.1);
    expect(secondSession).toBe(1.0);
  });
});
