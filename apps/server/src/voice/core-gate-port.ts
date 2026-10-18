import type { ConfirmClearedPayload } from "@blip/protocol";
import { clearVoiceGatedAction, armDialogueReadback, executeGatedAction, invalidateGatedAction, type GatedContext } from "../act/gated";
import type { GatePort } from "./gate-port";

/** Adapt the dialogue reducer lifecycle to core's server-owned one-use grant and Executor. */
export function createCoreDialogueGatePort(ctx: GatedContext): GatePort {
  return {
    arm(request) {
      return armDialogueReadback(ctx, request);
    },
    clear(grantId, reason: ConfirmClearedPayload["reason"]) {
      if (reason === "executed") return false;
      return clearVoiceGatedAction(ctx, grantId, reason);
    },
    async redeem(request) {
      await executeGatedAction(ctx, {
        type: "confirmation",
        text: request.phrase,
        grantId: request.grantId,
        speakId: request.speakId,
        utteranceId: request.utteranceId,
      });
      return { ok: true, handledByCore: true };
    },
    invalidate(reason) {
      invalidateGatedAction(ctx, reason, `dialogue-${reason}`);
    },
  };
}
