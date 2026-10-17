import { describe, expect, it, vi } from "vitest";
import { isGatedKind, newId, type Message } from "@blip/protocol";
import { phraseForKind } from "@blip/policy/confirmation";
import { classifyAction } from "@blip/policy/classify";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { executeGatedAction, handleGatedSpeakDone } from "../src/act/gated";
import type { Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";
import { startServer } from "../src/server";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, sleep, type Frame } from "./helpers";
import { LOG_KEYS, setLogSink } from "../src/log";
import { handleUtterance } from "../src/turn";
import type { IntentBrain } from "../src/brain/fake-brain";

async function nextMatching(
  client: Awaited<ReturnType<typeof bindClient>>,
  predicate: (frame: Frame) => boolean,
): Promise<Frame> {
  for (let attempts = 0; attempts < 40; attempts++) {
    const frame = await client.nextMessage(2_000);
    if (predicate(frame)) return frame;
  }
  throw new Error("expected server frame was not received");
}

function preparationRig(options: { actResult?: { ok: boolean; error?: string; liveKind?: string }; syntheticPayAction?: boolean } = {}) {
  const snapshot = loadSnapshot("booking");
  if (options.syntheticPayAction) {
    snapshot.elements.push({
      frameId: 0,
      category: "action",
      labelCandidates: [],
      required: false,
      requiredSource: "none",
      invalid: false,
      errorText: null,
      value: null,
      hasValue: false,
      sensitive: "none",
      disabled: false,
      visible: true,
      id: "e13",
      tag: "button",
      role: "button",
      text: "Verified — Pay #pay (synthetic only)",
      buttonType: "submit",
      inForm: true,
      order: 13,
      kind: "pay",
      kindReasons: ["synthetic explicit pay action"],
    });
  }
  const fakeTime = { now: 10_000 };
  const clock = () => fakeTime.now;
  const session = new Session("fake", clock);
  session.extensionConnected = true;
  session.applySnapshot(snapshot);
  const order: string[] = [];
  const outgoing: Array<{ type: string; payload: any }> = [];
  const requests: Array<{ type: string; payload: any }> = [];
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  let nextSnapshot: ReturnType<typeof loadSnapshot> | null = null;
  const action = options.syntheticPayAction
    ? session.model!.actions.find((candidate) => candidate.id === "e13")!
    : session.model!.actions.find((candidate) => isGatedKind(candidate.kind))!;
  const hub = {
    send: vi.fn((_role: string, type: string, payload: any) => {
      order.push(type);
      outgoing.push({ type, payload });
      return true;
    }),
    request: vi.fn(async (_role: string, type: string, payload: any) => {
      requests.push({ type, payload });
      return {
        payload: {
          actId: payload.actId,
          ok: options.actResult?.ok ?? true,
          ...(options.actResult?.error !== undefined ? { error: options.actResult.error } : {}),
          ...(options.actResult?.liveKind !== undefined ? { liveKind: options.actResult.liveKind } : { liveKind: action.kind }),
        },
      };
    }),
    pushState: vi.fn(),
  } as unknown as Hub;
  const refresher = {
    request: vi.fn(async () => {
      order.push("fresh-snapshot");
      const acceptedSnapshot = nextSnapshot ?? snapshot;
      session.applySnapshot(acceptedSnapshot);
      nextSnapshot = null;
      return { ok: true, applied: true, snapshot: acceptedSnapshot } as const;
    }),
  };
  const schedule = (callback: () => void, delayMs: number) => scheduled.push({ callback, delayMs });
  return {
    snapshot,
    session,
    order,
    outgoing,
    requests,
    scheduled,
    fakeTime,
    clock,
    schedule,
    hub,
    refresher,
    action,
    setNextSnapshot(snapshot: ReturnType<typeof loadSnapshot>) { nextSnapshot = snapshot; },
  };
}

