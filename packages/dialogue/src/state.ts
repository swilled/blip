import type { PayloadOf } from "@blip/protocol";

export type Mode = "ready" | "reading" | "awaiting-value" | "reading-back" | "awaiting-confirm" | "executing";

export type DialogueState = {
  lastSpoken: string | null;
  mode: Mode;
  seq: number;
  readCursor: number | null;
  currentFieldId: string | null;
  pendingOptions: { fieldId: string } | null;
  pendingFill: { fieldId: string; replaced: boolean } | null;
  outstanding: string[];
  lastDoneAt: number | null;
  readBack: { speakId: string; actionId: string; digest: string } | null;
  confirm: { grantId: string; phrase: string; actionId: string; digest: string; expiresAt: number } | null;
  previousValues: Record<string, string>;
};

export type SpeakEffect = {
  kind: "speak";
  speakId: string;
  text: string;
  category: PayloadOf<"speak">["category"];
  interruptible: boolean;
};

export type CancelSpeechEffect = { kind: "cancelSpeech"; speakId: string };

export function initialState(): DialogueState {
  return {
    lastSpoken: null,
    mode: "ready",
    seq: 1,
    readCursor: null,
    currentFieldId: null,
    pendingOptions: null,
    pendingFill: null,
    outstanding: [],
    lastDoneAt: null,
    readBack: null,
    confirm: null,
    previousValues: {},
  };
}

export function dialogueStateName(mode: Mode): PayloadOf<"state">["dialogue"] {
  switch (mode) {
    case "ready": return "ready";
    case "reading": return "describing";
    case "awaiting-value": return "awaiting-value";
    case "reading-back": return "reading-back";
    case "awaiting-confirm": return "awaiting-confirm";
    case "executing": return "executing";
  }
}

export function speakEffect(
  state: DialogueState,
  text: string,
  category: PayloadOf<"speak">["category"],
  opts?: { interruptible?: boolean },
): { state: DialogueState; effect: SpeakEffect } {
  const speakId = `b${state.seq}`;
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      lastSpoken: category === "filler" ? state.lastSpoken : text,
      outstanding: [...state.outstanding, speakId],
    },
    effect: {
      kind: "speak",
      speakId,
      text,
      category,
      interruptible: opts?.interruptible ?? true,
    },
  };
}

export function cancelEffect(state: DialogueState): { state: DialogueState; effect: CancelSpeechEffect } {
  const speakId = `b${state.seq}`;
  return {
    state: { ...state, seq: state.seq + 1, outstanding: [...state.outstanding, speakId] },
    effect: { kind: "cancelSpeech", speakId },
  };
}
