import type { PayloadOf } from "@blip/protocol";
import type { OutputMode } from "../session/session";

export type SpeechOutput = {
  /** NVDA Controller Client returns zero when it accepted the request. */
  speak: (text: string) => number;
  cancel: () => number;
};

/** Route one server speech frame according to the owning voice session's selected output mode. */
export function routeSpeech(
  outputMode: OutputMode,
  payload: PayloadOf<"speak">,
  sendAgentVoice: () => boolean,
  screenReader: SpeechOutput,
): boolean {
  if (outputMode === "agent-voice") return sendAgentVoice();

  if (payload.interrupt && screenReader.cancel() !== 0) return false;
  const screenReaderAccepted = screenReader.speak(payload.text) === 0;
  if (outputMode === "screen-reader") return screenReaderAccepted;

  // "both" is best-effort for delivery, but has no single trustworthy completion signal.
  // Session tracking therefore refuses speak.done for this mode and keeps gated actions closed.
  const agentVoiceAccepted = sendAgentVoice();
  return screenReaderAccepted || agentVoiceAccepted;
}
