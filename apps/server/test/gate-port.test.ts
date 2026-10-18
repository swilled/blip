import { describe, expect, it, vi } from "vitest";
import type { Hub } from "../src/hub/hub";
import { createGrantStore, type ConsumedGrant, type GrantBinding } from "../src/act/grants";
import { createGatePort } from "../src/act/gate-port";

const binding: GrantBinding = {
  targetId: "survey-submit",
  kind: "submit",
  model: { url: "http://127.0.0.1:7777/survey", snapshotVersion: 4, fields: [] },
};

describe("GatePort", () => {
  it("constructs only the gated click bound to a consumed grant", async () => {
    const request = vi.fn(async (_role: string, _type: string, payload: any) => ({
      type: "act.result" as const,
      payload: { actId: payload.actId, ok: true, liveKind: "submit" },
    }));
    const grants = createGrantStore(() => 1_000);
    const port = createGatePort({ request } as unknown as Hub, grants);
    const armed = grants.arm(binding)!;
    const authorization = grants.consumeForDispatch(armed.grantId, binding, 17)!;

    await expect(port.dispatchClick(authorization)).resolves.toMatchObject({ payload: { ok: true, liveKind: "submit" } });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![2]).toMatchObject({
      tabId: 17,
      snapshotVersion: 4,
      action: { op: "click", targetId: "survey-submit" },
      expectedKind: "submit",
      gate: { grantId: armed.grantId, kind: "submit" },
    });
    const secondPort = createGatePort({ request } as unknown as Hub, grants);
    expect(() => port.dispatchClick(authorization)).toThrow("gated dispatch requires a consumed grant");
    expect(() => secondPort.dispatchClick(authorization)).toThrow("gated dispatch requires a consumed grant");
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses copied or forged grant metadata before touching the Hub", () => {
    const request = vi.fn();
    const grants = createGrantStore(() => 1_000);
    const otherGrants = createGrantStore(() => 1_000);
    const foreignGrant = otherGrants.consumeForDispatch(otherGrants.arm(binding)!.grantId, binding, 17)!;
    const port = createGatePort({ request } as unknown as Hub, grants);
    const forged = {
      grantId: "fake",
      targetId: binding.targetId,
      kind: binding.kind,
      tabId: 17,
      snapshotVersion: 4,
    } as unknown as ConsumedGrant;

    expect(() => port.dispatchClick(forged)).toThrow("gated dispatch requires a consumed grant");
    expect(() => port.dispatchClick(foreignGrant)).toThrow("gated dispatch requires a consumed grant");
    expect(request).not.toHaveBeenCalled();
  });
});
