import type { PayloadOf } from "@blip/protocol";

// Type-only: events fed to the dialogue reducer. Page-originated text is untrusted data.
export type DialogueEvent =
  | { type: "utterance"; utterance: PayloadOf<"utterance">; heardDuringSpeech?: boolean }
  | { type: "speak.done"; done: PayloadOf<"speak.done"> }
  | { type: "form.changed" }
  | {
      type: "act.result";
      op: "fill" | "select" | "focus";
      fieldId: string;
      ok: boolean;
      error?: string;
      observedValue?: string | null;
    }
  | { type: "confirm.armed"; grantId: string; speakId: string; phrase: string; expiresAt: number }
  | { type: "confirm.refused"; reason: string }
  | { type: "confirm.cleared"; grantId: string; reason: PayloadOf<"confirm.cleared">["reason"] }
  | { type: "gated.result"; ok: boolean; reason?: string; silent?: boolean }
  | { type: "intent.reply"; text: string }
  | { type: "control"; cmd: "stop" | "repeat" };
