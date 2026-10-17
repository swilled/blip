// Global push-to-talk hook: wraps uiohook-napi and ptt-state (D-02, VOX-01).
// Only keycodes 29 (Left Ctrl), 57 (Space) and 3613 (Right Ctrl) are interpreted.
// Nothing else is stored, forwarded or logged (T-01-04). This module never logs.
import { uIOhook } from "uiohook-napi";
import { createPttState, type PttState } from "./ptt-state";

const LEFT_CTRL = 29;
const SPACE = 57;
const RIGHT_CTRL = 3613;

interface KeyEventLike {
  keycode: number;
}

/** The subset of uIOhook that this wrapper uses; injectable for tests. */
export interface HookLike {
  on(event: "keydown" | "keyup", listener: (e: KeyEventLike) => void): unknown;
  off(event: "keydown" | "keyup", listener: (e: KeyEventLike) => void): unknown;
  start(): void;
  stop(): void;
}

export interface PttHookDeps {
  hook?: HookLike;
}

let running: {
  hook: HookLike;
  down: (e: KeyEventLike) => void;
  up: (e: KeyEventLike) => void;
  state: PttState;
} | null = null;

function relevant(keycode: number): boolean {
  return keycode === LEFT_CTRL || keycode === SPACE || keycode === RIGHT_CTRL;
}

export function startPttHook(
  onHold: (state: "start" | "end") => void,
  deps: PttHookDeps = {},
): void {
  if (running) stopPttHook();
  const hook = deps.hook ?? (uIOhook as unknown as HookLike);
  const state = createPttState({ onChange: onHold });
  const down = (e: KeyEventLike): void => {
    if (relevant(e.keycode)) state.handle("down", e.keycode);
  };
  const up = (e: KeyEventLike): void => {
    if (relevant(e.keycode)) state.handle("up", e.keycode);
  };
  hook.on("keydown", down);
  hook.on("keyup", up);
  running = { hook, down, up, state };
  hook.start();
}

export function stopPttHook(): void {
  if (!running) return;
  const { hook, down, up, state } = running;
  running = null;
  hook.off("keydown", down);
  hook.off("keyup", up);
  state.reset();
  hook.stop();
}
