import { describe, expect, it } from "vitest";
import { ActOp, ActRequest, ActResult } from "../src/index";

describe("ActOp", () => {
  it.each([
    { op: "fill", targetId: "e1", value: "Ada" },
    { op: "select", targetId: "e1", optionValue: "king" },
    { op: "check", targetId: "e1", checked: true },
    { op: "focus", targetId: "e1" },
    { op: "click", targetId: "e1" },
    { op: "scroll-into-view", targetId: "e1" },
  ])("accepts $op", (op) => {
    expect(ActOp.safeParse(op).success).toBe(true);
  });

  it("has exactly six ops and rejects an unknown op", () => {
    expect(ActOp.options).toHaveLength(6);
    expect(ActOp.safeParse({ op: "type", targetId: "e1", value: "x" }).success).toBe(false);
  });
});

describe("ActRequest", () => {
  const base = {
    actId: "a1",
    tabId: 1,
    snapshotVersion: 3,
    action: { op: "fill", targetId: "e1", value: "Ada" },
    expectedKind: "fill",
  };

  it("accepts a request without a gate", () => {
    expect(ActRequest.safeParse(base).success).toBe(true);
  });

  it("accepts a gate with grantId and kind", () => {
    const r = ActRequest.safeParse({ ...base, expectedKind: "submit", gate: { grantId: "g1", kind: "submit" } });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown expectedKind", () => {
    expect(ActRequest.safeParse({ ...base, expectedKind: "approve" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const r = ActRequest.safeParse({ ...base, extra: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("extra");
  });
});

describe("ActResult", () => {
  it.each(["target-not-found", "stale-snapshot", "kind-mismatch", "gate-required", "sensitive-field", "disabled", "exception"])(
    "accepts error code %s",
    (error) => {
      expect(ActResult.safeParse({ actId: "a1", ok: false, error }).success).toBe(true);
    },
  );

  it("rejects an undrafted error code", () => {
    expect(ActResult.safeParse({ actId: "a1", ok: false, error: "boom" }).success).toBe(false);
  });

  it("accepts observedValue string or null and a liveKind", () => {
    expect(ActResult.safeParse({ actId: "a1", ok: true, observedValue: "Ada", liveKind: "fill", newSnapshotVersion: 4 }).success).toBe(true);
    expect(ActResult.safeParse({ actId: "a1", ok: true, observedValue: null }).success).toBe(true);
  });

  it("caps detail at 300 chars", () => {
    expect(ActResult.safeParse({ actId: "a1", ok: false, detail: "x".repeat(301) }).success).toBe(false);
  });
});
