import type { Field, FormModel } from "@blip/protocol";
import type { DialogueContext, Effect } from "./effects";
import type { DialogueState } from "./state";
import { cancelEffect, speakEffect } from "./state";
import { fillableFields, matchOption, optionLabelFor, optionList, resolveField, spokenLabel } from "./fields";
import { cleanValue, normalizeCommand, normalizeEmail, normalizeNumberish } from "./normalize";
import { changeText, echoText, readBatchText, requiredEmptyText, spellValueText } from "./templates";
import type { DialogueEvent } from "./events";

type DialogueResult = { state: DialogueState; effects: Effect[] };

const READ = new Set(["read the form", "read form", "read the fields"]);
const CONTINUE = new Set(["continue", "next", "more"]);
const STOP = new Set(["stop", "be quiet", "quiet", "stop talking"]);
const REPEAT = new Set(["repeat", "say that again", "repeat that"]);
const REQUIRED = new Set([
  "whats required",
  "what is required",
  "which fields are required",
  "what fields are required",
]);
const MISSING = new Set([
  "whats missing",
  "what is missing",
  "what do i still need",
  "what do i need to fill",
]);

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight"] as const;
const FILL_PREFIXES = new Set(["set", "fill", "enter", "type", "my"]);
const COMMAND_VERBS = new Set([
  "fill", "spell", "change", "undo", "where", "what", "whats", "read", "submit", "go", "open",
  "click", "press", "tap", "book", "pay", "delete", "send", "help", "how", "why", "can", "could",
  "set", "enter", "type", "my", "cancel",
]);
const NON_VALUE = new Set(["yes", "yeah", "no", "ok", "okay", "cancel", "nevermind", "never mind", "sure"]);

