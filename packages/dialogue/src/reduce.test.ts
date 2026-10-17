import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { reduce } from "./reduce";
import type { DialogueEvent } from "./events";
import type { DialogueState } from "./effects";

const form = FormModel.parse(fixtureJson);
const start: DialogueState = { lastSpoken: null };

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
  it("1: answers with the pinned counts-first string", () => {
    const { effects } = reduce(start, say("what's here"), { form });
    expect(effects).toEqual([
      { kind: "speak", text: "Customer survey. 5 fields, 2 required, 2 actions.", category: "answer", interruptible: true },
    ]);
    const req = form.fields.filter((f) => f.required).length;
    expect((effects[0] as { text: string }).text).toBe(
      `${form.title}. ${form.fields.length} fields, ${req} required, ${form.actions.length} actions.`,
    );
  });

  it("2: matches variants", () => {
    for (const t of ["whats here", "What is here?", "what's on this page", "WHAT'S HERE!"]) {
      const { effects } = reduce(start, say(t), { form });
      expect(effects[0]?.kind, t).toBe("speak");
    }
  });

  it("3: singular wording", () => {
    const { effects } = reduce(start, say("what's here"), { form: withCounts(1, 1, 1) });
    expect((effects[0] as { text: string }).text).toBe("T. 1 field, 1 required, 1 action.");
  });

  it("4: zero required and zero fields", () => {
    expect((reduce(start, say("what's here"), { form: withCounts(3, 0, 2) }).effects[0] as { text: string }).text).toBe(
      "T. 3 fields, 0 required, 2 actions.",
    );
    expect((reduce(start, say("what's here"), { form: withCounts(0, 0, 2) }).effects[0] as { text: string }).text).toBe(
      "T. No fields, 2 actions.",
    );
  });

  it("5: no form", () => {
    const { effects } = reduce(start, say("what's here"), { form: null });
    expect(effects).toEqual([{ kind: "speak", text: "I can't see a page yet.", category: "answer", interruptible: true }]);
  });

  it("6: unmatched text goes to parseIntent", () => {
    const { effects } = reduce(start, say("Fill in my name"), { form });
    expect(effects).toEqual([{ kind: "parseIntent", text: "Fill in my name" }]);
  });

  it("7: empty text yields nothing", () => {
    for (const t of ["", "   "]) {
      const r = reduce(start, say(t), { form });
      expect(r.effects).toEqual([]);
      expect(r.state).toBe(start);
    }
  });

  it("8: title is capped at 80 and control chars removed", () => {
    const long = "A".repeat(100);
    const t1 = (reduce(start, say("what's here"), { form: withCounts(1, 1, 1, long) }).effects[0] as { text: string }).text;
    expect(t1.startsWith("A".repeat(80) + ". 1 field")).toBe(true);
    const t2 = (reduce(start, say("what's here"), { form: withCounts(1, 1, 1, "Hi\u0000\u0007 there\n") }).effects[0] as { text: string }).text;
    expect(t2.startsWith("Hi there. 1 field")).toBe(true);
  });

  it("9: records lastSpoken", () => {
    const r = reduce(start, say("what's here"), { form });
    expect(r.state.lastSpoken).toBe("Customer survey. 5 fields, 2 required, 2 actions.");
  });

  it("10: never speaks a label or value", () => {
    const text = (reduce(start, say("what's here"), { form }).effects[0] as { text: string }).text;
    for (const f of form.fields) {
      if (f.label) expect(text).not.toContain(f.label);
      if (typeof f.value === "string" && f.value) expect(text).not.toContain(f.value);
    }
  });

  it("11: speak.done and form.changed are no-ops", () => {
    const s: DialogueState = { lastSpoken: "x" };
    for (const e of [
      { type: "speak.done", done: { speakId: "s1", interrupted: false } },
      { type: "form.changed" },
    ] as DialogueEvent[]) {
      const r = reduce(s, e, { form });
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("12: fixture is the real FormModel shape", () => {
    expect(FormModel.safeParse(fixtureJson).success).toBe(true);
  });
});
