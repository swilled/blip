import { describe, expect, it, vi } from "vitest";
import { Session } from "../src/session/session";
import { routeSpeech, type SpeechOutput } from "../src/voice/speech-routing";

const payload = {
  speakId: "tracked-1",
  text: "Synthetic answer.",
  category: "answer" as const,
  interrupt: false,
};

function unavailableNvda(): SpeechOutput {
  return {
    speak: vi.fn(() => 0),
    cancel: vi.fn(() => 0),
    completionSignal: "unavailable",
  };
}

describe("per-session output routing", () => {
  it("keeps agent voice routing available and reports NVDA as unavailable without calling its DLL", () => {
    const nvda = unavailableNvda();
    const sendAgentVoice = vi.fn(() => true);

    expect(routeSpeech("agent-voice", payload, sendAgentVoice, nvda)).toEqual({
      kind: "agent-voice",
      accepted: true,
    });
    expect(routeSpeech("screen-reader", payload, sendAgentVoice, nvda)).toEqual({
      kind: "nvda-unavailable",
    });
    expect(routeSpeech("both", payload, sendAgentVoice, nvda)).toEqual({
      kind: "nvda-unavailable",
    });

    expect(sendAgentVoice).toHaveBeenCalledTimes(1);
    expect(nvda.speak).not.toHaveBeenCalled();
    expect(nvda.cancel).not.toHaveBeenCalled();
  });

  it("leaves the ID pending after NVDA DLL dispatch acceptance", () => {
    const session = new Session("fake");
    session.outputMode = "screen-reader";
    const nvda = unavailableNvda();

    expect(nvda.speak(payload.text)).toBe(0); // zero is dispatch acceptance only
    session.trackSpeech(payload.speakId, payload.category);

    expect(session.completeSpeech(payload.speakId, false, Date.now())).toBe(false);
    expect(session.speechCompletion(payload.speakId)).toBeNull();
  });

  it("settles an agent-voice ID once on actual completion or cancellation signals", () => {
    const completed = new Session("fake");
    completed.trackSpeech("done-id", "readback");
    expect(completed.speechCompletion("done-id")).toBeNull();
    expect(completed.completeSpeech("done-id", false, 100)).toBe(true);
    expect(completed.completeSpeech("done-id", false, 101)).toBe(false);
    expect(completed.speechCompletion("done-id")).toEqual({
      category: "readback",
      completedAt: 100,
      interrupted: false,
    });

    const cancelled = new Session("fake");
    cancelled.trackSpeech("cancelled-id", "readback");
    expect(cancelled.completeSpeech("cancelled-id", true, 200)).toBe(true);
    expect(cancelled.completeSpeech("cancelled-id", false, 201)).toBe(false);
    expect(cancelled.speechCompletion("cancelled-id")).toEqual({
      category: "readback",
      completedAt: 200,
      interrupted: true,
    });
  });

  it("ignores late completion signals after an ID was abandoned", () => {
    const session = new Session("fake");
    session.trackSpeech("late-id", "answer");
    expect(session.abandonSpeech("late-id")).toBe(true);

    expect(session.completeSpeech("late-id", true, 300)).toBe(false);
    expect(session.speechCompletion("late-id")).toBeNull();
  });
});
