import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import brokenJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import type { DialogueEvent } from "./events";
import { initialState } from "./state";
import { reduce } from "./reduce";
import { requiredEmptyText } from "./templates";

const survey = FormModel.parse(surveyJson);
const broken = FormModel.parse(brokenJson);
const ctx = (form: FormModel | null) => ({ form, now: 0 });

function say(text: string): DialogueEvent {
  return { type: "utterance", utterance: { utteranceId: "u1", text, source: "typed" } };
}

function speak(text: string, speakId = "b1") {
  return { kind: "speak", speakId, text, category: "answer", interruptible: true };
}

function readSurvey() {
  return reduce(initialState(), say("read the form"), ctx(survey));
}

function readSecondSurveyBatch() {
  const first = readSurvey();
  return reduce(first.state, say("continue"), ctx(survey));
}

describe("dialogue read and option picks", () => {
  it("changes a named field and confirms its prior and page-observed values", () => {
    const filled = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2"
        ? { ...field, hasValue: true, value: "old@example.com" }
        : field),
    });
    const command = reduce(initialState(), say("change email to new@example.com"), ctx(filled));
    expect(command.effects).toEqual([{ kind: "fill", fieldId: "e2", value: "new@example.com" }]);
    expect(command.state.pendingFill).toEqual({ fieldId: "e2", replaced: true, previousValue: "old@example.com" });
    const result = reduce(command.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: "new@example.co",
    }, ctx(filled));
    expect((result.effects[0] as { text: string }).text).toContain("old at example dot com");
    expect((result.effects[0] as { text: string }).text).toContain("new at example dot co");
    expect((result.effects[0] as { text: string }).text).not.toContain("new at example dot com.");
  });

  it("does not claim or echo a requested value after a failed change", () => {
    const command = reduce(initialState(), say("change email to secret@example.com"), ctx(survey));
    const result = reduce(command.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: false, observedValue: null,
    }, ctx(survey));
    expect((result.effects[0] as { text: string }).text).toContain("page shows nothing");
    expect((result.effects[0] as { text: string }).text).not.toContain("secret");
  });

  it("clarifies an ambiguous change target without emitting a fill or model request", () => {
    const ambiguous = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e3"
        ? { ...field, label: "Email" }
        : field),
    });
    const result = reduce(initialState(), say("change email to new@example.com"), ctx(ambiguous));
    expect(result.effects.some((effect) => effect.kind === "fill")).toBe(false);
    expect(result.effects.some((effect) => effect.kind === "parseIntent")).toBe(false);
    expect((result.effects[0] as { text: string }).text).toMatch(/^Which one/);
  });

  it("spells each page-observed email character and names punctuation", () => {
    const emailForm = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2"
        ? { ...field, hasValue: true, value: "jane@example.com" }
        : field),
    });
    const result = reduce(initialState(), say("spell email"), ctx(emailForm));
    expect(result.effects).toEqual([speak("j, a, n, e, at, e, x, a, m, p, l, e, dot, c, o, m")]);
  });

  it("clarifies a missing or ambiguous spell target without model parsing", () => {
    expect(reduce(initialState(), say("spell nonexistent"), ctx(survey)).effects).toEqual([
      speak("I couldn't find that field. Which field should I spell?"),
    ]);
    const ambiguous = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e3"
        ? { ...field, label: "Email" }
        : field),
    });
    const result = reduce(initialState(), say("spell email"), ctx(ambiguous));
    expect((result.effects[0] as { text: string }).text).toMatch(/^Which field\?/);
    expect(result.effects.some((effect) => effect.kind === "parseIntent")).toBe(false);
  });

  it("reads exactly three fields and records the cursor and current field", () => {
    const result = readSurvey();
    expect(result.effects[0]?.kind).toBe("speak");
    expect(result.effects).toEqual([speak(
      "Field 1: probably Your name, optional. Field 2: probably Email, required. Field 3: unlabeled field 3, required. Say continue for more.",
    )]);
    expect(result.state.mode).toBe("reading");
    expect(result.state.readCursor).toBe(3);
    expect(result.state.currentFieldId).toBe("e3");
    expect(result.state.pendingOptions).toBeNull();
  });

  it("reads the final survey batch and offers non-placeholder options", () => {
    const result = readSecondSurveyBatch();
    expect(result.effects).toEqual([speak(
      "Field 4: probably How did you hear about us, required. Options: one, Friend. Two, Web search. Three, Other. Field 5: probably Satisfaction, optional. Options: one, Low. Two, Medium. Three, High. Field 6: probably Age, optional. That is all 6 fields.",
      "b2",
    )]);
    expect(result.state.readCursor).toBeNull();
    expect(result.state.currentFieldId).toBe("e6");
    expect(result.state.pendingOptions).toEqual({ fieldId: "e4" });
  });

  it("continues only after a batch and gives a restart prompt at the end", () => {
    const result = reduce(initialState(), say("continue"), ctx(survey));
    expect(result.effects).toEqual([speak("Say read the form to start.")]);
  });

  it("recognizes the exact read and continuation aliases", () => {
    for (const phrase of ["read form", "read the fields"]) {
      expect(reduce(initialState(), say(phrase), ctx(survey)).effects[0]?.kind).toBe("speak");
    }
    for (const phrase of ["next", "more"]) {
      const result = reduce(readSurvey().state, say(phrase), ctx(survey));
      expect(result.effects[0]?.kind).toBe("speak");
      expect((result.effects[0] as { text: string }).text).toContain("Field 4:");
    }
  });

  it("stops with a tracked cancel and repeats the last spoken line", () => {
    const reading = { ...initialState(), mode: "reading" as const, currentFieldId: "e3" };
    const stopped = reduce(reading, say("stop"), ctx(survey));
    expect(stopped.effects).toEqual([{ kind: "cancelSpeech", speakId: "b1" }]);
    expect(stopped.state.mode).toBe("ready");
    expect(stopped.state.currentFieldId).toBe("e3");

    const repeated = reduce({ ...initialState(), lastSpoken: "last answer" }, say("repeat"), ctx(survey));
    expect(repeated.effects).toEqual([speak("last answer")]);
  });

  it("answers required-field grammar with the established spoken labels", () => {
    const result = reduce(initialState(), say("what's required"), ctx(survey));
    expect(result.effects).toEqual([speak(
      "3 required: probably Email, unlabeled field 3, probably How did you hear about us.",
    )]);
    const optional = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => ({ ...field, required: false })),
    });
    expect(reduce(initialState(), say("what fields are required"), ctx(optional)).effects).toEqual([
      speak("No fields are required."),
    ]);
  });

  it.each(["what's missing", "what do I still need", "what do I need to fill"])(
    "names currently empty required fields when asked %s",
    (command) => {
      expect(reduce(initialState(), say(command), ctx(survey)).effects).toEqual([
        speak(requiredEmptyText(survey)),
      ]);
    },
  );

  it.each(["two", "number two", "option 2", "Web search"])("picks an option by %s and sends its value", (choice) => {
    const second = readSecondSurveyBatch();
    const picked = reduce(second.state, say(choice), ctx(survey));
    expect(picked.effects).toEqual([{ kind: "select", fieldId: "e4", optionValue: "web" }]);
    expect(picked.state.pendingOptions).toBeNull();
  });

  it("asks the user to disambiguate a label shared by options", () => {
    const field = survey.fields.find((item) => item.id === "e4")!;
    const ambiguous = FormModel.parse({
      ...survey,
      fields: survey.fields.map((item) => item.id === "e4" ? {
        ...field,
        options: [
          { value: "web-search", label: "Web search" },
          { value: "search-site", label: "Search website" },
        ],
      } : item),
    });
    const second = readSecondSurveyBatch();
    const picked = reduce(second.state, say("search"), ctx(ambiguous));
    expect(picked.effects).toEqual([speak("Which one? one, Web search. two, Search website.", "b3")]);
    expect(picked.state.pendingOptions).toEqual({ fieldId: "e4" });
  });

  it("explains an unmatched option and repeats the numbered list", () => {
    const second = readSecondSurveyBatch();
    const picked = reduce(second.state, say("option 9"), ctx(survey));
    expect(picked.effects).toEqual([speak(
      "I didn't find that option. one, Friend. two, Web search. three, Other.",
      "b3",
    )]);
  });

  it("handles a missing page, no fields, and overlong unrecognized text", () => {
    expect(reduce(initialState(), say("read the form"), ctx(null)).effects).toEqual([
      speak("I can't see a page yet."),
    ]);
    const empty = FormModel.parse({ ...broken, fields: [] });
    expect((reduce(initialState(), say("read the form"), ctx(empty)).effects[0] as { text: string }).text).toBe("There are no fields.");
    expect(reduce(initialState(), say("read the form " + "x".repeat(201)), ctx(survey)).effects).toEqual([
      { kind: "parseIntent", text: "read the form " + "x".repeat(201) },
    ]);
  });
});
