import { describe, expect, it } from "vitest";
import { createHoldClient, parseHold, type HoldSocketLike } from "./hold-client";

function fake() {
  const socks: HoldSocketLike[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const holds: string[] = [];
  createHoldClient({
    makeWebSocket: () => {
      const s: HoldSocketLike = { onmessage: null, onclose: null, onerror: null, close() {} };
      socks.push(s);
      return s;
    },
    onHold: (h) => holds.push(h),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
  });
  return { socks, timers, holds };
}

describe("hold client", () => {
  it("accepts only {hold:start|end}", () => {
    expect(parseHold('{"hold":"start"}')).toBe("start");
    expect(parseHold('{"hold":"end"}')).toBe("end");
    for (const bad of ['{"hold":"x"}', '{"hold":"start","k":1}', "[]", "nope", '{"state":"start"}', 5, null]) {
      expect(parseHold(bad)).toBeNull();
    }
  });

  it("feeds valid holds, drops others", () => {
    const f = fake();
    f.socks[0]!.onmessage!({ data: '{"hold":"start"}' });
    f.socks[0]!.onmessage!({ data: '{"hold":"bogus"}' });
    expect(f.holds).toEqual(["start"]);
  });

  it("reconnects after 2000 ms", () => {
    const f = fake();
    f.socks[0]!.onclose!();
    expect(f.timers[0]!.ms).toBe(2000);
    f.timers[0]!.fn();
    expect(f.socks).toHaveLength(2);
  });
  it("ends active holds on disconnect and ignores callbacks from the replaced socket", () => {
    const f = fake();
    f.socks[0]!.onmessage!({ data: '{"hold":"start"}' });
    f.socks[0]!.onclose!();
    expect(f.holds).toEqual(["start", "end"]);
    f.timers[0]!.fn();
    f.socks[0]!.onmessage!({ data: '{"hold":"start"}' });
    expect(f.holds).toEqual(["start", "end"]);
  });
});
