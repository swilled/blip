// Server speak -> local tts; tts completion -> speak.done for every speakId
// (completed or interrupted). No confirm-phrase logic lives here or anywhere in the window.
import type { PayloadOf } from "@blip/protocol";
import type { Tts } from "./tts";

export interface SpeakBridge {
  onSpeak(p: PayloadOf<"speak">): void;
  /** Wire as the tts onDone handler. */
  onTtsDone(d: { speakId?: string; interrupted: boolean }): void;
}

export function createSpeakBridge(deps: {
  tts: Pick<Tts, "speak" | "cancel" | "markReplied">;
  sendSpeakDone: (p: PayloadOf<"speak.done">) => void;
}): SpeakBridge {
  return {
    onSpeak(p) {
      deps.tts.markReplied();
      if (p.interrupt) deps.tts.cancel();
      deps.tts.speak(p.text, { speakId: p.speakId });
    },
    onTtsDone(d) {
      if (d.speakId === undefined) return; // local "One moment." filler
      deps.sendSpeakDone({ speakId: d.speakId, interrupted: d.interrupted });
    },
  };
}
