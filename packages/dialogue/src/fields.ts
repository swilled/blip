import { isLowConfidenceLabel, type Field, type FormModel } from "@blip/protocol";
import { cleanSpoken, normalizeCommand, wordsToNumber } from "./normalize";

export type ListedOption = { n: number; value: string; label: string };
export type OptionMatch = { kind: "match"; option: ListedOption } | { kind: "many"; labels: string[] } | { kind: "none" };
export type FieldMatch = { kind: "match"; field: Field; rest: string } | { kind: "ambiguous"; labels: string[] } | { kind: "none" };

/** Enabled fields use the same page order that spoken numbering uses. */
export function fillableFields(form: FormModel): Field[] {
  return form.fields.filter((field) => !field.disabled).slice().sort((a, b) => a.order - b.order);
}

/** Return the sanitized label that may be spoken for a field. */
export function spokenLabel(field: Field, n: number): string {
  const label = cleanSpoken(field.label);
  if (!label) return `unlabeled field ${n}`;
  return isLowConfidenceLabel(field) ? `probably ${label}` : label;
}

/** Options keep their page order, but empty values cannot be selected. */
export function optionList(field: Field): ListedOption[] {
  const options = (field.options ?? []).filter((option) => option.value !== "");
  return options.map((option, index) => ({
    n: index + 1,
    value: option.value,
    label: cleanSpoken(option.label),
  }));
}

export function optionLabelFor(field: Field, value: string): string | null {
  const option = field.options?.find((candidate) => candidate.value === value && candidate.value !== "");
  return option ? cleanSpoken(option.label) : null;
}

/** Match a select/radio option by its spoken number or a unique sanitized label. */
export function matchOption(field: Field, text: string): OptionMatch {
  if (text.length > 200) return { kind: "none" };
  const options = optionList(field);
  const tokens = normalizeCommand(text).split(" ").filter(Boolean);
  if (tokens.length === 0) return { kind: "none" };

  const numberTokens = tokens.length === 2 && (tokens[0] === "number" || tokens[0] === "option")
    ? [tokens[1]!]
    : tokens;
  let number: number | null = null;
  if (numberTokens.length === 1 && /^[0-9]{1,2}$/.test(numberTokens[0]!)) number = Number(numberTokens[0]);
  else number = wordsToNumber(numberTokens);
  if (number !== null && number >= 1 && number <= 20) {
    const option = options.find((candidate) => candidate.n === number);
    if (option) return { kind: "match", option };
  }

  const query = tokens.join(" ");
  const normalized = options.map((option) => ({ option, label: normalizeCommand(option.label) })).filter((item) => item.label);
  const exact = normalized.filter((item) => item.label === query);
  if (exact.length === 1) return { kind: "match", option: exact[0]!.option };
  if (exact.length > 1) return { kind: "many", labels: exact.map((item) => item.option.label) };

  const partial = normalized.filter((item) => item.label.includes(query));
  if (partial.length === 1) return { kind: "match", option: partial[0]!.option };
  if (partial.length > 1) return { kind: "many", labels: partial.map((item) => item.option.label) };
  return { kind: "none" };
}

type WordSpan = { word: string; start: number; end: number };

function wordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  const matcher = /[a-z0-9]+/gi;
  for (const match of text.matchAll(matcher)) {
    const start = match.index;
    spans.push({ word: match[0].toLowerCase(), start, end: start + match[0].length });
  }
  return spans;
}

function containsAtStart(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  return phrase.every((word, index) => words[index] === word);
}

function containsContiguous(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((word, index) => haystack[start + index] === word)) return true;
  }
  return false;
}

/** Resolve an utterance's leading field label without turning page text into a pattern. */
export function resolveField(form: FormModel, text: string): FieldMatch {
  if (text.length > 200) return { kind: "none" };
  const normalized = normalizeCommand(text);
  if (!normalized) return { kind: "none" };
  const spans = wordSpans(text);
  const words = normalized.split(" ");
  if (words[0] === "field" && words.length >= 2 && /^[0-9]{1,3}$/.test(words[1]!)) {
    const position = Number(words[1]);
    const field = fillableFields(form)[position - 1];
    if (field && !cleanSpoken(field.label)) {
      let restIndex = 2;
      if (["is", "to", "as", "equals"].includes(words[restIndex] ?? "")) restIndex += 1;
      const rest = restIndex < spans.length ? text.slice(spans[restIndex]!.start).trim() : "";
      return { kind: "match", field, rest };
    }
  }

  const separatorIndex = words.findIndex((word) => ["is", "to", "as", "equals"].includes(word));
  const leading = separatorIndex >= 0 ? words.slice(0, separatorIndex) : words;
  if (leading.length === 0) return { kind: "none" };

  const candidates = fillableFields(form).flatMap((field) => {
    const label = normalizeCommand(cleanSpoken(field.label)).split(" ").filter(Boolean);
    if (label.length === 0) return [];
    const exactLeading = containsAtStart(leading, label);
    const partialLeading = !exactLeading && containsContiguous(label, leading);
    if (!exactLeading && !partialLeading) return [];
    return [{ field, label, score: exactLeading ? label.length : leading.length }];
  });
  if (candidates.length === 0) return { kind: "none" };
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const best = candidates.filter((candidate) => candidate.score === bestScore);
  if (best.length > 1) {
    return { kind: "ambiguous", labels: best.map(({ field }) => cleanSpoken(field.label)) };
  }

  const chosen = best[0]!;
  const consumed = chosen.score;
  let restIndex = consumed;
  if (separatorIndex === consumed) restIndex += 1;
  const rest = restIndex < spans.length ? text.slice(spans[restIndex]!.start).trim() : "";
  return { kind: "match", field: chosen.field, rest };
}

export function requiredEmpty(form: FormModel): Field[] {
  return fillableFields(form).filter((field) => field.required && !field.hasValue);
}

/** A stable revision digest that never includes a sensitive field's value. */
export function formDigest(form: FormModel): string {
  return form.fields.slice().sort((a, b) => a.order - b.order).map((field) => {
    const base = `${field.id}:${field.hasValue}`;
    return field.sensitive === "none" ? `${base}:${field.value ?? ""}` : base;
  }).join("|");
}
