import type { FormModel, PayloadOf } from "@blip/protocol";

// Type-only: effects the dialogue reducer asks the window to perform. Derived from the protocol.
// Page text reaches these types as data only; no effect executes page text as a command.
export type Effect =
  | {
      kind: "speak";
      text: string;
      category: PayloadOf<"speak">["category"];
      interruptible: boolean;
    }
  | { kind: "earcon"; name: PayloadOf<"earcon">["name"] }
  | { kind: "cancelSpeech" }
  | { kind: "parseIntent"; text: string };

export type DialogueState = { lastSpoken: string | null };

export type DialogueContext = { form: FormModel | null };
