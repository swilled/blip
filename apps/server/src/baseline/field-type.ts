import type { FieldType } from "@blip/protocol";

const DIRECT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text", "email", "tel", "url", "number", "date", "time", "password", "file",
]);

/** Map tag, input type and role to a FieldType. Anything unrecognized is `unknown`. */
export function toFieldType(el: { tag: string; inputType?: string; role: string }): FieldType {
  const tag = el.tag.toLowerCase();
  const inputType = el.inputType?.toLowerCase();

  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  if (el.role === "combobox") return "combobox";

  if (inputType !== undefined) {
    if (DIRECT_INPUT_TYPES.has(inputType)) return inputType as FieldType;
    if (inputType === "search") return "text";
    if (inputType === "radio") return "radio-group";
    if (inputType === "checkbox") return "checkbox";
  } else if (tag === "input") {
    // <input> with no type attribute is a text input.
    return "text";
  }

  if (el.role === "radiogroup") return "radio-group";
  if (el.role === "checkbox") return "checkbox";
  return "unknown";
}
