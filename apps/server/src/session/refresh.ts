import type { PayloadOf } from "@blip/protocol";
import { HubRequestError, type Hub } from "../hub/hub";
import type { Session } from "./session";

export type RefreshReason = PayloadOf<"snapshot.request">["reason"];

export type RefreshResult =
  | { ok: true; applied: boolean }
  | { ok: false; kind: "no-extension" | "read-failed" };

export type Refresher = { request(reason: RefreshReason): Promise<RefreshResult> };

/** Fetch and apply a snapshot without speaking; used by page changes and read intents alike. */
export function createRefresher(options: { hub: Hub; session: Session; timeoutMs: number }): Refresher {
  const { hub, session, timeoutMs } = options;

  return {
    async request(reason) {
      if (!session.extensionConnected) {
        session.stale = true;
        return { ok: false, kind: "no-extension" };
      }

      try {
        const result = await hub.request(
          "extension",
          "snapshot.request",
          { reason },
          { expect: "snapshot.result", timeoutMs },
        );
        if (!result.payload.ok) {
          session.stale = true;
          return { ok: false, kind: "read-failed" };
        }

        const applied = session.applySnapshot(result.payload.snapshot, { updateDialogue: false });
        if (applied) hub.pushState();
        return { ok: true, applied };
      } catch (error) {
        session.stale = true;
        if (error instanceof HubRequestError && (error.code === "disconnected" || error.code === "no-connection")) {
          return { ok: false, kind: "no-extension" };
        }
        return { ok: false, kind: "read-failed" };
      }
    },
  };
}
