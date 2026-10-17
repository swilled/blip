import { isLowConfidenceLabel, type FormModel, type PayloadOf } from "@blip/protocol";
import { fillableFields, spokenLabel } from "./fields";

export type Mode = "ready" | "reading" | "awaiting-value" | "reading-back" | "awaiting-confirm" | "executing";

export type UndoEntry = { fieldId: string; label: string; op: "fill" | "select"; previousValue: string | null; writtenValue: string };

export type DialogueState = {
  lastSpoken: string | null;
  mode: Mode;
  seq: number;
  readCursor: number | null;
  requiredCursor: number | null;
  labelDisclosures: Record<string, number>;
  currentFieldId: string | null;
  pendingOptions: { fieldId: string } | null;
  pendingFill: { fieldId: string; replaced: boolean; previousValue?: string | null; undoPreviousValue?: string | null; profileBatch?: boolean; undoEntry?: UndoEntry } | null;
  profileBatch: {
    entries: Array<{ fieldId: string; key: "name" | "email" | "tel"; value: string; label: string }>;
    cursor: number;
    filled: UndoEntry[];
    skipped: string[];
  } | null;
  undoRecord: UndoEntry[] | null;
  pendingUndo: { entries: UndoEntry[]; cursor: number; restored: string[]; skipped: string[]; failed: string[] } | null;
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
    requiredCursor: null,
    labelDisclosures: {},
    currentFieldId: null,
    pendingOptions: null,
    pendingFill: null,
    profileBatch: null,
    undoRecord: null,
    pendingUndo: null,
    outstanding: [],
    lastDoneAt: null,
    readBack: null,
    confirm: null,
    previousValues: {},
  };
}

/** Return the one-time disclosure for a guessed field label in this snapshot. */
export function discloseFieldLabel(
  state: DialogueState,
  form: FormModel,
  fieldId: string,
): { state: DialogueState; text: string } {
  const field = fillableFields(form).find((item) => item.id === fieldId);
  if (!field || !isLowConfidenceLabel(field) || state.labelDisclosures[field.id] === form.snapshotVersion) {
    return { state, text: "" };
  }
  const label = spokenLabel(field, fillableFields(form).indexOf(field) + 1);
  const text = field.labelSource === "inferred"
    ? `I guessed ${label}. The form model marks this label as inferred.`
    : `I guessed ${label}. The form model marks this label as low confidence.`;
  return {
    state: { ...state, labelDisclosures: { ...state.labelDisclosures, [field.id]: form.snapshotVersion } },
    text,
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