function answer(state: DialogueState, text: string): DialogueResult {
  const spoken = speakEffect(state, text, "answer", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

function errorAnswer(state: DialogueState, text: string): DialogueResult {
  const spoken = speakEffect(state, text, "error", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

function requiredText(form: FormModel): string {
  const fields = fillableFields(form);
  const required = fields.flatMap((field, index) => field.required ? [{ field, index }] : []);
  if (required.length === 0) return "No fields are required.";
  const labels = required.map(({ field, index }) => spokenLabel(field, index + 1));
  return `${required.length} required: ${labels.join(", ")}.`;
}

function read(state: DialogueState, form: FormModel, start: number): DialogueResult {
  const batch = readBatchText(form, start, 3);
  const spoken = speakEffect(state, batch.text, "answer", { interruptible: true });
  return {
    state: {
      ...spoken.state,
      mode: "reading",
      readCursor: batch.nextIndex,
      currentFieldId: batch.lastFieldId,
      pendingOptions: batch.optionsFieldId ? { fieldId: batch.optionsFieldId } : null,
    },
    effects: [spoken.effect],
  };
}

function numberName(n: number): string {
  return NUMBER_WORDS[n - 1] ?? String(n);
}

function numberedOptions(form: FormModel, fieldId: string): string | null {
  const field = fillableFields(form).find((item) => item.id === fieldId);
  if (!field) return null;
  return optionList(field)
    .map((option) => `${numberName(option.n)}, ${option.label || `unlabeled option ${option.n}`}.`)
    .join(" ");
}

function fieldNumber(form: FormModel, field: Field): number {
  return fillableFields(form).findIndex((item) => item.id === field.id) + 1;
}

function sayOr(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? "that field";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function speakableLabels(labels: string[]): string[] {
  return labels.map((label) => label.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80));
}

/** Handle the exact local spell grammar using only the current form snapshot. */
export function handleSpellUtterance(
  state: DialogueState,
  norm: string,
  ctx: DialogueContext,
): DialogueResult | null {
  if (norm !== "spell" && !norm.startsWith("spell ")) return null;
  if (ctx.form === null) return answer(state, "I can't see a page yet. Which field should I spell?");
  const requested = norm.slice("spell".length).trim();
  if (!requested) return answer(state, "Which field should I spell?");
  const match = resolveField(ctx.form, requested);
  if (match.kind === "ambiguous") {
    return answer(state, `Which field? ${sayOr(speakableLabels(match.labels))}?`);
  }
  if (match.kind === "none") return answer(state, "I couldn't find that field. Which field should I spell?");
  if (match.field.sensitive !== "none") return handoffSensitive(state, match.field, ctx.form);
  if (!match.field.hasValue || match.field.value === null || match.field.value === "") {
    return answer(state, `${spokenLabel(match.field, fieldNumber(ctx.form, match.field))} is empty, so there is nothing to spell.`);
  }
  return answer(state, spellValueText(match.field.value));
}

/** Handle "change {field} to {value}" without asking the model to route a known command. */
export function handleChangeUtterance(
  state: DialogueState,
  norm: string,
  raw: string,
  ctx: DialogueContext,
): DialogueResult | null {
  if (norm !== "change" && !norm.startsWith("change ")) return null;
  if (ctx.form === null) return answer(state, "I can't see a page yet. Which field should I change?");
  const trimmed = raw.trimStart();
  const commandEnd = trimmed.search(/\s/);
  const candidate = commandEnd < 0 ? "" : trimmed.slice(commandEnd).trimStart();
  if (!candidate) return answer(state, "Which field should I change, and what value should I use?");
  const match = resolveField(ctx.form, candidate);
  if (match.kind === "ambiguous") return answer(state, `Which one, ${sayOr(speakableLabels(match.labels))}?`);
  if (match.kind === "none") return answer(state, "I couldn't find that field. Which field should I change?");
  if (match.field.sensitive !== "none") return handoffSensitive(state, match.field, ctx.form);
  if (!match.rest.trim()) {
    return answer(state, `What value should I use for ${spokenLabel(match.field, fieldNumber(ctx.form, match.field))}?`);
  }
  const result = fillField(state, match.field, match.rest, ctx.form);
  if (result === null || result.state.pendingFill === null || !result.effects.some((effect) => effect.kind === "fill" || effect.kind === "select")) {
    return result ?? errorAnswer(state, `I couldn't change ${spokenLabel(match.field, fieldNumber(ctx.form, match.field))}.`);
  }
  const previousValue = match.field.hasValue && match.field.value !== null ? match.field.value : null;
  return {
    ...result,
    state: { ...result.state, pendingFill: { ...result.state.pendingFill, previousValue } },
  };
}

function handoffSensitive(state: DialogueState, field: Field, form: FormModel): DialogueResult {
  const label = spokenLabel(field, fieldNumber(form, field));
  const base = {
    ...state,
    mode: "ready" as const,
    readCursor: null,
    pendingOptions: null,
    pendingFill: null,
    currentFieldId: field.id,
  };
  const spoken = speakEffect(base, `${label} is sensitive. I can't fill it. I moved to the field so you can type it.`, "answer", { interruptible: true });
  return { state: spoken.state, effects: [{ kind: "focus", fieldId: field.id }, spoken.effect] };
}

function storeOldValue(state: DialogueState, field: Field): Record<string, string> {
  if (field.sensitive !== "none" || !field.hasValue || field.value === null) return state.previousValues;
  return { ...state.previousValues, [field.id]: field.value };
}

function issueValueEffect(state: DialogueState, field: Field, value: string, kind: "fill" | "select", optionValue?: string): DialogueResult {
  const next: DialogueState = {
    ...state,
    mode: "awaiting-value",
    readCursor: null,
    currentFieldId: field.id,
    pendingOptions: null,
    pendingFill: { fieldId: field.id, replaced: field.hasValue },
    previousValues: storeOldValue(state, field),
  };
  return {
    state: next,
    effects: [kind === "fill"
      ? { kind: "fill", fieldId: field.id, value }
      : { kind: "select", fieldId: field.id, optionValue: optionValue ?? value }],
  };
}

function isTextLike(field: Field): boolean {
  return ["text", "email", "tel", "url", "number", "date", "time", "textarea", "unknown"].includes(field.type);
}

function normalizeValue(field: Field, value: string): string | null {
  if (field.type === "email" || field.autocomplete === "email") return normalizeEmail(value);
  if (field.type === "tel" || field.autocomplete === "tel") return cleanValue(normalizeNumberish(value, "tel"));
  if (field.type === "number") return cleanValue(normalizeNumberish(value, "number"));
  return cleanValue(value);
}

function fillField(state: DialogueState, field: Field, value: string, form: FormModel): DialogueResult | null {
  if (field.sensitive !== "none") return handoffSensitive(state, field, form);
  const normalized = normalizeValue(field, value);
  if (normalized === null) {
    return errorAnswer(state, "I didn't catch a full email address. Say it again, for example name at example dot com.");
  }
  if (field.type === "select" || field.type === "radio-group") {
    const match = matchOption(field, normalized);
    if (match.kind === "match") return issueValueEffect(state, field, match.option.value, "select", match.option.value);
    if (match.kind === "many") return answer(state, `Which one? ${sayOr(speakableLabels(match.labels))}?`);
    return null;
  }
  if (!isTextLike(field)) return null;
  return issueValueEffect(state, field, normalized, "fill");
}

function stripLeadingFillPrefix(raw: string, norm: string): { raw: string; prefix: string | null } {
  const first = norm.split(" ", 1)[0] ?? "";
  if (!FILL_PREFIXES.has(first)) return { raw, prefix: null };
  const trimmed = raw.trimStart();
  const separator = trimmed.search(/\s/);
  return { raw: separator < 0 ? "" : trimmed.slice(separator).trimStart(), prefix: first };
}

function namedEdit(state: DialogueState, norm: string, raw: string, form: FormModel): DialogueResult | null {
  const stripped = stripLeadingFillPrefix(raw, norm);
  const candidate = stripped.prefix === null ? raw : stripped.raw;
  if (!candidate) return null;
  const match = resolveField(form, candidate);
  if (match.kind === "ambiguous") return answer(state, `Which one, ${sayOr(speakableLabels(match.labels))}?`);
  if (match.kind !== "match") return null;
  if (match.rest.trim() === "") {
    const label = spokenLabel(match.field, fieldNumber(form, match.field));
    return answer(state, `What value should I use for ${label}?`);
  }
  return fillField(state, match.field, match.rest, form);
}

/** Resolve only a named edit with a supplied value, reusing the normal fill/select/focus path. */
export function resolveEdit(state: DialogueState, raw: string, ctx: DialogueContext): DialogueResult | null {
  if (ctx.form === null) return null;
  const norm = normalizeCommand(raw);
  const stripped = stripLeadingFillPrefix(raw, norm);
  const candidate = stripped.prefix === null ? raw : stripped.raw;
  if (!candidate) return null;
  const match = resolveField(ctx.form, candidate);
  if (match.kind !== "match" || match.rest.trim() === "") return null;
  return fillField(state, match.field, match.rest, ctx.form)
    ?? errorAnswer(state, `I didn't find a value for ${spokenLabel(match.field, fieldNumber(ctx.form, match.field))}.`);
}

function controlOrLongValue(norm: string, tokenCount: number): boolean {
  if (tokenCount > 8 || NON_VALUE.has(norm)) return true;
  const first = norm.split(" ", 1)[0] ?? "";
  return COMMAND_VERBS.has(first);
}

function optionValue(state: DialogueState, field: Field, text: string, form: FormModel): DialogueResult | null {
  const matched = matchOption(field, text);
  if (matched.kind === "match") return issueValueEffect(state, field, matched.option.value, "select", matched.option.value);
  if (matched.kind === "many") return answer(state, `Which one? ${numberedOptions(form, field.id) ?? ""}`);
  return null;
}

/** Handle named and current-field dictation without asking the model to interpret known grammar. */
export function handleFillUtterance(
  state: DialogueState,
  norm: string,
  raw: string,
  ctx: DialogueContext,
  sttConfidence?: number,
): DialogueResult | null {
  if (ctx.form === null) return null;
  const named = namedEdit(state, norm, raw, ctx.form);
  if (named !== null) return named;

  // A just-read option list gets first chance to match a choice. If it does not match,
  // the last field read may still accept a bare value; explicit "option/number N" stays a pick.
  if (state.pendingOptions !== null) {
    const pendingField = fillableFields(ctx.form).find((item) => item.id === state.pendingOptions?.fieldId);
    if (pendingField) {
      const pendingMatch = matchOption(pendingField, raw);
      if (pendingMatch.kind !== "none") return null;
      if (norm.startsWith("option ") || norm.startsWith("number ")) return null;
      if (state.currentFieldId === pendingField.id) return null;
    }
  }
  const tokenCount = norm.split(" ").filter(Boolean).length;
  if (controlOrLongValue(norm, tokenCount)) return null;
  if (state.currentFieldId === null) return null;
  const field = fillableFields(ctx.form).find((item) => item.id === state.currentFieldId);
  if (!field) return null;
  if (field.sensitive !== "none") return handoffSensitive(state, field, ctx.form);
  if (sttConfidence !== undefined && sttConfidence < 0.5) {
    return errorAnswer(state, "I'm not sure I heard that. Say it again.");
  }
  if (field.type === "select" || field.type === "radio-group") return optionValue(state, field, raw, ctx.form);
  if (!isTextLike(field)) return null;
  return fillField(state, field, raw, ctx.form);
}

/** Use the page's observed value as the sole source for a fill/select echo. */
export function handleActResult(
  state: DialogueState,
  event: Extract<DialogueEvent, { type: "act.result" }>,
  ctx: DialogueContext,
): DialogueResult {
  const pending = state.pendingFill;
  if (pending === null || pending.fieldId !== event.fieldId || ctx.form === null) return { state, effects: [] };
  const field = ctx.form.fields.find((item) => item.id === event.fieldId);
  if (!field) return { state, effects: [] };

  if (field.sensitive !== "none" || event.error === "sensitive-field") {
    return handoffSensitive(state, field, ctx.form);
  }

  const base: DialogueState = {
    ...state,
    mode: "ready",
    pendingFill: null,
    pendingOptions: null,
  };
  const observed = event.observedValue;
  if (!event.ok || observed === null || observed === undefined || observed === "") {
    const text = `I tried to fill ${spokenLabel(field, fieldNumber(ctx.form, field))}, but the page shows nothing.`;
    const spoken = speakEffect(base, text, "error", { interruptible: true });
    return { state: spoken.state, effects: [spoken.effect, { kind: "earcon", name: "error" }] };
  }

  let display = observed;
  if (event.op === "select" || field.type === "select" || field.type === "radio-group") {
    const label = optionLabelFor(field, observed);
    if (label === null) {
      const text = `I tried to fill ${spokenLabel(field, fieldNumber(ctx.form, field))}, but the page shows nothing.`;
      const spoken = speakEffect(base, text, "error", { interruptible: true });
      return { state: spoken.state, effects: [spoken.effect, { kind: "earcon", name: "error" }] };
    }
    display = label;
  }

  if (Object.hasOwn(pending, "previousValue")) {
    const text = changeText(field, pending.previousValue ?? null, display);
    const spoken = speakEffect(base, text, "answer", { interruptible: true });
    return { state: spoken.state, effects: [spoken.effect, { kind: "refreshForm" }] };
  }

  const text = echoText(field, display, pending.replaced);
  const spoken = speakEffect(base, text, "answer", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect, { kind: "refreshForm" }] };
}

/** Handle the exact, local read/continue/control/required grammar. */
export function handleReadUtterance(
  state: DialogueState,
  norm: string,
  _raw: string,
  ctx: DialogueContext,
): DialogueResult | null {
  if (READ.has(norm)) {
    if (ctx.form === null) return answer(state, "I can't see a page yet.");
    return read(state, ctx.form, 0);
  }

  if (CONTINUE.has(norm)) {
    if (state.readCursor === null) return answer(state, "Say read the form to start.");
    if (ctx.form === null) return answer(state, "I can't see a page yet.");
    return read(state, ctx.form, state.readCursor);
  }

  if (STOP.has(norm)) {
    const stopped = cancelEffect({ ...state, mode: "ready", readCursor: null, pendingOptions: null });
    return { state: stopped.state, effects: [stopped.effect] };
  }

  if (REPEAT.has(norm)) return answer(state, state.lastSpoken ?? "There's nothing to repeat.");

  if (MISSING.has(norm)) {
    return answer(state, ctx.form === null ? "I can't see a page yet." : requiredEmptyText(ctx.form));
  }

  if (REQUIRED.has(norm)) {
    return answer(state, ctx.form === null ? "I can't see a page yet." : requiredText(ctx.form));
  }

  return null;
}

/** Handle a number or option label while the most recently read choices are pending. */
export function handleOptionPick(
  state: DialogueState,
  raw: string,
  ctx: DialogueContext,
): DialogueResult | null {
  const pending = state.pendingOptions;
  if (pending === null || ctx.form === null) return null;
  const field = fillableFields(ctx.form).find((item) => item.id === pending.fieldId);
  if (!field) return null;

  const matched = matchOption(field, raw);
  if (matched.kind === "match") {
    return issueValueEffect(state, field, matched.option.value, "select", matched.option.value);
  }

  const norm = normalizeCommand(raw);
  if (controlOrLongValue(norm, norm.split(" ").filter(Boolean).length)
    && !norm.startsWith("option ") && !norm.startsWith("number ")) return null;

  const choices = numberedOptions(ctx.form, field.id);
  if (choices === null) return null;
  if (matched.kind === "many") return answer(state, `Which one? ${choices}`);
  return answer(state, `I didn't find that option. ${choices}`);
}

