import { describe, it, expect } from "vitest";
import {
  createStt,
  MSG_DIDNT_CATCH,
  MSG_MIC,
  MSG_CLICK_WINDOW,
  type RecognitionLike,
  type SttFinal,
  type SttError,
  type SttResultEvent,
} from "./stt";

function fakeRec() {
  const calls = { start: 0, stop: 0 };
  const rec: RecognitionLike = {
    lang: "",
    continuous: true,
    interimResults: false,
    maxAlternatives: 0,
    onresult: null,
    onerror: null,
    onend: null,
    start() {
      calls.start++;
    },
    stop() {
      calls.stop++;
    },
  };
  return { rec, calls };
}

function res(isFinal: boolean, alts: Array<[string, number]>) {
  const r: Record<number, { transcript: string; confidence: number }> & {
    isFinal: boolean;
    length: number;
  } = { isFinal, length: alts.length };
  alts.forEach(([transcript, confidence], i) => {
    r[i] = { transcript, confidence };
  });
  return r;
}
function event(...results: ReturnType<typeof res>[]): SttResultEvent {
  const list: Record<number, unknown> & { length: number } = { length: results.length };
  results.forEach((r, i) => (list[i] = r));
  return { results: list as SttResultEvent["results"] };
}

function setup(canListen = () => true) {
  const f = fakeRec();
  const interim: string[] = [];
  const finals: SttFinal[] = [];
  const errors: SttError[] = [];
  const stt = createStt({
    makeRecognition: () => f.rec,
    onInterim: (t) => interim.push(t),
    onFinal: (x) => finals.push(x),
    onError: (e) => errors.push(e),
    canListen,
  });
  return { f, stt, interim, finals, errors };
}

describe("stt", () => {
  it("one start per press; a second press while active is ignored", () => {
    const { f, stt } = setup();
    stt.press();
    stt.press();
    expect(f.calls.start).toBe(1);
    expect(f.rec.continuous).toBe(false);
    expect(f.rec.maxAlternatives).toBe(3);
    expect(f.rec.lang).toBe("en-US");
    expect(f.rec.interimResults).toBe(true);
  });

  it("release stops; interim then a single final", () => {
    const { f, stt, interim, finals } = setup();
    stt.press();
    f.rec.onresult!(event(res(false, [["open the", 0]])));
    expect(interim).toEqual(["open the"]);
    stt.release();
    expect(f.calls.stop).toBe(1);
    f.rec.onresult!(event(res(true, [["open the menu", 0.9]])));
    f.rec.onresult!(event(res(true, [["open the menu", 0.9]])));
    f.rec.onend!();
    expect(finals).toEqual([{ text: "open the menu", confidence: 0.9, alternatives: [] }]);
    expect(stt.isActive()).toBe(false);
  });

  it("waits for all final chunks before delivering a multiword utterance", () => {
    const { f, stt, finals } = setup();
    stt.press();

    f.rec.onresult!(event(res(true, [["read the", 0.9]])));
    expect(finals).toEqual([]);

    f.rec.onresult!(
      event(res(true, [["read the", 0.9]]), res(true, [["form", 0.8]])),
    );
    expect(finals).toEqual([]);

    f.rec.onend!();
    expect(finals).toHaveLength(1);
    expect(finals[0]!.text).toBe("read the form");
    expect(finals[0]!.confidence).toBeCloseTo(0.85);
    expect(finals[0]!.alternatives).toEqual([]);
  });

  it("clamps confidence and limits alternatives", () => {
    const { f, stt, finals } = setup();
    stt.press();
    const long = "x".repeat(900);
    f.rec.onresult!(
      event(
        res(true, [
          ["best", 1.7],
          ["best", 0.5],
          ["alt one", 0.4],
          [long, 0.3],
          ["alt three", 0.2],
          ["alt four", 0.1],
        ]),
      ),
    );
    f.rec.onend!();
    const out = finals[0]!;
    expect(out.confidence).toBe(1);
    expect(out.alternatives).toHaveLength(3);
    expect(out.alternatives).not.toContain("best");
    expect(out.alternatives.every((a) => a.length <= 500)).toBe(true);
  });

  it("maps errors to the copywriting messages with no retry", () => {
    for (const [code, msg] of [
      ["no-speech", MSG_DIDNT_CATCH],
      ["not-allowed", MSG_MIC],
      ["network", MSG_DIDNT_CATCH],
    ] as const) {
      const { f, stt, errors } = setup();
      stt.press();
      f.rec.onerror!({ error: code });
      f.rec.onend!();
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe(msg);
      expect(f.calls.start).toBe(1);
    }
  });

  it("an end with no result reports a single didn't-catch error", () => {
    const { f, stt, errors } = setup();
    stt.press();
    f.rec.onend!();
    expect(errors.map((e) => e.message)).toEqual([MSG_DIDNT_CATCH]);
    expect(f.calls.start).toBe(1);
  });

  it("does not start when canListen is false and reports the click message", () => {
    const { f, stt, errors } = setup(() => false);
    stt.press();
    expect(f.calls.start).toBe(0);
    expect(errors).toEqual([{ kind: "unfocused", message: MSG_CLICK_WINDOW }]);
  });
});
