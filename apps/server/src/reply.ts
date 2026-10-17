// Pure, deterministic reply text (D-23). Built from the title, labels and counts only: a field
// value never reaches a reply, so a sensitive value cannot be spoken by construction (T-01-28).
// The voice workstream's dialogue templates replace these strings later; keep the module tiny.
import type { FormModel } from "@blip/protocol";
import { summarizeFormModel } from "./baseline";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `<title>. <n> fields, <r> required, <a> actions.` */
export function describeReply(model: FormModel): string {
  const s = summarizeFormModel(model);
  const actions = plural(s.actionCount, "action", "actions");
  if (s.fieldCount === 0) return `${model.title}. No fields, ${actions}.`;
  return `${model.title}. ${plural(s.fieldCount, "field", "fields")}, ${s.requiredCount} required, ${actions}.`;
}
