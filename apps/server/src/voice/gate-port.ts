import { ActionKind, isGatedKind, newId } from "@blip/protocol";
import type { ConfirmClearedPayload } from "@blip/protocol";

export type ArmRequest = {
  actionId: string;
  kind: string;
  title: string;
  digest: string;
};

export type ArmResult =
  | { ok: true; grantId: string; phrase: string; expiresAt: number }
  | { ok: false; reason: "not-gated" };

export type GateRefusal = { ok: false; reason: string };

export interface GatePort {
  arm(request: ArmRequest): Promise<ArmResult>;
  clear(grantId: string, reason: ConfirmClearedPayload["reason"]): void | Promise<void>;
  redeem(grantId: string): Promise<GateRefusal>;
}

const PHRASE_NOUNS = ["booking", "order", "application", "message", "survey"] as const;
const PHRASES: Record<string, string> = {
  pay: "confirm payment",
  delete: "confirm delete",
  send: "send it now",
  "navigate-cross-domain": "leave this site",
};

function submitPhrase(title: string): string {
  const normalizedTitle = title.toLowerCase();
  const noun = PHRASE_NOUNS.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`).test(normalizedTitle),
  );
  return noun ? `submit ${noun}` : "submit form";
}

/** A STAND-IN for core's policy phrase table; this gate can only refuse redemption. */
export function createStubGate(now: () => number): GatePort {
  return {
    async arm(request) {
      const parsedKind = ActionKind.safeParse(request.kind);
      if (!parsedKind.success || !isGatedKind(request.kind)) {
        return { ok: false, reason: "not-gated" };
      }

      const phrase =
        parsedKind.data === "submit"
          ? submitPhrase(request.title)
          : PHRASES[parsedKind.data];

      if (!phrase) return { ok: false, reason: "not-gated" };

      return {
        ok: true,
        grantId: newId(),
        phrase,
        expiresAt: now() + 30_000,
      };
    },

    clear() {
      // The voice stub has no state to clear.
    },

    async redeem() {
      return { ok: false, reason: "gate-not-connected" };
    },
  };
}
