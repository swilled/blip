import { describe, expect, it } from "vitest";
import { FormModel } from "@blip/protocol";
import surveyJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };
import brokenJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import type { DialogueEvent } from "./events";
import { initialState } from "./state";
import { reduce } from "./reduce";
import { requiredEmptyText } from "./templates";
import { profileFieldMatches, profileTokenMatch } from "./fields";

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
  it("maps supported autocomplete detail tokens regardless of section and shipping or billing token order", () => {
    const withAutocomplete = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e1"
        ? { ...field, autocomplete: "section-shipping shipping name" }
        : field.id === "e2"
          ? { ...field, autocomplete: "billing email" }
          : field.id === "e3"
            ? { ...field, autocomplete: "tel section-home" }
            : field),
    });
    const matches = profileFieldMatches(withAutocomplete).filter(({ match }) => match.kind === "match");
    expect(matches.map(({ field, match }) => [field.id, match.kind === "match" ? match.key : null])).toEqual([
      ["e1", "name"], ["e2", "email"], ["e3", "tel"],
    ]);
    expect(profileTokenMatch({ ...withAutocomplete.fields[0]!, autocomplete: "email name" })).toEqual({ kind: "ambiguous" });
    expect(profileTokenMatch({ ...withAutocomplete.fields[0]!, autocomplete: "email email" })).toEqual({ kind: "ambiguous" });
  });

  it("fills clear profile matches one at a time in page order and advances after refresh", () => {
    const profileForm = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e1"
        ? { ...field, autocomplete: "section-checkout shipping name" }
        : field.id === "e2"
          ? { ...field, autocomplete: "billing email" }
          : field.id === "e3"
            ? { ...field, autocomplete: "section-contact tel" }
            : field),
    });
    const profile = { name: "Rowan Example", email: "rowan@example.com", tel: "202-555-0142" };
    const command = reduce(initialState(), say("fill from my profile"), { form: profileForm, now: 0, profile });
    expect(command.effects).toEqual([{ kind: "fill", fieldId: "e1", value: profile.name }]);

    const first = reduce(command.state, {
      type: "act.result", op: "fill", fieldId: "e1", ok: true, observedValue: "Rowan",
    }, { form: profileForm, now: 1, profile });
    expect(first.effects[0]).toMatchObject({ kind: "speak", text: expect.stringContaining("Rowan") });
    expect(first.effects.at(-1)).toEqual({ kind: "refreshForm" });
    expect(first.state.profileBatch?.filled).toEqual([{
      fieldId: "e1", label: "probably Your name", op: "fill", previousValue: null, writtenValue: "Rowan",
    }]);

    const refreshed = FormModel.parse({
      ...profileForm,
      fields: profileForm.fields.map((field) => field.id === "e1" ? { ...field, hasValue: true, value: "Rowan" } : field),
    });
    const second = reduce(first.state, { type: "form.changed" }, { form: refreshed, now: 2, profile });
    expect(second.effects).toEqual([{ kind: "fill", fieldId: "e2", value: profile.email }]);
  });

  it("skips populated, ambiguous, unmatched, disabled, and sensitive profile fields", () => {
    const form = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e1"
        ? { ...field, autocomplete: "email", hasValue: true, value: "existing@example.test" }
        : field.id === "e2"
          ? { ...field, autocomplete: "email" }
          : field.id === "e3"
            ? { ...field, autocomplete: "tel", sensitive: "password", type: "password", value: null }
            : field.id === "e6"
              ? { ...field, autocomplete: "email", disabled: true }
              : field),
    });
    const result = reduce(initialState(), say("fill from my profile"), {
      form, now: 0, profile: { name: "Rowan Example", email: "rowan@example.com", tel: "202-555-0142" },
    });
    expect(result.effects.some((effect) => effect.kind === "fill")).toBe(false);
    expect(result.effects.some((effect) => effect.kind === "parseIntent")).toBe(false);
    const text = (result.effects.find((effect) => effect.kind === "speak") as { text: string }).text;
    expect(text).toContain("Your name");
    expect(text).toContain("Email");
    expect(text).toContain("unlabeled field 3");
    expect(text).toContain("Age");
    expect(text).toContain("How did you hear about us");
  });

  it("undoes a profile batch only when each observed page value still matches Blip's write", () => {
    const profileForm = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e1"
        ? { ...field, autocomplete: "name" }
        : field.id === "e2"
          ? { ...field, autocomplete: "email" }
          : field.id === "e3"
            ? { ...field, autocomplete: "" }
          : field),
    });
    const profile = { name: "Rowan Example", email: "rowan@example.com", tel: "202-555-0142" };
    const first = reduce(initialState(), say("fill from my profile"), { form: profileForm, now: 0, profile });
    const firstResult = reduce(first.state, {
      type: "act.result", op: "fill", fieldId: "e1", ok: true, observedValue: "Rowan observed",
    }, { form: profileForm, now: 1, profile });
    const afterFirstPage = FormModel.parse({
      ...profileForm,
      fields: profileForm.fields.map((field) => field.id === "e1" ? { ...field, hasValue: true, value: "Rowan observed" } : field),
    });
    const second = reduce(firstResult.state, { type: "form.changed" }, { form: afterFirstPage, now: 2, profile });
    const secondResult = reduce(second.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: "rowan@example.co",
    }, { form: afterFirstPage, now: 3, profile });
    const afterProfile = FormModel.parse({
      ...afterFirstPage,
      fields: afterFirstPage.fields.map((field) => field.id === "e2" ? { ...field, hasValue: true, value: "rowan@example.co" } : field),
    });
    const summary = reduce(secondResult.state, { type: "form.changed" }, { form: afterProfile, now: 4, profile });
    expect((summary.effects[0] as { text: string }).text).toContain("Filled probably Your name and probably Email.");
    expect((summary.effects[0] as { text: string }).text).toContain("How did you hear about us");
    expect(summary.state.undoRecord).toHaveLength(2);

    const undo = reduce(summary.state, say("undo"), { form: afterProfile, now: 5, profile });
    expect(undo.effects).toEqual([{ kind: "refreshForm" }]);
    expect(undo.state.undoRecord).toBeNull();
    const undoFirst = reduce(undo.state, { type: "form.changed" }, { form: afterProfile, now: 6, profile });
    expect(undoFirst.effects).toEqual([{ kind: "fill", fieldId: "e1", value: "" }]);
    const undoFirstResult = reduce(undoFirst.state, {
      type: "act.result", op: "fill", fieldId: "e1", ok: true, observedValue: "",
    }, { form: afterProfile, now: 7, profile });
    const afterUndoFirst = FormModel.parse({
      ...afterProfile,
      fields: afterProfile.fields.map((field) => field.id === "e1" ? { ...field, hasValue: false, value: "" } : field),
    });
    const undoSecond = reduce(undoFirstResult.state, { type: "form.changed" }, { form: afterUndoFirst, now: 8, profile });
    expect(undoSecond.effects).toEqual([{ kind: "fill", fieldId: "e2", value: "" }]);
    const undoSecondResult = reduce(undoSecond.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: "",
    }, { form: afterUndoFirst, now: 9, profile });
    const afterUndoSecond = FormModel.parse({
      ...afterUndoFirst,
      fields: afterUndoFirst.fields.map((field) => field.id === "e2" ? { ...field, hasValue: false, value: "" } : field),
    });
    const undone = reduce(undoSecondResult.state, { type: "form.changed" }, { form: afterUndoSecond, now: 10, profile });
    expect((undone.effects[0] as { text: string }).text).toContain("Undid changes to");
    expect(undone.state.pendingUndo).toBeNull();
    expect((reduce(undone.state, say("undo"), { form: afterUndoSecond, now: 11, profile }).effects[0] as { text: string }).text)
      .toBe("There's nothing left to undo.");
  });

  it("leaves a changed page value untouched during undo and explains the skip", () => {
    const command = reduce(initialState(), say("email is new@example.com"), ctx(survey));
    const written = reduce(command.state, {
      type: "act.result", op: "fill", fieldId: "e2", ok: true, observedValue: "new@example.com",
    }, ctx(survey));
    const external = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2" ? { ...field, hasValue: true, value: "external@example.com" } : field),
    });
    const undo = reduce(written.state, say("undo"), ctx(external));
    const checked = reduce(undo.state, { type: "form.changed" }, ctx(external));
    expect(checked.effects.some((effect) => effect.kind === "fill")).toBe(false);
    expect((checked.effects[0] as { text: string }).text).toContain("changed after my fill");
    expect(checked.state.pendingUndo).toBeNull();
  });

  it("changes a named field and confirms its prior and page-observed values", () => {
    const filled = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2"
        ? { ...field, hasValue: true, value: "old@example.com" }
        : field),
    });
    const command = reduce(initialState(), say("change email to new@example.com"), ctx(filled));
    expect(command.effects).toEqual([{ kind: "fill", fieldId: "e2", value: "new@example.com" }]);
    expect(command.state.pendingFill).toEqual({
      fieldId: "e2", replaced: true, previousValue: "old@example.com", undoPreviousValue: "old@example.com",
    });
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

  it("hands sensitive fields to the user and confirms presence without retaining or speaking the value", () => {
    const sentinel = "sensitive-sentinel-9472";
    const sensitive = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2"
        ? { ...field, label: "Password", type: "password", sensitive: "password", hasValue: true, value: null }
        : field),
    });
    const handoff = reduce(initialState(), say(`change password to ${sentinel}`), ctx(sensitive));
    expect(handoff.effects.map((effect) => effect.kind)).toEqual(["focus", "speak"]);
    expect(handoff.effects.some((effect) => effect.kind === "fill" || effect.kind === "parseIntent")).toBe(false);
    expect(JSON.stringify(handoff.state)).not.toContain(sentinel);
    expect(JSON.stringify(handoff.effects)).not.toContain(sentinel);

    const spelling = reduce(initialState(), say("spell password"), ctx(sensitive));
    expect(spelling.effects.map((effect) => effect.kind)).toEqual(["focus", "speak"]);
    expect(JSON.stringify(spelling.effects)).not.toContain(sentinel);

    const overlong = reduce(initialState(), say(`change password to ${sentinel}${"x".repeat(205)}`), ctx(sensitive));
    expect(overlong.effects.some((effect) => effect.kind === "parseIntent")).toBe(false);
    expect(JSON.stringify(overlong.effects)).not.toContain(sentinel);

    const confirmed = reduce(handoff.state, say("done"), ctx(sensitive));
    expect((confirmed.effects[0] as { text: string }).text).toBe("probably Password is entered, hidden.");
    expect(JSON.stringify(confirmed.state)).not.toContain(sentinel);
    expect(JSON.stringify(confirmed.effects)).not.toContain(sentinel);
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
      "3 required fields are empty: probably Email, unlabeled field 3, probably How did you hear about us.",
    )]);
    const optional = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => ({ ...field, required: false })),
    });
    expect(reduce(initialState(), say("what fields are required"), ctx(optional)).effects).toEqual([
      speak("No required fields are empty."),
    ]);
  });

  it("batches empty required fields in page order and resumes only on continue", () => {
    const manyRequired = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => ({ ...field, required: true })),
    });
    const first = reduce(initialState(), say("what's required"), ctx(manyRequired));
    expect(first.effects).toEqual([speak(
      "6 required fields are empty: probably Your name, probably Email, unlabeled field 3. Say continue for more.",
    )]);
    expect(first.state.requiredCursor).toBe(3);
    const next = reduce(first.state, say("continue"), ctx(manyRequired));
    expect(next.effects).toEqual([speak(
      "Still empty and required: probably How did you hear about us, probably Satisfaction, probably Age.",
      "b2",
    )]);
    expect(next.state.requiredCursor).toBeNull();
  });

  it("orients only from the current snapshot and masks sensitive values", () => {
    const afterRead = readSurvey();
    const oriented = reduce(afterRead.state, say("where am I"), ctx(survey));
    expect(oriented.effects).toEqual([speak("Customer survey. Current field: unlabeled field 3, empty.", "b2")]);
    const sensitive = FormModel.parse({
      ...survey,
      fields: survey.fields.map((field) => field.id === "e2"
        ? { ...field, hasValue: true, value: null, sensitive: "password" as const }
        : field),
    });
    expect(reduce({ ...initialState(), currentFieldId: "e2" }, say("where am I"), ctx(sensitive)).effects)
      .toEqual([speak("Customer survey. Current field: probably Email, filled, hidden.")]);
    expect(reduce({ ...afterRead.state, lastSpoken: "stale title and field" }, say("where am I"), ctx(null)).effects)
      .toEqual([speak("I can't read the page yet. Please reconnect or try again.", "b2")]);
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
