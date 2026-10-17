import { readFileSync } from "node:fs";
import { FormModel } from "@blip/protocol";
import { describe, expect, it } from "vitest";
import surveyModelJson from "../../../fixtures/forms/survey-form.model.json" with { type: "json" };

const html = readFileSync(new URL("../../../fixtures/forms/broken.html", import.meta.url), "utf8");

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

describe("broken survey form", () => {
  it("keeps the page deliberately broken, client-only, and empty on every load", () => {
    const forms = html.match(/<form\b[^>]*>/gi) ?? [];
    expect(forms).toHaveLength(1);
    const form = forms[0];
    if (form === undefined) throw new Error("Expected the broken form fixture to contain one form");
    expect(form).not.toMatch(/\bmethod\s*=\s*["']?post\b/i);
    expect(attribute(form, "autocomplete")).toBe("off");
    expect(form).toMatch(/\bnovalidate(?:\s|>|$)/i);

    const roleButtons = html.match(/<div\b[^>]*\brole=["']button["'][^>]*>/gi) ?? [];
    expect(roleButtons).toHaveLength(2);
    expect(html).not.toMatch(/<button\b|<input\b[^>]*\btype=["']submit["']/i);

    const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map(([tag]) => tag);
    const phone = inputs.find((input) => attribute(input, "autocomplete") === "tel");
    expect(phone).toBeDefined();
    expect(phone).toMatch(/\brequired(?:\s|>|$)/i);
    const radios = inputs.filter((input) => attribute(input, "type") === "radio");
    expect(radios).toHaveLength(3);
    expect(new Set(radios.map((input) => attribute(input, "name")))).toEqual(new Set(["satisfaction"]));
    expect(html).not.toMatch(/<fieldset\b|<legend\b/i);

    const selects = [...html.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)].map(([select]) => select);
    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatch(/<option\b[^>]*\bvalue\s*=\s*(?:""|'')/i);

    const labelsFor = new Set(
      [...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/gi)].map(([, id]) => id),
    );
    const unlabelledInput = inputs.some((input) => {
      const id = attribute(input, "id");
      const position = html.indexOf(input);
      const before = html.slice(0, position);
      const after = html.slice(position + input.length);
      const insideLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label") && after.includes("</label>");
      return !attribute(input, "placeholder") &&
        !attribute(input, "aria-label") &&
        !(id && labelsFor.has(id)) &&
        !insideLabel;
    });
    expect(unlabelledInput).toBe(true);

    const logicalFieldCount = inputs.filter((input) => attribute(input, "type") !== "radio").length +
      (radios.length > 0 ? 1 : 0) + selects.length;
    expect(logicalFieldCount).toBe(6);
    expect((html.match(/\bautocomplete\s*=\s*["']off["']/gi) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(html).toMatch(/role=["']alert["'][^>]*hidden[^>]*>Some answers need attention<\/div>/i);
    expect(html).toMatch(/\.invalid\s*\{\s*border-color:\s*#c00\s*;\s*\}/i);
    expect(html).toMatch(/DOMContentLoaded/);
    expect(html).toMatch(/pageshow/);
    expect(html).toMatch(/setTimeout\(resetForm,\s*0\)/);
    expect(html).toMatch(/form\.reset\(\)/);
    expect(html).not.toMatch(/localStorage/i);
    expect(html.toLowerCase()).not.toContain("submit survey");
    expect(html).not.toMatch(/>\s*yes\s*</i);
  });
});

describe("generated survey form model", () => {
  const model = FormModel.parse(surveyModelJson);

  it("preserves the six survey fields and fail-closed submit action", () => {
    expect(model.fields).toHaveLength(6);
    expect(model.fields.some((field) => field.label === "")).toBe(true);

    const select = model.fields.find((field) => field.type === "select");
    expect(select?.options?.some((option) => option.value === "")).toBe(true);

    const radios = model.fields.find((field) => field.type === "radio-group");
    expect(radios?.options).toHaveLength(3);

    expect(model.fields.filter((field) => field.required && !field.hasValue).length).toBeGreaterThanOrEqual(2);
    expect(model.actions.filter((action) => action.primary && action.kind === "submit")).toHaveLength(1);
    expect(model.actions.filter((action) => action.primary)).toHaveLength(1);
  });
});
