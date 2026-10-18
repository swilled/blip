import { describe, expect, it, vi } from "vitest";
import { Session } from "../src/session/session";
import { routeSpeech } from "../src/voice/speech-routing";

const payload = {
  speakId: "tracked-1",
  text: "Synthetic answer.",
  category: "answer" as const,
  interrupt: false,
};

describe("per-session output routing", () => {
  it("routes each session independently to agent voice or NVDA", () => {
    const screenReaderSession = new Session("fake");
    screenReaderSession.outputMode = "screen-reader";
    const agentSession = new Session("fake");
    const sendScreenReaderVoice = vi.fn(() => true);
    const sendAgentVoice = vi.fn(() => true);
    const nvda = { speak: vi.fn(() => 0), cancel: vi.fn(() => 0) };

    expect(routeSpeech(screenReaderSession.outputMode, payload, sendScreenReaderVoice, nvda)).toBe(true);
    expect(routeSpeech(agentSession.outputMode, payload, sendAgentVoice, nvda)).toBe(true);

    expect(nvda.speak).toHaveBeenCalledExactlyOnceWith(payload.text);
    expect(sendScreenReaderVoice).not.toHaveBeenCalled();
    expect(sendAgentVoice).toHaveBeenCalledTimes(1);
  });

  it("cancels NVDA before interrupting speech and routes both outputs in both mode", () => {
    const session = new Session("fake");
    session.outputMode = "both";
    const order: string[] = [];
    const nvda = {
      cancel: vi.fn(() => { order.push("cancel"); return 0; }),
      speak: vi.fn(() => { order.push("nvda"); return 0; }),
    };
    const sendAgentVoice = vi.fn(() => { order.push("voice"); return true; });

    const accepted = routeSpeech(session.outputMode, { ...payload, interrupt: true }, sendAgentVoice, nvda);

    expect(accepted).toBe(true);
    expect(order).toEqual(["cancel", "nvda", "voice"]);
  });

  it("does not turn NVDA dispatch acceptance into speech-completion evidence", () => {
    const session = new Session("fake");
    session.outputMode = "screen-reader";
    session.trackSpeech(payload.speakId, payload.category);

    expect(session.completeSpeech(payload.speakId, false, Date.now())).toBe(false);
    expect(session.speechCompletion(payload.speakId)).toBeNull();
  });

  it("refuses a replacement utterance when NVDA cancellation fails", () => {
    const session = new Session("fake");
    session.outputMode = "screen-reader";
    const nvda = { speak: vi.fn(() => 0), cancel: vi.fn(() => 5) };
    const sendAgentVoice = vi.fn(() => true);

    const accepted = routeSpeech(session.outputMode, { ...payload, interrupt: true }, sendAgentVoice, nvda);

    expect(accepted).toBe(false);
    expect(nvda.speak).not.toHaveBeenCalled();
    expect(sendAgentVoice).not.toHaveBeenCalled();
  });
});
