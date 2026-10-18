import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";
import { phraseMatches } from "./confirm";
import { formDigest } from "./fields";
import { initialState } from "./state";
import { reduce } from "./reduce";

const survey = FormModel.parse(surveyJson);
const filledSurvey = FormModel.parse({
  ...survey,
  fields: survey.fields.map((field) => field.required
    ? { ...field, hasValue: true, value: field.type === "select" ? field.options?.[1]?.value ?? "friend" : "fictional value" }
    : field),
});
const changedSurvey = FormModel.parse({
  ...filledSurvey,
  fields: filledSurvey.fields.map((field) => field.id === "e1" ? { ...field, hasValue: true, value: "changed name" } : field),
});

const PHRASE = "submit survey";
const UTTERANCE_POOL = [
  "yes", "yeah", "yep", "ok", "okay", "sure", "do it", "go ahead", "confirm", "submit", "submit it",
  "yes submit survey", "submit the survey", "submit surveys", "submit survey now", "Submit Survey.",
  "please submit survey", "submit survey please", "cancel", "read back", "Email is a at b dot com", "two",
  "number two", "option 2", "continue", "stop", "repeat", "Your name is Ada", "submit survey!",
];

function context(form: DialogueContext["form"], now: number): DialogueContext {
  return { form, now };
}

function utterance(text: string, utteranceId = "u-test", source: "voice" | "typed" = "typed", alternatives?: string[]): DialogueEvent {
  return {
    type: "utterance",
    utterance: { utteranceId, text, source, ...(alternatives === undefined ? {} : { alternatives }) },
  };
}

function speakDone(speakId: string, interrupted = false): DialogueEvent {
  return { type: "speak.done", done: { speakId, interrupted } };
}

