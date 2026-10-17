import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";
import { cleanTitle, normalizeCommand, plural } from "./normalize";
import { cancelEffect, speakEffect } from "./state";
import { handleActResult, handleChangeUtterance, handleFillUtterance, handleOptionPick, handleReadUtterance, handleSpellUtterance } from "./read-fill";
import { handleArmedUtterance, handleReadbackUtterance, handleSubmitFlow, handleSubmitUtterance } from "./submit";

// Pure grammar-first reducer. No IO, no clock. Page text (the title) is data and is sanitized
// before it is spoken; only counts are spoken, never field labels or values.

const WHATS_HERE = [
  /^whats here$/,
  /^what is here$/,
  /^what is on this page$/,
  /^whats on this page$/,
  /^whats on the page$/,
  /^what is on the page$/,
  /^what is this page$/,
  /^whats on this form$/,
  /^what is on this form$/,
];

function describe(form: NonNullable<DialogueContext["form"]>): string {
  const title = cleanTitle(form.title);
  const required = form.fields.filter((f) => f.required).length;
  const actions = plural(form.actions.length, "action", "actions");
  if (form.fields.length === 0) return `${title}. No fields, ${actions}.`;
  return `${title}. ${plural(form.fields.length, "field", "fields")}, ${required} required, ${actions}.`;
}

function answer(state: DialogueState, text: string): { state: DialogueState; effects: Effect[] } {
  const spoken = speakEffect(state, text, "answer", { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

export function reduce(
  state: DialogueState,
  event: DialogueEvent,
  ctx: DialogueContext,
): { state: DialogueState; effects: Effect[] } {
  if (event.type !== "utterance") {
    if (event.type === "speak.done" || event.type === "form.changed" || event.type === "confirm.armed"
      || event.type === "confirm.refused" || event.type === "confirm.cleared" || event.type === "gated.result") {
      return handleSubmitFlow(state, event, ctx);
    }
    if (event.type === "act.result") return handleActResult(state, event, ctx);
    if (event.type === "intent.reply") {
      if (state.mode === "reading-back" || state.mode === "awaiting-confirm" || state.mode === "executing") {
        return { state, effects: [] };
      }
      return answer(state, event.text);
    }

    if (event.type === "control") {
      if (state.mode === "awaiting-confirm") return handleArmedUtterance(state, event, ctx);
      if (state.mode === "executing") {
        if (event.cmd === "stop") {
          const stopped = cancelEffect(state);
          return { state: stopped.state, effects: [stopped.effect] };
        }
        return answer(state, state.lastSpoken ?? "There's nothing to repeat.");
      }
      if (event.cmd === "stop") {
        const ready = cancelEffect({ ...state, mode: "ready", readBack: null });
        return { state: ready.state, effects: [ready.effect] };
      }
      return answer(state, state.lastSpoken ?? "There's nothing to repeat.");
    }

    return handleSubmitFlow(state, event, ctx);
  }

  const raw = event.utterance.text;
  if (state.mode === "awaiting-confirm") return handleArmedUtterance(state, event, ctx);
  if (state.mode === "reading-back") return handleReadbackUtterance(state, event, ctx);
  if (state.mode === "executing") return { state, effects: [] };
  if (raw.length > 200) return { state, effects: [{ kind: "parseIntent", text: raw }] };
  const norm = normalizeCommand(raw);
  if (norm === "") return { state, effects: [] };

  const submitResult = handleSubmitUtterance(state, norm, raw, event, ctx);
  if (submitResult !== null) return submitResult;

  if (WHATS_HERE.some((re) => re.test(norm))) {
    const text = ctx.form === null ? "I can't see a page yet." : describe(ctx.form);
    return answer(state, text);
  }

  const changeResult = handleChangeUtterance(state, norm, raw, ctx);
  if (changeResult !== null) return changeResult;

  const spellResult = handleSpellUtterance(state, norm, ctx);
  if (spellResult !== null) return spellResult;

  const readResult = handleReadUtterance(state, norm, raw, ctx);
  if (readResult !== null) return readResult;

  const fillResult = handleFillUtterance(state, norm, raw, ctx, event.utterance.sttConfidence);
  if (fillResult !== null) return fillResult;

  const optionResult = handleOptionPick(state, raw, ctx);
  if (optionResult !== null) return optionResult;

  return { state, effects: [{ kind: "parseIntent", text: raw }] };
}
