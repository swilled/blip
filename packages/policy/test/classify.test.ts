import { describe, expect, it } from "vitest";
import { classifyAction, classifyBrowserLink } from "@blip/policy/classify";

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

describe("classifyBrowserLink", () => {
  const link = (text: string, href: string, extra: Record<string, unknown> = {}) => ({
    tag: "a", text, href, origin: "https://site.test/article", ...extra,
  });

  const cases: Array<{ text: string; href: string; expected: string; extra?: Record<string, unknown> }> = [
    { text: "Read the field guide", href: "https://site.test/guide", expected: "same-origin-safe-get" },
    { text: "Pay now", href: "https://site.test/pay", expected: "confirmation-required" },
    { text: "Open", href: "https://site.test/account/delete", expected: "confirmation-required" },
    { text: "Sign out", href: "https://site.test/session", expected: "confirmation-required" },
    { text: "Unsubscribe", href: "https://site.test/preferences", expected: "confirmation-required" },
    { text: "Accept invitation", href: "https://site.test/invitation", expected: "confirmation-required" },
    { text: "Download report", href: "https://site.test/report", expected: "confirmation-required" },
    { text: "Read policy", href: "https://outside.test/policy", expected: "confirmation-required" },
    { text: "Continue", href: "https://site.test/continue", expected: "confirmation-required" },
    { text: "Jump to details", href: "https://site.test/article#details", expected: "confirmation-required" },
    { text: "Read policy", href: "javascript:alert(1)", expected: "unsupported" },
    { text: "Read policy", href: "https://site.test/policy", expected: "unsupported", extra: { target: "_blank" } },
  ];

  it.each(cases)("classifies $text at $href as $expected", ({ text, href, expected, extra }) => {
    expect(classifyBrowserLink(link(text, href, extra))).toBe(expected);
  });

  it("does not loosen form action classification for ordinary same-origin links", () => {
    const facts = link("Read the field guide", "https://site.test/guide");
    expect(classifyBrowserLink(facts)).toBe("same-origin-safe-get");
    expect(classifyAction(facts)).toMatchObject({ kind: "submit" });
  });
});
