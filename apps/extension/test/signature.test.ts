import { describe, expect, it } from "vitest";
import type { RawElement } from "@blip/protocol";
import { changeSignature, computeStructuralHash } from "../src/shared/signature.js";

const element = (overrides: Partial<RawElement> = {}): RawElement => ({
  id: "e1",
  frameId: 0,
  category: "field",
  tag: "input",
  inputType: "text",
  role: "textbox",
  labelCandidates: [{ text: "Full name", source: "label", confidence: 1 }],
  required: false,
  requiredSource: "none",
  invalid: false,
  errorText: null,
  value: "Alice",
  hasValue: true,
  sensitive: "none",
  disabled: false,
  visible: true,
  order: 0,
  ...overrides,
});

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  structuralHash: "ignored-input-hash",
  headings: [{ level: 1, text: "Booking" }],
  alerts: [],
  elements: [element()],
  ...overrides,
});

describe("structural signatures", () => {
  it("hashes the stable, value-free field identity deterministically", () => {
    const first = element();
    const valueOnly = element({ value: "Bob", hasValue: false });
    expect(computeStructuralHash([first])).toBe(computeStructuralHash([first]));
    expect(computeStructuralHash([first])).toBe(computeStructuralHash([valueOnly]));
    expect(computeStructuralHash([first])).not.toBe(computeStructuralHash([element({ name: "full-name" })]));
  });

  it.each([
    ["visibility", { visible: false }],
    ["disabled", { disabled: true }],
    ["required", { required: true }],
    ["invalid", { invalid: true }],
    ["validation errors", { errorText: "Enter a valid name" }],
    ["options", { options: [{ value: "standard", label: "Standard", selected: false }] }],
  ])("includes %s in the change signature", (_name, change) => {
    expect(changeSignature(snapshot())).not.toBe(changeSignature(snapshot({ elements: [element(change)] })));
  });

  it("includes headings and alerts in the change signature", () => {
    const base = changeSignature(snapshot());
    expect(changeSignature(snapshot({ headings: [{ level: 2, text: "Contact details" }] }))).not.toBe(base);
    expect(changeSignature(snapshot({ alerts: ["Saved"] }))).not.toBe(base);
  });

  it("excludes entered values, value presence, checked state, and selected option state", () => {
    const base = changeSignature(snapshot({
      elements: [element({
        checked: false,
        options: [{ value: "standard", label: "Standard", selected: false }],
      })],
    }));
    expect(changeSignature(snapshot({
      elements: [element({
        value: "a private value",
        hasValue: false,
        checked: true,
        options: [{ value: "standard", label: "Standard", selected: true }],
      })],
    }))).toBe(base);
  });
});
