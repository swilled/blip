import { describe, expect, it } from "vitest";
import type { ActionKind, FormModel } from "@blip/protocol";
import { setLogSink } from "../src/log";
import { createGrantStore, type GrantBinding } from "../src/act/grants";

const emailField: FormModel["fields"][number] = {
  id: "email",
  role: "textbox",
  type: "email",
  label: "Email",
  labelSource: "label",
  confidence: 1,
  required: true,
  value: "person@example.test",
  hasValue: true,
  sensitive: "none",
  error: null,
  disabled: false,
  order: 3,
};

const cardField: FormModel["fields"][number] = {
  id: "card",
  role: "textbox",
  type: "text",
  label: "Card number",
  labelSource: "label",
  confidence: 1,
  required: true,
  value: null,
  hasValue: true,
  sensitive: "card-number",
  error: null,
  disabled: false,
  order: 1,
};

function makeModel(overrides: Partial<FormModel> = {}): FormModel {
  return {
    snapshotVersion: 7,
    structuralHash: "structure-7",
    url: "https://example.test/booking?step=2",
    title: "Booking",
    fields: [emailField, cardField],
    actions: [],
    groups: [],
    pageErrors: [],
    repairStatus: "baseline",
    ...overrides,
  };
}

function makeBinding(overrides: Partial<GrantBinding> = {}): GrantBinding {
  return {
    targetId: "submit-1",
    kind: "submit",
    model: makeModel(),
    ...overrides,
  };
}

function armedId(store: ReturnType<typeof createGrantStore>, binding: GrantBinding): string {
  const armed = store.arm(binding);
  expect(armed).not.toBeNull();
  return armed!.grantId;
}

describe("createGrantStore", () => {
  it("creates a 30-second grant and consumes it exactly once", () => {
    const now = 1_000;
    const store = createGrantStore(() => now);
    const binding = makeBinding();
    const armed = store.arm(binding);

    expect(armed).toMatchObject({ expiresAt: now + 30_000 });
    expect(armed?.grantId).toEqual(expect.any(String));
    expect(store.consume(armed!.grantId, binding)).toBe(true);
    expect(store.consume(armed!.grantId, binding)).toBe(false);
  });

  it.each([
    [29_999, true],
    [30_000, false],
  ])("expires at exactly 30 seconds (age %i ms)", (age, expected) => {
    let now = 50_000;
    const store = createGrantStore(() => now);
    const binding = makeBinding();
    const grantId = armedId(store, binding);

    now += age;
    expect(store.consume(grantId, binding)).toBe(expected);
  });

  it.each([
    ["target", (binding: GrantBinding) => ({ ...binding, targetId: "other-target" })],
    ["kind", (binding: GrantBinding) => ({ ...binding, kind: "pay" as ActionKind })],
    ["exact URL", (binding: GrantBinding) => ({ ...binding, model: makeModel({ url: `${binding.model.url}#changed` }) })],
    ["snapshot version", (binding: GrantBinding) => ({ ...binding, model: makeModel({ snapshotVersion: binding.model.snapshotVersion + 1 }) })],
    ["non-sensitive value", (binding: GrantBinding) => ({
      ...binding,
      model: makeModel({ fields: binding.model.fields.map((field) => field.id === "email" ? { ...field, value: "changed@example.test" } : field) }),
    })],
    ["field presence", (binding: GrantBinding) => ({
      ...binding,
      model: makeModel({ fields: binding.model.fields.map((field) => field.id === "card" ? { ...field, hasValue: false } : field) }),
    })],
    ["field document order", (binding: GrantBinding) => ({
      ...binding,
      model: makeModel({ fields: binding.model.fields.map((field) => field.id === "email" ? { ...field, order: 0 } : field) }),
    })],
  ] as const)("clears and refuses a grant after a %s mismatch", (_name, changeBinding) => {
    const store = createGrantStore(() => 100);
    const original = makeBinding();
    const grantId = armedId(store, original);

    expect(store.consume(grantId, changeBinding(original))).toBe(false);
    expect(store.consume(grantId, original)).toBe(false);
  });

  it("encodes fields in document order rather than caller array order", () => {
    const store = createGrantStore(() => 100);
    const original = makeBinding();
    const grantId = armedId(store, original);
    const reordered = makeBinding({ model: makeModel({ fields: [...original.model.fields].reverse() }) });

    expect(store.consume(grantId, reordered)).toBe(true);
  });

  it("does not grant ungated kinds and supports explicit clearing", () => {
    const store = createGrantStore(() => 100);
    expect(store.arm(makeBinding({ kind: "fill" }))).toBeNull();

    const binding = makeBinding();
    const grantId = armedId(store, binding);
    store.clear(grantId);
    expect(store.consume(grantId, binding)).toBe(false);
  });

  it("excludes sensitive values from fingerprints, serialized state, and logs", () => {
    const secret = "4111111111111111";
    const changedSecret = "5555555555554444";
    const originalModel = makeModel({
      fields: [emailField, { ...cardField, value: secret }],
    });
    const changedSensitiveModel = makeModel({
      fields: [emailField, { ...cardField, value: changedSecret }],
    });
    const original = makeBinding({ model: originalModel });
    const changedSensitive = makeBinding({ model: changedSensitiveModel });
    const store = createGrantStore(() => 100);
    const lines: string[] = [];
    const previousSink = setLogSink((line) => lines.push(line));

    try {
      const armed = store.arm(original);
      expect(armed).not.toBeNull();
      expect(JSON.stringify({ store, armed })).not.toContain(secret);
      expect(JSON.stringify({ store, armed })).not.toContain(changedSecret);
      expect(store.consume(armed!.grantId, changedSensitive)).toBe(true);
    } finally {
      setLogSink(previousSink);
    }

    expect(lines).toEqual([]);
  });
});
