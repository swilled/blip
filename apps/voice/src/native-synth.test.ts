import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeSynth } from "./native-synth";
const voice = { name: "Microsoft David", voiceURI: "local-david", lang: "en-US", localService: true, default: true } as SpeechSynthesisVoice;
function setup() {
  const target = new EventTarget();
  let voices: SpeechSynthesisVoice[] = [voice];
  const spoken: SpeechSynthesisUtterance[] = [];
  const errors: string[] = [], done: string[] = [];
  const synth = createNativeSynth({
    synthesis: { getVoices: () => voices, speak: (u: SpeechSynthesisUtterance) => spoken.push(u), cancel: vi.fn(), paused: false, resume() {}, addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) } as never,
    makeUtterance: text => ({ text, rate: 1, voice: null, onend: null, onerror: null, onstart: null }) as unknown as SpeechSynthesisUtterance,
  });
  const speak = (rate = 1) => synth.speak("Test phrase.", { onstart: () => done.push("start"), onend: () => done.push("end"), onerror: e => errors.push(e ?? "") }, rate);
  return { synth, spoken, errors, done, target, setVoices: (v: SpeechSynthesisVoice[]) => { voices = v; }, speak };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("native synthesis lifecycle", () => {
  it("applies a chosen voice to the next item without disturbing current speech or rate", () => {
    const t = setup();
    const zira = { ...voice, voiceURI: "local-zira", name: "Microsoft Zira" };
    t.setVoices([voice, zira, { ...voice, name: "Network voice", voiceURI: "remote", localService: false }]); t.speak(1.26); vi.advanceTimersByTime(0);
    t.synth.setVoice(zira.voiceURI);
    expect(t.spoken[0].voice).toBe(voice); expect(t.spoken[0].rate).toBe(1.26);
    t.spoken[0].onend!({} as never); t.speak(0.5); vi.advanceTimersByTime(0);
    expect(t.spoken[1].voice).toBe(zira); expect(t.spoken[1].rate).toBe(0.5);
    expect(t.synth.getVoices()).toEqual([voice, zira]); t.synth.dispose();
  });
  it("sets voice and rate in the next task and reports actual events once", () => {
    const t = setup(); t.speak(0.63);
    expect(t.spoken).toHaveLength(0); vi.advanceTimersByTime(0);
    const u = t.spoken[0]!;
    expect(u.rate).toBe(0.63); expect(u.voice).toBe(voice);
    u.onstart!({} as never); u.onend!({} as never); u.onerror!({ error: "canceled" } as never);
    expect(t.done).toEqual(["start", "end"]); expect(t.errors).toEqual([]); t.synth.dispose();
  });
  it("loads delayed voices and retains the selected voice across list reordering", () => {
    const t = setup(); t.setVoices([]); t.speak();
    vi.advanceTimersByTime(1000); expect(t.spoken).toEqual([]);
    t.setVoices([voice]); t.target.dispatchEvent(new Event("voiceschanged")); vi.advanceTimersByTime(0);
    expect(t.spoken[0]?.voice).toBe(voice); t.spoken[0]!.onend!({} as never);
    t.setVoices([{ ...voice, name: "Microsoft Aaron", voiceURI: "aaron" }, voice]);
    t.speak(2); vi.advanceTimersByTime(0);
    expect(t.spoken[1]?.voice).toBe(voice); t.synth.dispose();
  });
  it("ignores cancelled callbacks and remains usable after twenty changes", () => {
    const t = setup();
    for (let i = 0; i < 20; i++) {
      t.speak(i % 2 ? 0.5 : 2); vi.advanceTimersByTime(0);
      const old = t.spoken.at(-1)!; t.synth.cancel(); old.onerror!({ error: "interrupted" } as never);
    }
    t.speak(); vi.advanceTimersByTime(0); t.spoken.at(-1)!.onstart!({} as never); t.spoken.at(-1)!.onend!({} as never);
    expect(t.errors).toEqual([]); expect(t.done).toEqual(["start", "end"]); t.synth.dispose();
  });
  it("does not launch after cancellation during voice loading", () => {
    const t = setup(); t.setVoices([]); t.speak(); t.synth.cancel();
    vi.advanceTimersByTime(10000); expect(t.spoken).toEqual([]); t.synth.dispose();
  });
});
