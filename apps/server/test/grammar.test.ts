import { describe, expect, it } from "vitest";
import { matchGrammar, type LocalCommand } from "../src/brain/grammar";

describe("matchGrammar", () => {
  it.each([
    ["what's here", "describe"],
    ["whats here", "describe"],
    ["what is here", "describe"],
    ["describe", "describe"],
    ["describe the page", "describe"],
    ["what's on this page", "describe"],
    ["what's required", "whats_required"],
    ["which fields are required", "whats_required"],
    ["read the form", "read_form"],
    ["read form", "read_form"],
    ["what went wrong", "what_went_wrong"],
    ["stop", "stop"],
    ["be quiet", "stop"],
    ["repeat", "repeat"],
    ["say that again", "repeat"],
  ] as const)("%s -> %s", (text, type) => {
    expect(matchGrammar(text)).toEqual({ type });
  });

  it("ignores case, punctuation and extra whitespace", () => {
    expect(matchGrammar("  WHAT'S   HERE?! ")).toEqual({ type: "describe" });
    expect(matchGrammar("Read, the form.")).toEqual({ type: "read_form" });
    expect(matchGrammar("  WHAT  WENT WRONG?! ")).toEqual({ type: "what_went_wrong" });
    expect(matchGrammar("What’s required")).toEqual({ type: "whats_required" });
  });

  it("returns null for anything else", () => {
    expect(matchGrammar("describe my bank account")).toBeNull();
    expect(matchGrammar("")).toBeNull();
    expect(matchGrammar("submit the form")).toBeNull();
    expect(matchGrammar("x".repeat(500))).toBeNull();
    expect(matchGrammar("what is ".repeat(60))).toBeNull();
  });

  it("is linear-time on hostile input", () => {
    const hostile = `${"a ".repeat(100)}!`.slice(0, 200);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) matchGrammar(hostile);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("can never produce a gated or filling intent (type-level and value-level)", () => {
    // If LocalCommand ever grew request_action, click_safe or set_fields this assignment would stop compiling.
    const allowed: LocalCommand["type"][] = ["describe", "whats_required", "read_form", "what_went_wrong", "stop", "repeat"];
    // @ts-expect-error request_action is not a local command
    const bad: LocalCommand["type"] = "request_action";
    expect(allowed).not.toContain(bad);
    for (const phrase of [
      "click submit",
      "book the room",
      "pay now",
      "fill my name",
      "delete everything",
      "confirm",
      "yes submit",
      "submit survey",
      "confirm payment",
      "confirm deletion",
      "confirm sending",
      "leave this site",
      "what is happening",
      "why did this happen",
    ]) {
      expect(matchGrammar(phrase)).toBeNull();
    }
  });
});
