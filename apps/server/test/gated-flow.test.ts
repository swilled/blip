import { describe, expect, it, vi } from "vitest";
import { isGatedKind } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { executeGatedAction, handleGatedSpeakDone } from "../src/act/gated";
import type { Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";

function preparationRig() {
  const snapshot = loadSnapshot("booking");
  const session = new Session("fake");
  session.extensionConnected = true;
  session.applySnapshot(snapshot);
  const order: string[] = [];
  const outgoing: Array<{ type: string; payload: any }> = [];
  const hub = {
    send: vi.fn((_role: string, type: string, payload: any) => {
      order.push(type);
      outgoing.push({ type, payload });
      return true;
    }),
    pushState: vi.fn(),
  } as unknown as Hub;
  const refresher = {
    request: vi.fn(async () => {
      order.push("fresh-snapshot");
      session.applySnapshot(snapshot);
      return { ok: true, applied: true } as const;
    }),
  };
  const action = session.model!.actions.find((candidate) => isGatedKind(candidate.kind))!;
  return { snapshot, session, order, outgoing, hub, refresher, action };
}

describe("gated Executor read-back preparation", () => {
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
    expect(spoken).toContain(rig.action.label);
    expect(spoken.length).toBeLessThanOrEqual(20_000);
  });

  it("never arms after interrupted or mismatched speech completion", async () => {
    const rig = preparationRig();
    const clock = vi.fn(() => 10_000);
    const ctx = { hub: rig.hub, session: rig.session, refresher: rig.refresher, clock };
    await executeGatedAction(ctx, { type: "request_action", actionId: rig.action.id });
    const speakId = rig.session.pendingGatedAction!.speakId;

    handleGatedSpeakDone(rig.session, { speakId: "wrong-id", interrupted: false }, clock);
    expect(rig.session.pendingGatedAction?.speechCompletedAt).toBeNull();
    handleGatedSpeakDone(rig.session, { speakId, interrupted: true }, clock);
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
});
