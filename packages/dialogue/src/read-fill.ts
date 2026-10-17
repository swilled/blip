import type { FormModel } from "@blip/protocol";
import type { DialogueContext, Effect } from "./effects";
import type { DialogueState } from "./state";
import { cancelEffect, speakEffect } from "./state";
import { fillableFields, matchOption, optionList, spokenLabel } from "./fields";
import { readBatchText } from "./templates";

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

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight"] as const;

function answer(state: DialogueState, text: string): DialogueResult {
  const spoken = speakEffect(state, text, "answer", { interruptible: true });
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
    return {
      state: { ...state, mode: "ready", currentFieldId: field.id, pendingOptions: null },
      effects: [{ kind: "select", fieldId: field.id, optionValue: matched.option.value }],
    };
  }

  const choices = numberedOptions(ctx.form, field.id);
  if (choices === null) return null;
  if (matched.kind === "many") return answer(state, `Which one? ${choices}`);
  return answer(state, `I didn't find that option. ${choices}`);
}

