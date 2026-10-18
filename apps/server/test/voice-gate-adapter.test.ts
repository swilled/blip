import { describe, expect, it, vi } from "vitest";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { createVoiceGateAdapter } from "../src/act/voice-gate-adapter";
import { handleGatedSpeakDone, type GatedContext } from "../src/act/gated";
import type { Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";

function makeRig() {
  const snapshot = loadSnapshot("broken");
  const fakeTime = { now: 50_000 };
  const session = new Session("fake", () => fakeTime.now);
  session.extensionConnected = true;
  session.applySnapshot(snapshot);
  const action = session.model!.actions.find((candidate) => candidate.kind === "submit")!;
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
      return { payload: { actId: payload.actId, ok: true, liveKind: action.kind } };
    }),
    pushState: vi.fn(),
  } as unknown as Hub;
  const refresher = {
    request: vi.fn(async () => {
      session.applySnapshot(snapshot);
      return { ok: true, applied: true, snapshot } as const;
    }),
  };
  const context: GatedContext = {
    hub,
    session,
    refresher,
    clock: () => fakeTime.now,
    schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
  };
  return { context, snapshot, fakeTime, session, action, outgoing, requests, scheduled };
}

describe("voice GatePort adapter", () => {
  it("lets core reread, track, and arm the exact survey action before exposing a grant", async () => {
    const rig = makeRig();
    const gate = createVoiceGateAdapter(rig.context);

    await gate.arm({
      actionId: rig.action.id,
      kind: "submit",
      title: "untrusted reducer title",
      digest: "untrusted reducer digest",
    });

    expect(rig.context.refresher.request).toHaveBeenCalledWith("refresh");
    expect(rig.session.pendingGatedAction).toMatchObject({ targetId: rig.action.id, kind: "submit" });
    expect(rig.session.pendingGatedAction?.grantId).toBeUndefined();
    const readback = rig.outgoing.find((frame) => frame.type === "speak")!;
    expect(readback.payload.text).toContain("Customer survey");
    expect(readback.payload.text).not.toContain("untrusted reducer");

    handleGatedSpeakDone(rig.context, { speakId: readback.payload.speakId, interrupted: false });
    expect(rig.scheduled[0]?.delayMs).toBe(1_000);
    rig.fakeTime.now += 1_000;
    rig.scheduled.shift()!.callback();

    const armed = rig.outgoing.find((frame) => frame.type === "confirm.armed")!;
    expect(armed.payload).toMatchObject({
      speakId: readback.payload.speakId,
      phrase: "submit survey",
      kind: "submit",
    });
    expect(rig.session.pendingGatedAction?.grantId).toBe(armed.payload.grantId);
    expect(rig.requests.filter((request) => request.type === "act.request")).toHaveLength(0);

    expect(gate.clear("another-grant", "cancelled")).toBe(false);
    expect(rig.session.pendingGatedAction?.grantId).toBe(armed.payload.grantId);
    expect(gate.clear(armed.payload.grantId, "cancelled")).toBe(true);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.find((frame) => frame.type === "confirm.cleared")?.payload).toMatchObject({
      grantId: armed.payload.grantId,
      reason: "cancelled",
    });
  });

  it("refuses a reducer action-kind mismatch against the refreshed core model", async () => {
    const rig = makeRig();
    const gate = createVoiceGateAdapter(rig.context);

    await gate.arm({ actionId: rig.action.id, kind: "pay" });

    expect(rig.context.refresher.request).toHaveBeenCalledWith("refresh");
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.outgoing.some((frame) => frame.type === "confirm.armed")).toBe(false);
    expect(rig.outgoing.some((frame) => frame.type === "speak" && frame.payload.category === "error")).toBe(true);
  });
});
