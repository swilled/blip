import { describe, expect, it } from "vitest";
import { ActionTarget, Field, FormModel, LOW_CONFIDENCE_THRESHOLD, RawElement, isLowConfidenceLabel } from "../src/index";
import { makeElement, makeField } from "./helpers";

describe("Field sensitive-null refinement (D-09)", () => {
  it("rejects a card-number field with a non-null value, without echoing it", () => {
    const r = Field.safeParse(makeField({ sensitive: "card-number", value: "4111111111111111", hasValue: true }));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).not.toContain("4111");
  });

  it("accepts hasValue true with value null on a sensitive field", () => {
    expect(Field.safeParse(makeField({ sensitive: "card-number", value: null, hasValue: true })).success).toBe(true);
  });

  it("carries hasValue", () => {
    const { hasValue: _h, ...rest } = makeField();
    expect(Field.safeParse(rest).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const r = Field.safeParse({ ...makeField(), extra: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("extra");
  });
});

describe("label source boundary (D-05)", () => {
  it("accepts deterministic raw candidate sources and rejects model provenance", () => {
    const deterministicSources = ["aria", "label", "nearby-text", "placeholder", "inferred"] as const;
    for (const source of deterministicSources) {
      expect(RawElement.safeParse(makeElement({
        labelCandidates: [{ text: "Email", source, confidence: 0.9 }],
      })).success).toBe(true);
    }
    const rawWithModel: unknown = {
      ...makeElement(),
      labelCandidates: [{ text: "Email", source: "model", confidence: 0.9 }],
    };
    expect(RawElement.safeParse(rawWithModel).success).toBe(false);
  });

  it("accepts resolved model provenance and preserves the source/confidence pair", () => {
    const parsed = Field.safeParse(makeField({ labelSource: "model", confidence: 0.92 }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ labelSource: "model", confidence: 0.92 });
  });
});

describe("isLowConfidenceLabel (D-12)", () => {
  it("threshold is 0.7", () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.7);
  });
  it("is true for inferred at any confidence", () => {
    expect(isLowConfidenceLabel({ labelSource: "inferred", confidence: 0.99 })).toBe(true);
    expect(isLowConfidenceLabel({ labelSource: "inferred", confidence: 0 })).toBe(true);
  });
  it("is true below 0.7", () => {
    expect(isLowConfidenceLabel({ labelSource: "nearby-text", confidence: 0.6 })).toBe(true);
    expect(isLowConfidenceLabel({ labelSource: "aria", confidence: 0.69 })).toBe(true);
  });
  it("is false for label/aria at 0.95 and placeholder at exactly 0.7", () => {
    expect(isLowConfidenceLabel({ labelSource: "label", confidence: 0.95 })).toBe(false);
    expect(isLowConfidenceLabel({ labelSource: "aria", confidence: 0.95 })).toBe(false);
    expect(isLowConfidenceLabel({ labelSource: "placeholder", confidence: 0.7 })).toBe(false);
  });
});

describe("ActionTarget and FormModel", () => {
  it("accepts a valid ActionTarget and rejects an unknown kind", () => {
    const t = { id: "e2", label: "Book now", kind: "submit", kindReasons: ["button type=submit"], primary: true };
    expect(ActionTarget.safeParse(t).success).toBe(true);
    expect(ActionTarget.safeParse({ ...t, kind: "approve" }).success).toBe(false);
  });

  it("accepts a baseline FormModel and strips unknown keys", () => {
    const m = {
      snapshotVersion: 1,
      structuralHash: "h",
      url: "http://x",
      title: "Booking",
      fields: [makeField()],
      actions: [],
      groups: [],
      pageErrors: [],
      repairStatus: "baseline",
      extra: 1,
    };
    const r = FormModel.safeParse(m);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("extra");
  });

  it("does not define a FormRepair export yet (Phase 4)", async () => {
    const mod = await import("../src/index");
    expect(mod).not.toHaveProperty("FormRepair");
  });
});
