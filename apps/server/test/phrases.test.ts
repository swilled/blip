import { describe, expect, it } from "vitest";
import type { Field, FormModel } from "@blip/protocol";
import { buildBaselineFormModel } from "../src/baseline";
import { matchFieldPhrase, resolveFieldPhrase } from "../src/brain/phrases";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";

const booking = () => buildBaselineFormModel(loadSnapshot("booking"));

function operationModel(): FormModel {
  const base = booking();
  const template = base.fields[0]!;
  const select: Field = {
    ...template,
    id: "test-select",
    role: "combobox",
    type: "select",
    label: "Room type",
    options: [
      { value: "king", label: "King" },
      { value: "king-suite", label: "King suite" },
      { value: "queen", label: "Queen" },
    ],
    value: null,
    hasValue: false,
    order: 90,
  };
  const checkbox: Field = {
    ...template,
    id: "test-checkbox",
    role: "checkbox",
    type: "checkbox",
    label: "Email updates",
    value: null,
    hasValue: false,
    order: 91,
  };
  return { ...base, fields: [...base.fields, select, checkbox] };
}

describe("field phrases", () => {
  it("parses a bounded fill phrase and preserves the complete value", () => {
    expect(matchFieldPhrase("  Fill Full name with Jane Doe  ")).toEqual({
      type: "fill",
      label: "Full name",
      value: "Jane Doe",
    });
    expect(matchFieldPhrase("fill notes with say with spaces")).toEqual({
      type: "fill",
      label: "notes",
      value: "say with spaces",
    });
  });

  it("resolves exact labels before a unique partial label", () => {
    const model = booking();
    const exact = matchFieldPhrase("fill Full name with Jane Doe")!;
    expect(resolveFieldPhrase(model, exact)).toEqual({
      type: "set_fields",
      fills: [{ fieldId: model.fields.find((field) => field.label === "Full name")!.id, value: "Jane Doe" }],
    });

    const partial = matchFieldPhrase("fill phone with 555 0100")!;
    expect(resolveFieldPhrase(model, partial)).toMatchObject({ type: "set_fields", fills: [{ value: "555 0100" }] });
  });

  it("clarifies unknown fields and rejects empty or oversized input", () => {
    expect(resolveFieldPhrase(booking(), matchFieldPhrase("fill imaginary field with a value")!)).toMatchObject({ type: "clarify" });
    expect(matchFieldPhrase("fill Full name with   ")).toEqual({ type: "invalid", reason: "empty" });
    expect(matchFieldPhrase(`fill Full name with ${"x".repeat(301)}`)).toEqual({ type: "invalid", reason: "too-long" });
    expect(matchFieldPhrase("x".repeat(501))).toEqual({ type: "invalid", reason: "too-long" });
  });

  it("parses select, check, uncheck, focus and go-to field phrases", () => {
    expect(matchFieldPhrase("select King for Room type")).toEqual({ type: "select", label: "Room type", value: "King" });
    expect(matchFieldPhrase("check Email updates")).toEqual({ type: "check", label: "Email updates", checked: true });
    expect(matchFieldPhrase("uncheck Email updates")).toEqual({ type: "check", label: "Email updates", checked: false });
    expect(matchFieldPhrase("focus Full name")).toEqual({ type: "focus", label: "Full name" });
    expect(matchFieldPhrase("go to Full name")).toEqual({ type: "focus", label: "Full name" });
  });

  it("resolves option labels or values and checkbox booleans, and clarifies ambiguity", () => {
    const model = operationModel();
    expect(resolveFieldPhrase(model, matchFieldPhrase("select King for Room type")!)).toEqual({
      type: "set_fields",
      fills: [{ fieldId: "test-select", value: "king" }],
    });
    expect(resolveFieldPhrase(model, matchFieldPhrase("select king-suite for Room type")!)).toEqual({
      type: "set_fields",
      fills: [{ fieldId: "test-select", value: "king-suite" }],
    });
    expect(resolveFieldPhrase(model, matchFieldPhrase("check Email updates")!)).toEqual({
      type: "set_fields",
      fills: [{ fieldId: "test-checkbox", value: "true" }],
    });
    expect(resolveFieldPhrase(model, matchFieldPhrase("uncheck Email updates")!)).toEqual({
      type: "set_fields",
      fills: [{ fieldId: "test-checkbox", value: "false" }],
    });
    expect(resolveFieldPhrase(model, matchFieldPhrase("focus Full name")!)).toEqual({ type: "go_to_field", fieldId: model.fields[0]!.id });
    expect(resolveFieldPhrase(model, matchFieldPhrase("select ki for Room type")!)).toMatchObject({ type: "clarify" });
  });

  it("clarifies ambiguous field labels even when one label contains the phrase", () => {
    const model = operationModel();
    const duplicate: Field = { ...model.fields[0]!, id: "duplicate-name", order: 99 };
    expect(resolveFieldPhrase({ ...model, fields: [...model.fields, duplicate] }, matchFieldPhrase("fill Full name with Pat")!)).toMatchObject({
      type: "clarify",
    });
  });
});