/** Reach armed mode only through submit -> correlated read-back done -> confirm.armed. */
function armedState(): DialogueState {
  const submitted = reduce(initialState(), utterance(PHRASE), context(filledSurvey, 1000));
  const readBackId = submitted.state.readBack?.speakId;
  if (readBackId === undefined) throw new Error("submit did not produce a read-back speak id");
  const readBackDone = reduce(submitted.state, speakDone(readBackId), context(filledSurvey, 10_000));
  const armed = reduce(readBackDone.state, {
    type: "confirm.armed", grantId: "grant-1", speakId: readBackId, phrase: PHRASE, expiresAt: 40_000,
  }, context(filledSurvey, 10_100));
  if (armed.state.mode !== "awaiting-confirm" || armed.state.confirm === null) {
    throw new Error("the real submit/read-back/confirm sequence did not arm");
  }
  return armed.state;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomStep(random: () => number, state: DialogueState, seed: number, step: number): DialogueEvent {
  const choice = Math.floor(random() * 5);
  if (choice === 0) {
    const text = UTTERANCE_POOL[Math.floor(random() * UTTERANCE_POOL.length)]!;
    const source = random() < 0.5 ? "voice" : "typed";
    const alternatives = random() < 0.2 ? [PHRASE] : undefined;
    return utterance(text, `u-${seed}-${step}`, source, alternatives);
  }
  if (choice === 1) {
    const speakId = state.outstanding.length > 0 && random() < 0.8
      ? state.outstanding[Math.floor(random() * state.outstanding.length)]!
      : `unknown-${seed}-${step}`;
    return speakDone(speakId, random() < 0.15);
  }
  if (choice === 2) return { type: "form.changed" };
  if (choice === 3) {
    const reasons = ["expired", "page-changed", "value-changed", "executed", "cancelled"] as const;
    const reason = reasons[Math.floor(random() * reasons.length)]!;
    return { type: "confirm.cleared", grantId: random() < 0.7 ? state.confirm?.grantId ?? "grant-1" : "stale-grant", reason };
  }
  return { type: "control", cmd: "stop" };
}

function onlyEffect(effects: Effect[], kind: Effect["kind"]): boolean {
  return effects.filter((effect) => effect.kind === kind).length > 0;
}

describe("confirm gate reducer invariant", () => {
  it("refuses the exact phrase while any prompt speak is outstanding", () => {
    const state = armedState();
    const result = reduce(state, utterance(PHRASE), context(filledSurvey, 30_000));
    expect(result.effects.some((effect) => effect.kind === "redeem")).toBe(false);
    expect(result.state.mode).toBe("awaiting-confirm");
  });

  it("refuses at 999 ms and redeems at 1000 ms after the latest speak.done", () => {
    const state = armedState();
    const promptId = state.outstanding[0]!;
    const promptDone = reduce(state, speakDone(promptId), context(filledSurvey, 20_000));
    const tooSoon = reduce(promptDone.state, utterance(PHRASE), context(filledSurvey, 20_999));
    expect(tooSoon.effects.some((effect) => effect.kind === "redeem")).toBe(false);

    const refusalId = tooSoon.effects.find((effect) => effect.kind === "speak")?.speakId;
    if (refusalId === undefined) throw new Error("the 999 ms refusal did not speak");
    const refusalDone = reduce(tooSoon.state, speakDone(refusalId), context(filledSurvey, 21_000));
    const atBoundary = reduce(refusalDone.state, utterance(PHRASE), context(filledSurvey, 22_000));
    expect(atBoundary.effects).toEqual([{
      kind: "redeem", grantId: "grant-1", speakId: "b1", phrase: PHRASE, utteranceId: "u-test",
    }]);
    expect(atBoundary.state.mode).toBe("executing");
  });

  it("never arms or redeems a phrase after an interrupted read-back", () => {
    const request = reduce(initialState(), utterance(PHRASE), context(filledSurvey, 1000));
    const readBackId = request.state.readBack!.speakId;
    const interrupted = reduce(request.state, speakDone(readBackId, true), context(filledSurvey, 2000));
    expect(interrupted.state.mode).toBe("ready");
    expect(interrupted.effects.some((effect) => effect.kind === "armConfirm")).toBe(false);

    const phrase = reduce(interrupted.state, utterance(PHRASE), context(filledSurvey, 10_000));
    expect(phrase.effects.some((effect) => effect.kind === "redeem")).toBe(false);
    expect(phrase.state.mode).toBe("reading-back");
  });

  it("preserves the gate invariants across 500 seeded 60-step walks", () => {
    expect(UTTERANCE_POOL.length).toBeGreaterThanOrEqual(24);

    for (let seed = 1; seed <= 500; seed += 1) {
      const random = lcg(seed);
      let state = armedState();
      let now = 10_100;
      const redeemedGrants = new Set<string>();

      for (let step = 0; step < 60; step += 1) {
        now += Math.floor(random() * 1501);
        const event = randomStep(random, state, seed, step);
        const before = state;
        const liveForm = random() < 0.15 ? changedSurvey : filledSurvey;
        const result = reduce(before, event, context(liveForm, now));
        const redeem = result.effects.find((effect) => effect.kind === "redeem");
        const diagnostic = `seed=${seed} step=${step} event=${JSON.stringify(event)} mode=${before.mode}`;

        if (redeem !== undefined) {
          const text = event.type === "utterance" ? event.utterance.text : "";
          const source = event.type === "utterance" ? event.utterance.source : "";
          const conditionsHold = before.mode === "awaiting-confirm"
            && before.confirm !== null
            && event.type === "utterance"
            && phraseMatches(text, before.confirm.phrase)
            && (source === "voice" || source === "typed")
            && before.outstanding.length === 0
            && before.lastDoneAt !== null
            && now - before.lastDoneAt >= 1000;
          expect(conditionsHold, `redeem violated its pre-step gate: ${diagnostic}`).toBe(true);
          expect(redeemedGrants.has(redeem.grantId), `grant redeemed more than once: ${diagnostic}`).toBe(false);
          redeemedGrants.add(redeem.grantId);
        }

        if (before.mode === "reading-back" || before.mode === "awaiting-confirm" || before.mode === "executing") {
          expect(onlyEffect(result.effects, "parseIntent"), `guarded mode emitted parseIntent: ${diagnostic}`).toBe(false);
        }

        for (const effect of result.effects) {
          if (effect.kind !== "speak" && effect.kind !== "cancelSpeech") continue;
          expect(effect.speakId.trim().length > 0, `empty speakId: ${diagnostic}`).toBe(true);
          expect(result.state.outstanding, `untracked ${effect.kind} speakId=${effect.speakId}: ${diagnostic}`).toContain(effect.speakId);
        }

        state = result.state;
      }
    }
  });
});
