import type { ActionKind, ActionTarget, Field, FormModel, RawElement, Snapshot } from "@blip/protocol";
import { toFieldType } from "./field-type";
import { cleanText, pickLabel } from "./label";

// Schema caps (form-model.ts). Page text is clamped to these so hostile or long text cannot make
// the FormModel invalid (T-01-13).
const LABEL_MAX = 120;
const HINT_MAX = 200;
const ERROR_MAX = 300;
const GROUP_MAX = 120;
const STEP_MAX = 100;
const TITLE_MAX = 200;

const FAIL_CLOSED_REASON = "no usable kind supplied; treated as submit (fail-closed)";

// Kinds an ACTION element may carry. Field kinds (fill/select/check) on an action are not usable.
const ACTION_KINDS: ReadonlySet<string> = new Set([
  "click-safe", "submit", "pay", "delete", "send", "navigate-cross-domain",
]);

/** Stable sort by document order; ties keep input order. Never mutates the input array. */
function byOrder(elements: readonly RawElement[]): RawElement[] {
  return [...elements].sort((a, b) => a.order - b.order);
}

function buildField(el: RawElement): Field {
  const picked = pickLabel(el.labelCandidates);
  const hint = cleanText(el.describedBy, HINT_MAX);
  const group = cleanText(el.group, GROUP_MAX);
  const error = cleanText(el.errorText, ERROR_MAX);
  const sensitive = el.sensitive !== "none";

  const field: Field = {
    id: el.id,
    role: el.role,
    type: toFieldType(el),
    label: cleanText(picked.label, LABEL_MAX),
    labelSource: picked.labelSource,
    confidence: picked.confidence,
    required: el.requiredSource !== "none",
    // Defense in depth: a sensitive control never carries a value, even if the input was not validated.
    value: sensitive ? null : el.value,
    hasValue: el.hasValue,
    sensitive: el.sensitive,
    error: error === "" ? null : error,
    disabled: el.disabled,
    order: el.order,
  };
  if (hint !== "") field.hint = hint;
  if (el.autocomplete !== undefined) field.autocomplete = el.autocomplete;
  if (el.options !== undefined) {
    field.options = el.options.map((o) => ({ value: o.value, label: cleanText(o.label, LABEL_MAX) }));
  }
  if (group !== "") field.group = group;
  return field;
}

function buildAction(el: RawElement): Omit<ActionTarget, "primary"> {
  const fromText = cleanText(el.text, LABEL_MAX);
  const label = fromText !== "" ? fromText : cleanText(pickLabel(el.labelCandidates).label, LABEL_MAX);

  // D-11: never invent an ungated kind. Missing or field-ish kinds fail closed to `submit`.
  const usable = el.kind !== undefined && ACTION_KINDS.has(el.kind);
  const kind: ActionKind = usable ? el.kind! : "submit";
  const kindReasons = usable ? [...(el.kindReasons ?? [])] : [FAIL_CLOSED_REASON];

  const target: Omit<ActionTarget, "primary"> = { id: el.id, label, kind, kindReasons };
  if (el.href !== undefined) target.href = el.href;
  return target;
}

/**
 * Pure baseline FormModel (PAGE-02): no I/O, no clock, no mutation of the input.
 * Label confidence and source reach the output unchanged so speech can hedge on guessed labels.
 */
export function buildBaselineFormModel(snapshot: Snapshot): FormModel {
  const visible = byOrder(snapshot.elements).filter((e) => e.visible);

  const fields: Field[] = [];
  const rawActions: Array<Omit<ActionTarget, "primary">> = [];
  for (const el of visible) {
    // Anything that is not explicitly a field is an action (fail closed).
    if (el.category === "field") fields.push(buildField(el));
    else rawActions.push(buildAction(el));
  }

  // Exactly one primary: first submit, else first pay, else first send, else none.
  const primaryIndex = ["submit", "pay", "send"]
    .map((k) => rawActions.findIndex((a) => a.kind === k))
    .find((i) => i >= 0);
  const actions: ActionTarget[] = rawActions.map((a, i) => ({ ...a, primary: i === primaryIndex }));

  const groups: FormModel["groups"] = [];
  const groupIndex = new Map<string, number>();
  for (const f of fields) {
    if (f.group === undefined) continue;
    const at = groupIndex.get(f.group);
    if (at === undefined) {
      groupIndex.set(f.group, groups.length);
      groups.push({ name: f.group, fieldIds: [f.id] });
    } else {
      groups[at]!.fieldIds.push(f.id);
    }
  }

  const h1 = snapshot.headings.map((h) => (h.level === 1 ? cleanText(h.text, TITLE_MAX) : "")).find((t) => t !== "");
  const model: FormModel = {
    snapshotVersion: snapshot.version,
    structuralHash: snapshot.structuralHash,
    url: snapshot.url,
    title: h1 ?? cleanText(snapshot.title, TITLE_MAX),
    fields,
    actions,
    groups,
    pageErrors: snapshot.alerts.map((a) => cleanText(a, ERROR_MAX)).filter((a) => a !== ""),
    repairStatus: "baseline",
  };
  const step = cleanText(snapshot.stepHint, STEP_MAX);
  if (step !== "") model.step = step;
  return model;
}
