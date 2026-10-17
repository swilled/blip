import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { mergeRepairPatch } from "../src/brain/claude/repair-merge";
import { parseRepairPatch, validateRepairPatch } from "../src/brain/claude/repair-schema";

const baseline = () => buildBaselineFormModel(loadSnapshot("broken"));

describe("strict label repair patches", () => {
  it("rejects unknown keys at both levels", () => {
    expect(parseRepairPatch({ title: "Form", fields: [], actionKinds: ["click-safe"] })).toBeNull();
    expect(parseRepairPatch({ fields: [{ id: "e1", label: "Name", value: "secret" }] })).toBeNull();
  });

  it("rejects duplicate IDs and IDs absent from either captured or current fields", () => {
    const captured = baseline();
    const current = structuredClone(captured);
    expect(validateRepairPatch({ fields: [{ id: "e1", label: "Name" }, { id: "e1", group: "People" }] }, captured, current)).toBeNull();
    expect(validateRepairPatch({ fields: [{ id: "not-a-field", label: "Name" }] }, captured, current)).toBeNull();

    const currentWithoutE1 = { ...current, fields: current.fields.filter((field) => field.id !== "e1") };
    expect(validateRepairPatch({ fields: [{ id: "e1", label: "Name" }] }, captured, currentWithoutE1)).toBeNull();
  });

  it("rejects invalid confidence and overbounded title, label, or group text", () => {
    expect(parseRepairPatch({ fields: [{ id: "e1", confidence: 1.01 }] })).toBeNull();
    expect(parseRepairPatch({ title: "T".repeat(201), fields: [] })).toBeNull();
    expect(parseRepairPatch({ fields: [{ id: "e1", label: "L".repeat(121) }] })).toBeNull();
    expect(parseRepairPatch({ fields: [{ id: "e1", group: "G".repeat(121) }] })).toBeNull();
  });

  it("merges only descriptions and preserves current value, policy, and snapshot state", () => {
    const current = baseline();
    const captured = structuredClone(current);
    const currentWithLiveState = {
      ...current,
      snapshotVersion: current.snapshotVersion + 1,
      fields: current.fields.map((field, index) => index === 0
        ? { ...field, value: "current value", hasValue: true, required: true, options: [{ value: "v", label: "Current option" }], error: "Current error", sensitive: "none" as const, disabled: true }
        : field),
      pageErrors: ["Current page error"],
      actions: current.actions.map((action) => ({ ...action, kindReasons: [...action.kindReasons, "current policy reason"] })),
    };
    const patch = validateRepairPatch({
      title: "Improved title",
      fields: [{ id: current.fields[0]!.id, label: "Repaired label", group: "Guests", confidence: 0.92 }],
    }, captured, currentWithLiveState);
    expect(patch).not.toBeNull();
    const repaired = mergeRepairPatch(currentWithLiveState, patch!);

    const expectedFields = currentWithLiveState.fields.map((field, index) => index === 0
      ? { ...field, label: "Repaired label", labelSource: "model" as const, group: "Guests", confidence: 0.92 }
      : field);
    expect(repaired).toEqual({
      ...currentWithLiveState,
      title: "Improved title",
      fields: expectedFields,
      groups: [{ name: "Guests", fieldIds: [current.fields[0]!.id] }],
    });
  });

  it("preserves source when a repair changes confidence but not the label", () => {
    const current = baseline();
    const field = current.fields.find((candidate) => candidate.label !== "")!;
    const repaired = mergeRepairPatch(current, { fields: [{ id: field.id, confidence: 0.99 }] });
    expect(repaired.fields.find((candidate) => candidate.id === field.id)).toMatchObject({
      label: field.label,
      labelSource: field.labelSource,
      confidence: 0.99,
    });
  });
});
