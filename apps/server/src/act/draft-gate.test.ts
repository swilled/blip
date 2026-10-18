import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { phraseForKind } from "@blip/policy/confirmation";
import { createGatePort } from "./gate-port";
import { createVoiceGateAdapter } from "./voice-gate-adapter";
import { executeGatedAction, handleGatedSpeakDone } from "./gated";
import type { Hub } from "../hub/hub";
import { Session } from "../session/session";
import type { Refresher } from "../session/refresh";
import { handleUtterance } from "../turn";

const RECIPIENT = "alex@example.test";
const OBSERVED_DRAFT = "I can meet Friday at noon.";
const SOURCE_TEXT = "Could we move our check-in to Friday?";

function setField(snapshot: Snapshot, id: string, value: string): void {
  const element = snapshot.elements.find((candidate) => candidate.id === id);
  if (element === undefined) throw new Error(`missing fixture field ${id}`);
  element.value = value;
  element.hasValue = true;
}

function makeAction(id = "send-1", visible = true): Snapshot["elements"][number] {
  return {
    frameId: 0,
    category: "action",
    labelCandidates: [{ text: "Send message", source: "aria", confidence: 0.95 }],
    required: false,
    requiredSource: "none",
    invalid: false,
    errorText: null,
    value: null,
    hasValue: false,
    sensitive: "none",
    disabled: false,
    visible,
    id,
    tag: "button",
    role: "button",
    text: "Send message",
    buttonType: "button",
    inForm: false,
    order: 20,
    kind: "send",
    kindReasons: ["synthetic visible send action"],
  };
}

function makeRig(options: {
  visibleSend?: boolean;
  duplicateSend?: boolean;
  postActConfirmed?: boolean;
  postActWrongTab?: boolean;
} = {}) {
  const snapshot = loadSnapshot("booking");
  setField(snapshot, "e2", RECIPIENT);
  setField(snapshot, "e8", OBSERVED_DRAFT);
  snapshot.elements.push(makeAction("send-1", options.visibleSend ?? true));
  if (options.duplicateSend) snapshot.elements.push(makeAction("send-2", true));

  const fakeTime = { now: 50_000 };
  const session = new Session("fake", () => fakeTime.now);
  session.extensionConnected = true;
  session.applySnapshot(snapshot);
  const identity = {
    captureId: "message-capture-1",
    captureRevision: 1,
    tabId: snapshot.tabId,
    pageUrl: snapshot.url,
  };
  const item = {
    itemId: "message-item-1",
    text: SOURCE_TEXT,
    visibleDate: null,
    identity,
    frameId: 0,
  };
  session.applyBrowserCapture({ identity, blocks: [], items: [item], links: [] });
  const recipient = session.model!.fields.find((field) => field.id === "e2")!;
  expect(session.setActivePageTask({
    taskId: "send-task-1",
    identity,
    itemId: item.itemId,
    frameId: 0,
    sourceExcerpt: item.text,
    taskKind: "draft",
    draftTargetId: "e8",
    recipientBinding: {
      fieldId: recipient.id,
      valueHash: createHash("sha256").update(recipient.value!, "utf8").digest("hex"),
    },
    actionTargetBinding: null,
    lastObservedDraftValue: OBSERVED_DRAFT,
    associatedGrantId: null,
  })).toBe(true);

  const outgoing: Array<{ type: string; payload: any }> = [];
  const requests: Array<{ type: string; payload: any }> = [];
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  const hub = {
    send: vi.fn((_role: string, type: string, payload: any) => {
      outgoing.push({ type, payload });
      return true;
    }),
    request: vi.fn(async (_role: string, type: string, payload: any) => {
      requests.push({ type, payload });
      return {
        payload: {
          actId: payload.actId,
          ok: true,
          liveKind: "send",
        },
      };
    }),
    pushState: vi.fn(),
  } as unknown as Hub;

  let nextRefreshSnapshot: Snapshot | null = null;
  const refresher = {
    request: vi.fn(async (reason: "refresh" | "post-act") => {
      const accepted = reason === "post-act"
        ? {
          ...structuredClone(snapshot),
          ...(options.postActWrongTab ? { tabId: snapshot.tabId + 1 } : {}),
          capturedAt: snapshot.capturedAt + 2,
          headings: options.postActConfirmed === false ? snapshot.headings : [
            ...snapshot.headings,
            { level: 2, text: "Message successfully sent." },
          ],
        }
        : nextRefreshSnapshot ?? structuredClone(snapshot);
      nextRefreshSnapshot = null;
      session.applySnapshot(accepted);
      return { ok: true, applied: true, snapshot: accepted } as const;
    }),
  } as unknown as Refresher;
  const schedule = (callback: () => void, delayMs: number) => scheduled.push({ callback, delayMs });
  const clock = () => fakeTime.now;
  const gatePort = createGatePort(hub, session.grants);
  const ctx = { hub, gatePort, session, refresher, clock, schedule };

  return {
    snapshot,
    session,
    outgoing,
    requests,
    scheduled,
    fakeTime,
    refresher,
    ctx,
    setNextRefreshSnapshot(value: Snapshot) { nextRefreshSnapshot = value; },
  };
}

