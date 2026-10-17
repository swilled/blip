import { describe, expect, it } from "vitest";
import { buildBaselineFormModel } from "../src/baseline";
import { matchFieldPhrase, resolveFieldPhrase } from "../src/brain/phrases";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";

const booking = () => buildBaselineFormModel(loadSnapshot("booking"));

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
});
