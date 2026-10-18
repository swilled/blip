import { isGatedKind } from "@blip/protocol";
import type { FormModel } from "@blip/protocol";
import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";
import { confirmWindowOpen, isCancel, phraseMatches } from "./confirm";
import { formDigest, requiredEmpty } from "./fields";
import { normalizeCommand } from "./normalize";
import { cancelEffect, speakEffect } from "./state";
import { resolveEdit } from "./read-fill";
import { confirmPromptText, readBackText, refusalText, requiredEmptyText } from "./templates";

type DialogueResult = { state: DialogueState; effects: Effect[] };

const READ_BACK_COMMANDS = new Set(["read back", "read it back", "read everything back"]);
const SUBMIT_COMMANDS = new Set(["submit", "submit it", "submit the form", "submit survey"]);
const REPEAT_COMMANDS = new Set(["repeat", "say that again", "repeat that"]);
const STOP_COMMANDS = new Set(["stop", "be quiet", "quiet", "stop talking"]);
const FORM_CHANGED_TEXT = "The form changed, so I'm not submitting. Say submit when you're ready.";
const WAIT_FOR_READBACK_TEXT = "Wait for the read-back to finish, or say cancel.";

function speak(state: DialogueState, text: string, category: "answer" | "confirm-prompt" | "error" | "readback"): DialogueResult {
  const spoken = speakEffect(state, text, category, { interruptible: true });
  return { state: spoken.state, effects: [spoken.effect] };
}

function selectGatedAction(form: FormModel): { action: FormModel["actions"][number] | null; error: string | null } {
  const gated = form.actions.filter((action) => isGatedKind(action.kind));
  if (gated.length === 0) return { action: null, error: "I can't find a submit button." };

  const primary = gated.filter((action) => action.primary);
  if (primary.length === 1) return { action: primary[0]!, error: null };
  if (primary.length === 0 && gated.length === 1) return { action: gated[0]!, error: null };
  return {
    action: null,
    error: `I found ${gated.length} buttons that could submit and can't tell which one.`,
  };
}

function requestSubmit(state: DialogueState, ctx: DialogueContext): DialogueResult {
  if (ctx.form === null) return speak({ ...state, mode: "ready", readBack: null }, "I can't see a page yet.", "error");

  const selected = selectGatedAction(ctx.form);
  if (selected.error !== null || selected.action === null) {
    return speak({ ...state, mode: "ready", readBack: null }, selected.error ?? "I can't find a submit button.", "error");
  }

  if (requiredEmpty(ctx.form).length > 0) {
    return speak({ ...state, mode: "ready", readBack: null }, requiredEmptyText(ctx.form), "error");
  }

  const readback = speakEffect(state, readBackText(ctx.form), "readback", { interruptible: true });
  return {
    state: {
      ...readback.state,
      mode: "reading-back",
      readBack: {
        speakId: readback.effect.speakId,
        actionId: selected.action.id,
        digest: formDigest(ctx.form),
      },
    },
    effects: [readback.effect],
  };
}

/** Handle read-back and submit requests in modes that are not guarded by the confirm gate. */
export function handleSubmitUtterance(
  state: DialogueState,
  norm: string,
  _raw: string,
  _event: Extract<DialogueEvent, { type: "utterance" }>,
  ctx: DialogueContext,
): DialogueResult | null {
  if (READ_BACK_COMMANDS.has(norm)) {
    if (ctx.form === null) return speak(state, "I can't see a page yet.", "error");
    return speak(state, readBackText(ctx.form), "readback");
  }
  if (SUBMIT_COMMANDS.has(norm)) return requestSubmit(state, ctx);
  return null;
}

function refuseArmed(state: DialogueState): DialogueResult {
  const phrase = state.confirm?.phrase;
  if (phrase === undefined) {
    const reset = speakEffect(state, "I can't submit that right now.", "error", { interruptible: true });
    return { state: reset.state, effects: [reset.effect, { kind: "earcon", name: "blocked" }] };
  }
  const refusal = speakEffect(state, refusalText(phrase), "confirm-prompt", { interruptible: true });
  return { state: refusal.state, effects: [refusal.effect, { kind: "earcon", name: "blocked" }] };
}