async function prepareAndArm(rig: ReturnType<typeof makeRig>) {
  await executeGatedAction(rig.ctx, { type: "draft-send" });
  const pending = rig.session.pendingGatedAction;
  if (pending === null) throw new Error("expected draft-send read-back");
  const prompt = rig.outgoing.find((message) => message.type === "speak" && message.payload.category === "confirm-prompt");
  if (prompt === undefined) throw new Error("expected tracked draft-send read-back");
  expect(handleGatedSpeakDone(rig.ctx, { speakId: pending.speakId, interrupted: false })).toBe(true);
  expect(rig.scheduled[0]?.delayMs).toBe(1_000);
  rig.fakeTime.now += 999;
  rig.scheduled.shift()!.callback();
  expect(rig.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);
  expect(rig.scheduled[0]?.delayMs).toBe(1);
  rig.fakeTime.now += 1;
  rig.scheduled.shift()!.callback();
  const armed = rig.outgoing.find((message) => message.type === "confirm.armed");
  if (armed === undefined) throw new Error("expected page-task grant after cooldown");
  return { pending, prompt: prompt.payload, armed: armed.payload };
}

function voiceConfirmation(armed: any, prompt: any, text = "send this email") {
  return {
    type: "confirmation" as const,
    text,
    source: "voice" as const,
    grantId: armed.grantId,
    speakId: prompt.speakId,
    utteranceId: "voice-utterance-1",
  };
}

