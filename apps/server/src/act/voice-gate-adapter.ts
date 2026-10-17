import type { ConfirmRedeemPayload } from "@blip/protocol";
import { executeGatedAction, type GatedContext } from "./gated";

/**
 * Maps the voice reducer's arm/clear/redeem protocol to the core Executor.
 * The reducer sends identifiers and a phrase only; ConsumedGrant never leaves the server.
 */
export type VoiceGateAdapter = {
  redeem(payload: ConfirmRedeemPayload): Promise<void>;
};

export function createVoiceGateAdapter(ctx: GatedContext): VoiceGateAdapter {
  return {
    redeem(payload) {
      return executeGatedAction(ctx, {
        type: "confirmation",
        text: payload.phrase,
        grantId: payload.grantId,
        speakId: payload.speakId,
      });
    },
  };
}