/** Only the gate phrase and narrowly permitted controls are handled while a grant is armed. */
export function handleArmedUtterance(
  state: DialogueState,
  event: Extract<DialogueEvent, { type: "utterance" }> | Extract<DialogueEvent, { type: "control" }>,
  ctx: DialogueContext,
): DialogueResult {
  if (event.type === "control") {
    const confirm = state.confirm;
    const reset: DialogueState = { ...state, mode: "ready", readBack: null, confirm: null };
    if (event.cmd === "stop") {
      const stopped = cancelEffect(reset);
      return {
        state: stopped.state,
        effects: [
          ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
          stopped.effect,
        ],
      };
    }
    const repeated = speakEffect(reset, state.lastSpoken ?? "There's nothing to repeat.", "answer", { interruptible: true });
    return {
      state: repeated.state,
      effects: [
        ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
        repeated.effect,
      ],
    };
  }

  const raw = event.utterance.text;
  const norm = normalizeCommand(raw);
  const confirm = state.confirm;

  if (confirm !== null && phraseMatches(raw, confirm.phrase)) {
    if (confirmWindowOpen(state.outstanding.length, state.lastDoneAt, ctx.now)) {
      return {
        state: { ...state, mode: "executing" },
        effects: [{
          kind: "redeem",
          grantId: confirm.grantId,
          speakId: confirm.speakId,
          phrase: raw,
          utteranceId: event.utterance.utteranceId,
        }],
      };
    }
    return refuseArmed(state);
  }

  if (isCancel(raw)) {
    const reset: DialogueState = { ...state, mode: "ready", readBack: null, confirm: null };
    const acknowledgement = speakEffect(reset, "Okay, not submitting.", "answer", { interruptible: true });
    return {
      state: acknowledgement.state,
      effects: [
        ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
        acknowledgement.effect,
      ],
    };
  }

  if (STOP_COMMANDS.has(norm)) {
    const reset = { ...state, mode: "ready" as const, readBack: null, confirm: null };
    const stopped = cancelEffect(reset);
    return {
      state: stopped.state,
      effects: [
        ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
        stopped.effect,
      ],
    };
  }

  if (REPEAT_COMMANDS.has(norm)) {
    const reset = { ...state, mode: "ready" as const, readBack: null, confirm: null };
    const repeated = speakEffect(reset, state.lastSpoken ?? "There's nothing to repeat.", "answer", { interruptible: true });
    return {
      state: repeated.state,
      effects: [
        ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
        repeated.effect,
      ],
    };
  }

  if (READ_BACK_COMMANDS.has(norm)) {
    const reset = { ...state, mode: "ready" as const, readBack: null, confirm: null };
    const repeatedReadBack = ctx.form === null
      ? speakEffect(reset, "I can't see a page yet.", "error", { interruptible: true })
      : speakEffect(reset, readBackText(ctx.form), "readback", { interruptible: true });
    return {
      state: repeatedReadBack.state,
      effects: [
        ...(confirm === null ? [] : [{ kind: "clearConfirm" as const, grantId: confirm.grantId, reason: "cancelled" as const }]),
        repeatedReadBack.effect,
      ],
    };
  }

  const preflight = resolveEdit(state, raw, ctx);
  if (preflight !== null && confirm !== null) {
    const clearedBase: DialogueState = { ...state, mode: "awaiting-value", readBack: null, confirm: null };
    const warning = speakEffect(clearedBase, FORM_CHANGED_TEXT, "error", { interruptible: true });
    // resolveEdit is pure; rerun it against the post-warning state so every speak id is unique and ordered.
    const edit = resolveEdit(warning.state, raw, ctx);
    const finalState = edit === null ? warning.state : { ...edit.state, mode: "awaiting-value" as const, confirm: null, readBack: null };
    return {
      state: finalState,
      effects: [
        { kind: "clearConfirm", grantId: confirm.grantId, reason: "value-changed" },
        warning.effect,
        ...(edit?.effects ?? []),
      ],
    };
  }

  return refuseArmed(state);
}

/** Reading-back speech cannot reach general grammar or the model. */
export function handleReadbackUtterance(
  state: DialogueState,
  event: Extract<DialogueEvent, { type: "utterance" }>,
  ctx: DialogueContext,
): DialogueResult {
  const norm = normalizeCommand(event.utterance.text);
  if (STOP_COMMANDS.has(norm)) {
    const stopped = cancelEffect({ ...state, mode: "ready", readBack: null });
    return { state: stopped.state, effects: [stopped.effect] };
  }
  if (isCancel(event.utterance.text)) {
    const reset = { ...state, mode: "ready" as const, readBack: null };
    const acknowledgement = speakEffect(reset, "Okay, not submitting.", "answer", { interruptible: true });
    return { state: acknowledgement.state, effects: [acknowledgement.effect] };
  }
  const waiting = speakEffect(state, WAIT_FOR_READBACK_TEXT, "answer", { interruptible: true });
  return { state: waiting.state, effects: [waiting.effect] };
}

function finishReadback(state: DialogueState, event: Extract<DialogueEvent, { type: "speak.done" }>, ctx: DialogueContext): DialogueResult {
  const readBack = state.readBack;
  const withoutDone: DialogueState = {
    ...state,
    outstanding: state.outstanding.filter((speakId) => speakId !== event.done.speakId),
    lastDoneAt: ctx.now,
  };

  if (state.mode !== "reading-back" || readBack === null || event.done.speakId !== readBack.speakId) {
    return { state: withoutDone, effects: [] };
  }

  if (event.done.interrupted) {
    return { state: { ...withoutDone, mode: "ready", readBack: null }, effects: [] };
  }

  const action = ctx.form?.actions.find((candidate) => candidate.id === readBack.actionId);
  if (ctx.form === null || formDigest(ctx.form) !== readBack.digest || action === undefined || !isGatedKind(action.kind)) {
    const reset = { ...withoutDone, mode: "ready" as const, readBack: null };
    return speak(reset, FORM_CHANGED_TEXT, "error");
  }

  return {
    state: withoutDone,
    effects: [{
      kind: "armConfirm",
      actionId: readBack.actionId,
      actionKind: action.kind,
      title: ctx.form.title,
      digest: readBack.digest,
      speakId: readBack.speakId,
    }],
  };
}

