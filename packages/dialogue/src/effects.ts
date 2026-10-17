import type { ActionKind, ConfirmClearedPayload, FormModel, PayloadOf } from "@blip/protocol";
import type { CancelSpeechEffect, DialogueState, SpeakEffect } from "./state";

export type { DialogueState } from "./state";

// Type-only: effects the dialogue reducer asks the window/runner to perform.
// Page text reaches these types as data only; no effect executes page text as a command.
export type Effect =
  | SpeakEffect
  | { kind: "earcon"; name: PayloadOf<"earcon">["name"] }
  | CancelSpeechEffect
  | { kind: "parseIntent"; text: string }
  | { kind: "fill"; fieldId: string; value: string }
  | { kind: "select"; fieldId: string; optionValue: string }
  | { kind: "focus"; fieldId: string }
  | { kind: "refreshForm" }
  | { kind: "armConfirm"; actionId: string; actionKind: ActionKind; title: string; digest: string }
  | { kind: "clearConfirm"; grantId: string; reason: ConfirmClearedPayload["reason"] }
  | { kind: "redeem"; grantId: string };

export type LocalProfile = Readonly<{ name: string; email: string; tel: string }>;

export type DialogueContext = {
  form: FormModel | null;
  now: number;
  profile?: LocalProfile;
  /** Voice-local projection of StatePayload.page.untrustedInstructionDetected. */
  untrustedInstructionDetected?: boolean;
  /** Stable for a tab/snapshot pair so a changed flagged snapshot is warned once. */
  pageInjectionKey?: string;
};
