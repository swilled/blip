import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { reduce } from "./reduce";
import type { DialogueEvent } from "./events";
import type { DialogueState } from "./effects";
import { dialogueStateName, initialState, speakEffect } from "./state";

const form = FormModel.parse(fixtureJson);
const start: DialogueState = initialState();
const context = (form: FormModel | null) => ({ form, now: 0 });

function say(text: string): DialogueEvent {
  return { type: "utterance", utterance: { utteranceId: "u1", text, source: "typed" } };
}

function withCounts(fields: number, required: number, actions: number, title = "T"): FormModel {
  const f = form.fields[0]!;
  const a = form.actions[0]!;
  return {
    ...form,
    title,
    fields: Array.from({ length: fields }, (_, i) => ({ ...f, id: `f${i}`, required: i < required })),
    actions: Array.from({ length: actions }, () => a),
  };
}

describe("reduce: what's here", () => {
  it("initializes every dialogue state field", () => {
    expect(initialState()).toEqual({
      lastSpoken: null,
      mode: "ready",
      seq: 1,
      readCursor: null,
      currentFieldId: null,
      pendingOptions: null,
      pendingFill: null,
      outstanding: [],
      lastDoneAt: null,
      readBack: null,
      confirm: null,
      previousValues: {},
    });
  });

  it("1: answers with the pinned counts-first string", () => {
    const { effects } = reduce(start, say("what's here"), context(form));
    expect(effects).toEqual([
      { kind: "speak", speakId: "b1", text: "Customer survey. 5 fields, 2 required, 2 actions.", category: "answer", interruptible: true },
    ]);
    expect(start.outstanding).toEqual([]);
    const req = form.fields.filter((f) => f.required).length;
    expect((effects[0] as { text: string }).text).toBe(
      `${form.title}. ${form.fields.length} fields, ${req} required, ${form.actions.length} actions.`,
    );
  });

  it("2: matches variants", () => {
    for (const t of ["whats here", "What is here?", "what's on this page", "WHAT'S HERE!"]) {
      const { effects } = reduce(start, say(t), context(form));
      expect(effects[0]?.kind, t).toBe("speak");
    }
  });

  it("3: singular wording", () => {
    const { effects } = reduce(start, say("what's here"), context(withCounts(1, 1, 1)));
    expect((effects[0] as { text: string }).text).toBe("T. 1 field, 1 required, 1 action.");
  });

  it("4: zero required and zero fields", () => {
    expect((reduce(start, say("what's here"), context(withCounts(3, 0, 2))).effects[0] as { text: string }).text).toBe(
      "T. 3 fields, 0 required, 2 actions.",
    );
    expect((reduce(start, say("what's here"), context(withCounts(0, 0, 2))).effects[0] as { text: string }).text).toBe(
      "T. No fields, 2 actions.",
    );
  });

  it("5: no form", () => {
    const { effects } = reduce(start, say("what's here"), context(null));
    expect(effects).toEqual([{ kind: "speak", speakId: "b1", text: "I can't see a page yet.", category: "answer", interruptible: true }]);
  });

  it("6: unmatched text goes to parseIntent", () => {
    const { effects } = reduce(start, say("Fill in my name"), context(form));
    expect(effects).toEqual([{ kind: "parseIntent", text: "Fill in my name" }]);
  });

  it("7: empty text yields nothing", () => {
    for (const t of ["", "   "]) {
      const r = reduce(start, say(t), context(form));
      expect(r.effects).toEqual([]);
      expect(r.state).toBe(start);
    }
  });

  it("8: title is capped at 80 and control chars removed", () => {
    const long = "A".repeat(100);
    const t1 = (reduce(start, say("what's here"), context(withCounts(1, 1, 1, long))).effects[0] as { text: string }).text;
    expect(t1.startsWith("A".repeat(80) + ". 1 field")).toBe(true);
    const t2 = (reduce(start, say("what's here"), context(withCounts(1, 1, 1, "Hi\u0000\u0007 there\n"))).effects[0] as { text: string }).text;
    expect(t2.startsWith("Hi there. 1 field")).toBe(true);
  });

  it("9: records lastSpoken", () => {
    const r = reduce(start, say("what's here"), context(form));
    expect(r.state.lastSpoken).toBe("Customer survey. 5 fields, 2 required, 2 actions.");
  });

  it("tracks each utterance speak with an incrementing id", () => {
    const first = reduce(start, say("what's here"), context(form));
    expect((first.effects[0] as { speakId?: string }).speakId).toBe("b1");
    expect(first.state.outstanding).toEqual(["b1"]);

    const second = reduce(first.state, say("what's here"), context(form));
    expect((second.effects[0] as { speakId?: string }).speakId).not.toBe(
      (first.effects[0] as { speakId?: string }).speakId,
    );
  });

  it("speakEffect appends unique ids to outstanding", () => {
    const first = speakEffect(initialState(), "first", "answer");
    const second = speakEffect(first.state, "second", "answer");
    expect(first.effect.speakId).toBe("b1");
    expect(first.state.outstanding).toEqual(["b1"]);
    expect(second.effect.speakId).not.toBe(first.effect.speakId);
    expect(second.state.outstanding).toEqual(["b1", "b2"]);
  });

  it("maps internal modes to the protocol dialogue state names", () => {
    expect(["ready", "reading", "awaiting-value", "reading-back", "awaiting-confirm", "executing"].map((mode) =>
      dialogueStateName(mode as DialogueState["mode"]),
    )).toEqual(["ready", "describing", "awaiting-value", "reading-back", "awaiting-confirm", "executing"]);
  });

  it("tracks stop, repeat, and intent replies through speak effects", () => {
    const stopped = reduce(start, { type: "control", cmd: "stop" }, context(form));
    expect(stopped.effects).toEqual([{ kind: "cancelSpeech", speakId: "b1" }]);
    expect(stopped.state.mode).toBe("ready");
    expect(stopped.state.outstanding).toEqual(["b1"]);

    const repeated = reduce({ ...initialState(), lastSpoken: "previous answer" }, { type: "control", cmd: "repeat" }, context(form));
    expect(repeated.effects).toEqual([
      { kind: "speak", speakId: "b1", text: "previous answer", category: "answer", interruptible: true },
    ]);
    expect(repeated.state.lastSpoken).toBe("previous answer");

    const replied = reduce(initialState(), { type: "intent.reply", text: "Model reply" }, context(form));
    expect(replied.effects).toEqual([
      { kind: "speak", speakId: "b1", text: "Model reply", category: "answer", interruptible: true },
    ]);
  });

  it("10: never speaks a label or value", () => {
    const text = (reduce(start, say("what's here"), context(form)).effects[0] as { text: string }).text;
    for (const f of form.fields) {
      if (f.label) expect(text).not.toContain(f.label);
      if (typeof f.value === "string" && f.value) expect(text).not.toContain(f.value);
    }
  });

  it("11: speak.done and form.changed are no-ops", () => {
    const s: DialogueState = { ...initialState(), lastSpoken: "x" };
    for (const e of [
      { type: "speak.done", done: { speakId: "s1", interrupted: false } },
      { type: "form.changed" },
    ] as DialogueEvent[]) {
      const r = reduce(s, e, context(form));
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("12: fixture is the real FormModel shape", () => {
    expect(FormModel.safeParse(fixtureJson).success).toBe(true);
  });
});
