import { describe, it, expect, vi } from "vitest";
import { createSpeakBridge } from "./speak-bridge";
import { createTts, type SynthHandlers } from "./tts";

function mk() {
  const tts = { speak: vi.fn(), cancel: vi.fn(), markReplied: vi.fn() };
  const sent: unknown[] = [];
  const b = createSpeakBridge({ tts, sendSpeakDone: (p) => sent.push(p) });
  return { tts, sent, b };
}

describe("speak bridge", () => {
  it("markReplied then speak with speakId", () => {
    const { tts, b } = mk();
    b.onSpeak({ speakId: "s1", text: "hi.", category: "answer", interrupt: false });
    expect(tts.markReplied).toHaveBeenCalled();
    expect(tts.speak).toHaveBeenCalledWith("hi.", { speakId: "s1" });
    expect(tts.cancel).not.toHaveBeenCalled();
  });
  it("interrupt cancels first", () => {
    const { tts, b } = mk();
    const order: string[] = [];
    tts.cancel.mockImplementation(() => order.push("cancel"));
    tts.speak.mockImplementation(() => order.push("speak"));
    b.onSpeak({ speakId: "s1", text: "hi.", category: "answer", interrupt: true });
    expect(order).toEqual(["cancel", "speak"]);
  });
  it("sends speak.done once per defined speakId, interrupted flag passed", () => {
    const { sent, b } = mk();
    b.onTtsDone({ speakId: "s1", interrupted: false });
    b.onTtsDone({ speakId: "s2", interrupted: true });
    b.onTtsDone({ speakId: undefined, interrupted: false });
    expect(sent).toEqual([
      { speakId: "s1", interrupted: false },
      { speakId: "s2", interrupted: true },
    ]);
  });
  it("three queued speaks cancelled together give three interrupted dones", () => {
    const sent: unknown[] = [];
    let bridge: ReturnType<typeof createSpeakBridge>;
    const handlers: SynthHandlers[] = [];
    const tts = createTts({
      synth: { speak: (_t, h) => handlers.push(h), cancel: () => {} },
      now: () => 0,
      setTimer: () => 0,
      clearTimer: () => {},
      onDone: (d) => bridge.onTtsDone(d),
    });
    bridge = createSpeakBridge({ tts, sendSpeakDone: (p) => sent.push(p) });
    for (const id of ["a", "b", "c"]) bridge.onSpeak({ speakId: id, text: "x.", category: "answer", interrupt: false });
    tts.cancel();
    expect(sent).toEqual([
      { speakId: "a", interrupted: true },
      { speakId: "b", interrupted: true },
      { speakId: "c", interrupted: true },
    ]);
  });
  it("filler category marks replied", () => {
    const { tts, b } = mk();
    b.onSpeak({ speakId: "f", text: "One moment.", category: "filler", interrupt: false });
    expect(tts.markReplied).toHaveBeenCalled();
  });
});
