// Voice window status machine. Pure: no DOM access.
// The state type is a string union so Plan 08 can add "listening".
export type VoiceStatus = "idle" | "thinking" | "speaking" | "offline";

export interface VoiceState {
  get(): VoiceStatus;
  messageSent(): void;
  replyReceived(): void;
  speechDone(): void;
  socketClosed(): void;
  socketOpened(): void;
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
  };
}
