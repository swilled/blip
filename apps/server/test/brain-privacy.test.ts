import { describe, expect, it, vi } from "vitest";
import type { Field, FormModel } from "@blip/protocol";
import { buildBaselineFormModel } from "../src/baseline";
import { decideUtteranceForBrain } from "../src/brain/claude/privacy";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";

function booking(): FormModel {
  return buildBaselineFormModel(loadSnapshot("booking"));
}

function ordinaryBooking(): FormModel {
  const model = booking();
  return { ...model, fields: model.fields.filter((field) => field.sensitive === "none" && field.type !== "password") };
}

function withField(model: FormModel, changes: Partial<Field> & Pick<Field, "id" | "label" | "type" | "sensitive">): FormModel {
  const template = model.fields[0]!;
  return {
    ...model,
    fields: [
      ...model.fields,
      { ...template, ...changes, role: "textbox", value: null, hasValue: false, order: model.fields.length },
    ],
  };
}

describe("pre-provider utterance privacy", () => {
  it("redacts recognized fill and select values before they can reach a provider", () => {
    const fill = decideUtteranceForBrain("fill Full name with PrivateName-314", booking());
    expect(fill).toEqual({ kind: "redacted-command", providerText: "fill Full name with [value omitted]" });
    expect(JSON.stringify(fill)).not.toContain("PrivateName-314");

    const select = decideUtteranceForBrain("select private-option-928 for Room type", booking());
    expect(select).toEqual({ kind: "redacted-command", providerText: "select [option omitted] for Room type" });
    expect(JSON.stringify(select)).not.toContain("private-option-928");
  });

  it("withholds valid and mistyped card shapes and SSNs before provider invocation", () => {
    for (const utterance of [
      "use 4111 1111 1111 1111",
      "use 4111 1111 1111 1112",
      "use 078-05-1120",
    ]) {
      expect(decideUtteranceForBrain(utterance, booking()).kind).toBe("withhold-and-handoff");
    }

    const cardField = withField(ordinaryBooking(), {
      id: "card-number",
      label: "Credit card number",
      type: "text",
      sensitive: "card-number",
    });
    expect(decideUtteranceForBrain("4111 1111 1111 1111", cardField)).toMatchObject({
      kind: "withhold-and-handoff",
      handoff: { kind: "focus-and-type", fieldId: "card-number", fieldLabel: "Credit card number" },
    });
  });

  it.each([
    ["my password is", "my password is offline-password-sentinel-947"],
    ["password colon", "password: offline-password-sentinel-947"],
    ["password equals", "password=offline-password-sentinel-947"],
  ])("withholds clearly labeled password input (%s)", (_pattern, utterance) => {
    const model = withField(ordinaryBooking(), {
      id: "account-password",
      label: "Account password",
      type: "password",
      sensitive: "password",
    });
    expect(decideUtteranceForBrain(utterance, model)).toMatchObject({
      kind: "withhold-and-handoff",
      handoff: {
        kind: "focus-and-type",
        fieldId: "account-password",
        fieldLabel: "Account password",
      },
    });
    expect(JSON.stringify(decideUtteranceForBrain(utterance, model)))
      .not.toContain("offline-password-sentinel-947");
  });

  it("keeps a unique secret sentinel out of provider, diagnostics, speech, and repair-cache bytes", async () => {
    const sentinel = "offline-password-sentinel-947";
    const model = withField(ordinaryBooking(), {
      id: "account-password",
      label: "Account password",
      type: "password",
      sensitive: "password",
    });
    const provider = { parseIntent: vi.fn(async (text: string) => ({ type: "answer", text })) };
    const diagnostics: string[] = [];
    const speech: string[] = [];
    const focus = vi.fn();
    const repairCache = {
      writes: [] as Uint8Array[],
      serialize: () => new TextEncoder().encode(JSON.stringify({ origin: "https://forms.test", fields: [] })),
      write(bytes: Uint8Array) { this.writes.push(bytes); },
    };

    const decision = decideUtteranceForBrain(`my password is ${sentinel}`, model);
    diagnostics.push(`privacy decision: ${decision.kind}`);
    if (decision.kind === "withhold-and-handoff") {
      if (decision.handoff.kind === "focus-and-type") focus(decision.handoff.fieldId);
      speech.push(decision.handoff.spokenText);
    } else {
      await provider.parseIntent(decision.providerText);
    }
    const cacheBytes = repairCache.serialize();
    const captured = [
      ...provider.parseIntent.mock.calls.flatMap(([text]) => [text]),
      ...diagnostics,
      ...speech,
      new TextDecoder().decode(cacheBytes),
    ].join("\n");

    expect(decision.kind).toBe("withhold-and-handoff");
    expect(provider.parseIntent).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("account-password");
    expect(captured).not.toContain(sentinel);
    expect(repairCache.writes).toEqual([]);
  });

  it("returns a value-free clarification when no unique target field can be resolved", () => {
    const noPasswordField = ordinaryBooking();
    const noMatch = decideUtteranceForBrain("my password is private-value-11", noPasswordField);
    expect(noMatch).toEqual({
      kind: "withhold-and-handoff",
      handoff: { kind: "clarify", spokenText: "Please restate the field label without its value." },
    });

    const onePassword = withField(noPasswordField, {
      id: "another-password",
      label: "Other password",
      type: "password",
      sensitive: "password",
    });
    const ambiguous = withField(onePassword, {
      id: "third-password",
      label: "Backup password",
      type: "password",
      sensitive: "password",
    });
    const ambiguousResult = decideUtteranceForBrain("password=private-value-12", ambiguous);
    expect(ambiguousResult).toMatchObject({ kind: "withhold-and-handoff", handoff: { kind: "clarify" } });
    expect(JSON.stringify(ambiguousResult)).not.toContain("private-value-12");
  });
});
