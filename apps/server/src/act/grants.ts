import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { ActionKind, FormModel } from "@blip/protocol";
import { phraseForKind } from "@blip/policy/confirmation";

const GRANT_TTL_MS = 30_000;

export type GrantBinding = {
  targetId: string;
  kind: ActionKind;
  model: Pick<FormModel, "url" | "snapshotVersion" | "fields">;
};

export type ArmedGrant = {
  grantId: string;
  expiresAt: number;
};

declare const consumedGrantBrand: unique symbol;

/** Opaque proof that a live one-use grant was consumed for this exact dispatch binding. */
export type ConsumedGrant = Readonly<{
  grantId: string;
  targetId: string;
  kind: ActionKind;
  tabId: number;
  snapshotVersion: number;
  readonly [consumedGrantBrand]: true;
}>;

export type GrantStore = {
  arm(binding: GrantBinding): ArmedGrant | null;
  consume(grantId: string, liveBinding: GrantBinding): boolean;
  consumeForDispatch(grantId: string, liveBinding: GrantBinding, tabId: number): ConsumedGrant | null;
  /** Runtime guard scoped to this store; copied metadata and proofs from another store are refused. */
  isConsumedGrant(value: unknown): value is ConsumedGrant;
  /** Atomically claims a valid proof for one dispatch, even across GatePort instances. */
  claimDispatch(value: unknown): value is ConsumedGrant;
  clear(grantId?: string): void;
};

type PendingGrant = {
  fingerprint: Buffer;
  expiresAt: number;
};

function fingerprint(binding: GrantBinding): Buffer {
  const fields = binding.model.fields
    .map((field, inputOrder) => ({
      inputOrder,
      documentOrder: field.order,
      encoded: [
        field.order,
        field.id,
        field.sensitive !== "none",
        field.hasValue,
        field.sensitive === "none" ? field.value : null,
      ] as const,
    }))
    .sort((left, right) => left.documentOrder - right.documentOrder || left.inputOrder - right.inputOrder)
    .map(({ encoded }) => encoded);

  const canonical = JSON.stringify([
    binding.targetId,
    binding.kind,
    binding.model.url,
    binding.model.snapshotVersion,
    fields,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest();
}

/** Create an in-memory, synchronous store for privacy-preserving one-use grants. */
export function createGrantStore(clock: () => number = Date.now): GrantStore {
  const pending = new Map<string, PendingGrant>();
  const consumedProofs = new WeakSet<object>();
  const dispatchedProofs = new WeakSet<object>();

  function isConsumedGrant(value: unknown): value is ConsumedGrant {
    return typeof value === "object" && value !== null && consumedProofs.has(value);
  }

  function claimDispatch(value: unknown): value is ConsumedGrant {
    if (!isConsumedGrant(value) || dispatchedProofs.has(value)) return false;
    dispatchedProofs.add(value);
    return true;
  }

  function discardExpired(now: number): void {
    for (const [grantId, grant] of pending) {
      if (grant.expiresAt <= now) pending.delete(grantId);
    }
  }

  function consume(grantId: string, liveBinding: GrantBinding): boolean {
    const grant = pending.get(grantId);
    if (grant === undefined) return false;

    // Delete before expiry or binding checks so every attempt is strictly one-use.
    pending.delete(grantId);

    let now: number;
    let liveFingerprint: Buffer;
    try {
      now = clock();
      if (!Number.isFinite(now) || grant.expiresAt <= now) return false;
      liveFingerprint = fingerprint(liveBinding);
    } catch {
      return false;
    }

    return timingSafeEqual(grant.fingerprint, liveFingerprint);
  }

  function consumeForDispatch(grantId: string, liveBinding: GrantBinding, tabId: number): ConsumedGrant | null {
    if (!Number.isSafeInteger(tabId) || !consume(grantId, liveBinding)) return null;
    const proof = Object.freeze({
      grantId,
      targetId: liveBinding.targetId,
      kind: liveBinding.kind,
      tabId,
      snapshotVersion: liveBinding.model.snapshotVersion,
    }) as ConsumedGrant;
    consumedProofs.add(proof);
    return proof;
  }

  return {
    arm(binding): ArmedGrant | null {
      if (phraseForKind(binding.kind) === undefined) return null;

      let now: number;
      let bindingFingerprint: Buffer;
      try {
        now = clock();
        if (!Number.isFinite(now)) return null;
        bindingFingerprint = fingerprint(binding);
      } catch {
        return null;
      }

      const expiresAt = now + GRANT_TTL_MS;
      if (!Number.isFinite(expiresAt)) return null;
      discardExpired(now);

      let grantId = randomUUID();
      while (pending.has(grantId)) grantId = randomUUID();
      pending.set(grantId, { fingerprint: bindingFingerprint, expiresAt });
      return { grantId, expiresAt };
    },

    consume,
    consumeForDispatch,
    isConsumedGrant,
    claimDispatch,

    clear(grantId): void {
      if (grantId === undefined) pending.clear();
      else pending.delete(grantId);
    },
  };
}
