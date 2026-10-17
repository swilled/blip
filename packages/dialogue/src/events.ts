import type { PayloadOf } from "@blip/protocol";

// Type-only: events fed to the dialogue reducer. heardDuringSpeech is optional (R2) and never used for safety.
export type DialogueEvent =
  | { type: "utterance"; utterance: PayloadOf<"utterance">; heardDuringSpeech?: boolean }
  | { type: "speak.done"; done: PayloadOf<"speak.done"> }
  | { type: "form.changed" };
