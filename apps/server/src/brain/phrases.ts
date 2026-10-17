import type { FormModel, Intent } from "@blip/protocol";

const MAX_PHRASE_LENGTH = 500;
const MAX_VALUE_LENGTH = 300;

export type FieldPhrase =
  | { type: "fill"; label: string; value: string }
  | { type: "invalid"; reason: "too-long" | "empty" };

/** Parse the intentionally small typed-REPL fill grammar without unbounded regex work. */
export function matchFieldPhrase(text: string): FieldPhrase | null {
  if (text.length > MAX_PHRASE_LENGTH) return { type: "invalid", reason: "too-long" };
  const input = text.trimStart();
  const lower = input.toLowerCase();
  if (!lower.startsWith("fill ")) return null;

  const separator = lower.indexOf(" with", 5);
  if (separator < 0) return null;
  if (!/\s/.test(input[separator + 5] ?? "")) return null;
  const label = input.slice(5, separator).trim();
  const value = input.slice(separator + 5).trim();
  if (label === "" || value === "") return { type: "invalid", reason: "empty" };
  if (value.length > MAX_VALUE_LENGTH) return { type: "invalid", reason: "too-long" };
  return { type: "fill", label, value };
}

/** Resolve an exact label first, then a unique label containing the requested phrase. */
export function resolveFieldPhrase(model: FormModel, phrase: FieldPhrase): Intent {
  if (phrase.type === "invalid") {
    return { type: "clarify", question: phrase.reason === "too-long" ? "That value is too long to fill." : "Say a field and the value to fill." };
  }

  const requested = phrase.label.toLocaleLowerCase();
  const exact = model.fields.filter((field) => field.label.trim().toLocaleLowerCase() === requested);
  const matches = exact.length > 0
    ? exact
    : model.fields.filter((field) => field.label.trim().toLocaleLowerCase().includes(requested));

  if (matches.length !== 1) {
    const question = matches.length === 0
      ? "I couldn't find that field. Say its label and the value to fill."
      : "Which field do you mean? Say the full field label and the value to fill.";
    return { type: "clarify", question };
  }

  return { type: "set_fields", fills: [{ fieldId: matches[0]!.id, value: phrase.value }] };
}
