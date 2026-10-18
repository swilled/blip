import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTts, type Synth, type SynthHandlers, type TtsDeps, type TtsDone } from "./tts";

function setup() {
  const spoken: string[] = [];
  const spokenRates: Array<number | undefined> = [];
  const handlers: SynthHandlers[] = [];
  let currentRate = 1.0;
  const cancel = vi.fn();
  const synth: Synth = {
    speak(text, h, rate) {
      spoken.push(text);
      spokenRates.push(rate);
      handlers.push(h);
    },
    cancel,
  };
  const done: TtsDone[] = [];
  const tts = createTts({
    synth,
    getRate: () => currentRate,
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onDone: (d) => done.push(d),
  } as unknown as TtsDeps);
  return { tts, spoken, spokenRates, handlers, done, cancel, setRate: (rate: number) => (currentRate = rate) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tts", () => {
  it("captures rate when each utterance starts without restarting active speech", () => {
    const harness = setup();
    const { tts, handlers, spokenRates, cancel, setRate } = harness;
    tts.speak("current item.");
    expect(spokenRates).toEqual([1.0]);
    setRate(1.4);
    tts.speak("queued acknowledgement.");
    expect(spokenRates).toEqual([1.0]);
    handlers[0].onend();
    vi.advanceTimersByTime(400);
    expect(spokenRates).toEqual([1.0, 1.4]);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("speaks sentence by sentence in order", () => {
    const { tts, spoken, handlers } = setup();
    tts.speak("a. b.", { speakId: "s1" });
    expect(spoken).toEqual(["a."]);
    handlers[0].onend();
    expect(spoken).toEqual(["a.", "b."]);
  });

  it("speaks One moment. once when no reply within 1500 ms", () => {
    const { tts, spoken } = setup();
    tts.markSent();
    vi.advanceTimersByTime(1499);
    expect(spoken).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(spoken).toEqual(["One moment."]);
    vi.advanceTimersByTime(1500);
    expect(spoken).toEqual(["One moment."]);
  });

  it("a reply (or server filler) before 1500 ms prevents One moment.", () => {
    const { tts, spoken } = setup();
    tts.markSent();
    vi.advanceTimersByTime(1000);
    tts.markReplied();
    vi.advanceTimersByTime(5000);
    expect(spoken).toEqual([]);
  });

  it("fails closed as interrupted when the completion watchdog expires", () => {
    const { tts, done, cancel } = setup();
    tts.speak("one two three", { speakId: "s1" }); // 3 words = 1200 ms estimate
    vi.advanceTimersByTime(2199);
    expect(done).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(done).toEqual([{ speakId: "s1", interrupted: true }]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("waits the 400 ms tail after onend before reporting done", () => {
    const { tts, handlers, done } = setup();
    tts.speak("hello.", { speakId: "s1" });
    handlers[0].onend();
    vi.advanceTimersByTime(399);
    expect(done).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(done).toHaveLength(1);
  });

  it("reports done exactly once for a finished speak", () => {
    const { tts, handlers, done } = setup();
    tts.speak("hello.", { speakId: "s1" });
    handlers[0].onend();
    handlers[0].onend();
    vi.advanceTimersByTime(10_000);
    expect(done).toEqual([{ speakId: "s1", interrupted: false }]);
  });

  it("treats onerror (interrupted/canceled) as interruption, not completion", () => {
    const { tts, handlers, done, cancel } = setup();
    tts.speak("hello. second sentence.", { speakId: "s1" });
    handlers[0].onerror("interrupted");
    expect(done).toEqual([{ speakId: "s1", interrupted: true }]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancel reports interrupted for active and queued speaks in order, once", () => {
    const { tts, handlers, done, cancel } = setup();
    tts.speak("one.", { speakId: "s1" });
    tts.speak("two.", { speakId: "s2" });
    tts.speak("three.", { speakId: "s3" });
    tts.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(done).toEqual([
      { speakId: "s1", interrupted: true },
      { speakId: "s2", interrupted: true },
      { speakId: "s3", interrupted: true },
    ]);
    // the synth's own cancelled-utterance error must not produce another report
    handlers[0].onerror("canceled");
    vi.advanceTimersByTime(10_000);
    tts.cancel();
    expect(done).toHaveLength(3);
    expect(tts.isSpeaking()).toBe(false);
  });

  it("local One moment. filler reports done with no speakId", () => {
    const { tts, handlers, done } = setup();
    tts.markSent();
    vi.advanceTimersByTime(1500);
    handlers[0].onend();
    vi.advanceTimersByTime(400);
    expect(done).toEqual([{ speakId: undefined, interrupted: false }]);
  });

  it("isSpeaking and msSinceSpeechEnd", () => {
    const { tts, handlers } = setup();
    expect(tts.isSpeaking()).toBe(false);
    expect(tts.msSinceSpeechEnd()).toBe(Number.POSITIVE_INFINITY);
    tts.speak("hello.", { speakId: "s1" });
    expect(tts.isSpeaking()).toBe(true);
    handlers[0].onend();
    expect(tts.isSpeaking()).toBe(true);
    vi.advanceTimersByTime(400);
    expect(tts.isSpeaking()).toBe(false);
    vi.advanceTimersByTime(250);
    expect(tts.msSinceSpeechEnd()).toBe(250);
  });
});
