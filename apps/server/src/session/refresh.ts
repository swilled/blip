import type { PayloadOf } from "@blip/protocol";
import { HubRequestError, type Hub } from "../hub/hub";
import type { Session } from "./session";

export type RefreshReason = PayloadOf<"snapshot.request">["reason"];

export type RefreshResult =
  | { ok: true; applied: boolean }
  | { ok: false; kind: "no-extension" | "read-failed" | "stale-snapshot" };

export type Refresher = { request(reason: RefreshReason): Promise<RefreshResult> };

/** Fetch and apply a snapshot without speaking; used by page changes and read intents alike. */
export function createRefresher(options: { hub: Hub; session: Session; timeoutMs: number }): Refresher {
  const { hub, session, timeoutMs } = options;

  const perform = async (reason: RefreshReason): Promise<RefreshResult> => {
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
      if (!applied) {
        session.stale = true;
        return { ok: false, kind: "stale-snapshot" };
      }
      hub.pushState();
      return { ok: true, applied: true };
    } catch (error) {
      session.stale = true;
      if (error instanceof HubRequestError && (error.code === "disconnected" || error.code === "no-connection")) {
        return { ok: false, kind: "no-extension" };
      }
      return { ok: false, kind: "read-failed" };
    }
  };

  let inFlight: Promise<RefreshResult> | null = null;
  let followup:
    | { reason: RefreshReason; promise: Promise<RefreshResult>; resolve: (result: RefreshResult) => void }
    | null = null;

  const start = (reason: RefreshReason): Promise<RefreshResult> => {
    const current = perform(reason);
    inFlight = current;
    void current.then((result) => {
      const queued = followup;
      if (queued !== null) {
        followup = null;
        void start(queued.reason).then(queued.resolve);
      } else if (inFlight === current) {
        inFlight = null;
      }
      return result;
    });
    return current;
  };

  return {
    request(reason) {
      if (!session.extensionConnected) {
        session.stale = true;
        return Promise.resolve({ ok: false, kind: "no-extension" });
      }
      if (inFlight === null) return start(reason);
      if (followup !== null) {
        followup.reason = reason;
        return followup.promise;
      }

      let resolve!: (result: RefreshResult) => void;
      const promise = new Promise<RefreshResult>((complete) => {
        resolve = complete;
      });
      followup = { reason, promise, resolve };
      return promise;
    },
  };
}
