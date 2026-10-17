import { describe, expect, it } from "vitest";
import { FormModel, isGatedKind } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import type { DialogueContext, DialogueState } from "./effects";
import type { DialogueEvent } from "./events";
import { formDigest } from "./fields";
import { confirmPromptText, readBackText, requiredEmptyText } from "./templates";
import { initialState, speakEffect } from "./state";
import { reduce } from "./reduce";

const survey = FormModel.parse(surveyJson);
const filledSurvey = FormModel.parse({
  ...survey,
  fields: survey.fields.map((field) => field.required
    ? { ...field, hasValue: true, value: field.type === "select" ? field.options?.[1]?.value ?? "friend" : "fictional value" }
    : field),
});

function ctx(form: DialogueContext["form"] = survey, now = 0): DialogueContext {
  return { form, now };
}

function say(text: string): DialogueEvent {
  return { type: "utterance", utterance: { utteranceId: "u1", text, source: "typed" } };
}

function done(speakId: string, interrupted = false): DialogueEvent {
  return { type: "speak.done", done: { speakId, interrupted } };
}

function submitted(form: DialogueContext["form"] = filledSurvey) {
  return reduce(initialState(), say("submit survey"), ctx(form));
}

function armEffect(form = filledSurvey) {
  const submit = submitted(form);
  const id = submit.state.readBack?.speakId;
  if (!id) throw new Error("submit did not create a read-back speak");
  return reduce(submit.state, done(id), ctx(form, 1200));
}

