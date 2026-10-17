import { describe, expect, it } from "vitest";

type NormalizeApi = {
  normalizeCommand?: (text: string) => string;
  cleanSpoken?: (text: string, max?: number) => string;
  cleanValue?: (text: string) => string;
  normalizeEmail?: (text: string) => string | null;
  normalizeNumberish?: (text: string, kind: "tel" | "number" | "text") => string;
  wordsToNumber?: (tokens: string[]) => number | null;
  speakable?: (value: string, kind: "email" | "tel" | "number" | "text") => string;
};

// Keep the RED run assertion-driven while the module is still absent.
const loaded = await import("./normalize.js").catch(() => null) as NormalizeApi | null;
const normalizeCommand = (text: string) => loaded?.normalizeCommand?.(text) ?? "";
const cleanSpoken = (text: string, max?: number) => loaded?.cleanSpoken?.(text, max) ?? "";
const cleanValue = (text: string) => loaded?.cleanValue?.(text) ?? "";
const normalizeEmail = (text: string) => loaded?.normalizeEmail?.(text) ?? null;
const normalizeNumberish = (text: string, kind: "tel" | "number" | "text") => loaded?.normalizeNumberish?.(text, kind) ?? text;
const wordsToNumber = (tokens: string[]) => loaded?.wordsToNumber?.(tokens) ?? null;
const speakable = (value: string, kind: "email" | "tel" | "number" | "text") => loaded?.speakable?.(value, kind) ?? value;

describe("spoken-text normalization", () => {
  it("converts spoken and typed email addresses", () => {
    const cases: Array<[string, string | null]> = [
      ["Jane at example dot com.", "jane@example.com"],
      ["jane@example.com", "jane@example.com"],
      ["jane @ example . com", "jane@example.com"],
      ["pat at work at example dot com", "patatwork@example.com"],
      ["j a n e at example dot org", "jane@example.org"],
      ["bob dash smith at mail dot co dot uk", "bob-smith@mail.co.uk"],
      ["bob underscore one at x dot com", "bob_1@x.com"],
      ["bob plus one at x dot com", "bob+1@x.com"],
      ["a period b at x dot com", "a.b@x.com"],
      ["jane at example dot co dot uk!", "jane@example.co.uk"],
      ["JANE AT EXAMPLE DOT COM", "jane@example.com"],
      ["zero at x dot com", "0@x.com"],
      ["one two at x dot com", "12@x.com"],
      ["a oh one at x dot com", "a01@x.com"],
      ["one at two dot com", "1@2.com"],
      ["jane at example dot com,", "jane@example.com"],
      ["jane at example dot com?", "jane@example.com"],
      ["jane at example dot com.", "jane@example.com"],
      ["jane at example", null],
      ["hello", null],
      ["at example dot com", null],
      ["jane at example dot", null],
      ["jane@@example.com", null],
      ["jane example.com", null],
      ["jane at example dot com" + " ".repeat(180), null],
      ["x".repeat(201), null],
    ];
    for (const [input, expected] of cases) expect(normalizeEmail(input), input).toBe(expected);
  });

  it("normalizes number words without changing typed digits or unknown words", () => {
    expect(normalizeNumberish("five five five oh one double zero", "tel")).toBe("5550100");
    expect(normalizeNumberish("twenty five", "number")).toBe("25");
    expect(normalizeNumberish("one hundred and five", "number")).toBe("105");
    expect(normalizeNumberish("555 0100", "tel")).toBe("555 0100");
    expect(normalizeNumberish("please enter a passphrase", "text")).toBe("please enter a passphrase");
    expect(normalizeNumberish("twenty five", "text")).toBe("twenty five");
    expect(normalizeNumberish("five apples", "number")).toBe("5 apples");
  });

  it("parses number words from zero through nine hundred ninety nine", () => {
    const cases: Array<[string[], number | null]> = [
      [["zero"], 0], [["nine"], 9], [["ten"], 10], [["nineteen"], 19],
      [["twenty"], 20], [["twenty", "five"], 25], [["ninety", "nine"], 99],
      [["one", "hundred"], 100], [["one", "hundred", "and", "five"], 105],
      [["nine", "hundred", "ninety", "nine"], 999], [["one", "thousand"], null],
      [["five", "five"], null], [["unknown"], null],
    ];
    for (const [tokens, expected] of cases) expect(wordsToNumber(tokens), tokens.join(" ")).toBe(expected);
  });

  it("sanitizes and caps spoken and submitted values", () => {
    expect(cleanSpoken(" \u0000Hi\u007f   there\n", 80)).toBe("Hi there");
    expect(cleanSpoken("x".repeat(90), 80)).toBe("x".repeat(80));
    expect(cleanSpoken("x".repeat(201))).toBe("");
    expect(cleanValue(" \u0000one\u009f   two\n ")).toBe("one two");
    expect(cleanValue("x".repeat(350))).toBe("x".repeat(300));
  });

  it("keeps command normalization byte-for-byte compatible with the old reducer helper", () => {
    const cases: Array<[string, string]> = [
      ["What's here?", "whats here"],
      ["WHAT’S ON THIS PAGE!", "whats on this page"],
      ["fill  Email\t is Jane@Example.com", "fill email is jane example com"],
      ["  A---B  ", "a b"],
      ["café", "caf"],
      ["x".repeat(201), ""],
    ];
    for (const [input, expected] of cases) expect(normalizeCommand(input), input).toBe(expected);
  });

  it("makes email and long numeric values speakable", () => {
    expect(speakable("jane@example.com", "email")).toBe("jane at example dot com");
    expect(speakable("5550100", "tel")).toBe("5 5 5 0 1 0 0");
    expect(speakable("123456", "number")).toBe("1 2 3 4 5 6");
    expect(speakable("Hello, world.", "text")).toBe("Hello, world.");
  });
});
