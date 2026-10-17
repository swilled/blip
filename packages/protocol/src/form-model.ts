import { z } from "zod";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";
import { ActionKind } from "./action-kind";
import { RawLabelSource, SENSITIVE_VALUE_MESSAGE, Sensitivity, sensitiveValueIsNull } from "./snapshot";

// Resolved FormModel provenance can include a validated server-side model repair.
export const LabelSource = z.enum([...RawLabelSource.options, "model"]);
export type LabelSource = z.infer<typeof LabelSource>;

export const FieldType = z.enum([
  "text", "email", "tel", "url", "number", "date", "time", "password",
  "textarea", "select", "radio-group", "checkbox", "combobox", "file", "unknown",
]);
export type FieldType = z.infer<typeof FieldType>;

// Server-side resolved field (baseline + repair merged).
const FieldBase = z.object({
  id: z.string(),
  role: z.string(),
  type: FieldType,
  label: z.string().max(120),
  labelSource: LabelSource,
  confidence: z.number().min(0).max(1),
  hint: z.string().max(200).optional(), // format hints ("MM/DD/YYYY")
  required: z.boolean(),
  autocomplete: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  value: z.string().nullable(), // LAST VALUE READ FROM DOM, not intended value; null when sensitive
  hasValue: z.boolean(),
  sensitive: Sensitivity,
  error: z.string().max(300).nullable(),
  group: z.string().max(120).optional(),
  disabled: z.boolean(),
  order: z.number().int(),
});

export const Field = FieldBase.refine(sensitiveValueIsNull, {
  message: SENSITIVE_VALUE_MESSAGE,
  path: ["value"],
});
export type Field = z.infer<typeof Field>;

export const ActionTarget = z.object({
  id: z.string(),
  label: z.string().max(120),
  kind: ActionKind, // from @blip/policy rules ONLY
  kindReasons: z.array(z.string()), // ["button type=submit inside form", "text matches /pay|purchase/"]
  primary: z.boolean(), // the form's main submit
  href: z.string().optional(),
});
export type ActionTarget = z.infer<typeof ActionTarget>;

export const FormModel = z.object({
  snapshotVersion: z.number().int(),
  structuralHash: z.string(),
  url: z.string(),
  title: z.string(), // repaired form title ("Hotel booking")
  step: z.string().optional(), // "Step 2 of 4: Guest details"
  fields: z.array(Field),
  actions: z.array(ActionTarget),
  groups: z.array(z.object({ name: z.string(), fieldIds: z.array(z.string()) })),
  pageErrors: z.array(z.string()), // errors not tied to a field
  repairStatus: z.enum(["baseline", "pending", "repaired", "failed"]),
});
export type FormModel = z.infer<typeof FormModel>;

/**
 * D-12: speak a hedge ("probably phone number") when the label was guessed.
 * Derived rather than stored so the FormModel shape stays minimal.
 */
export function isLowConfidenceLabel(f: { labelSource: LabelSource; confidence: number }): boolean {
  return f.labelSource === "inferred" || f.confidence < LOW_CONFIDENCE_THRESHOLD;
}