function handleConfirmArmed(state: DialogueState, event: Extract<DialogueEvent, { type: "confirm.armed" }>, ctx: DialogueContext): DialogueResult {
  const readBack = state.readBack;
  if (state.mode !== "reading-back" || readBack === null) {
    return { state, effects: [{ kind: "clearConfirm", grantId: event.grantId, reason: "cancelled" }] };
  }

  const action = ctx.form?.actions.find((candidate) => candidate.id === readBack.actionId);
  if (ctx.form === null || formDigest(ctx.form) !== readBack.digest || action === undefined || !isGatedKind(action.kind)) {
    const clear = { kind: "clearConfirm", grantId: event.grantId, reason: "value-changed" } as const;
    const reset = { ...state, mode: "ready" as const, readBack: null };
    const warning = speakEffect(reset, FORM_CHANGED_TEXT, "error", { interruptible: true });
    return { state: warning.state, effects: [clear, warning.effect] };
  }

  const armed: DialogueState = {
    ...state,
    mode: "awaiting-confirm",
    readBack: null,
    confirm: {
      grantId: event.grantId,
      speakId: event.speakId,
      phrase: event.phrase,
      actionId: readBack.actionId,
      digest: readBack.digest,
      expiresAt: event.expiresAt,
    },
  };
  const prompt = speakEffect(armed, confirmPromptText(event.phrase), "confirm-prompt", { interruptible: true });
  return {
    state: prompt.state,
    effects: [prompt.effect, { kind: "earcon", name: "blocked" }],
  };
}

function handleConfirmCleared(state: DialogueState, event: Extract<DialogueEvent, { type: "confirm.cleared" }>): DialogueResult {
  if (state.confirm?.grantId !== event.grantId) return { state, effects: [] };
  const reset = { ...state, mode: "ready" as const, readBack: null, confirm: null };
  if (event.reason === "expired") return speak(reset, "That timed out. Say submit to start again.", "error");
  if (event.reason === "page-changed" || event.reason === "value-changed") return speak(reset, FORM_CHANGED_TEXT, "error");
  return { state: reset, effects: [] };
}

function handleFormChanged(state: DialogueState, ctx: DialogueContext): DialogueResult {
  const expectedDigest = state.mode === "awaiting-confirm" ? state.confirm?.digest
    : state.mode === "reading-back" ? state.readBack?.digest
      : undefined;
  if (expectedDigest === undefined) return { state, effects: [] };
  const actualDigest = ctx.form === null ? null : formDigest(ctx.form);
  if (actualDigest === expectedDigest) return { state, effects: [] };

  const reset: DialogueState = { ...state, mode: "ready", readBack: null, confirm: null };
  const clear = state.mode === "awaiting-confirm" && state.confirm !== null
    ? [{ kind: "clearConfirm", grantId: state.confirm.grantId, reason: "value-changed" } as const]
    : [];
  const warning = speakEffect(reset, FORM_CHANGED_TEXT, "error", { interruptible: true });
  return { state: warning.state, effects: [...clear, warning.effect] };
}

function handleGatedResult(state: DialogueState, event: Extract<DialogueEvent, { type: "gated.result" }>): DialogueResult {
  const reset: DialogueState = { ...state, mode: "ready", readBack: null, confirm: null };
  if (event.silent) return { state: reset, effects: [] };
  if (event.ok) return speak(reset, "Submitted.", "answer");
  if (event.reason === "gate-not-connected") {
    const result = speakEffect(reset, "Blocked. The safety gate is not connected, so nothing was submitted.", "error", { interruptible: true });
    return { state: result.state, effects: [result.effect, { kind: "earcon", name: "error" }] };
  }
  return speak(reset, "That didn't go through. Nothing was submitted.", "error");
}

/** Handle submit-flow events before any other grammar can bypass speak bookkeeping. */
export function handleSubmitFlow(state: DialogueState, event: DialogueEvent, ctx: DialogueContext): DialogueResult {
  switch (event.type) {
    case "speak.done":
      return finishReadback(state, event, ctx);
    case "confirm.armed":
      return handleConfirmArmed(state, event, ctx);
    case "confirm.refused": {
      const reset: DialogueState = { ...state, mode: "ready", readBack: null, confirm: null };
      return speak(reset, "I can't submit that right now.", "error");
    }
    case "confirm.cleared":
      return handleConfirmCleared(state, event);
    case "gated.result":
      return handleGatedResult(state, event);
    case "form.changed":
      return handleFormChanged(state, ctx);
    default:
      return { state, effects: [] };
  }
}
