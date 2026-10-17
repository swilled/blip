// Voice window status machine. Pure: no DOM access.
export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "offline";

export interface HoldStartResult {
  /** True when speech was playing and must be cut (barge-in by key, D-03). */
  cancelSpeech: boolean;
  /** False when the hold start was ignored (already listening, or offline). */
  started: boolean;
}

export interface VoiceState {
  get(): VoiceStatus;
  messageSent(): void;
  replyReceived(): void;
  speechDone(): void;
  socketClosed(): void;
  socketOpened(): void;
  holdStart(): HoldStartResult;
  /** A final transcript arrived for the current hold: listening -> thinking. */
  transcriptDelivered(): void;
  /** The hold ended with nothing recognized: listening -> idle. */
  noTranscript(): void;
}

export function createVoiceState(onChange: (s: VoiceStatus) => void): VoiceState {
  let current: VoiceStatus = "offline";
  const set = (next: VoiceStatus): void => {
    if (next === current) return;
    current = next;
    onChange(current);
  };
  return {
    get: () => current,
    messageSent: () => {
      if (current !== "offline") set("thinking");
    },
    replyReceived: () => {
      if (current !== "offline") set("speaking");
    },
    speechDone: () => {
      if (current !== "offline") set("idle");
    },
    socketClosed: () => set("offline"),
    socketOpened: () => set("idle"),
    holdStart: () => {
      if (current === "offline" || current === "listening") {
        return { cancelSpeech: false, started: false };
      }
      const cancelSpeech = current === "speaking";
      set("listening");
      return { cancelSpeech, started: true };
    },
    transcriptDelivered: () => {
      if (current === "listening") set("thinking");
    },
    noTranscript: () => {
      if (current === "listening") set("idle");
    },
  };
}
