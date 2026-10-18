import { describe, expect, it } from "vitest";
import type { FormModel } from "@blip/protocol";
import { makeElement, makeSnapshot } from "../../../packages/protocol/test/helpers";
import { buildBaselineFormModel } from "../src/baseline";
import { estimateProjectionTokens, projectPageForPrompt } from "../src/brain/agy/projection";

describe("projectPageForPrompt", () => {
  it("retains all field/action ids and safe routing metadata", () => {
    const snapshot = makeSnapshot({
      title: "Reservation",
      headings: [{ level: 1, text: "Guest details" }, { level: 2, text: "Payment" }],
      elements: [
        makeElement({ id: "guest-name", order: 1, labelCandidates: [{ text: "Full name", source: "label", confidence: 0.95 }] }),
        makeElement({ id: "room", order: 2, inputType: "select", tag: "select", options: [
          { value: "raw-standard", label: "Standard", selected: false },
          { value: "raw-suite", label: "Suite", selected: true },
        ] }),
        makeElement({ id: "submit", order: 3, category: "action", tag: "button", role: "button", text: "Book now", kind: "submit" }),
      ],
    });
    const model = buildBaselineFormModel(snapshot);

    const projection = projectPageForPrompt(snapshot, model);

    expect(projection.p.t).toBe("Guest details");
    expect(projection.p.h).toEqual(["Guest details", "Payment"]);
    expect(projection.f.map((field) => field.i)).toEqual(["guest-name", "room"]);
    expect(projection.f[0]).toMatchObject({ t: "text", l: "Full name", q: false });
    expect(projection.f[1]?.o).toEqual(["Standard", "Suite"]);
    expect(projection.a).toEqual([{ i: "submit", l: "Book now", k: "submit", p: true }]);
    expect(JSON.stringify(projection)).not.toContain("raw-standard");
    expect(JSON.stringify(projection)).not.toContain("raw-suite");
  });

  it("omits current and sensitive values, presence flags, errors, and never mutates inputs", () => {
    const snapshot = makeSnapshot({
      alerts: ["PAGE_ERROR_SENTINEL"],
      elements: [
        makeElement({
          id: "ordinary",
          value: "CURRENT_VALUE_SENTINEL",
          hasValue: true,
          errorText: "FIELD_ERROR_SENTINEL",
          describedBy: "DESCRIPTION_SENTINEL",
        }),
        makeElement({ id: "card", order: 2, sensitive: "card-number", value: null, hasValue: true }),
      ],
    });
    const model = buildBaselineFormModel(snapshot);
    const malformed = structuredClone(model) as FormModel;
    (malformed.fields[1] as unknown as { value: string }).value = "CARD_VALUE_SENTINEL";
    const snapshotBefore = structuredClone(snapshot);
    const modelBefore = structuredClone(malformed);

    const projection = projectPageForPrompt(snapshot, malformed);
    const serialized = JSON.stringify(projection);

    for (const sentinel of [
      "CURRENT_VALUE_SENTINEL",
      "CARD_VALUE_SENTINEL",
      "FIELD_ERROR_SENTINEL",
      "PAGE_ERROR_SENTINEL",
      "DESCRIPTION_SENTINEL",
    ]) expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("hasValue");
    expect(serialized).not.toContain("transcript");
    expect(snapshot).toEqual(snapshotBefore);
    expect(malformed).toEqual(modelBefore);
  });

  it("rejects a model from a different accepted snapshot", () => {
    const snapshot = makeSnapshot();
    const model = buildBaselineFormModel(snapshot);

    expect(() => projectPageForPrompt(snapshot, { ...model, snapshotVersion: model.snapshotVersion + 1 })).toThrow(
      "Prompt projection requires a FormModel for the accepted snapshot",
    );
  });

  it("trims a large projection under the estimate while preserving every id and type", () => {
    const elements = Array.from({ length: 250 }, (_, index) => makeElement({
      id: `field-${index}`,
      order: index,
      tag: "select",
      inputType: "select",
      role: "combobox",
      labelCandidates: [{ text: `Long descriptive field label ${index} ${"label ".repeat(12)}`, source: "label", confidence: 0.9 }],
      describedBy: `Long format description ${"description ".repeat(10)}`,
      group: `Section ${index} ${"group ".repeat(8)}`,
      options: Array.from({ length: 8 }, (__, optionIndex) => ({
        value: `private-value-${index}-${optionIndex}`,
        label: `Long option label ${optionIndex} ${"choice ".repeat(8)}`,
        selected: false,
      })),
    }));
    const snapshot = makeSnapshot({
      headings: Array.from({ length: 40 }, (_, index) => ({ level: index === 0 ? 1 : 2, text: `Heading ${index} ${"heading ".repeat(12)}` })),
      elements,
    });
    const model = buildBaselineFormModel(snapshot);

    const projection = projectPageForPrompt(snapshot, model);

    expect(estimateProjectionTokens(projection)).toBeLessThanOrEqual(8000);
    expect(projection.f.map((field) => field.i)).toEqual(elements.map((element) => element.id));
    expect(projection.f.every((field) => field.t === "select")).toBe(true);
    expect(projection.v).toBe(snapshot.version);
    expect(projection.h).toBe(snapshot.structuralHash);
    expect(JSON.stringify(projection)).not.toContain("private-value-");
  });
});
