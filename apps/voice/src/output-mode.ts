export type VoiceOutputMode = "agent-voice" | "screen-reader";

export function statusAriaLive(mode: VoiceOutputMode): "polite" | "off" {
  return mode === "screen-reader" ? "off" : "polite";
}

/** Local acknowledgements must never escape through browser TTS in screen-reader mode. */
export function shouldSpeakLocalAcknowledgement(mode: VoiceOutputMode): boolean {
  return mode === "agent-voice";
}

export interface OutputModeController {
  getMode(): VoiceOutputMode;
  select(mode: VoiceOutputMode): void;
  fallBackToAgentVoice(): void;
}

export function createOutputModeController(deps: {
  cancelCurrentSpeech: () => void;
  sendSettings: (mode: VoiceOutputMode) => void;
  onModeChange: (mode: VoiceOutputMode) => void;
}): OutputModeController {
  let mode: VoiceOutputMode = "agent-voice";

  return {
    getMode: () => mode,
    select(next) {
      if (next === mode) return;

      // Settle/cancel the current browser speech before the server receives the new route.
      deps.cancelCurrentSpeech();
      mode = next;
      deps.onModeChange(mode);
      deps.sendSettings(mode);
    },
    fallBackToAgentVoice() {
      if (mode === "agent-voice") return;
      mode = "agent-voice";
      deps.onModeChange(mode);
    },
  };
}
