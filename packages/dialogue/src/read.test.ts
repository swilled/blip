import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import brokenJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import type { DialogueEvent } from "./events";
import { initialState } from "./state";
import { reduce } from "./reduce";

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
