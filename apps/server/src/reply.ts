// Pure, deterministic reply text (D-23). Built from the title, labels and counts only: a field
// value never reaches a reply, so a sensitive value cannot be spoken by construction (T-01-28).
// The voice workstream's dialogue templates replace these strings later; keep the module tiny.
import { isLowConfidenceLabel, type Field, type FormModel } from "@blip/protocol";
import { summarizeFormModel } from "./baseline";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The label as spoken: empty reads as "unlabeled field", a guessed label is hedged with "probably". */
function spokenLabel(f: Field): string {
  if (f.label.trim() === "") return "unlabeled field";
  return isLowConfidenceLabel(f) ? `probably ${f.label}` : f.label;
}

/** `<title>. <n> fields, <r> required, <a> actions.` */
export function describeReply(model: FormModel): string {
  const s = summarizeFormModel(model);
  const actions = plural(s.actionCount, "action", "actions");
  if (s.fieldCount === 0) return `${model.title}. No fields, ${actions}.`;
  return `${model.title}. ${plural(s.fieldCount, "field", "fields")}, ${s.requiredCount} required, ${actions}.`;
}

/** `6 required: Full name, Email address, ...` or `No fields are required.` */
export function requiredReply(model: FormModel): string {
  const required = model.fields.filter((f) => f.required);
  if (required.length === 0) return "No fields are required.";
  return `${required.length} required: ${required.map(spokenLabel).join(", ")}.`;
}

/** `<title>. <n> fields. 1: Full name, required. 2: ...` Labels and required flags only, never values. */
export function readFormReply(model: FormModel): string {
  if (model.fields.length === 0) return `${model.title}. No fields.`;
  const items = model.fields.map((f, i) => `${i + 1}: ${spokenLabel(f)}${f.required ? ", required" : ""}.`);
  return `${model.title}. ${plural(model.fields.length, "field", "fields")}. ${items.join(" ")}`;
}

/** Speak only the value the extension read back from the DOM. Controls and length are bounded. */
export function fieldValueReply(field: Field, observedValue: string | null, requestedValue: string): string | null {
  if (field.sensitive !== "none" || observedValue === null || observedValue !== requestedValue) return null;
  const clean = observedValue.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean === "") return null;
  return `${field.label} is now ${clean}.`;
}
