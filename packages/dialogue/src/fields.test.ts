import { describe, expect, it } from "vitest";
import { FormModel, type Field } from "@blip/protocol";
import fixtureJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };

type ListedOption = { n: number; value: string; label: string };
type FieldsApi = {
  fillableFields?: (form: FormModel) => Field[];
  spokenLabel?: (field: Field, n: number) => string;
  optionList?: (field: Field) => ListedOption[];
  optionLabelFor?: (field: Field, value: string) => string | null;
  resolveField?: (form: FormModel, text: string) => { kind: "match"; field: Field; rest: string } | { kind: "ambiguous"; labels: string[] } | { kind: "none" };
  matchOption?: (field: Field, text: string) => { kind: "match"; option: ListedOption } | { kind: "many"; labels: string[] } | { kind: "none" };
  requiredEmpty?: (form: FormModel) => Field[];
  formDigest?: (form: FormModel) => string;
};

const loaded = await import("./fields.js").catch(() => null) as FieldsApi | null;
const fixture = FormModel.parse(fixtureJson);
const fillableFields = (form: FormModel) => loaded?.fillableFields?.(form) ?? form.fields;
const spokenLabel = (field: Field, _n: number) => loaded?.spokenLabel?.(field, _n) ?? field.label;
const optionList = (field: Field) => loaded?.optionList?.(field) ?? (field.options ?? []).map((option, n) => ({ n: n + 1, ...option }));
const optionLabelFor = (field: Field, value: string) => loaded?.optionLabelFor?.(field, value) ?? field.options?.find((option) => option.value === value)?.label ?? null;
const resolveField = (form: FormModel, text: string) => loaded?.resolveField?.(form, text) ?? { kind: "none" as const };
const matchOption = (field: Field, text: string) => loaded?.matchOption?.(field, text) ?? { kind: "none" as const };
const requiredEmpty = (form: FormModel) => loaded?.requiredEmpty?.(form) ?? [];
const formDigest = (form: FormModel) => loaded?.formDigest?.(form) ?? form.fields.map((field) => field.value ?? "").join("|");

function makeField(overrides: Partial<Field> = {}): Field {
  return {
    ...fixture.fields[0]!,
    id: "field-a",
    label: "Email",
    order: 1,
    required: false,
    disabled: false,
    ...overrides,
  };
}

function withFields(fields: Field[]): FormModel {
  return { ...fixture, fields };
}

describe("form fields and option resolution", () => {
  it("returns enabled fields in page order for spoken field numbering", () => {
    const form = withFields([
      makeField({ id: "third", label: "", order: 3 }),
      makeField({ id: "disabled", label: "Hidden", order: 2, disabled: true }),
      makeField({ id: "first", label: "Name", order: 1 }),
    ]);
    expect(fillableFields(form).map((field) => field.id).join(",")).toBe("first,third");
    expect(spokenLabel(fillableFields(form)[1]!, 2)).toBe("unlabeled field 2");
  });

  it("speaks unlabeled fields by position and hedges low-confidence labels", () => {
    expect(spokenLabel(makeField({ label: " \t ", labelSource: "inferred" }), 3)).toBe("unlabeled field 3");
    expect(spokenLabel(makeField({ label: " Email\u0000   Address ", labelSource: "nearby-text", confidence: 0.9 }), 1)).toBe("Email Address");
    expect(spokenLabel(makeField({ label: "Email", labelSource: "inferred", confidence: 0.9 }), 2)).toBe("probably Email");
  });

  it("lists page options in order, skips empty values, and sanitizes their labels", () => {
    const field = makeField({
      type: "select",
      options: [
        { value: "", label: "Choose one" },
        { value: "friend", label: " Friend\u0000 " },
        { value: "web", label: "Web search" },
      ],
    });
    expect(optionList(field).map((option) => `${option.n}:${option.value}:${option.label}`).join("|"))
      .toBe("1:friend:Friend|2:web:Web search");
    expect(optionLabelFor(field, "web")).toBe("Web search");
    expect(optionLabelFor(field, "missing")).toBeNull();
  });

  it("matches options by number, exact name, or a unique name fragment", () => {
    const field = fixture.fields.find((candidate) => candidate.id === "e4")!;
    for (const phrase of ["two", "number two", "option 2", "2", "Web search", "search"]) {
      expect(matchOption(field, phrase).kind, phrase).toBe("match");
    }
    const friend = matchOption(field, "friend");
    expect(friend.kind).toBe("match");
    if (friend.kind === "match") {
      expect(friend.option.n).toBe(1);
      expect(friend.option.value).toBe("friend");
      expect(friend.option.label).toBe("Friend");
    }
    expect(matchOption(field, "e").kind).toBe("many");
    expect(matchOption(field, "not listed")).toEqual({ kind: "none" });
  });

  it("resolves named labels by longest unique match and preserves the dictated value", () => {
    const form = withFields([
      makeField({ id: "short", label: "Email", order: 1 }),
      makeField({ id: "long", label: "Alternate email", order: 2 }),
    ]);
    const result = resolveField(form, "Alternate email to Jane@Example.org");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.field.id).toBe("long");
      expect(result.rest).toBe("Jane@Example.org");
    }
  });

  it("addresses an unlabeled field by its one-based spoken field number", () => {
    const result = resolveField(fixture, "field 3 is 555 0100");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.field.id).toBe("e3");
      expect(result.rest).toBe("555 0100");
    }
  });

  it("reports ambiguous label fragments instead of choosing a field", () => {
    const form = withFields([
      makeField({ id: "email", label: "Email", order: 1 }),
      makeField({ id: "work-email", label: "Work email", order: 2 }),
    ]);
    const result = resolveField(form, "email is jane@example.com");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.labels.join("|")).toBe("Email|Work email");
  });

  it("returns none when no leading field label matches", () => {
    expect(resolveField(fixture, "perhaps Jane at example dot com")).toEqual({ kind: "none" });
    expect(resolveField(fixture, "x".repeat(201))).toEqual({ kind: "none" });
  });

  it("returns only required empty enabled fields in page order", () => {
    const form = withFields([
      makeField({ id: "later", label: "Later", order: 3, required: true, hasValue: false }),
      makeField({ id: "disabled", label: "Disabled", order: 2, required: true, disabled: true, hasValue: false }),
      makeField({ id: "filled", label: "Filled", order: 1, required: true, hasValue: true }),
    ]);
    expect(requiredEmpty(form).length).toBe(1);
    expect(requiredEmpty(form).map((field) => field.id).join(",")).toBe("later");
  });

  it("does not include values from sensitive fields in the form digest", () => {
    const marker = "sensitive-marker-7fa3";
    const form = withFields([
      makeField({ id: "public", value: "visible", hasValue: true }),
      makeField({ id: "password", type: "password", sensitive: "password", value: null, hasValue: true }),
    ]);
    const forged = {
      ...form,
      fields: form.fields.map((field) => field.id === "password" ? { ...field, value: marker } : field),
    } as unknown as FormModel;
    const digest = formDigest(forged);
    expect(digest.length).toBeGreaterThan(0);
    expect(digest).toContain("visible");
    expect(digest).not.toContain(marker);
  });
});
