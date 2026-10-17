import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import type { DialogueEvent } from "./events";
import { initialState } from "./state";
import { reduce } from "./reduce";

const survey = FormModel.parse(surveyJson);
const ctx = (form: FormModel | null) => ({ form, now: 0 });

function say(text: string, sttConfidence?: number): DialogueEvent {
  return {
    type: "utterance",
    utterance: { utteranceId: "u1", text, source: "voice", ...(sttConfidence === undefined ? {} : { sttConfidence }) },
  };
}

function speak(text: string, speakId = "b1", category: "answer" | "error" = "answer") {
  return { kind: "speak", speakId, text, category, interruptible: true };
}

function withConfidence(form: FormModel, fieldId: string, confidence: number): FormModel {
  return FormModel.parse({
    ...form,
    fields: form.fields.map((field) => field.id === fieldId ? { ...field, confidence } : field),
  });
}

function withPassword(form: FormModel): FormModel {
  return FormModel.parse({
    ...form,
    fields: [...form.fields, {
      id: "password",
      role: "textbox",
      type: "password",
      label: "Password",
      labelSource: "label",
      confidence: 0.95,
      required: false,
      value: null,
      hasValue: true,
      sensitive: "password",
      error: null,
      disabled: false,
      order: 7,
    }],
  });
}

