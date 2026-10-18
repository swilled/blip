import { describe, expect, it } from "vitest";
import { fieldValueRequest, requiresFreshFormSnapshot } from "./live-read";

describe("live form reads", () => {
  it("requires a fresh page for read, value, and submit inspections", () => {
    for (const phrase of [
      "read the form", "read back", "what's required", "what's missing", "where am I", "spell email",
      "what's in Your name", "what is written in the age field", "submit survey",
    ]) {
      expect(requiresFreshFormSnapshot(phrase), phrase).toBe(true);
    }
    for (const phrase of ["stop", "repeat", "fill age with 30", "continue"]) {
      expect(requiresFreshFormSnapshot(phrase), phrase).toBe(false);
    }
  });

  it.each([
    ["what's in Your name", "your name"],
    ["what is written in the age field", "age"],
    ["what did I put in email", "email"],
    ["read the value of department", "department"],
  ])("extracts the field label from %s", (phrase, expected) => {
    expect(fieldValueRequest(phrase)).toBe(expected);
  });
});
