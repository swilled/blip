import { describe, expect, it } from "vitest";
import { FormModel, type Field } from "@blip/protocol";
import fixtureJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };

type BatchResult = { text: string; nextIndex: number | null; lastFieldId: string | null; optionsFieldId: string | null };
type TemplatesApi = {
  readBatchText?: (form: FormModel, startIndex: number, count: number) => BatchResult;
  echoText?: (field: Field, observedDisplay: string | null, replaced: boolean) => string;
  readBackText?: (form: FormModel) => string;
  requiredEmptyText?: (form: FormModel) => string;
  confirmPromptText?: (phrase: string) => string;
  refusalText?: (phrase: string) => string;
};

const loaded = await import("./templates.js").catch(() => null) as TemplatesApi | null;
const fixture = FormModel.parse(fixtureJson);
const missing = "unimplemented template";
const readBatchText = (form: FormModel, startIndex: number, count: number): BatchResult =>
  loaded?.readBatchText?.(form, startIndex, count) ?? { text: missing, nextIndex: null, lastFieldId: null, optionsFieldId: null };
const echoText = (field: Field, observedDisplay: string | null, replaced: boolean) =>
  loaded?.echoText?.(field, observedDisplay, replaced) ?? missing;
const readBackText = (form: FormModel) => loaded?.readBackText?.(form) ?? missing;
const requiredEmptyText = (form: FormModel) => loaded?.requiredEmptyText?.(form) ?? missing;
const confirmPromptText = (phrase: string) => loaded?.confirmPromptText?.(phrase) ?? missing;
const refusalText = (phrase: string) => loaded?.refusalText?.(phrase) ?? missing;

function makeField(overrides: Partial<Field> = {}): Field {
  return {
    ...fixture.fields[0]!,
    id: "field-a",
    role: "textbox",
    type: "text",
    label: "Name",
    labelSource: "nearby-text",
    confidence: 0.95,
    required: false,
    options: undefined,
    value: null,
    hasValue: false,
    sensitive: "none",
    error: null,
    disabled: false,
    order: 1,
    ...overrides,
  };
}

function withFields(fields: Field[]): FormModel {
  return { ...fixture, fields };
}

describe("spoken form templates", () => {
  it("reads three enabled fields in page order and returns the next offset", () => {
    const batch = readBatchText(fixture, 0, 3);
    expect(batch.text).toBe("Field 1: probably Your name, optional. Field 2: probably Email, required. Field 3: unlabeled field 3, required. Say continue for more.");
    expect(batch.nextIndex).toBe(3);
    expect(batch.lastFieldId).toBe("e3");
    expect(batch.optionsFieldId).toBeNull();
  });

  it("numbers page options and closes the final batch with its field count", () => {
    const batch = readBatchText(fixture, 3, 3);
    expect(batch.text).toBe("Field 4: probably How did you hear about us, required. Options: one, Friend. Two, Web search. Three, Other. Field 5: probably Satisfaction, optional. Options: one, Low. Two, Medium. Three, High. Field 6: probably Age, optional. That is all 6 fields.");
    expect(batch.nextIndex).toBeNull();
    expect(batch.lastFieldId).toBe("e6");
    expect(batch.optionsFieldId).toBe("e4");
  });

  it("limits spoken option lists to eight and tells the user how to choose", () => {
    const field = makeField({
      id: "choices",
      type: "select",
      options: Array.from({ length: 10 }, (_, index) => ({ value: `v${index + 1}`, label: `Choice ${index + 1}` })),
    });
    const batch = readBatchText(withFields([field]), 0, 1);
    expect(batch.text).toContain("Options: one, Choice 1.");
    expect(batch.text).toContain("Eight, Choice 8. And 2 more. Say the one you want.");
  });

  it("echoes the value read from the page and says when a value was replaced", () => {
    const email = makeField({ type: "email", label: "Email" });
    expect(echoText(email, "jane@example.com", false)).toBe("Email, jane at example dot com.");
    expect(echoText(email, "jane@example.com", true)).toBe("Email, jane at example dot com. Replacing the old value.");
    expect(echoText(makeField({ label: "Age", type: "number" }), null, false)).toBe("I tried to fill Age, but the page shows nothing.");
  });

  it("reads every field back, maps options, hides sensitive values, and counts missing requirements", () => {
    const fields = fixture.fields.map((field) => {
      if (field.id === "e1") return { ...field, value: "Ada", hasValue: true, confidence: 0.95 };
      if (field.id === "e2") return { ...field, value: "", hasValue: false, confidence: 0.95 };
      if (field.id === "e3") return { ...field, confidence: 0.95 };
      if (field.id === "e4") return { ...field, value: "friend", hasValue: true, confidence: 0.95 };
      if (field.id === "e5") return { ...field, value: "high", hasValue: true, confidence: 0.95 };
      return { ...field, value: "42", hasValue: true, confidence: 0.95 };
    });
    expect(readBackText(withFields(fields))).toBe("Reading back 6 fields. Your name, Ada. Email, empty, required. unlabeled field 3, empty, required. How did you hear about us, Friend. Satisfaction, High. Age, 42. 2 required fields are still empty.");
  });

  it("uses the required-empty and exact confirmation wording", () => {
    const form = withFields([
      makeField({ id: "phone", label: "Phone", type: "tel", required: true, order: 1 }),
      makeField({ id: "email", label: "Email", type: "email", required: true, order: 2 }),
    ]);
    expect(requiredEmptyText(form)).toBe("I can't submit yet. Phone and Email are required and empty.");
    expect(confirmPromptText("submit survey")).toBe("To submit, say 'submit survey'.");
    expect(refusalText("submit survey")).toBe("Not submitting. I need you to say 'submit survey'.");
  });

  it("sanitizes page labels, option labels, and field errors before speaking them", () => {
    const field = makeField({
      label: "Contact\u0000   method",
      type: "select",
      options: [{ value: "web", label: "Web\u0000   search" }],
      error: "Please\u0000   check this",
    });
    const form = withFields([field]);
    expect(readBatchText(form, 0, 1).text).toContain("Contact method");
    expect(readBatchText(form, 0, 1).text).toContain("Web search");
    expect(readBackText(form)).toContain("Contact method, empty, optional, error: Please check this.");
  });

  it("never includes a sensitive field value in any spoken template", () => {
    const passwordMarker = "password-marker-09f7";
    const cardMarker = "card-marker-4c31";
    const password = makeField({ id: "password", label: "Password", type: "password", required: true, sensitive: "password", value: null, hasValue: true, order: 1 });
    const card = makeField({ id: "card", label: "Card number", type: "text", required: true, sensitive: "card-number", value: null, hasValue: true, order: 2 });
    const publicField = makeField({ id: "public", label: "Email", type: "email", order: 3 });
    const forged = withFields([
      { ...password, value: passwordMarker },
      { ...card, value: cardMarker },
      publicField,
    ] as unknown as Field[]);
    const outputs = [
      readBatchText(forged, 0, 3).text,
      echoText({ ...password, value: passwordMarker } as unknown as Field, passwordMarker, false),
      readBackText(forged),
      requiredEmptyText(forged),
      confirmPromptText("submit survey"),
      refusalText("submit survey"),
    ];
    for (const output of outputs) {
      expect(output).not.toContain(passwordMarker);
      expect(output).not.toContain(cardMarker);
    }
    expect(outputs[2]).toContain("Password, entered, hidden.");
    expect(outputs[2]).toContain("Card number, entered, hidden.");
  });
});
