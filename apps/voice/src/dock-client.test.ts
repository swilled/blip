import { describe, expect, it } from "vitest";
import { createDockClient, parseDockEvent, type DockEvent, type DockSocketLike } from "./dock-client";

function fake() {
  const socks: (DockSocketLike & { sent: string[] })[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const events: DockEvent[] = [];
  const client = createDockClient({
    makeWebSocket: () => {
      const s = { readyState: 1, sent: [] as string[], onmessage: null, onclose: null, onerror: null, close() {}, send(d: string) { this.sent.push(d); } };
      socks.push(s);
      return s;
    },
    onEvent: (e) => events.push(e),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
  });
  return { client, socks, timers, events };
}

describe("dock client", () => {
  it("parses only docked, zone and dockAvailable events", () => {
    expect(parseDockEvent('{"docked":"top"}')).toEqual({ kind: "docked", edge: "top" });
    expect(parseDockEvent('{"zone":null}')).toEqual({ kind: "zone", zone: null });
    expect(parseDockEvent('{"zone":"left"}')).toEqual({ kind: "zone", zone: "left" });
    expect(parseDockEvent('{"dockAvailable":false}')).toEqual({ kind: "available", available: false });
    for (const bad of ['{"docked":"bottom"}', '{"zone":"x"}', '{"hold":"start"}', '{"docked":"top","x":1}', "[]", "nope", 3]) {
      expect(parseDockEvent(bad)).toBeNull();
    }
  });

  it("sends dock and drag requests and feeds events", () => {
    const f = fake();
    expect(f.client.dock("left")).toBe(true);
    expect(f.client.drag("start")).toBe(true);
    expect(f.socks[0]!.sent).toEqual(['{"dock":"left"}', '{"drag":"start"}']);
    f.socks[0]!.onmessage!({ data: '{"hold":"start"}' });
    f.socks[0]!.onmessage!({ data: '{"docked":"left"}' });
    expect(f.events).toEqual([{ kind: "docked", edge: "left" }]);
  });

  it("refuses to send while closed and reconnects after 2000 ms", () => {
    const f = fake();
    f.socks[0]!.readyState = 3;
    expect(f.client.dock("top")).toBe(false);
    f.socks[0]!.onclose!();
    expect(f.timers[0]!.ms).toBe(2000);
    f.timers[0]!.fn();
    expect(f.socks).toHaveLength(2);
  });
});
