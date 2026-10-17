import type { Field, FormModel } from "@blip/protocol";
import { fillableFields, optionLabelFor, optionList, requiredEmpty, spokenLabel } from "./fields";
import { cleanSpoken, plural, speakable } from "./normalize";

const OPTION_NUMBERS = ["one", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"] as const;

function spokenValue(value: string, field: Field): string {
  const clean = cleanSpoken(value);
  const kind = field.type === "email" ? "email"
    : field.type === "tel" ? "tel"
      : field.type === "number" ? "number"
        : "text";
  return cleanSpoken(speakable(clean, kind));
}

const SPELL_NAMES: Readonly<Record<string, string>> = {
  "@": "at",
  ".": "dot",
  "-": "hyphen",
  "_": "underscore",
  "+": "plus",
  "/": "slash",
  "\\": "backslash",
  ",": "comma",
  ":": "colon",
  ";": "semicolon",
  "'": "apostrophe",
  '"': "quotation mark",
  "#": "number sign",
  "$": "dollar sign",
  "%": "percent sign",
  "&": "ampersand",
  "!": "exclamation mark",
  "?": "question mark",
  "(": "open parenthesis",
  ")": "close parenthesis",
  "[": "open bracket",
  "]": "close bracket",
  "{": "open brace",
  "}": "close brace",
  "=": "equals sign",
  "*": "asterisk",
};

/** Spell a page-observed value one character at a time, naming punctuation. */
export function spellValueText(value: string): string {
  const characters = Array.from(cleanSpoken(value, 300));
  if (characters.length === 0) return "The field is empty.";
  const spelled = characters.map((character) => {
    if (/^[a-z0-9]$/i.test(character)) return character;
    if (/^\s$/.test(character)) return "space";
    return SPELL_NAMES[character] ?? "symbol";
  });
  return spelled.join(", ");
}

function readOptions(field: Field): string {
  const options = optionList(field);
  if (options.length === 0) return "";
  const spoken = options.slice(0, 8).map((option) => {
    const number = OPTION_NUMBERS[option.n - 1] ?? `${option.n}`;
    return `${number}, ${option.label || `unlabeled option ${option.n}`}.`;
  });
  const remaining = options.length - spoken.length;
  const more = remaining > 0 ? ` And ${remaining} more. Say the one you want.` : "";
  return ` Options: ${spoken.join(" ")}${more}`;
}

/** Speak one page-ordered batch without exposing any field values. */
export function readBatchText(form: FormModel, startIndex: number, count: number): {
  text: string;
  nextIndex: number | null;
  lastFieldId: string | null;
  optionsFieldId: string | null;
} {
  const fields = fillableFields(form);
  const start = Math.max(0, Math.trunc(startIndex));
  const size = Math.max(0, Math.trunc(count));
  const end = Math.min(fields.length, start + size);
  const batch = fields.slice(start, end);
  const lines = batch.map((field, offset) => {
    const number = start + offset + 1;
    const requirement = field.required ? "required" : "optional";
    return `Field ${number}: ${spokenLabel(field, number)}, ${requirement}.${readOptions(field)}`;
  });
  if (fields.length === 0) lines.push("There are no fields.");
  else if (end < fields.length) lines.push("Say continue for more.");
  else lines.push(`That is all ${fields.length} fields.`);
  const optionsField = batch.find((field) => (field.type === "select" || field.type === "radio-group") && optionList(field).length > 0);
  return {
    text: lines.join(" "),
    nextIndex: end < fields.length ? end : null,
    lastFieldId: batch.at(-1)?.id ?? null,
    optionsFieldId: optionsField?.id ?? null,
  };
}

/** Echo the sanitized value observed on the page, never the dictated input. */
export function echoText(field: Field, observedDisplay: string | null, replaced: boolean): string {
  const label = spokenLabel(field, 1);
  if (field.sensitive !== "none") {
    return observedDisplay ? `${label}, entered, hidden.` : `I tried to fill ${label}, but the page shows nothing.`;
  }
  const value = observedDisplay === null ? "" : spokenValue(observedDisplay, field);
  if (!value) return `I tried to fill ${label}, but the page shows nothing.`;
  return `${label}, ${value}.${replaced ? " Replacing the old value." : ""}`;
}

function fieldReadBack(field: Field, number: number): string {
  const label = spokenLabel(field, number);
  let detail: string;
  if (field.sensitive !== "none") {
    detail = field.hasValue ? "entered, hidden" : `empty, ${field.required ? "required" : "optional"}`;
  } else if (!field.hasValue) {
    detail = `empty, ${field.required ? "required" : "optional"}`;
  } else {
    const rawValue = cleanSpoken(field.value ?? "");
    const optionValue = field.type === "select" || field.type === "radio-group"
      ? optionLabelFor(field, rawValue) ?? rawValue
      : rawValue;
    detail = spokenValue(optionValue, field) || `empty, ${field.required ? "required" : "optional"}`;
  }
  const error = field.error === null ? ""
    : field.sensitive === "none" ? `, error: ${cleanSpoken(field.error) || "page error"}`
      : ", error reported on page";
  return `${label}, ${detail}${error}.`;
}

/** Read every enabled field, mapping choices and hiding sensitive values. */
export function readBackText(form: FormModel): string {
  const fields = fillableFields(form);
  const parts = fields.map((field, index) => fieldReadBack(field, index + 1));
  const empty = requiredEmpty(form).length;
  const summary = empty === 0
    ? "All required fields are filled."
    : `${plural(empty, "required field", "required fields")} ${empty === 1 ? "is" : "are"} still empty.`;
  return [`Reading back ${plural(fields.length, "field", "fields")}.`, ...parts, summary].join(" ");
}

function joinAnd(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** Explain why submission cannot proceed while required fields remain empty. */
export function requiredEmptyText(form: FormModel): string {
  const missing = requiredEmpty(form);
  if (missing.length === 0) return "All required fields are filled.";
  const fields = fillableFields(form);
  const labels = missing.map((field) => spokenLabel(field, fields.indexOf(field) + 1));
  if (missing.length >= 4) {
    return `I can't submit yet. ${missing.length} required fields are empty: ${joinAnd(labels)}.`;
  }
  return `I can't submit yet. ${joinAnd(labels)} ${missing.length === 1 ? "is" : "are"} required and empty.`;
}

export function confirmPromptText(phrase: string): string {
  return `To submit, say '${phrase}'.`;
}

export function refusalText(phrase: string): string {
  return `Not submitting. I need you to say '${phrase}'.`;
}
