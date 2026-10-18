import { isGatedKind, newId, type ActResult } from "@blip/protocol";
import { phraseForKind } from "@blip/policy/confirmation";
import type { Hub } from "../hub/hub";
import type { ConsumedGrant, GrantStore } from "./grants";

const ACT_TIMEOUT_MS = 5_000;

/** The only extension dispatch boundary for actions that require a confirmation grant. */
export type GatePort = {
  dispatchClick(authorization: ConsumedGrant): Promise<{ payload: ActResult }>;
};

export function createGatePort(hub: Hub, grants: GrantStore): GatePort {
  return {
    dispatchClick(authorization) {
      if (!grants.claimDispatch(authorization) || !isGatedKind(authorization.kind) || phraseForKind(authorization.kind) === undefined) {
        throw new Error("gated dispatch requires a consumed grant");
      }

      return hub.request("extension", "act.request", {
        actId: newId(),
        tabId: authorization.tabId,
        snapshotVersion: authorization.snapshotVersion,
        action: { op: "click", targetId: authorization.targetId },
        expectedKind: authorization.kind,
        gate: { grantId: authorization.grantId, kind: authorization.kind },
      }, {
        expect: "act.result",
        timeoutMs: ACT_TIMEOUT_MS,
      }).then((result) => ({ payload: result.payload }));
    },
  };
}
