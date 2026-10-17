import type { Field, FormModel } from "@blip/protocol";
import type { DialogueContext, Effect } from "./effects";
import type { DialogueState, UndoEntry } from "./state";
import { cancelEffect, discloseFieldLabel, speakEffect } from "./state";
import { fillableFields, matchOption, optionLabelFor, optionList, profileFieldMatches, requiredEmpty, resolveField, spokenLabel } from "./fields";
import { cleanValue, normalizeCommand, normalizeEmail, normalizeNumberish } from "./normalize";
import { changeText, echoText, profileBatchText, readBatchText, requiredEmptyText, requiredFieldsBatchText, spellValueText, undoSummaryText } from "./templates";
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

/** Disclose a guessed label once per field and snapshot, using only model metadata. */
function discloseFields(state: DialogueState, form: FormModel, fields: Field[]): { state: DialogueState; text: string } {
  const disclosures: string[] = [];
  let nextState = state;
  for (const field of fields) {
    const result = discloseFieldLabel(nextState, form, field.id);
    nextState = result.state;
    if (result.text) disclosures.push(result.text);
  }
  return { state: nextState, text: disclosures.join(" ") };
}

function withFieldDisclosure(state: DialogueState, form: FormModel, field: Field, text: string): DialogueResult {
  const disclosure = discloseFields(state, form, [field]);
  const spoken = speakEffect(disclosure.state, [disclosure.text, text].filter(Boolean).join(" "), "answer", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

function read(state: DialogueState, form: FormModel, start: number): DialogueResult {
  const batch = readBatchText(form, start, 3);
  const disclosure = discloseFields(state, form, fillableFields(form).slice(start, start + 3));
  const spoken = speakEffect(disclosure.state, [disclosure.text, batch.text].filter(Boolean).join(" "), "answer", { interruptible: true });
  return {
    state: {
      ...spoken.state,
      mode: "reading",
      requiredCursor: null,
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
    return withFieldDisclosure(state, ctx.form, match.field, `${spokenLabel(match.field, fieldNumber(ctx.form, match.field))} is empty, so there is nothing to spell.`);
  }
  return withFieldDisclosure(state, ctx.form, match.field, spellValueText(match.field.value));
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
  const disclosure = discloseFields(base, form, [field]);
  const text = [disclosure.text, `${label} is sensitive. I can't fill it. I moved to the field so you can type it.`]
    .filter(Boolean).join(" ");
  const spoken = speakEffect(disclosure.state, text, "answer", { interruptible: true });
  return { state: spoken.state, effects: [{ kind: "focus", fieldId: field.id }, spoken.effect] };
}

function storeOldValue(state: DialogueState, field: Field): Record<string, string> {
  if (field.sensitive !== "none" || !field.hasValue || field.value === null) return state.previousValues;
  return { ...state.previousValues, [field.id]: field.value };
}

function issueValueEffect(state: DialogueState, field: Field, value: string, kind: "fill" | "select", form: FormModel, optionValue?: string): DialogueResult {
  const disclosure = discloseFields(state, form, [field]);
  const beforeAction = disclosure.text
    ? speakEffect(disclosure.state, disclosure.text, "answer", { interruptible: true })
    : null;
  const next: DialogueState = {
    ...(beforeAction?.state ?? disclosure.state),
    mode: "awaiting-value",
    readCursor: null,
    currentFieldId: field.id,
    pendingOptions: null,
    pendingFill: {
      fieldId: field.id,
      replaced: field.hasValue,
      ...(field.sensitive === "none" ? { undoPreviousValue: field.hasValue ? field.value : null } : {}),
    },
    previousValues: storeOldValue(state, field),
  };
  return {
    state: next,
    effects: [
      ...(beforeAction ? [beforeAction.effect] : []),
      kind === "fill"
        ? { kind: "fill", fieldId: field.id, value }
        : { kind: "select", fieldId: field.id, optionValue: optionValue ?? value },
    ],
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
    if (match.kind === "match") return issueValueEffect(state, field, match.option.value, "select", form, match.option.value);
    if (match.kind === "many") return answer(state, `Which one? ${sayOr(speakableLabels(match.labels))}?`);
    return null;
  }
  if (!isTextLike(field)) return null;
  return issueValueEffect(state, field, normalized, "fill", form);
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
  if (matched.kind === "match") return issueValueEffect(state, field, matched.option.value, "select", form, matched.option.value);
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
  if (field.sensitive !== "none") {
    if (norm === "done") {
      const label = spokenLabel(field, fieldNumber(ctx.form, field));
      return answer(state, field.hasValue ? `${label} is entered, hidden.` : `${label} is still empty.`);
    }
    return handoffSensitive(state, field, ctx.form);
  }
  if (sttConfidence !== undefined && sttConfidence < 0.5) {
    return errorAnswer(state, "I'm not sure I heard that. Say it again.");
  }
  if (field.type === "select" || field.type === "radio-group") return optionValue(state, field, raw, ctx.form);
  if (!isTextLike(field)) return null;
  return fillField(state, field, raw, ctx.form);
}

/** Handle the first profile tracer locally; profile values never enter intent parsing. */
export function handleProfileFillUtterance(
  state: DialogueState,
  norm: string,
  ctx: DialogueContext,
): DialogueResult | null {
  if (norm !== "fill from my profile") return null;
  if (ctx.form === null) return answer(state, "I can't see a page yet.");
  const profile = ctx.profile;
  if (!profile) return answer(state, "I can't access the local profile yet.");
  const allFields = profileFieldMatches(ctx.form);
  const entries: NonNullable<DialogueState["profileBatch"]>["entries"] = [];
  const skipped: string[] = [];
  for (const { field, match } of allFields) {
    const label = spokenLabel(field, fieldNumber(ctx.form, field));
    if (field.disabled || field.sensitive !== "none" || field.hasValue || match.kind !== "match") {
      skipped.push(label);
      continue;
    }
    entries.push({ fieldId: field.id, key: match.key, value: profile[match.key], label });
  }
  if (entries.length === 0) {
    return answer(state, profileBatchText([], skipped, ctx.form));
  }
  const batchState: DialogueState = {
    ...state,
    profileBatch: { entries, cursor: 0, filled: [], skipped },
  };
  return startProfileEntry(batchState, ctx.form);
}

function startProfileEntry(state: DialogueState, form: FormModel): DialogueResult {
  const batch = state.profileBatch;
  if (batch === null) return { state, effects: [] };
  let cursor = batch.cursor;
  const skipped = [...batch.skipped];
  const fields = new Map(form.fields.map((field) => [field.id, field]));
  while (cursor < batch.entries.length) {
    const entry = batch.entries[cursor]!;
    const field = fields.get(entry.fieldId);
    if (!field || field.disabled || field.sensitive !== "none" || field.hasValue) {
      skipped.push(entry.label);
      cursor += 1;
      continue;
    }
    const nextState: DialogueState = {
      ...state,
      mode: "awaiting-value",
      currentFieldId: field.id,
      pendingOptions: null,
      pendingFill: { fieldId: field.id, replaced: false, profileBatch: true },
      profileBatch: { ...batch, cursor, skipped },
    };
    return { state: nextState, effects: [{ kind: "fill", fieldId: field.id, value: entry.value }] };
  }
  const spoken = speakEffect(state, profileBatchText(batch.filled.map((item) => item.label), skipped, form), "answer", { interruptible: true });
  return {
    state: {
      ...spoken.state,
      profileBatch: null,
      ...(batch.filled.length > 0 ? { undoRecord: batch.filled } : {}),
    },
    effects: [spoken.effect],
  };
}

export function continueProfileBatch(state: DialogueState, form: FormModel | null): DialogueResult {
  if (state.profileBatch === null) return { state, effects: [] };
  if (form === null) {
    const batch = state.profileBatch;
    const base = { ...state, profileBatch: null, ...(batch.filled.length > 0 ? { undoRecord: batch.filled } : {}) };
    return answer(base, "The page changed, so I stopped the profile fill. The page's current values can't be confirmed yet.");
  }
  return startProfileEntry(state, form);
}

export function continueUndo(state: DialogueState, form: FormModel | null): DialogueResult {
  const pending = state.pendingUndo;
  if (pending === null) return { state, effects: [] };
  if (form === null) {
    return answer({ ...state, pendingUndo: null }, "I couldn't check the current page values, so I left them unchanged.");
  }
  const fields = new Map(form.fields.map((field) => [field.id, field]));
  let cursor = pending.cursor;
  const restored = [...pending.restored];
  const skipped = [...pending.skipped];
  while (cursor < pending.entries.length) {
    const entry = pending.entries[cursor]!;
    const field = fields.get(entry.fieldId);
    if (!field || field.sensitive !== "none" || field.value !== entry.writtenValue) {
      skipped.push(entry.label);
      cursor += 1;
      continue;
    }
    return {
      state: {
        ...state,
        mode: "awaiting-value",
        currentFieldId: field.id,
        pendingFill: { fieldId: field.id, replaced: true, undoEntry: entry },
        pendingUndo: { ...pending, cursor, restored, skipped },
      },
      effects: [entry.op === "select"
        ? { kind: "select", fieldId: field.id, optionValue: entry.previousValue ?? "" }
        : { kind: "fill", fieldId: field.id, value: entry.previousValue ?? "" }],
    };
  }
  const spoken = speakEffect({ ...state, pendingUndo: null }, undoSummaryText(restored, skipped, pending.failed), "answer", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

export function handleUndoUtterance(state: DialogueState, norm: string): DialogueResult | null {
  if (norm !== "undo") return null;
  if (state.undoRecord === null || state.undoRecord.length === 0) return answer(state, "There's nothing left to undo.");
  return {
    state: {
      ...state,
      mode: "ready",
      undoRecord: null,
      pendingUndo: { entries: state.undoRecord, cursor: 0, restored: [], skipped: [], failed: [] },
    },
    effects: [{ kind: "refreshForm" }],
  };
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
    if (pending.profileBatch) return handoffSensitive({ ...state, profileBatch: null }, field, ctx.form);
    return handoffSensitive(state, field, ctx.form);
  }

  const base: DialogueState = {
    ...state,
    mode: "ready",
    pendingFill: null,
    pendingOptions: null,
  };
  const observed = event.observedValue;
  if (pending.undoEntry !== undefined && state.pendingUndo !== null) {
    const undo = state.pendingUndo;
    const entry = pending.undoEntry;
    const target = entry.previousValue ?? "";
    const success = event.ok && (observed ?? "") === target;
    return {
      state: {
        ...base,
        pendingUndo: {
          ...undo,
          cursor: undo.cursor + 1,
          restored: success ? [...undo.restored, entry.label] : undo.restored,
          skipped: undo.skipped,
          failed: success ? undo.failed : [...undo.failed, entry.label],
        },
      },
      effects: [{ kind: "refreshForm" }],
    };
  }
  if (pending.profileBatch && state.profileBatch !== null) {
    const batch = state.profileBatch;
    const entry = batch.entries[batch.cursor];
    const nextCursor = batch.cursor + 1;
    const nextBatch = {
      ...batch,
      cursor: nextCursor,
      filled: event.ok && observed !== null && observed !== undefined && observed !== "" && entry
        ? [...batch.filled, { fieldId: entry.fieldId, label: entry.label, op: "fill" as const, previousValue: null, writtenValue: observed }]
        : batch.filled,
      skipped: event.ok && observed !== null && observed !== undefined && observed !== ""
        ? batch.skipped
        : [...batch.skipped, entry?.label ?? spokenLabel(field, fieldNumber(ctx.form, field))],
    };
    if (!event.ok || observed === null || observed === undefined || observed === "") {
      const base = { ...state, mode: "ready" as const, pendingFill: null, profileBatch: nextBatch };
      const spoken = speakEffect(base, `I tried to fill ${spokenLabel(field, fieldNumber(ctx.form, field))}, but the page shows nothing.`, "error", { interruptible: true });
      return { state: spoken.state, effects: [spoken.effect, { kind: "earcon", name: "error" }, { kind: "refreshForm" }] };
    }
    let display = observed;
    if (event.op === "select" || field.type === "select" || field.type === "radio-group") {
      display = optionLabelFor(field, observed) ?? observed;
    }
    const base = { ...state, mode: "ready" as const, pendingFill: null, profileBatch: nextBatch };
    const spoken = speakEffect(base, echoText(field, display, false), "answer", { interruptible: true });
    return { state: spoken.state, effects: [spoken.effect, { kind: "refreshForm" }] };
  }
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

  const undoEntry: UndoEntry = {
    fieldId: field.id,
    label: spokenLabel(field, fieldNumber(ctx.form, field)),
    op: event.op === "select" ? "select" : "fill",
    previousValue: pending.undoPreviousValue ?? pending.previousValue ?? null,
    writtenValue: observed,
  };
  const withUndo = { ...base, undoRecord: [undoEntry] };

  if (Object.hasOwn(pending, "previousValue")) {
    const text = changeText(field, pending.previousValue ?? null, display);
    const spoken = speakEffect(withUndo, text, "answer", { interruptible: true });
    return { state: spoken.state, effects: [spoken.effect, { kind: "refreshForm" }] };
  }

  const text = echoText(field, display, pending.replaced);
  const spoken = speakEffect(withUndo, text, "answer", { interruptible: true });
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
    if (state.requiredCursor !== null && ctx.form !== null) {
      const batch = requiredFieldsBatchText(ctx.form, state.requiredCursor);
      const disclosure = discloseFields(state, ctx.form, requiredEmpty(ctx.form).slice(state.requiredCursor, state.requiredCursor + 3));
      const text = batch.opening
        ? [batch.opening, disclosure.text, batch.labelText].filter(Boolean).join(" ")
        : batch.text;
      const spoken = speakEffect(disclosure.state, text, "answer", { interruptible: true });
      return { state: { ...spoken.state, requiredCursor: batch.nextCursor }, effects: [spoken.effect] };
    }
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
    if (ctx.form === null) return answer(state, "I can't read the page yet. Please reconnect or try again.");
    const missing = requiredEmpty(ctx.form);
    const disclosure = discloseFields(state, ctx.form, missing);
    const spoken = speakEffect(disclosure.state, [disclosure.text, requiredEmptyText(ctx.form)].filter(Boolean).join(" "), "answer", { interruptible: true });
    return { state: spoken.state, effects: [spoken.effect] };
  }

  if (REQUIRED.has(norm)) {
    if (ctx.form === null) return answer(state, "I can't read the page yet. Please reconnect or try again.");
    const batch = requiredFieldsBatchText(ctx.form);
    const disclosure = discloseFields(state, ctx.form, requiredEmpty(ctx.form).slice(0, 3));
    const text = batch.opening
      ? [batch.opening, disclosure.text, batch.labelText].filter(Boolean).join(" ")
      : batch.text;
    const spoken = speakEffect(disclosure.state, text, "answer", { interruptible: true });
    return { state: { ...spoken.state, requiredCursor: batch.nextCursor }, effects: [spoken.effect] };
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
    return issueValueEffect(state, field, matched.option.value, "select", ctx.form, matched.option.value);
  }

  const norm = normalizeCommand(raw);
  if (controlOrLongValue(norm, norm.split(" ").filter(Boolean).length)
    && !norm.startsWith("option ") && !norm.startsWith("number ")) return null;

  const choices = numberedOptions(ctx.form, field.id);
  if (choices === null) return null;
  if (matched.kind === "many") return answer(state, `Which one? ${choices}`);
  return answer(state, `I didn't find that option. ${choices}`);
}

