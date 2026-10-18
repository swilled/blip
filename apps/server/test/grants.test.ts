import { describe, expect, it } from "vitest";
import type { ActionKind, BrowserPageIdentity, FormModel } from "@blip/protocol";
import { setLogSink } from "../src/log";
import { createGrantStore, type GrantBinding, type PageTaskSendBinding } from "../src/act/grants";

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

const sourceIdentity: BrowserPageIdentity = {
  captureId: "send-capture-1",
  captureRevision: 4,
  tabId: 9,
  pageUrl: "https://example.test/messages",
};

function taskBinding(overrides: Partial<PageTaskSendBinding> = {}): PageTaskSendBinding {
  return {
    taskId: "draft-task-1",
    draftHash: "a".repeat(64),
    recipientFieldId: "recipient-field",
    recipientValueHash: "b".repeat(64),
    sourceItemId: "visible-message-1",
    sourceIdentity,
    tabId: 9,
    operation: "send",
    targetId: "send-button",
    targetKind: "send",
    speakId: "final-readback-1",
    ...overrides,
  };
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

  it("returns an opaque dispatch proof only after consuming the exact live grant", () => {
    const store = createGrantStore(() => 100);
    const binding = makeBinding();
    const grantId = armedId(store, binding);
    const proof = store.consumeForDispatch(grantId, binding, 9);

    expect(proof).toMatchObject({
      grantId,
      targetId: binding.targetId,
      kind: binding.kind,
      tabId: 9,
      snapshotVersion: binding.model.snapshotVersion,
    });
    expect(store.isConsumedGrant(proof)).toBe(true);
    expect(store.consumeForDispatch(grantId, binding, 9)).toBeNull();

    const copiedMetadata = { ...proof! };
    expect(store.isConsumedGrant(copiedMetadata)).toBe(false);
    expect(createGrantStore(() => 100).isConsumedGrant(proof)).toBe(false);
  });

  it("does not produce a dispatch proof for a changed live binding", () => {
    const store = createGrantStore(() => 100);
    const binding = makeBinding();
    const grantId = armedId(store, binding);
    const changed = makeBinding({ targetId: "other-submit" });

    expect(store.consumeForDispatch(grantId, changed, 9)).toBeNull();
    expect(store.consumeForDispatch(grantId, binding, 9)).toBeNull();
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

  it.each([
    ["task id", (task: PageTaskSendBinding) => ({ ...task, taskId: "draft-task-2" })],
    ["draft hash", (task: PageTaskSendBinding) => ({ ...task, draftHash: "c".repeat(64) })],
    ["recipient field id", (task: PageTaskSendBinding) => ({ ...task, recipientFieldId: "other-recipient" })],
    ["recipient value hash", (task: PageTaskSendBinding) => ({ ...task, recipientValueHash: "d".repeat(64) })],
    ["source item id", (task: PageTaskSendBinding) => ({ ...task, sourceItemId: "visible-message-2" })],
    ["source capture id", (task: PageTaskSendBinding) => ({ ...task, sourceIdentity: { ...task.sourceIdentity, captureId: "send-capture-2" } })],
    ["source capture revision", (task: PageTaskSendBinding) => ({ ...task, sourceIdentity: { ...task.sourceIdentity, captureRevision: task.sourceIdentity.captureRevision + 1 } })],
    ["source tab id", (task: PageTaskSendBinding) => ({ ...task, tabId: task.tabId + 1, sourceIdentity: { ...task.sourceIdentity, tabId: task.tabId + 1 } })],
    ["source page URL", (task: PageTaskSendBinding) => ({ ...task, sourceIdentity: { ...task.sourceIdentity, pageUrl: "https://example.test/other" } })],
    ["operation", (task: PageTaskSendBinding) => ({ ...task, operation: "reply" as PageTaskSendBinding["operation"] })],
    ["action target id", (task: PageTaskSendBinding) => ({ ...task, targetId: "other-send-button" })],
    ["action target kind", (task: PageTaskSendBinding) => ({ ...task, targetKind: "submit" as PageTaskSendBinding["targetKind"] })],
    ["tracked speak id", (task: PageTaskSendBinding) => ({ ...task, speakId: "another-readback" })],
  ] as const)("rejects a page-task grant when its %s changes", (_name, changeTask) => {
    const store = createGrantStore(() => 100);
    const pageTask = taskBinding();
    const binding = makeBinding({
      kind: "send",
      targetId: pageTask.targetId,
      model: makeModel({ url: sourceIdentity.pageUrl }),
      pageTask,
    });
    const grantId = armedId(store, binding);
    const changedTask = changeTask(pageTask) as PageTaskSendBinding;
    const changed = makeBinding({
      kind: "send",
      targetId: changedTask.targetId,
      model: makeModel({ url: sourceIdentity.pageUrl }),
      pageTask: changedTask,
    });

    expect(store.consume(grantId, changed)).toBe(false);
    expect(store.consume(grantId, binding)).toBe(false);
  });

  it("stores only hashes for page-task draft and recipient values", () => {
    const task = taskBinding();
    expect(JSON.stringify(task)).not.toContain("The final message text");
    expect(JSON.stringify(task)).not.toContain("alex@example.test");
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
