import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStt, MSG_CAPTURE_LIMIT, MSG_DIDNT_CATCH, MSG_MIC, MSG_MIC_MISSING, MSG_STT_NETWORK, MSG_STT_UNAVAILABLE, MSG_CLICK_WINDOW, type RecognitionLike, type SttFinal, type SttError, type SttResultEvent } from "./stt";
function result(text: string, final = true, confidence = 0.9): SttResultEvent {
  return { results: { length: 1, 0: { isFinal: final, length: 1, 0: { transcript: text, confidence } } } };
}
function setup(canListen = () => true) {
  const records: Array<{ rec: RecognitionLike; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }> = [];
  const finals: SttFinal[] = [], errors: SttError[] = [], interim: string[] = [], stages: string[] = [];
  const stt = createStt({
    makeRecognition() {
      const start = vi.fn(), stop = vi.fn(), abort = vi.fn();
      const rec: RecognitionLike = { lang: "", continuous: false, interimResults: false, maxAlternatives: 0, onresult: null, onerror: null, onend: null, start, stop, abort };
      records.push({ rec, start, stop, abort }); return rec;
    },
    onInterim: text => interim.push(text), onFinal: f => finals.push(f), onError: e => errors.push(e), onStage: s => stages.push(s), canListen,
  });
  const first = () => records[0]!;
  const complete = (text: string) => { const r = records.at(-1)!.rec; r.onresult!(result(text)); stt.release(); r.onend!(); };
  return { stt, records, first, finals, errors, interim, stages, complete };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("held speech capture", () => {
  it("waits for native readiness and ignores a duplicate press", () => {
    const t = setup(); t.stt.press(); t.stt.press();
    expect(t.records).toHaveLength(1);
    expect(t.stages).toEqual(["starting"]);
    t.first().rec.onstart!();
    expect(t.stages.at(-1)).toBe("listening");
    expect(t.first().rec).toMatchObject({ lang: "en-US", continuous: true, interimResults: true, maxAlternatives: 3 });
    t.stt.cancel();
  });
  it("delivers once only after release and finalization", () => {
    const t = setup(); t.stt.press();
    const r = t.first().rec;
    r.onresult!(result("read the", false));
    expect(t.interim).toEqual(["read the"]); expect(t.finals).toEqual([]);
    t.stt.release(); expect(t.first().stop).toHaveBeenCalledOnce();
    r.onresult!(result("read the form"));
    r.onend!(); r.onend!();
    expect(t.finals.map(x => x.text)).toEqual(["read the form"]);
    expect(t.stt.isActive()).toBe(false);
  });
  it("recovers an automatic end without treating it as key release", () => {
    const t = setup(); t.stt.press();
    t.first().rec.onend!();
    expect(t.stt.isActive()).toBe(true); expect(t.errors).toEqual([]);
    vi.advanceTimersByTime(999); expect(t.records).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(t.records).toHaveLength(2);
    t.complete("what's required");
    expect(t.finals[0]?.text).toBe("what's required");
  });
  it("collects final chunks across sessions with no duplicate prefix", () => {
    const t = setup(); t.stt.press();
    const r = t.first().rec;
    r.onresult!(result("read the")); r.onresult!(result("read the")); r.onend!();
    vi.advanceTimersByTime(1000);
    t.complete("form");
    expect(t.finals.map(x => x.text)).toEqual(["read the form"]);
    expect(t.interim.at(-1)).toBe("read the form");
  });
  it("survives no-speech while held and cancels a pending restart on release", () => {
    const t = setup(); t.stt.press();
    t.first().rec.onerror!({ error: "no-speech" }); t.first().rec.onend!();
    expect(t.errors).toEqual([]);
    t.stt.release(); vi.advanceTimersByTime(10000);
    expect(t.records).toHaveLength(1);
    expect(t.errors[0]?.message).toBe(MSG_DIDNT_CATCH);
  });
  it("bounds repeated automatic recovery", () => {
    const t = setup(); t.stt.press();
    for (let i = 0; i < 6; i++) { t.records.at(-1)!.rec.onend!(); vi.advanceTimersByTime(1000); }
    expect(t.records).toHaveLength(6);
    expect(t.errors).toHaveLength(1);
    expect(t.stt.isActive()).toBe(false);
  });
  it("settles terminal errors without waiting for an end event", () => {
    for (const [code, message] of [["not-allowed", MSG_MIC], ["audio-capture", MSG_MIC_MISSING], ["network", MSG_STT_NETWORK]]) {
      const t = setup(); t.stt.press(); t.first().rec.onresult!(result("submit"));
      t.first().rec.onerror!({ error: code! });
      expect(t.errors[0]?.message).toBe(message);
      expect(t.first().abort).toHaveBeenCalledOnce();
      expect(t.stt.isActive()).toBe(false);
      t.first().rec.onend!(); expect(t.finals).toEqual([]);
    }
  });
  it("discards a prefix if the browser loses an unfinished interim", () => {
    const t = setup(); t.stt.press();
    t.first().rec.onresult!(result("submit survey", false)); t.first().rec.onend!();
    expect(t.finals).toEqual([]); expect(t.errors).toHaveLength(1);
  });
  it("ignores old callbacks and cannot merge rapid consecutive holds", () => {
    const t = setup(); t.stt.press(); const old = t.first().rec;
    old.onresult!(result("old text")); t.stt.cancel(); t.stt.press();
    old.onresult!(result("submit survey")); old.onend!();
    t.complete("read the form");
    expect(t.finals.map(x => x.text)).toEqual(["read the form"]);
  });
  it("does not let a press steal a finalizing capture", () => {
    const t = setup(); t.stt.press(); t.stt.release(); t.stt.press();
    expect(t.records).toHaveLength(1); t.first().rec.onresult!(result("one")); t.first().rec.onend!();
    t.stt.press(); t.complete("two");
    expect(t.finals.map(x => x.text)).toEqual(["one", "two"]);
  });
  it("aborts a missing finalization and never sends its partial prefix", () => {
    const t = setup(); t.stt.press(); t.first().rec.onresult!(result("read the"));
    t.stt.release(); vi.advanceTimersByTime(2000);
    expect(t.finals).toEqual([]); expect(t.errors[0]?.message).toContain("did not finish");
    expect(t.first().abort).toHaveBeenCalledOnce();
  });
  it("bounds startup and the physical hold", () => {
    const a = setup(); a.stt.press(); vi.advanceTimersByTime(8000);
    expect(a.errors[0]?.message).toContain("did not start");
    const b = setup(); b.stt.press(); b.first().rec.onstart!();
    vi.advanceTimersByTime(10000); expect(b.errors[0]?.message).toBe(MSG_CAPTURE_LIMIT);
    expect(b.finals).toEqual([]);
  });
  it("rejects overlong final input without truncating it into a command", () => {
    const t = setup(); t.stt.press(); t.first().rec.onresult!(result("x".repeat(501)));
    expect(t.errors[0]?.message).toContain("too long"); expect(t.finals).toEqual([]);
  });
  it("keeps bounded alternatives and confidence only for the full hypothesis", () => {
    const t = setup(); t.stt.press();
    t.first().rec.onresult!({ results: { length: 1, 0: { isFinal: true, length: 3, 0: { transcript: "best", confidence: 2 }, 1: { transcript: "other", confidence: 0 }, 2: { transcript: "best", confidence: 0 } } } });
    t.stt.release(); t.first().rec.onend!();
    expect(t.finals).toEqual([{ text: "best", confidence: 1, alternatives: ["other"] }]);
  });
  it("reports browser absence or focus rejection instead of throwing", () => {
    const t = setup(() => false); t.stt.press(); expect(t.errors[0]?.message).toBe(MSG_CLICK_WINDOW);
    const errors: SttError[] = [];
    createStt({ makeRecognition() { throw new Error("absent"); }, onFinal() {}, onInterim() {}, onError: e => errors.push(e), canListen: () => true }).press();
    expect(errors[0]?.message).toBe(MSG_STT_UNAVAILABLE);
  });
});