describe("submit and read-back flow", () => {
  it.each(["read back", "read it back", "read everything back"])("speaks the full read-back for %s", (command) => {
    const result = reduce(initialState(), say(command), ctx(filledSurvey));
    expect(result.effects).toEqual([{
      kind: "speak",
      speakId: "b1",
      text: readBackText(filledSurvey),
      category: "readback",
      interruptible: true,
    }]);
    expect(result.state.mode).toBe("ready");
    expect(result.state.lastSpoken).toBe(readBackText(filledSurvey));
    expect(result.state.outstanding).toEqual(["b1"]);
  });

  it("answers when there is no page, gated action, or unambiguous primary action", () => {
    expect(reduce(initialState(), say("submit"), ctx(null)).effects).toEqual([{
      kind: "speak", speakId: "b1", text: "I can't see a page yet.", category: "error", interruptible: true,
    }]);

    const noActions = FormModel.parse({ ...filledSurvey, actions: [] });
    expect(reduce(initialState(), say("submit"), ctx(noActions)).effects).toEqual([{
      kind: "speak", speakId: "b1", text: "I can't find a submit button.", category: "error", interruptible: true,
    }]);

    const gated = filledSurvey.actions.filter((action) => isGatedKind(action.kind));
    const ambiguous = FormModel.parse({
      ...filledSurvey,
      actions: gated.slice(0, 2).map((action) => ({ ...action, primary: false })),
    });
    const result = reduce(initialState(), say("submit"), ctx(ambiguous));
    expect(result.effects).toEqual([{
      kind: "speak", speakId: "b1", text: `I found ${gated.slice(0, 2).length} buttons that could submit and can't tell which one.`, category: "error", interruptible: true,
    }]);
    expect(result.effects.some((effect) => effect.kind === "armConfirm")).toBe(false);
  });

  it("explains required fields and never arms when submit is requested too early", () => {
    const result = reduce(initialState(), say("submit the form"), ctx(survey));
    expect(result.effects).toEqual([{
      kind: "speak", speakId: "b1", text: requiredEmptyText(survey), category: "error", interruptible: true,
    }]);
    expect(result.state.mode).toBe("ready");
    expect(result.effects.some((effect) => effect.kind === "armConfirm")).toBe(false);
    expect(result.effects.some((effect) => effect.kind === "redeem")).toBe(false);
  });

  it("submit waits for the uninterrupted read-back before arming", () => {
    const request = submitted();
    expect(request.effects).toEqual([{
      kind: "speak",
      speakId: "b1",
      text: readBackText(filledSurvey),
      category: "readback",
      interruptible: true,
    }]);
    expect(request.state.mode).toBe("reading-back");
    expect(request.state.readBack).toEqual({
      speakId: "b1",
      actionId: filledSurvey.actions.find((action) => action.primary && isGatedKind(action.kind))?.id,
      digest: formDigest(filledSurvey),
    });
    expect(request.state.outstanding).toEqual(["b1"]);

    const completed = reduce(request.state, done("b1"), ctx(filledSurvey, 1200));
    expect(completed.effects).toEqual([{
      kind: "armConfirm",
      actionId: "e7",
      actionKind: "submit",
      title: filledSurvey.title,
      digest: formDigest(filledSurvey),
    }]);
    expect(completed.state.outstanding).toEqual([]);
    expect(completed.state.lastDoneAt).toBe(1200);
    expect(completed.effects.some((effect) => effect.kind === "redeem")).toBe(false);
  });

  it("does not arm from an earlier or unknown speak.done", () => {
    const before = speakEffect(initialState(), "One moment.", "filler").state;
    const request = reduce(before, say("submit"), ctx(filledSurvey));
    const readBackId = request.state.readBack?.speakId;
    expect(readBackId).toBe("b2");
    expect(reduce(request.state, done("b1"), ctx(filledSurvey, 300)).effects).toEqual([]);
    expect(reduce(request.state, done("unknown"), ctx(filledSurvey, 400)).effects).toEqual([]);
    expect(request.state.outstanding).toEqual(["b1", readBackId]);
  });

  it("does not arm after an interrupted read-back", () => {
    const request = submitted();
    const result = reduce(request.state, done("b1", true), ctx(filledSurvey, 1200));
    expect(result.effects).toEqual([]);
    expect(result.state.mode).toBe("ready");
    expect(result.state.readBack).toBeNull();
    expect(result.state.outstanding).toEqual([]);
  });

  it("abandons a read-back if the form digest changed before speech completed", () => {
    const request = submitted();
    const changed = FormModel.parse({
      ...filledSurvey,
      fields: filledSurvey.fields.map((field) => field.id === "e2" ? { ...field, value: "other@example.test" } : field),
    });
    const result = reduce(request.state, done("b1"), ctx(changed, 1200));
    expect(result.effects).toEqual([{
      kind: "speak",
      speakId: "b2",
      text: "The form changed, so I'm not submitting. Say submit when you're ready.",
      category: "error",
      interruptible: true,
    }]);
    expect(result.state.mode).toBe("ready");
    expect(result.state.readBack).toBeNull();
    expect(result.state.outstanding).toEqual(["b2"]);
  });

  it("arms only the primary gated action when there are multiple gated actions", () => {
    const form = FormModel.parse({
      ...filledSurvey,
      actions: filledSurvey.actions.map((action, index) => ({ ...action, primary: index === 0 })),
    });
    const result = armEffect(form);
    expect(result.effects).toEqual([{
      kind: "armConfirm",
      actionId: form.actions[0]!.id,
      actionKind: form.actions[0]!.kind,
      title: form.title,
      digest: formDigest(form),
    }]);
  });

  it("uses the only gated action when none is marked primary", () => {
    const form = FormModel.parse({
      ...filledSurvey,
      actions: [
        { ...filledSurvey.actions[0]!, primary: false },
        ...filledSurvey.actions.filter((action) => !isGatedKind(action.kind)),
      ],
    });
    const result = armEffect(form);
    expect(result.effects).toEqual([{
      kind: "armConfirm",
      actionId: form.actions[0]!.id,
      actionKind: form.actions[0]!.kind,
      title: form.title,
      digest: formDigest(form),
    }]);
  });

  it("accepts confirm.armed only after a read-back arm request", () => {
    const request = submitted();
    const doneReadBack = reduce(request.state, done("b1"), ctx(filledSurvey, 1000));
    const armed = reduce(doneReadBack.state, {
      type: "confirm.armed", grantId: "g1", phrase: "submit survey", expiresAt: 30_000,
    }, ctx(filledSurvey, 1100));
    expect(armed.state.mode).toBe("awaiting-confirm");
    expect(armed.state.confirm).toEqual({
      grantId: "g1", phrase: "submit survey", actionId: "e7", digest: formDigest(filledSurvey), expiresAt: 30_000,
    });
    expect(armed.effects).toEqual([
      { kind: "speak", speakId: "b2", text: confirmPromptText("submit survey"), category: "confirm-prompt", interruptible: true },
      { kind: "earcon", name: "blocked" },
    ]);
    expect(armed.state.outstanding).toEqual(["b2"]);
  });

  it("clears a confirm grant returned outside reading-back", () => {
    const state = initialState();
    const result = reduce(state, {
      type: "confirm.armed", grantId: "g1", phrase: "submit survey", expiresAt: 30_000,
    }, ctx(filledSurvey));
    expect(result).toEqual({
      state,
      effects: [{ kind: "clearConfirm", grantId: "g1", reason: "cancelled" }],
    });
  });

  it("resets on confirm.refused and ignores a cleared event for another grant", () => {
    const armed = {
      ...initialState(),
      mode: "awaiting-confirm" as const,
      confirm: { grantId: "g1", phrase: "submit survey", actionId: "e7", digest: formDigest(filledSurvey), expiresAt: 30_000 },
    };
    const refused = reduce(armed, { type: "confirm.refused", reason: "expired" }, ctx(filledSurvey));
    expect(refused.state.mode).toBe("ready");
    expect(refused.state.confirm).toBeNull();
    expect(refused.effects).toEqual([{
      kind: "speak", speakId: "b1", text: "I can't submit that right now.", category: "error", interruptible: true,
    }]);

    const stale = reduce(armed, { type: "confirm.cleared", grantId: "other", reason: "cancelled" }, ctx(filledSurvey));
    expect(stale).toEqual({ state: armed, effects: [] });
  });

  it.each([
    ["expired", "That timed out. Say submit to start again."],
    ["page-changed", "The form changed, so I'm not submitting. Say submit when you're ready."],
    ["value-changed", "The form changed, so I'm not submitting. Say submit when you're ready."],
    ["executed", null],
    ["cancelled", null],
  ] as const)("handles a matching cleared grant (%s)", (reason, text) => {
    const state: DialogueState = {
      ...initialState(),
      mode: "awaiting-confirm",
      confirm: { grantId: "g1", phrase: "submit survey", actionId: "e7", digest: formDigest(filledSurvey), expiresAt: 30_000 },
    };
    const result = reduce(state, { type: "confirm.cleared", grantId: "g1", reason }, ctx(filledSurvey));
    expect(result.state.mode).toBe("ready");
    expect(result.state.confirm).toBeNull();
    expect(result.effects).toEqual(text === null ? [] : [{
      kind: "speak",
      speakId: "b1",
      text,
      category: reason === "expired" ? "error" : "error",
      interruptible: true,
    }]);
  });

  it("clears an awaiting grant if the live form digest changes", () => {
    const state: DialogueState = {
      ...initialState(),
      mode: "awaiting-confirm",
      confirm: { grantId: "g1", phrase: "submit survey", actionId: "e7", digest: formDigest(filledSurvey), expiresAt: 30_000 },
    };
    const changed = FormModel.parse({
      ...filledSurvey,
      fields: filledSurvey.fields.map((field) => field.id === "e2" ? { ...field, value: "changed@example.test" } : field),
    });
    const result = reduce(state, { type: "form.changed" }, ctx(changed, 2000));
    expect(result.effects).toEqual([
      { kind: "clearConfirm", grantId: "g1", reason: "value-changed" },
      { kind: "speak", speakId: "b1", text: "The form changed, so I'm not submitting. Say submit when you're ready.", category: "error", interruptible: true },
    ]);
    expect(result.state.mode).toBe("ready");
    expect(result.state.confirm).toBeNull();
  });

  it("resolves gated outcomes fail-closed", () => {
    const disconnected = reduce(initialState(), { type: "gated.result", ok: false, reason: "gate-not-connected" }, ctx(filledSurvey));
    expect(disconnected.effects).toEqual([
      { kind: "speak", speakId: "b1", text: "Blocked. The safety gate is not connected, so nothing was submitted.", category: "error", interruptible: true },
      { kind: "earcon", name: "error" },
    ]);
    const failed = reduce(initialState(), { type: "gated.result", ok: false, reason: "target-changed" }, ctx(filledSurvey));
    expect(failed.effects).toEqual([{
      kind: "speak", speakId: "b1", text: "That didn't go through. Nothing was submitted.", category: "error", interruptible: true,
    }]);
    const success = reduce(initialState(), { type: "gated.result", ok: true }, ctx(filledSurvey));
    expect(success.effects).toEqual([{
      kind: "speak", speakId: "b1", text: "Submitted.", category: "answer", interruptible: true,
    }]);
  });
});
