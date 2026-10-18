import { describe, expect, it } from "vitest";
import { createPttState } from "./ptt-state.js";

const RCTRL = 3613;
const SPACE = 57;
const LCTRL = 29;

function setup() {
  const events: string[] = [];
  let pending: (() => void) | null = null;
  const ptt = createPttState({
    onChange: (s) => events.push(s),
    setTimer: (fn) => {
      pending = fn;
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
  });
  return { ptt, events, fire: () => pending?.(), hasTimer: () => pending !== null };
}

describe("ptt-state", () => {
  it("emits one start on Right Ctrl + Space and one end on release", () => {
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    expect(events).toEqual(["start"]);
    ptt.handle("up", SPACE);
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

  it("ends once when Right Ctrl is released first, then restarts on a new hold", () => {
    const { ptt, events } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    ptt.handle("up", RCTRL);
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

  it("watchdog forces one end; normal end cancels it", () => {
    const a = setup();
    a.ptt.handle("down", RCTRL);
    a.ptt.handle("down", SPACE);
    expect(a.hasTimer()).toBe(true);
    a.fire();
    expect(a.events).toEqual(["start", "end"]);
    const b = setup();
    b.ptt.handle("down", RCTRL);
    b.ptt.handle("down", SPACE);
    b.ptt.handle("up", SPACE);
    expect(b.hasTimer()).toBe(false);
    expect(b.events).toEqual(["start", "end"]);
  });

  it("after a forced end, no new start until both keys released and pressed again", () => {
    const { ptt, events, fire } = setup();
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    fire();
    ptt.handle("down", SPACE);
    ptt.handle("down", RCTRL);
    expect(events).toEqual(["start", "end"]);
    ptt.handle("up", SPACE);
    ptt.handle("up", RCTRL);
    ptt.handle("down", RCTRL);
    ptt.handle("down", SPACE);
    expect(events).toEqual(["start", "end", "start"]);
  });
});
