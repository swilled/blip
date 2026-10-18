import type { PayloadOf } from "@blip/protocol";
import type { OutputMode } from "../session/session";

export type SpeechOutput = {
  /** NVDA Controller Client returns zero when it accepted the request. */
  speak: (text: string) => number;
  cancel: () => number;
  /** The Controller Client has no safe per-utterance completion callback. */
  completionSignal: "unavailable";
};

export type SpeechRoute =
  | { kind: "agent-voice"; accepted: boolean }
  | { kind: "nvda-unavailable" };

/** Route one server speech frame according to the owning voice session's selected output mode. */
export function routeSpeech(
  outputMode: OutputMode,
  _payload: PayloadOf<"speak">,
  sendAgentVoice: () => boolean,
  screenReader: SpeechOutput,
): SpeechRoute {
  if (outputMode === "agent-voice") return { kind: "agent-voice", accepted: sendAgentVoice() };

  // A zero return from nvdaController_speakText means only that dispatch was accepted. Without a
  // completion signal, sending speech there would strand its speakId and leave read-back unsafe.
  if (screenReader.completionSignal === "unavailable") return { kind: "nvda-unavailable" };

  return { kind: "nvda-unavailable" };
}
