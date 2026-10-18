import { afterEach, describe, expect, it, vi } from "vitest";
import { createPttState } from "./ptt-state.js";

const RCTRL = 3613;
const SPACE = 57;
const LCTRL = 29;

function setup() {
  const events: string[] = [];
  const ptt = createPttState({
    onChange: (s) => events.push(s),
  });
  return { ptt, events };
}

afterEach(() => vi.useRealTimers());

describe("ptt-state", () => {
  it("stays active beyond ten seconds and ends only after both keys are released", () => {
    vi.useFakeTimers();
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL); ptt.handle("down", SPACE);
    vi.advanceTimersByTime(60_000);
    expect(events).toEqual(["start"]);
    ptt.handle("up", SPACE); expect(events).toEqual(["start"]);
    ptt.handle("up", RCTRL); expect(events).toEqual(["start", "end"]);
  });
  it("stays active until both Right Ctrl and Space are released", () => {
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    expect(events).toEqual(["start"]);
    ptt.handle("up", SPACE);
    expect(events).toEqual(["start"]);
    ptt.handle("up", RCTRL);
    expect(events).toEqual(["start", "end"]);
  });

  it("ignores key repeat", () => {
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    ptt.handle("down", SPACE);
    ptt.handle("down", SPACE);
    ptt.handle("down", RCTRL);
    expect(events).toEqual(["start"]);
  });

  it("ends once after releasing both keys, then restarts on a new hold", () => {
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    ptt.handle("up", RCTRL);
    expect(events).toEqual(["start"]);
    ptt.handle("up", SPACE);
    expect(events).toEqual(["start", "end"]);
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    expect(events).toEqual(["start", "end", "start"]);
  });

  it("ignores Left Ctrl and single keys", () => {
    const { ptt, events } = setup();
    ptt.handle("down", LCTRL);
    ptt.handle("down", SPACE);
    ptt.handle("up", SPACE);
    ptt.handle("up", LCTRL);
    ptt.handle("down", RCTRL);
    ptt.handle("up", RCTRL);
    ptt.handle("down", SPACE);
    ptt.handle("up", SPACE);
    expect(events).toEqual([]);
  });

  it("ignores other keycodes and does not store them", () => {
    const { ptt, events } = setup();
    ptt.handle("down", 30);
    ptt.handle("down", RCTRL);
    ptt.handle("down", 30);
    expect(events).toEqual([]);
    ptt.handle("down", SPACE);
    expect(events).toEqual(["start"]);
    ptt.handle("up", 30);
    expect(events).toEqual(["start"]);
  });

});
