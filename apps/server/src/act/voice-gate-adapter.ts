import type { ConfirmRedeemPayload } from "@blip/protocol";
import type { ActionKind } from "@blip/protocol";
import { clearVoiceGatedAction, executeGatedAction, type GatedClearReason, type GatedContext } from "./gated";

/**
 * Voice-facing request shape. Title and digest are reducer hints only: core rereads the live page,
 * derives its own read-back and binding, and never trusts these fields to authorize a click.
 */
export type VoiceArmRequest = {
  actionId: string;
  kind?: ActionKind;
  title?: string;
  digest?: string;
};

/**
 * Adapter between the voice reducer's arm/clear/redeem lifecycle and core's Executor.
 * `arm` starts core's own tracked read-back; the resulting `confirm.armed` is delivered over the
 * existing server-to-voice protocol. The voice side never receives a ConsumedGrant.
 */
export type VoiceGateAdapter = {
  arm(request: VoiceArmRequest): Promise<void>;
  clear(grantId: string, reason: GatedClearReason): boolean;
  redeem(payload: ConfirmRedeemPayload): Promise<void>;
};

export function createVoiceGateAdapter(ctx: GatedContext): VoiceGateAdapter {
  return {
    arm(request) {
      return executeGatedAction(ctx, {
        type: "voice-arm",
        actionId: request.actionId,
        ...(request.kind !== undefined ? { expectedKind: request.kind } : {}),
      });
    },
    clear(grantId, reason) {
      return clearVoiceGatedAction(ctx, grantId, reason);
    },
    redeem(payload) {
      return executeGatedAction(ctx, {
        type: "confirmation",
        text: payload.phrase,
        grantId: payload.grantId,
        speakId: payload.speakId,
        utteranceId: payload.utteranceId,
      });
    },
  };
}
