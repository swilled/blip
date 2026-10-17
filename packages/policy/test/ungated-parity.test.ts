import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ActionKind, isGatedKind } from "@blip/protocol";
import { classifyField, fieldKindForFieldType, isUngatedActionKind } from "@blip/policy/classify";
import * as policy from "../src/index";

describe("policy classifier contract", () => {
  it("re-exports the classifier from the package root", () => {
    expect(policy.classifyField).toBe(classifyField);
    expect(policy.fieldKindForFieldType).toBe(fieldKindForFieldType);
  });

  it("keeps local ungated membership aligned with the frozen protocol", () => {
    for (const kind of ActionKind.options) {
      expect(isUngatedActionKind(kind), kind).toBe(!isGatedKind(kind));
    }
    for (const junk of ["", "unknown", "click", "submit-now", "constructor"]) {
      expect(isUngatedActionKind(junk), junk).toBe(!isGatedKind(junk));
    }
  });

  it("classifies native controls and marks custom widgets unsupported", () => {
    expect(classifyField({ tag: "input", inputType: "email" })).toMatchObject({ kind: "fill", unsupported: false });
    expect(classifyField({ tag: "textarea" })).toMatchObject({ kind: "fill", unsupported: false });
    expect(classifyField({ tag: "select" })).toMatchObject({ kind: "select", unsupported: false });
    expect(classifyField({ tag: "input", inputType: "radio" })).toMatchObject({ kind: "select", unsupported: false });
    expect(classifyField({ tag: "input", inputType: "checkbox" })).toMatchObject({ kind: "check", unsupported: false });
    expect(classifyField({ tag: "input", inputType: "file" })).toMatchObject({ kind: "fill", unsupported: true });
    expect(classifyField({ tag: "div", role: "combobox" })).toMatchObject({ kind: "fill", unsupported: true });
  });

  it("maps the shared field type vocabulary to operations", () => {
    expect(fieldKindForFieldType("select")).toBe("select");
    expect(fieldKindForFieldType("radio-group")).toBe("select");
    expect(fieldKindForFieldType("checkbox")).toBe("check");
    for (const type of ["text", "email", "password", "combobox", "file", "unknown", "junk"]) {
      expect(fieldKindForFieldType(type)).toBe("fill");
    }
  });

  it("keeps the classifier entry point free of runtime package and Node imports", () => {
    const source = readFileSync(new URL("../src/classify.ts", import.meta.url), "utf8");
    expect(source).toMatch(/import type \{ ActionKind \} from "@blip\/protocol"/);
    expect(source).not.toMatch(/from ["'](?:zod|node:)/);
  });
});
