import { describe, expect, it } from "vitest";
import { classifyAction } from "../src/classify";

const button = (text: string, overrides: Record<string, unknown> = {}) => ({
  tag: "button",
  buttonType: "button",
  text,
  ...overrides,
});

describe("classifyAction", () => {
  it.each([
    ["Pay now", "pay"],
    ["Order a replacement", "pay"],
    ["Delete this profile", "delete"],
    ["Cancel-account", "delete"],
    ["Publish changes", "send"],
  ])("classifies gated text before structure: %s", (text, kind) => {
    expect(classifyAction(button(text))).toMatchObject({ kind });
  });

  it.each([
    [{ text: "Close and confirm", tag: "button", buttonType: "button" }, "submit"],
    [{ text: "Close", tag: "a", href: "/checkout", origin: "https://shop.test" }, "pay"],
    [{ text: "Open", tag: "a", href: "/profile/delete", origin: "https://shop.test" }, "delete"],
    [{ text: "Open", tag: "a", href: "/post", origin: "https://shop.test", target: "send" }, "send"],
  ])("scans visible text, href and target for gated terms", (facts, kind) => {
    expect(classifyAction(facts)).toMatchObject({ kind });
  });

  it("allows Close only when a button or same-origin link is structurally safe", () => {
    expect(classifyAction(button("Close"))).toMatchObject({ kind: "click-safe" });
    expect(classifyAction({
      tag: "a",
      text: "Close",
      href: "/dialog",
      origin: "https://shop.test",
    })).toMatchObject({ kind: "click-safe" });
    expect(classifyAction({
      tag: "a",
      text: "Close",
      href: "https://other.test/dialog",
      origin: "https://shop.test",
    })).toMatchObject({ kind: "navigate-cross-domain" });
  });

  it.each(["Next", "Continue", "Save", "Confirm", "Finish"])(
    "never treats %s as click-safe",
    (text) => {
      expect(classifyAction(button(text))).not.toMatchObject({ kind: "click-safe" });
    },
  );

  it.each([
    [{ tag: "button", text: "Close" }, "submit"],
    [{ tag: "button", buttonType: "submit", text: "Close" }, "submit"],
    [{ tag: "a", text: "Close", href: "http://[", origin: "https://shop.test" }, "submit"],
    [{ tag: "a", text: "Close", href: "/dialog" }, "submit"],
    [{ tag: "div", role: "button", text: "Close" }, "submit"],
    [{ tag: "x-unknown", text: "Close" }, "submit"],
    [{ tag: "button", buttonType: "button", text: "" }, "submit"],
  ])("fails closed for unsupported action facts", (facts, kind) => {
    const result = classifyAction(facts);
    expect(result.kind).toBe(kind);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("normalizes and caps text before matching", () => {
    expect(classifyAction(button(`${"x".repeat(501)} pay`))).toMatchObject({ kind: "submit" });
    expect(classifyAction(button("  PAY   NOW  "))).toMatchObject({ kind: "pay" });
  });

  it("always explains positive safe classifications", () => {
    expect(classifyAction(button("Add another guest")).reasons.length).toBeGreaterThan(0);
  });
});
