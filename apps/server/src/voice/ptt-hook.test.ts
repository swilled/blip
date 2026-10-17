import { describe, it, expect, afterEach } from "vitest";
import { startPttHook, stopPttHook, type HookLike } from "./ptt-hook";

type Listener = (e: { keycode: number }) => void;

function fakeHook() {
  const listeners: Record<string, Set<Listener>> = { keydown: new Set(), keyup: new Set() };
  let started = 0;
  let stopped = 0;
  const hook: HookLike = {
    on(ev, l) {
      listeners[ev]!.add(l);
    },
    off(ev, l) {
      listeners[ev]!.delete(l);
    },
    start() {
      started++;
    },
    stop() {
      stopped++;
    },
  };
  return {
    hook,
    down: (keycode: number) => listeners.keydown!.forEach((l) => l({ keycode })),
    up: (keycode: number) => listeners.keyup!.forEach((l) => l({ keycode })),
    count: () => listeners.keydown!.size + listeners.keyup!.size,
    started: () => started,
    stopped: () => stopped,
  };
}

afterEach(() => stopPttHook());

describe("ptt-hook", () => {
  it("Right Ctrl + Space gives start then end, and the hook is started", () => {
    const f = fakeHook();
    const seen: string[] = [];
    startPttHook((s) => seen.push(s), { hook: f.hook });
    expect(f.started()).toBe(1);
    f.down(3613);
    expect(seen).toEqual([]);
    f.down(57);
    expect(seen).toEqual(["start"]);
    f.up(57);
    expect(seen).toEqual(["start", "end"]);
    f.up(3613);
    expect(seen).toEqual(["start", "end"]);
  });

  it("Left Ctrl produces nothing", () => {
    const f = fakeHook();
    const seen: string[] = [];
    startPttHook((s) => seen.push(s), { hook: f.hook });
    f.down(29);
    f.down(57);
    f.up(57);
    f.up(29);
    expect(seen).toEqual([]);
  });

  it("other keycodes are ignored and never reach ptt-state", () => {
    const f = fakeHook();
    const seen: string[] = [];
    startPttHook((s) => seen.push(s), { hook: f.hook });
    for (const k of [30, 31, 42, 28, 1, 3675]) {
      f.down(k);
      f.up(k);
    }
    expect(seen).toEqual([]);
  });

  it("the module neither logs nor writes files", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./ptt-hook.ts", import.meta.url), "utf8");
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/console\./);
    expect(code).not.toMatch(/writeFile|appendFile|createWriteStream/);
  });

  it("stopPttHook stops the hook, removes listeners and ends an active hold", () => {
    const f = fakeHook();
    const seen: string[] = [];
    startPttHook((s) => seen.push(s), { hook: f.hook });
    expect(f.count()).toBe(2);
    f.down(3613);
    f.down(57);
    stopPttHook();
    expect(f.count()).toBe(0);
    expect(f.stopped()).toBe(1);
    expect(seen).toEqual(["start", "end"]);
    f.down(3613);
    f.down(57);
    expect(seen).toEqual(["start", "end"]);
  });
});
