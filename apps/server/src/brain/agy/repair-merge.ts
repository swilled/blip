import type { FormModel } from "@blip/protocol";
import { cleanText } from "../../baseline/label";
import type { RepairPatch } from "./repair-schema";

/** Rebuild derived groups from the current fields after descriptive group suggestions are applied. */
function groupsFor(fields: FormModel["fields"]): FormModel["groups"] {
  const groups: FormModel["groups"] = [];
  const byName = new Map<string, number>();
  for (const field of fields) {
    const name = field.group;
    if (name === undefined || name === "") continue;
    const index = byName.get(name);
    if (index === undefined) {
      byName.set(name, groups.length);
      groups.push({ name, fieldIds: [field.id] });
    } else {
      groups[index]!.fieldIds.push(field.id);
    }
  }
  return groups;
}

/** Apply an already validated patch to the current model, preserving every non-description field. */
export function mergeRepairPatch(current: FormModel, patch: RepairPatch): FormModel {
  const suggestions = new Map(patch.fields.map((field) => [field.id, field]));
  const fields = current.fields.map((field) => {
    const suggestion = suggestions.get(field.id);
    if (suggestion === undefined) return field;

    const repaired = { ...field };
    if (suggestion.label !== undefined) {
      const label = cleanText(suggestion.label, 120);
      if (label !== "" && label !== field.label) {
        repaired.label = label;
        repaired.labelSource = "model";
      }
    }
    if (suggestion.group !== undefined) {
      const group = cleanText(suggestion.group, 120);
      if (group === "") delete repaired.group;
      else repaired.group = group;
    }
    if (suggestion.confidence !== undefined) repaired.confidence = suggestion.confidence;
    return repaired;
  });

  const title = patch.title === undefined ? current.title : cleanText(patch.title, 200) || current.title;
  return {
    ...current,
    title,
    fields,
    groups: groupsFor(fields),
  };
}
