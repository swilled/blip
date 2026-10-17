import type { FormModel } from "@blip/protocol";

export interface FormSummary {
  fieldCount: number;
  requiredCount: number;
  /** Required fields with no value. Uses `hasValue`, never `value` (sensitive fields have null value). */
  requiredEmpty: number;
  actionCount: number;
}

export function summarizeFormModel(model: FormModel): FormSummary {
  const required = model.fields.filter((f) => f.required);
  return {
    fieldCount: model.fields.length,
    requiredCount: required.length,
    requiredEmpty: required.filter((f) => !f.hasValue).length,
    actionCount: model.actions.length,
  };
}
