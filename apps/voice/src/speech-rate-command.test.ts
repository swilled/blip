import { describe, expect, it } from "vitest";
import { parseSpeechRateCommand } from "./speech-rate";

describe("speech rate command parsing", () => {
  it("accepts only exact normalized faster and slower commands", () => {
    expect(parseSpeechRateCommand("Faster!")).toBe("faster");
    expect(parseSpeechRateCommand("  SLOWER  ")).toBe("slower");
  });

  it("leaves other utterances on the ordinary command path", () => {
    expect(parseSpeechRateCommand("please go faster")).toBeNull();
    expect(parseSpeechRateCommand("faster please")).toBeNull();
    expect(parseSpeechRateCommand("fill my name")).toBeNull();
  });
});
