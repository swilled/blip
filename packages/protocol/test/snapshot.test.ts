import { describe, expect, it } from "vitest";
import { ActionKind, GATED_KINDS, RawElement, Snapshot, isGatedKind } from "../src/index";
import { makeElement, makeSnapshot } from "./helpers";

describe("ActionKind and isGatedKind (D-11, fail closed)", () => {
  it("has exactly the nine drafted members", () => {
    expect([...ActionKind.options].sort()).toEqual(
      ["fill", "select", "check", "click-safe", "submit", "pay", "delete", "send", "navigate-cross-domain"].sort(),
    );
    expect(ActionKind.options).toHaveLength(9);
  });

  it("lists the five gated kinds", () => {
    expect([...GATED_KINDS].sort()).toEqual(["delete", "navigate-cross-domain", "pay", "send", "submit"]);
  });

  it.each(["submit", "pay", "delete", "send", "navigate-cross-domain"])("%s is gated", (k) => {
    expect(isGatedKind(k)).toBe(true);
  });

  it.each(["fill", "select", "check", "click-safe"])("%s is not gated", (k) => {
    expect(isGatedKind(k)).toBe(false);
  });

  it.each(["", "SUBMIT", "Fill", "unknown", "fill ", "__proto__"])("unrecognized %j is gated", (k) => {
    expect(isGatedKind(k)).toBe(true);
  });
});

describe("RawElement sensitive-null refinement (D-09)", () => {
  it("rejects a password element that carries a value, without echoing the value", () => {
    const r = RawElement.safeParse(makeElement({ sensitive: "password", value: "hunter2", hasValue: true }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues[0]!;
      expect(issue.path.at(-1)).toBe("value");
      expect(issue.message).not.toContain("hunter2");
      expect(JSON.stringify(r.error.issues)).not.toContain("hunter2");
    }
  });

  it.each(["password", "card-number", "card-cvc", "otp", "ssn"] as const)("rejects non-null value when sensitive is %s", (s) => {
    expect(RawElement.safeParse(makeElement({ sensitive: s, value: "x", hasValue: true })).success).toBe(false);
  });

  it("accepts hasValue true with value null for a sensitive element", () => {
    expect(RawElement.safeParse(makeElement({ sensitive: "password", value: null, hasValue: true })).success).toBe(true);
  });

  it("accepts a non-sensitive element with a value", () => {
    expect(RawElement.safeParse(makeElement({ value: "Ada", hasValue: true })).success).toBe(true);
  });

  it("requires category and hasValue", () => {
    const { category: _c, ...noCategory } = makeElement();
    const { hasValue: _h, ...noHasValue } = makeElement();
    expect(RawElement.safeParse(noCategory).success).toBe(false);
    expect(RawElement.safeParse(noHasValue).success).toBe(false);
  });

  it("requires an integer frameId (no default)", () => {
    const { frameId: _f, ...noFrame } = makeElement();
    expect(RawElement.safeParse(noFrame).success).toBe(false);
  });

  it("represents a radio group as ONE element with selectable options", () => {
    const radio = makeElement({
      id: "e9",
      inputType: "radio",
      role: "radiogroup",
      value: "king",
      hasValue: true,
      options: [
        { value: "king", label: "King", selected: true },
        { value: "double", label: "Double", selected: false },
      ],
    });
    expect(RawElement.safeParse(radio).success).toBe(true);
  });

  it("accepts an action element with a kind and strips unknown keys", () => {
    const btn = {
      ...makeElement({ id: "e2", category: "action", tag: "button", role: "button", text: "Book now", buttonType: "submit", inForm: true, kind: "submit", kindReasons: ["button type=submit inside form"] }),
      futureKey: 1,
    };
    const r = RawElement.safeParse(btn);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("futureKey");
  });

  it("rejects an unknown action kind", () => {
    expect(RawElement.safeParse(makeElement({ kind: "approve" as never })).success).toBe(false);
  });
});

describe("Snapshot caps (D-10)", () => {
  const els = (n: number) => Array.from({ length: n }, (_, i) => makeElement({ id: `e${i}`, order: i }));

  it("accepts 250 elements and rejects 251", () => {
    expect(Snapshot.safeParse(makeSnapshot({ elements: els(250) })).success).toBe(true);
    expect(Snapshot.safeParse(makeSnapshot({ elements: els(251) })).success).toBe(false);
  });

  it("accepts 40 headings and rejects 41", () => {
    const h = (n: number) => Array.from({ length: n }, () => ({ level: 2, text: "H" }));
    expect(Snapshot.safeParse(makeSnapshot({ headings: h(40) })).success).toBe(true);
    expect(Snapshot.safeParse(makeSnapshot({ headings: h(41) })).success).toBe(false);
  });

  it("accepts 20 alerts and rejects 21", () => {
    const a = (n: number) => Array.from({ length: n }, () => "Oops");
    expect(Snapshot.safeParse(makeSnapshot({ alerts: a(20) })).success).toBe(true);
    expect(Snapshot.safeParse(makeSnapshot({ alerts: a(21) })).success).toBe(false);
  });

  it("caps label and error text lengths", () => {
    expect(RawElement.safeParse(makeElement({ errorText: "x".repeat(301) })).success).toBe(false);
    expect(RawElement.safeParse(makeElement({ labelCandidates: [{ text: "x".repeat(201), source: "label", confidence: 1 }] })).success).toBe(false);
  });

  it("strips unknown extra keys on a Snapshot", () => {
    const r = Snapshot.safeParse({ ...makeSnapshot(), extra: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("extra");
  });

  it("preserves the optional warning-only GATE-07 flag without requiring it on older snapshots", () => {
    const legacy = Snapshot.safeParse(makeSnapshot());
    expect(legacy.success).toBe(true);
    const flagged = Snapshot.safeParse(makeSnapshot({ untrustedInstructionDetected: true }));
    expect(flagged.success).toBe(true);
    if (flagged.success) expect(flagged.data.untrustedInstructionDetected).toBe(true);
  });
});