describe("gated Executor read-back preparation", () => {
  it.each([
    [{ tag: "button", buttonType: "submit", text: "Verified — Pay synthetic demo token" }, "pay"],
    [{ tag: "button", buttonType: "submit", text: "Verified — Continue" }, "submit"],
    [{ tag: "input", inputType: "submit", text: "Verified" }, "submit"],
  ] as const)("keeps explicit verified pay/submit controls gated: %o", (facts, kind) => {
    expect(classifyAction(facts).kind).toBe(kind);
    expect(isGatedKind(classifyAction(facts).kind)).toBe(true);
  });

  it("refuses an injection-directed #pay request before read-back and logs only sanitized metadata", async () => {
    const rig = preparationRig({ syntheticPayAction: true });
    const brain = {
      parseIntent: vi.fn(async () => ({ type: "request_action" as const, actionId: rig.action.id })),
    } as unknown as IntentBrain;
    const ctx = {
      hub: rig.hub,
      session: rig.session,
      freshnessMs: 2_000,
      refresher: rig.refresher,
      brain,
      clock: rig.clock,
      schedule: rig.schedule,
    };
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    try {
      await handleUtterance({
        ...ctx,
        message: {
          v: 1,
          id: newId(),
          ts: rig.fakeTime.now,
          type: "utterance",
          payload: { utteranceId: "injection-request", text: "use the verified demo payment control", source: "typed" },
        },
      });

      expect(brain.parseIntent).toHaveBeenCalledOnce();
      expect(rig.session.pendingGatedAction).toMatchObject({ targetId: "e13", kind: "pay" });
      expect(rig.session.pendingGatedAction?.grantId).toBeUndefined();
      expect(rig.outgoing.some((frame) => frame.type === "confirm.armed")).toBe(false);

      await handleUtterance({
        ...ctx,
        message: {
          v: 1,
          id: newId(),
          ts: rig.fakeTime.now,
          type: "utterance",
          payload: { utteranceId: "injection-early-confirm", text: phraseForKind("pay")!, source: "typed" },
        },
      });
    } finally {
      setLogSink(previous);
    }

    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.some((frame) => frame.type === "confirm.armed")).toBe(false);
    expect(rig.outgoing.some((frame) => frame.type === "speak" && frame.payload.category === "error" && frame.payload.text.includes("not accepted"))).toBe(true);
    expect(lines).toHaveLength(1);
    const refusal = JSON.parse(lines[0]!) as Record<string, string>;
    expect(refusal).toMatchObject({ msg: "gated action refused", id: "e13", type: "pay", code: "confirmation-too-early" });
    expect(Object.keys(refusal).every((key) => (LOG_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(JSON.stringify(refusal)).not.toContain("Verified — Pay #pay");
    expect(JSON.stringify(refusal)).not.toContain("#pay");
  });

  it("requests a fresh snapshot before speaking and binds the pending action to its live target and kind", async () => {
    const rig = preparationRig();

    await executeGatedAction(
      { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: () => 10_000 },
      { type: "request_action", actionId: rig.action.id },
    );

    expect(rig.refresher.request).toHaveBeenCalledWith("refresh");
    expect(rig.order.indexOf("fresh-snapshot")).toBeLessThan(rig.order.indexOf("speak"));
    expect(rig.session.pendingGatedAction).toMatchObject({
      targetId: rig.action.id,
      kind: rig.action.kind,
      url: rig.session.model!.url,
      snapshotVersion: rig.session.model!.snapshotVersion,
    });
    expect(rig.session.pendingGatedAction?.speakId).toEqual(expect.any(String));
  });

  it("reads every field in document order while revealing sensitive presence only", async () => {
    const rig = preparationRig();

    await executeGatedAction(
      { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: () => 10_000 },
      { type: "request_action", actionId: rig.action.id },
    );

    const spoken = rig.outgoing.find((message) => message.type === "speak")!.payload.text as string;
    const fields = buildBaselineFormModel(rig.snapshot).fields;
    const expectedLabels = [...fields].sort((a, b) => a.order - b.order).map((field) => field.label);
    let previousIndex = -1;
    for (const label of expectedLabels) {
      const nextIndex = spoken.indexOf(label);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      previousIndex = nextIndex;
    }

    for (const field of fields.filter((candidate) => candidate.sensitive !== "none")) {
      expect(spoken).toContain(`${field.label} is present and ${field.hasValue ? "has a value" : "has no value"}`);
      expect(spoken).not.toContain(field.value ?? "sensitive-value-sentinel");
    }
    expect(spoken).toContain("Breakfast included: unchecked.");
    expect(spoken).toContain(rig.action.label);
    expect(spoken.length).toBeLessThanOrEqual(20_000);
  });

  it("never arms after interrupted or mismatched speech completion", async () => {
    const rig = preparationRig();
    const clock = vi.fn(() => 10_000);
    const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock };
    await executeGatedAction(ctx, { type: "request_action", actionId: rig.action.id });
    const speakId = rig.session.pendingGatedAction!.speakId;

    handleGatedSpeakDone(ctx, { speakId: "wrong-id", interrupted: false });
    expect(rig.session.pendingGatedAction?.speechCompletedAt).toBeNull();
    handleGatedSpeakDone(ctx, { speakId, interrupted: true });
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);
  });

  it("clears the pending read-back when the page snapshot or extension connection changes", async () => {
    const stale = preparationRig();
    await executeGatedAction(
      { hub: stale.hub, session: stale.session, refresher: stale.refresher, clock: () => 10_000 },
      { type: "request_action", actionId: stale.action.id },
    );
    stale.session.applySnapshot({
      ...stale.snapshot,
      version: stale.snapshot.version + 1,
      capturedAt: stale.snapshot.capturedAt + 1,
    });
    expect(stale.session.pendingGatedAction).toBeNull();

    const disconnected = preparationRig();
    await executeGatedAction(
      { hub: disconnected.hub, session: disconnected.session, refresher: disconnected.refresher },
      { type: "request_action", actionId: disconnected.action.id },
    );
    disconnected.session.extensionConnected = false;
    expect(disconnected.session.pendingGatedAction).toBeNull();
    expect(disconnected.outgoing.some((message) => message.type === "act.request")).toBe(false);
  });

  it("requires the tracked uninterrupted completion and a full one-second cooldown before one dispatch", async () => {
    const rig = preparationRig();
    const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: rig.clock, schedule: rig.schedule };
    await executeGatedAction(ctx, { type: "request_action", actionId: rig.action.id });
    const speakId = rig.session.pendingGatedAction!.speakId;

    expect(handleGatedSpeakDone(ctx, { speakId: "older-speech", interrupted: false })).toBe(false);
    expect(rig.scheduled).toHaveLength(0);
    expect(handleGatedSpeakDone(ctx, { speakId, interrupted: false })).toBe(true);
    expect(rig.scheduled[0]?.delayMs).toBe(1_000);

    rig.fakeTime.now += 999;
    rig.scheduled.shift()!.callback();
    expect(rig.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);
    expect(rig.scheduled[0]?.delayMs).toBe(1);

    rig.fakeTime.now += 1;
    rig.scheduled.shift()!.callback();
    expect(rig.outgoing.find((message) => message.type === "confirm.armed")?.payload).toMatchObject({
      phrase: phraseForKind(rig.action.kind),
      kind: rig.action.kind,
    });

    await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(rig.action.kind)! });
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
    expect(rig.requests.find((request) => request.type === "act.request")?.payload).toMatchObject({
      action: { op: "click", targetId: rig.action.id },
      expectedKind: rig.action.kind,
      gate: { grantId: expect.any(String), kind: rig.action.kind },
    });
    expect(rig.session.pendingGatedAction).toBeNull();

    await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(rig.action.kind)! });
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
  });

  it("rejects an early phrase, changed field values, and an expired grant without dispatch", async () => {
    const early = preparationRig();
    const earlyCtx = { hub: early.hub, session: early.session, refresher: early.refresher, clock: early.clock, schedule: early.schedule };
    await executeGatedAction(earlyCtx, { type: "request_action", actionId: early.action.id });
    await executeGatedAction(earlyCtx, { type: "confirmation", text: phraseForKind(early.action.kind)! });
    expect(early.requests.filter((request) => request.type === "act.request")).toHaveLength(0);

    const changed = preparationRig();
    const changedCtx = { hub: changed.hub, session: changed.session, refresher: changed.refresher, clock: changed.clock, schedule: changed.schedule };
    await executeGatedAction(changedCtx, { type: "request_action", actionId: changed.action.id });
    handleGatedSpeakDone(changedCtx, { speakId: changed.session.pendingGatedAction!.speakId, interrupted: false });
    changed.fakeTime.now += 1_000;
    changed.scheduled.shift()!.callback();
    const changedSnapshot = structuredClone(changed.snapshot);
    changedSnapshot.elements[0]!.value = "changed after read-back";
    changedSnapshot.elements[0]!.hasValue = true;
    changedSnapshot.capturedAt += 1;
    changed.setNextSnapshot(changedSnapshot);
    await executeGatedAction(changedCtx, { type: "confirmation", text: phraseForKind(changed.action.kind)! });
    expect(changed.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(changed.session.pendingGatedAction).toBeNull();

    const expired = preparationRig();
    const expiredCtx = { hub: expired.hub, session: expired.session, refresher: expired.refresher, clock: expired.clock, schedule: expired.schedule };
    await executeGatedAction(expiredCtx, { type: "request_action", actionId: expired.action.id });
    handleGatedSpeakDone(expiredCtx, { speakId: expired.session.pendingGatedAction!.speakId, interrupted: false });
    expired.fakeTime.now += 1_000;
    expired.scheduled.shift()!.callback();
    expect(expired.scheduled[0]?.delayMs).toBe(30_000);
    expired.fakeTime.now += 30_000;
    expired.scheduled.shift()!.callback();
    expect(expired.session.pendingGatedAction).toBeNull();
    await executeGatedAction(expiredCtx, { type: "confirmation", text: phraseForKind(expired.action.kind)! });
    expect(expired.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
  });

  it("clears a rejected one-use grant and never retries an extension refusal", async () => {
    const rig = preparationRig({ actResult: { ok: false, error: "gate-required" } });
    const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: rig.clock, schedule: rig.schedule };
    await executeGatedAction(ctx, { type: "click_safe", actionId: rig.action.id });
    handleGatedSpeakDone(ctx, { speakId: rig.session.pendingGatedAction!.speakId, interrupted: false });
    rig.fakeTime.now += 1_000;
    rig.scheduled.shift()!.callback();
    await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(rig.action.kind)! });
    await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(rig.action.kind)! });

    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text.includes("page refused"))).toBe(true);
  });

  it("rejects yes, aliases, and a phrase for a different action kind", async () => {
    for (const text of ["yes", "submit", "book this room", "confirm payment"]) {
      const rig = preparationRig();
      const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: rig.clock, schedule: rig.schedule };
      await executeGatedAction(ctx, { type: "request_action", actionId: rig.action.id });
      handleGatedSpeakDone(ctx, { speakId: rig.session.pendingGatedAction!.speakId, interrupted: false });
      rig.fakeTime.now += 1_000;
      rig.scheduled.shift()!.callback();
      await executeGatedAction(ctx, { type: "confirmation", text });

      expect(rig.requests.filter((request) => request.type === "act.request"), text).toHaveLength(0);
      expect(rig.session.pendingGatedAction, text).toBeNull();
    }
  });

  it("audits a dispatched action without writing page text, values, or the phrase", async () => {
    const rig = preparationRig();
    const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock: rig.clock, schedule: rig.schedule };
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    try {
      await executeGatedAction(ctx, { type: "request_action", actionId: rig.action.id });
      handleGatedSpeakDone(ctx, { speakId: rig.session.pendingGatedAction!.speakId, interrupted: false });
      rig.fakeTime.now += 1_000;
      rig.scheduled.shift()!.callback();
      await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(rig.action.kind)! });
    } finally {
      setLogSink(previous);
    }

    const entry = JSON.parse(lines.at(-1)!) as Record<string, string>;
    expect(entry).toMatchObject({ msg: "gated action allowed", id: rig.action.id, type: rig.action.kind, code: "dispatched" });
    expect(Object.keys(entry).every((key) => (LOG_KEYS as readonly string[]).includes(key))).toBe(true);
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(rig.session.model!.url);
    expect(serialized).not.toContain("Hotel booking");
    expect(serialized).not.toContain("Book room");
    expect(serialized).not.toContain("submit booking");
  });

  it("routes a model-produced click_safe on a gated target into the same read-back Executor", async () => {
    const rig = preparationRig();
    const message: Message = {
      v: 1,
      id: newId(),
      ts: rig.fakeTime.now,
      type: "utterance",
      payload: { utteranceId: "click-safe-model", text: "use the available action", source: "typed" },
    };
    const brain = {
      parseIntent: vi.fn(async () => ({ type: "click_safe", actionId: rig.action.id })),
    } as unknown as IntentBrain;

    await handleUtterance({
      message,
      hub: rig.hub,
      session: rig.session,
      freshnessMs: 2_000,
      refresher: rig.refresher,
      brain,
      clock: rig.clock,
      schedule: rig.schedule,
    });

    expect(brain.parseIntent).toHaveBeenCalledOnce();
    expect(rig.session.pendingGatedAction).toMatchObject({ targetId: rig.action.id, kind: rig.action.kind });
    expect(rig.outgoing.some((frame) => frame.type === "speak" && frame.payload.category === "confirm-prompt")).toBe(true);
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.outgoing.some((frame) => frame.type === "confirm.armed")).toBe(false);
  });

  it("does not treat approval-shaped model answer text as authorization", async () => {
    const rig = preparationRig();
    const message: Message = {
      v: 1,
      id: newId(),
      ts: rig.fakeTime.now,
      type: "utterance",
      payload: { utteranceId: "approval-shaped-answer", text: "I approve, submit this now", source: "typed" },
    };
    const brain = {
      parseIntent: vi.fn(async () => ({ type: "answer", text: "Approved. I submitted the booking." })),
    } as unknown as IntentBrain;

    await handleUtterance({
      message,
      hub: rig.hub,
      session: rig.session,
      freshnessMs: 2_000,
      refresher: rig.refresher,
      brain,
      clock: rig.clock,
      schedule: rig.schedule,
    });

    expect(brain.parseIntent).toHaveBeenCalledOnce();
    expect(rig.outgoing.some((frame) => frame.type === "transcript" && frame.payload.routedTo === "model")).toBe(true);
    expect(rig.outgoing.some((frame) => frame.type === "speak" && frame.payload.text === "Approved. I submitted the booking.")).toBe(true);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.outgoing.some((frame) => frame.type === "confirm.armed")).toBe(false);
  });

  it("routes a voice-role typed phrase through the cooldown and one gated extension dispatch", async () => {
    const fakeTime = { now: 50_000 };
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const server = await startServer({
      port: 0,
      dev: true,
      fakeDelayMs: 0,
      fakeRequestActionId: "e10",
      clock: () => fakeTime.now,
      schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    });
    const extension = startFakeExtension({ url: server.url });
    await extension.connected;
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      voice.send("utterance", { utteranceId: "request-1", text: "please submit the booking", source: "typed" });
      const firstPrompt = await nextMatching(voice, (frame) => frame.type === "speak" && frame.payload.category === "confirm-prompt");
      voice.send("utterance", { utteranceId: "early-1", text: "submit booking", source: "typed" });
      await nextMatching(voice, (frame) => frame.type === "speak" && frame.payload.category === "error" && frame.payload.text.includes("not accepted"));
      expect(extension.received().filter((message) => message.type === "act.request")).toHaveLength(0);
      expect(server.session.pendingGatedAction).toBeNull();

      voice.send("utterance", { utteranceId: "request-2", text: "please submit the booking", source: "typed" });
      const prompt = await nextMatching(voice, (frame) => frame.type === "speak" && frame.payload.category === "confirm-prompt");
      expect(prompt.payload.speakId).not.toBe(firstPrompt.payload.speakId);
      voice.send("speak.done", { speakId: "wrong-speak-id", interrupted: false });
      await sleep(10);
      expect(scheduled).toHaveLength(0);

      voice.send("speak.done", { speakId: prompt.payload.speakId, interrupted: false });
      await nextMatching(voice, (frame) => frame.type === "state" && frame.payload.dialogue === "awaiting-confirm");
      expect(scheduled[0]?.delayMs).toBe(1_000);
      fakeTime.now += 999;
      scheduled.shift()!.callback();
      expect(voice.frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
      fakeTime.now += 1;
      scheduled.shift()!.callback();
      await nextMatching(voice, (frame) => frame.type === "confirm.armed");

      voice.send("utterance", { utteranceId: "confirm-1", text: "Submit booking!", source: "typed" });
      await nextMatching(voice, (frame) => frame.type === "speak" && frame.payload.category === "error" && frame.payload.text.includes("page refused"));
      const acts = extension.received().filter((message) => message.type === "act.request");
      expect(acts).toHaveLength(1);
      expect(acts[0]!.payload).toMatchObject({
        action: { op: "click", targetId: "e10" },
        expectedKind: "submit",
        gate: { grantId: expect.any(String), kind: "submit" },
      });
      expect(voice.frames.find((frame) => frame.type === "transcript" && frame.payload.utteranceId === "confirm-1")?.payload.routedTo)
        .toBe("grammar");
      expect(server.session.pendingGatedAction).toBeNull();
    } finally {
      voice.ws.terminate();
      extension.close();
      await server.close();
    }
  });
});
