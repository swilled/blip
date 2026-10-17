import { describe, expect, it } from "vitest";
import { FormModel, isGatedKind } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import type { DialogueContext, DialogueState } from "./effects";
import type { DialogueEvent } from "./events";
import { formDigest } from "./fields";
import { confirmPromptText, readBackText, refusalText, requiredEmptyText } from "./templates";
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

function armed(form = filledSurvey) {
  const armRequest = armEffect(form);
  return reduce(armRequest.state, {
    type: "confirm.armed", grantId: "g1", phrase: "submit survey", expiresAt: 30_000,
  }, ctx(form, 1201));
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

  describe("armed-mode utterance gate", () => {
    const refusalPhrases = [
      "yes", "yeah", "yep", "ok", "okay", "sure", "do it", "go ahead", "confirm", "submit",
      "submit it", "yes submit survey", "submit the survey", "submit surveys", "submit survey now",
      "I confirm", "correct", "affirmative", "absolutely", "please do", "send it", "yup", "right",
      "sounds good", "go for it", "please submit survey", "submit survey please", "yes please",
    ];

    it.each(refusalPhrases)("refuses %j without model routing or redeem", (phrase) => {
      const start = armed();
      const result = reduce(start.state, say(phrase), ctx(filledSurvey, 2000));
      expect(result.effects).toContainEqual({
        kind: "speak", speakId: "b3", text: refusalText("submit survey"), category: "confirm-prompt", interruptible: true,
      });
      expect(result.effects).toContainEqual({ kind: "earcon", name: "blocked" });
      expect(result.effects.some((effect) => effect.kind === "redeem")).toBe(false);
      expect(result.effects.some((effect) => effect.kind === "parseIntent")).toBe(false);
      expect(result.state.mode).toBe("awaiting-confirm");
      expect(result.state.confirm).toEqual(start.state.confirm);
    });

    it("refuses the exact phrase while the prompt is outstanding", () => {
      const start = armed();
      const result = reduce(start.state, say("submit survey"), ctx(filledSurvey, 3000));
      expect(result.effects).toContainEqual({
        kind: "speak", speakId: "b3", text: refusalText("submit survey"), category: "confirm-prompt", interruptible: true,
      });
      expect(result.effects).toContainEqual({ kind: "earcon", name: "blocked" });
      expect(result.effects.some((effect) => effect.kind === "redeem")).toBe(false);
      expect(result.state.mode).toBe("awaiting-confirm");
    });

    it("refuses while any earlier refusal speak remains outstanding, then opens at 1000 ms", () => {
      const start = armed();
      const refused = reduce(start.state, say("yes"), ctx(filledSurvey, 2000));
      const promptDone = reduce(refused.state, done("b2"), ctx(filledSurvey, 2100));
      const duringRefusal = reduce(promptDone.state, say("submit survey"), ctx(filledSurvey, 3100));
      expect(duringRefusal.effects).toContainEqual({
        kind: "speak", speakId: "b4", text: refusalText("submit survey"), category: "confirm-prompt", interruptible: true,
      });
      expect(duringRefusal.effects.some((effect) => effect.kind === "redeem")).toBe(false);

      const refusalDone = reduce(duringRefusal.state, done("b3"), ctx(filledSurvey, 3200));
      const tooSoon = reduce(refusalDone.state, say("submit survey"), ctx(filledSurvey, 4199));
      expect(tooSoon.effects.some((effect) => effect.kind === "redeem")).toBe(false);
      const refusalDoneAgain = reduce(tooSoon.state, done("b4"), ctx(filledSurvey, 4200));
      const redeemed = reduce(refusalDoneAgain.state, say("submit survey"), ctx(filledSurvey, 5200));
      expect(redeemed.effects).toEqual([{ kind: "redeem", grantId: "g1" }]);
      expect(redeemed.state.mode).toBe("executing");
      expect(reduce(redeemed.state, say("submit survey"), ctx(filledSurvey, 7000)).effects).toEqual([]);
    });

    it("refuses an exact phrase at 999 ms and redeems at the 1000 ms boundary", () => {
      const start = armed();
      const promptDone = reduce(start.state, done("b2"), ctx(filledSurvey, 3000));
      const tooSoon = reduce(promptDone.state, say("submit survey"), ctx(filledSurvey, 3999));
      expect(tooSoon.effects).toContainEqual({
        kind: "speak", speakId: "b3", text: refusalText("submit survey"), category: "confirm-prompt", interruptible: true,
      });
      expect(tooSoon.effects.some((effect) => effect.kind === "redeem")).toBe(false);
      const refusalDone = reduce(tooSoon.state, done("b3"), ctx(filledSurvey, 4000));
      const redeemed = reduce(refusalDone.state, say("submit survey"), ctx(filledSurvey, 5000));
      expect(redeemed.effects).toEqual([{ kind: "redeem", grantId: "g1" }]);
      expect(redeemed.state.mode).toBe("executing");
    });

    it("cancels and returns to ready with a tracked acknowledgement", () => {
      const start = armed();
      const result = reduce(start.state, say("never mind"), ctx(filledSurvey, 2000));
      expect(result.effects).toEqual([
        { kind: "clearConfirm", grantId: "g1", reason: "cancelled" },
        { kind: "speak", speakId: "b3", text: "Okay, not submitting.", category: "answer", interruptible: true },
      ]);
      expect(result.state.mode).toBe("ready");
      expect(result.state.confirm).toBeNull();
      expect(result.state.outstanding).toContain("b3");
    });

    it("keeps the armed mode when stop cancels speech using a tracked Stopped speakId", () => {
      const start = armed();
      const result = reduce(start.state, { type: "control", cmd: "stop" }, ctx(filledSurvey, 2000));
      expect(result.effects).toEqual([{ kind: "cancelSpeech", speakId: "b3" }]);
      expect(result.state.mode).toBe("awaiting-confirm");
      expect(result.state.confirm).toEqual(start.state.confirm);
      // The runner renders this tracked cancelSpeech as “Stopped.” with the same id.
      expect(result.state.outstanding).toContain("b3");
    });

    it("repeats and reads back through tracked speaks while remaining armed", () => {
      const start = armed();
      const repeated = reduce(start.state, say("repeat"), ctx(filledSurvey, 2000));
      expect(repeated.effects).toEqual([{
        kind: "speak", speakId: "b3", text: start.state.lastSpoken, category: "answer", interruptible: true,
      }]);
      expect(repeated.state.mode).toBe("awaiting-confirm");
      expect(repeated.state.outstanding).toContain("b3");

      const reread = reduce(start.state, say("read back"), ctx(filledSurvey, 2000));
      expect(reread.effects).toEqual([{
        kind: "speak", speakId: "b3", text: readBackText(filledSurvey), category: "readback", interruptible: true,
      }]);
      expect(reread.state.mode).toBe("awaiting-confirm");
      expect(reread.state.outstanding).toContain("b3");
    });

    it("voids the grant before applying a named field edit", () => {
      const start = armed();
      const result = reduce(start.state, say("Your name is Ada Lovelace"), ctx(filledSurvey, 2000));
      expect(result.effects).toEqual([
        { kind: "clearConfirm", grantId: "g1", reason: "value-changed" },
        { kind: "speak", speakId: "b3", text: "The form changed, so I'm not submitting. Say submit when you're ready.", category: "error", interruptible: true },
        { kind: "fill", fieldId: "e1", value: "Ada Lovelace" },
      ]);
      expect(result.state.mode).toBe("awaiting-value");
      expect(result.state.confirm).toBeNull();
      expect(result.state.outstanding).toContain("b3");
    });

    it("refuses bare values and ignores utterances once executing", () => {
      const start = armed();
      const bareValue = reduce(start.state, say("Ada Lovelace"), ctx(filledSurvey, 2000));
      expect(bareValue.effects).toContainEqual({
        kind: "speak", speakId: "b3", text: refusalText("submit survey"), category: "confirm-prompt", interruptible: true,
      });
      expect(bareValue.effects.some((effect) => effect.kind === "parseIntent" || effect.kind === "redeem")).toBe(false);

      const executing = {
        ...start.state,
        mode: "executing" as const,
      };
      const ignored = reduce(executing, say("submit survey"), ctx(filledSurvey, 8000));
      expect(ignored.effects).toEqual([]);
      expect(ignored.state).toEqual(executing);
    });
  });
});
