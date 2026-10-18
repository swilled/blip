import { describe, expect, it, vi } from "vitest";
import { parseSpeechRateCommand, createRateCommandController } from "./speech-rate";
import { createVoiceState } from "./state";
import { createTalkController, type SttHandlers, type UtteranceOut } from "./talk-controller";

describe("speech rate command parsing", () => {
  it("coalesces twenty rapid changes and cancels pending acknowledgement on close", () => {
    vi.useFakeTimers();
    try {
      const changed: number[] = [], messages: string[] = [];
      const c = createRateCommandController({ changed: rate => changed.push(rate), acknowledge: message => messages.push(message) });
      for (let i = 0; i < 20; i++) c.adjust(i % 2 ? "slower" : "faster");
      expect(changed).toHaveLength(20); expect(messages).toEqual([]);
      vi.advanceTimersByTime(200);
      expect(messages).toEqual(["Speaking slower."]); expect(c.get()).toBe(1);
      c.adjust("faster"); c.cancel(); vi.advanceTimersByTime(200); expect(messages).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
  it("accepts only exact normalized faster and slower commands", () => {
    expect(parseSpeechRateCommand("Faster!")).toBe("faster");
    expect(parseSpeechRateCommand("  SLOWER  ")).toBe("slower");
  });

  it("leaves other utterances on the ordinary command path", () => {
    expect(parseSpeechRateCommand("please go faster")).toBeNull();
    expect(parseSpeechRateCommand("faster please")).toBeNull();
    expect(parseSpeechRateCommand("fill my name")).toBeNull();
  });

  it("handles a spoken rate command before barge-in cancels active speech", () => {
    let handlers!: SttHandlers;
    const sent: UtteranceOut[] = [];
    let canceled = 0;
    const state = createVoiceState(() => {});
    state.socketOpened();
    state.replyReceived();
    const controller = createTalkController({
      socket: {
        sendPtt: () => {},
        sendUtterance: (utterance) => { sent.push(utterance); return "id"; },
      },
      makeStt: (value) => {
        handlers = value;
        return { press: () => {}, release: () => {}, isActive: () => false };
      },
      tts: { cancel: () => { canceled += 1; }, markSent: () => {}, isSpeaking: () => true, msSinceSpeechEnd: () => 0 },
      state,
      earcons: { play: () => {} },
      caption: { render: () => {}, clear: () => {} },
      log: { markInterrupted: () => {}, showMessage: () => {}, userSaid: () => {} },
      spokenText: () => "Current speech continues.",
      bargeInMode: () => "voice",
      handleLocalUtterance: (text) => parseSpeechRateCommand(text) !== null,
    });

    controller.activate();
    controller.onSpeechStart();
    handlers.onFinal({ text: "Faster!", confidence: 1, alternatives: [] });

    expect(canceled).toBe(0);
    expect(sent).toEqual([]);
  });
});