describe("dialogue field fills and page-sourced echoes", () => {
  it("normalizes a named email edit and waits for the page result", () => {
    const result = reduce(initialState(), say("email is jane at example dot com"), ctx(survey));
    expect(result.effects[0]?.kind).toBe("fill");
    expect(result.effects).toEqual([{ kind: "fill", fieldId: "e2", value: "jane@example.com" }]);
    expect(result.state.currentFieldId).toBe("e2");
    expect(result.state.pendingFill).toEqual({ fieldId: "e2", replaced: false, undoPreviousValue: null });
    expect(result.state.mode).toBe("awaiting-value");
  });

  it.each([
    ["set age to twenty five", "25"],
    ["age 25", "25"],
    ["field 3 is 555 0100", "555 0100"],
  ])("fills the addressed field for %s", (utterance, value) => {
    const result = reduce(initialState(), say(utterance), ctx(survey));
    const fieldId = utterance.startsWith("field 3") ? "e3" : "e6";
    expect(result.effects).toEqual([{ kind: "fill", fieldId, value }]);
  });

  it("rejects malformed email and ambiguous field labels without a fill", () => {
    const invalid = reduce(initialState(), say("email is not-an-address"), ctx(survey));
    expect(invalid.effects).toEqual([speak(
      "I didn't catch a full email address. Say it again, for example name at example dot com.",
      "b1",
      "error",
    )]);

    const e6 = survey.fields.find((field) => field.id === "e6")!;
    const duplicate = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e6" ? { ...e6, label: "Alternate email", confidence: 0.95 } : field),
    });
    const ambiguous = reduce(initialState(), say("email is jane at example dot com"), ctx(duplicate));
    expect(ambiguous.effects).toEqual([speak("Which one, Email or Alternate email?")]);
    expect(ambiguous.effects.some((effect) => effect.kind === "fill")).toBe(false);
  });

  it("fills a bare value only for a guarded current text field", () => {
    const state = { ...initialState(), currentFieldId: "e1" };
    const result = reduce(state, say("jane doe"), ctx(survey));
    expect(result.effects).toEqual([{ kind: "fill", fieldId: "e1", value: "jane doe" }]);

    const uncertain = reduce(state, say("jane doe", 0.4), ctx(survey));
    expect(uncertain.effects).toEqual([speak("I'm not sure I heard that. Say it again.", "b1", "error")]);
  });

  it.each(["yes", "yeah", "no", "ok", "okay", "cancel", "nevermind", "never mind", "sure"])(
    "does not type the control word %s into the current field",
    (word) => {
      const result = reduce({ ...initialState(), currentFieldId: "e1" }, say(word), ctx(survey));
      expect(result.effects.some((effect) => effect.kind === "fill")).toBe(false);
    },
  );

  it("does not turn command-leading, long, fieldless, or select text into fills", () => {
    const current = { ...initialState(), currentFieldId: "e1" };
    for (const text of [
      "fill this in", "spell this", "change something", "undo that", "where is it", "what is this", "whats next",
      "read something", "submit now", "go there", "open it", "click it", "press it", "tap it", "book it", "pay now",
      "delete it", "send it", "help me", "how now", "why now", "can you", "could you",
      "set an unknown field", "enter something", "type something", "my phone", "cancel this",
      "jane doe with extra words in a sentence that is too long",
    ]) {
      expect(reduce(current, say(text), ctx(survey)).effects.some((effect) => effect.kind === "fill")).toBe(false);
    }
    expect(reduce(initialState(), say("jane doe"), ctx(survey)).effects.some((effect) => effect.kind === "fill")).toBe(false);
    const disabled = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e1" ? { ...field, disabled: true } : field),
    });
    expect(reduce(current, say("jane doe"), ctx(disabled)).effects.some((effect) => effect.kind === "fill")).toBe(false);
    expect(reduce({ ...initialState(), currentFieldId: "e4" }, say("purple"), ctx(survey)).effects).toEqual([
      { kind: "parseIntent", text: "purple" },
    ]);
    expect(reduce(current, say("email"), ctx(survey)).effects[0]?.kind).toBe("speak");
  });

  it("routes bare select values through option values and does not fill them", () => {
    const result = reduce({ ...initialState(), currentFieldId: "e4" }, say("Web search"), ctx(survey));
    expect(result.effects).toEqual([{ kind: "select", fieldId: "e4", optionValue: "web" }]);
    expect(result.effects.some((effect) => effect.kind === "fill")).toBe(false);
  });

  it("still accepts a bare value for the last read field while earlier choices are pending", () => {
    const read = reduce(initialState(), say("read the form"), ctx(survey));
    const next = reduce(read.state, say("continue"), ctx(survey));
    expect(next.state.pendingOptions).toEqual({ fieldId: "e4" });
    const value = reduce(next.state, say("twenty five"), ctx(survey));
    expect(value.effects).toEqual([{ kind: "fill", fieldId: "e6", value: "25" }]);
  });

  it("focuses sensitive fields without filling or storing their dictated value", () => {
    const form = withPassword(survey);
    const result = reduce(initialState(), say("password is marker secret"), ctx(form));
    expect(result.effects.map((effect) => effect.kind)).toEqual(["focus", "speak"]);
    const spoken = result.effects.find((effect) => effect.kind === "speak");
    expect(spoken).toEqual(speak("Password is sensitive. I can't fill it. I moved to the field so you can type it.", "b1"));
    expect(result.effects.some((effect) => effect.kind === "fill")).toBe(false);
    expect(result.state.previousValues).toEqual({});
    expect(spoken?.kind === "speak" ? spoken.text : "").not.toContain("marker secret");
  });

  it("echoes only the observed page value and maps observed option values to labels", () => {
    const form = withConfidence(survey, "e2", 0.95);
    const typed = reduce(initialState(), say("email is jane at example dot com"), ctx(form));
    const success = reduce(typed.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: "jane@example.com",
    }, ctx(form));
    expect(success.effects).toEqual([
      speak("Email, jane at example dot com."),
      { kind: "refreshForm" },
    ]);

    const empty = reduce(typed.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: null,
    }, ctx(form));
    expect(empty.effects).toEqual([
      speak("I tried to fill Email, but the page shows nothing.", "b1", "error"),
      { kind: "earcon", name: "error" },
    ]);

    const selected = reduce({
      ...initialState(), pendingFill: { fieldId: "e4", replaced: false }, mode: "awaiting-value",
    }, {
      type: "act.result", op: "select", fieldId: "e4", ok: true, observedValue: "web",
    }, ctx(form));
    expect(selected.effects).toEqual([
      speak("probably How did you hear about us, Web search."),
      { kind: "refreshForm" },
    ]);
  });

  it("stores replaced non-sensitive values and refuses to expose sensitive act results", () => {
    const replacedForm = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2" ? {
        ...field, value: "old@example.com", hasValue: true, confidence: 0.95,
      } : field),
    });
    const result = reduce(initialState(), say("email is jane at example dot com"), ctx(replacedForm));
    expect(result.state.pendingFill).toEqual({ fieldId: "e2", replaced: true, undoPreviousValue: "old@example.com" });
    expect(result.state.previousValues).toEqual({ e2: "old@example.com" });

    const secretForm = withPassword(survey);
    const sensitive = reduce({
      ...initialState(), pendingFill: { fieldId: "password", replaced: true }, mode: "awaiting-value",
    }, {
      type: "act.result", op: "fill", fieldId: "password", ok: false, error: "sensitive-field", observedValue: "SENSITIVE-MARKER",
    }, ctx(secretForm));
    const speech = sensitive.effects.filter((effect) => effect.kind === "speak").map((effect) => effect.text).join(" ");
    expect(sensitive.effects.map((effect) => effect.kind)).toEqual(["focus", "speak"]);
    expect(speech).not.toContain("SENSITIVE-MARKER");
    expect(sensitive.effects.some((effect) => effect.kind === "fill")).toBe(false);
  });
});
