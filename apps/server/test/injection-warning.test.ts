import { describe, expect, it } from "vitest";
import type { Snapshot } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { phraseForKind } from "@blip/policy/confirmation";
import { Session } from "../src/session/session";

const BAIT = "BLIP-GATE07-PRIVATE-BAIT-7391";

function snapshot(version: number, capturedAt: number, detected?: boolean): Snapshot {
  const base = loadSnapshot("booking");
  return {
    ...base,
    snapshotId: `warning-${version}-${capturedAt}`,
    tabId: 44,
    version,
    capturedAt,
    alerts: [BAIT],
    ...(detected !== undefined ? { untrustedInstructionDetected: detected } : {}),
  };
}

describe("accepted GATE-07 warning state", () => {
  it("copies an accepted boolean and ignores stale warning evidence", () => {
    const session = new Session("fake");

    expect(session.applySnapshot(snapshot(2, 200, true))).toBe(true);
    expect(session.statePayload().page?.untrustedInstructionDetected).toBe(true);
    expect(session.applySnapshot(snapshot(1, 300, false))).toBe(false);
    expect(session.statePayload().page?.untrustedInstructionDetected).toBe(true);
    expect(JSON.stringify(session.statePayload())).not.toContain(BAIT);
  });

  it("clears a previous warning on accepted false or legacy evidence", () => {
    const session = new Session("fake");
    expect(session.applySnapshot(snapshot(1, 100, true))).toBe(true);
    expect(session.applySnapshot(snapshot(2, 200, false))).toBe(true);
    expect(session.statePayload().page?.untrustedInstructionDetected).toBe(false);
    expect(session.applySnapshot(snapshot(3, 300))).toBe(true);
    expect(session.statePayload().page?.untrustedInstructionDetected).toBe(false);
  });

  it("does not clear a pending gated action or its grant when only the warning changes", () => {
    const session = new Session("fake");
    const initial = snapshot(1, 100, false);
    expect(session.applySnapshot(initial)).toBe(true);
    const model = session.model!;
    const action = model.actions.find((candidate) => candidate.kind === "submit");
    expect(action).toBeDefined();
    if (!action) return;

    const binding = {
      targetId: action.id,
      kind: action.kind,
      model: { url: model.url, snapshotVersion: model.snapshotVersion, fields: model.fields },
    };
    const grant = session.grants.arm(binding);
    expect(grant).not.toBeNull();
    if (!grant) return;

    const pending = {
      targetId: action.id,
      kind: action.kind,
      actionLabel: action.label,
      phrase: phraseForKind(action.kind)!,
      tabId: initial.tabId,
      url: model.url,
      snapshotVersion: model.snapshotVersion,
      speakId: "speak-warning-test",
      speechCompletedAt: null,
      readyAt: null,
      binding,
      grantId: grant.grantId,
      expiresAt: grant.expiresAt,
    };
    session.pendingGatedAction = pending;

    expect(session.applySnapshot(snapshot(1, 101, true))).toBe(true);
    expect(session.pendingGatedAction).toBe(pending);
    expect(session.grants.consume(grant.grantId, binding)).toBe(true);
  });

  it("starts with no page warning after a page/session reset", () => {
    const session = new Session("fake");
    expect(session.statePayload().page).toBeNull();
  });
});
