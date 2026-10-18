import { describe, expect, it, vi } from "vitest";
import { routeSpeech, type SpeechOutput } from "./speech-routing";

describe("NVDA speech completion safety", () => {
  it("does not dispatch native speech or complete a speakId when no completion signal exists", () => {
    const speak = vi.fn(() => 0); // 0 means the DLL accepted the request, not that it finished.
    const cancel = vi.fn(() => 0);
    const sendAgentVoice = vi.fn(() => true);
    const nvda: SpeechOutput = { speak, cancel, completionSignal: "unavailable" };

    const route = routeSpeech(
      "screen-reader",
      { speakId: "tracked-speech-1", text: "Read-back", category: "answer", interrupt: false },
      sendAgentVoice,
      nvda,
    );

    expect(route).toEqual({ kind: "nvda-unavailable" });
    expect(speak).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(sendAgentVoice).not.toHaveBeenCalled();
  });
});