describe("task-bound email send gate", () => {
  it("reads the current draft and recipient, then asks a direct yes/no send question", async () => {
    const rig = makeRig();
    await executeGatedAction(rig.ctx, { type: "draft-send" });

    const prompt = rig.outgoing.find((message) => message.type === "speak" && message.payload.category === "confirm-prompt");
    expect(prompt?.payload.text).toContain(`Recipient: Email address, ${RECIPIENT}.`);
    expect(prompt?.payload.text).toContain(`Current message draft: ${OBSERVED_DRAFT}`);
    expect(prompt?.payload.text).toContain("Requested action: Send message.");
    expect(prompt?.payload.text).toContain("Would you like me to send it? Say yes to send, or no to keep it as a draft.");
    expect(rig.session.pendingGatedAction?.binding.pageTask).toMatchObject({
      taskId: "send-task-1",
      sourceItemId: "message-item-1",
      targetId: "send-1",
      targetKind: "send",
      operation: "send",
      speakId: prompt?.payload.speakId,
    });
    expect(JSON.stringify(rig.session.pendingGatedAction?.binding.pageTask)).not.toContain(OBSERVED_DRAFT);
    expect(JSON.stringify(rig.session.pendingGatedAction?.binding.pageTask)).not.toContain(RECIPIENT);
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);
  });

  it("dispatches one click only for an exact voice phrase with matching live ids after the one-second guard", async () => {
    const rig = makeRig();
    const { pending, prompt, armed } = await prepareAndArm(rig);
    expect(armed).toMatchObject({ phrase: "send this email", kind: "send", speakId: prompt.speakId });
    expect(rig.session.activePageTask?.associatedGrantId).toBe(armed.grantId);

    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt, "Send this email!"));
    expect(rig.requests.filter((request) => request.type === "act.request"), JSON.stringify(rig.outgoing)).toHaveLength(1);
    expect(rig.requests[0]?.payload).toMatchObject({
      action: { op: "click", targetId: "send-1" },
      expectedKind: "send",
      gate: { grantId: armed.grantId, kind: "send" },
    });
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.session.activePageTask).toBeNull();
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "The page confirms the action.")).toBe(true);
    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt));
    expect(rig.requests.filter((request) => request.type === "act.request"), JSON.stringify(rig.outgoing)).toHaveLength(1);
    expect(pending.binding.pageTask?.draftHash).toBe(createHash("sha256").update(OBSERVED_DRAFT, "utf8").digest("hex"));
  });

  it("accepts a voice yes only after the task-bound send question, read-back, and guard", async () => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);

    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt, "Yes!"));

    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "The page confirms the action.")).toBe(true);
  });

  it("leaves the draft unsent when the user says no", async () => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);

    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt, "No, thanks."));

    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "Okay, I left it as a draft.")).toBe(true);
  });

  it("does not arm after interrupted read-back or accept the exact phrase before the guard", async () => {
    const interrupted = makeRig();
    await executeGatedAction(interrupted.ctx, { type: "draft-send" });
    const interruptedPending = interrupted.session.pendingGatedAction!;
    expect(handleGatedSpeakDone(interrupted.ctx, { speakId: interruptedPending.speakId, interrupted: true })).toBe(true);
    expect(interrupted.session.pendingGatedAction).toBeNull();
    expect(interrupted.session.activePageTask).toBeNull();
    expect(interrupted.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);

    const early = makeRig();
    await executeGatedAction(early.ctx, { type: "draft-send" });
    const earlyPending = early.session.pendingGatedAction!;
    expect(handleGatedSpeakDone(early.ctx, { speakId: earlyPending.speakId, interrupted: false })).toBe(true);
    early.fakeTime.now += 999;
    await executeGatedAction(early.ctx, {
      type: "confirmation",
      text: "send this email",
      source: "voice",
      grantId: "premature-grant",
      speakId: earlyPending.speakId,
      utteranceId: "premature-voice-1",
    });
    expect(early.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(early.session.pendingGatedAction).toBeNull();
    expect(early.session.activePageTask).toBeNull();
  });

  it.each([
    ["absent source", undefined, "send this email"],
    ["typed source", "typed", "send this email"],
    ["typed affirmation", "typed", "yes"],
    ["typed okay", "typed", "okay"],
    ["old send phrase", "voice", "confirm sending"],
    ["wrong phrase", "voice", "send the email"],
  ] as const)("does not dispatch for %s", async (_name, source, text) => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);
    await executeGatedAction(rig.ctx, {
      ...voiceConfirmation(armed, prompt, text),
      ...(source === undefined ? { source: undefined } : { source }),
    });
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.session.activePageTask).toBeNull();
  });

  it.each([
    ["typed source", "typed"],
    ["legacy missing source", undefined],
  ] as const)("rejects a typed exact phrase through confirm.redeem with %s", async (_name, source) => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);
    await createVoiceGateAdapter(rig.ctx).redeem({
      grantId: armed.grantId,
      speakId: prompt.speakId,
      utteranceId: "typed-redeem-1",
      phrase: "send this email",
      ...(source === undefined ? {} : { source }),
    });
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
  });

  it("rejects a typed exact phrase through the ordinary utterance route", async () => {
    const rig = makeRig();
    await prepareAndArm(rig);
    await handleUtterance({
      message: {
        v: 1,
        id: "typed-send-frame",
        ts: rig.fakeTime.now,
        type: "utterance",
        payload: { utteranceId: "typed-send-1", text: "send this email", source: "typed" },
      },
      hub: rig.ctx.hub,
      session: rig.session,
      freshnessMs: 2_000,
      refresher: rig.refresher,
      brain: { parseIntent: vi.fn() } as any,
      clock: rig.ctx.clock,
      schedule: rig.ctx.schedule,
    });
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.session.activePageTask).toBeNull();
  });

  it.each(["grantId", "speakId", "utteranceId"] as const)("rejects a stale %s", async (id) => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);
    const command = voiceConfirmation(armed, prompt);
    if (id === "grantId") command.grantId = "stale-grant";
    if (id === "speakId") command.speakId = "stale-speak";
    if (id === "utteranceId") command.utteranceId = "";
    await executeGatedAction(rig.ctx, command);
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
  });

  it.each(["draft", "recipient"] as const)("refuses when the %s changes after the tracked read-back", async (changed) => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);
    const snapshot = structuredClone(rig.snapshot);
    setField(snapshot, changed === "draft" ? "e8" : "e2", changed === "draft" ? "I can meet next week." : "sam@example.test");
    snapshot.capturedAt += 2;
    rig.setNextRefreshSnapshot(snapshot);
    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt));
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.activePageTask).toBeNull();
  });

  it("refuses stale or ambiguous page task sources and ambiguous send actions before arming", async () => {
    const hidden = makeRig({ visibleSend: false });
    await executeGatedAction(hidden.ctx, { type: "draft-send" });
    expect(hidden.session.pendingGatedAction).toBeNull();
    expect(hidden.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);

    const ambiguous = makeRig({ duplicateSend: true });
    await executeGatedAction(ambiguous.ctx, { type: "draft-send" });
    expect(ambiguous.session.pendingGatedAction).toBeNull();
    expect(ambiguous.outgoing.some((message) => message.type === "confirm.armed")).toBe(false);

    const stale = makeRig();
    const task = stale.session.activePageTask!;
    stale.session.applyBrowserCapture({
      identity: { ...task.identity, captureRevision: task.identity.captureRevision + 1 },
      blocks: [],
      items: [],
      links: [],
    });
    await executeGatedAction(stale.ctx, { type: "draft-send" });
    expect(stale.session.pendingGatedAction).toBeNull();
    expect(stale.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
  });

  it("invalidates an armed send if the current capture no longer contains its source item", async () => {
    const rig = makeRig();
    const { prompt, armed } = await prepareAndArm(rig);
    const task = rig.session.activePageTask!;
    rig.session.applyBrowserCapture({
      identity: { ...task.identity, captureRevision: task.identity.captureRevision + 1 },
      blocks: [],
      items: [],
      links: [],
    });
    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt));
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.session.activePageTask).toBeNull();
  });

  it("does not claim success when the fresh post-act snapshot does not confirm the send", async () => {
    const rig = makeRig({ postActConfirmed: false });
    const { prompt, armed } = await prepareAndArm(rig);
    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt));
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "I couldn't verify the page outcome.")).toBe(true);
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "The page confirms the action.")).toBe(false);
  });

  it("does not claim success when the fresh post-act snapshot belongs to another tab", async () => {
    const rig = makeRig({ postActWrongTab: true });
    const { prompt, armed } = await prepareAndArm(rig);
    await executeGatedAction(rig.ctx, voiceConfirmation(armed, prompt));
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(1);
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "I couldn't verify the page outcome.")).toBe(true);
    expect(rig.outgoing.some((message) => message.type === "speak" && message.payload.text === "The page confirms the action.")).toBe(false);
  });
});
