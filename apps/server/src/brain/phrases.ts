import type { FormModel, Intent } from "@blip/protocol";

const MAX_PHRASE_LENGTH = 500;
const MAX_VALUE_LENGTH = 300;

export type FieldPhrase =
  | { type: "fill"; label: string; value: string }
  | { type: "select"; label: string; value: string }
  | { type: "check"; label: string; checked: boolean }
  | { type: "focus"; label: string }
  | { type: "invalid"; reason: "too-long" | "empty" };

/** Parse the intentionally small typed-REPL fill grammar without unbounded regex work. */
export function matchFieldPhrase(text: string): FieldPhrase | null {
  if (text.length > MAX_PHRASE_LENGTH) return { type: "invalid", reason: "too-long" };
  const input = text.trimStart();
  const lower = input.toLowerCase();
  if (lower.startsWith("fill ")) {
    const separator = lower.indexOf(" with", 5);
    if (separator < 0) return { type: "invalid", reason: "empty" };
    if (!/\s/.test(input[separator + 5] ?? "")) return { type: "invalid", reason: "empty" };
    const label = input.slice(5, separator).trim();
    const value = input.slice(separator + 5).trim();
    if (label === "" || value === "") return { type: "invalid", reason: "empty" };
    if (value.length > MAX_VALUE_LENGTH) return { type: "invalid", reason: "too-long" };
    return { type: "fill", label, value };
  }

  if (lower.startsWith("select ")) {
    const separator = lower.indexOf(" for ", 7);
    if (separator < 0) return null;
    const value = input.slice(7, separator).trim();
    const label = input.slice(separator + 5).trim();
    if (label === "" || value === "") return { type: "invalid", reason: "empty" };
    if (label.length > MAX_VALUE_LENGTH || value.length > MAX_VALUE_LENGTH) return { type: "invalid", reason: "too-long" };
    return { type: "select", label, value };
  }

  for (const verb of ["check", "uncheck", "focus"] as const) {
    const prefix = `${verb} `;
    if (lower.startsWith(prefix)) {
      const label = input.slice(prefix.length).trim();
      return label === "" ? { type: "invalid", reason: "empty" } : { type: verb === "focus" ? "focus" : "check", label, ...(verb === "focus" ? {} : { checked: verb === "check" }) } as FieldPhrase;
    }
  }

  if (lower.startsWith("go to ")) {
    const label = input.slice(6).trim();
    return label === "" ? { type: "invalid", reason: "empty" } : { type: "focus", label };
  }
  return null;
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
    : model.fields.filter((field) => {
        const label = field.label.trim().toLocaleLowerCase();
        return label.startsWith(requested) || label.includes(requested) || requested.includes(label);
      });

  if (matches.length !== 1) {
    const question = matches.length === 0
      ? "I couldn't find that field. Say its label again."
      : "Which field do you mean? Say the full field label.";
    return { type: "clarify", question };
  }

  const field = matches[0]!;
  if (phrase.type === "focus") return { type: "go_to_field", fieldId: field.id };
  if (phrase.type === "check") {
    if (field.type !== "checkbox") return { type: "clarify", question: "That is not a checkbox field." };
    return { type: "set_fields", fills: [{ fieldId: field.id, value: String(phrase.checked) }] };
  }
  if (phrase.type === "select") {
    if (field.type !== "select" && field.type !== "radio-group") {
      return { type: "clarify", question: "That field does not have selectable options." };
    }
    const choice = phrase.value.toLocaleLowerCase();
    const options = field.options ?? [];
    const exactOptions = options.filter((option) =>
      option.value.toLocaleLowerCase() === choice || option.label.trim().toLocaleLowerCase() === choice,
    );
    const optionMatches = exactOptions.length > 0
      ? exactOptions
      : options.filter((option) => {
          const label = option.label.trim().toLocaleLowerCase();
          return label.startsWith(choice) || label.includes(choice) || choice.includes(label);
        });
    if (optionMatches.length !== 1 || optionMatches[0]!.value === "") {
      return {
        type: "clarify",
        question: optionMatches.length > 1 ? "Which option do you mean? Say the full option label." : "I couldn't find that option.",
      };
    }
    return { type: "set_fields", fills: [{ fieldId: field.id, value: optionMatches[0]!.value }] };
  }

  return { type: "set_fields", fills: [{ fieldId: field.id, value: phrase.value }] };
}

/** A safe classification string: fill and select values never leave the deterministic parser. */
export function safePhraseForBrain(phrase: FieldPhrase): string {
  switch (phrase.type) {
    case "fill": return `fill ${phrase.label} with [value omitted]`;
    case "select": return `select [option omitted] for ${phrase.label}`;
    case "check": return `${phrase.checked ? "check" : "uncheck"} ${phrase.label}`;
    case "focus": return `focus ${phrase.label}`;
    case "invalid": return "field command [value omitted]";
  }
}

/** The transcript is shown to the voice client, so do not echo values from field commands. */
export function safePhraseForTranscript(phrase: FieldPhrase): string {
  return safePhraseForBrain(phrase);
}
