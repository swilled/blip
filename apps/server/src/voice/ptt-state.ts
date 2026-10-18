// Pure push-to-talk state machine: hold Right Ctrl + Space (D-02).
// Keeps only two booleans; every other keycode is ignored and never stored (T-01-04).

export const RIGHT_CTRL = 3613;
export const SPACE = 57;

export interface PttStateOptions {
  onChange: (state: "start" | "end") => void;
  watchdogMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface PttState {
  handle(kind: "down" | "up", keycode: number): void;
  reset(): void;
}

export function createPttState(opts: PttStateOptions): PttState {
  const watchdogMs = opts.watchdogMs ?? 10000;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let ctrlDown = false;
  let spaceDown = false;
  let active = false;
  let latched = false;
  let timer: unknown = null;

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function end(): void {
    if (!active) return;
    active = false;
    cancelTimer();
    opts.onChange("end");
  }

  function evaluate(): void {
    const bothReleased = !ctrlDown && !spaceDown;
    if (bothReleased) latched = false;
    const both = ctrlDown && spaceDown;
    if (both && !active && !latched) {
      active = true;
      opts.onChange("start");
      cancelTimer();
      timer = setTimer(() => {
        timer = null;
        if (active) {
          latched = true;
          end();
        }
      }, watchdogMs);
    } else if (bothReleased && active) {
      end();
    }
  }

  return {
    handle(kind, keycode) {
      if (keycode !== RIGHT_CTRL && keycode !== SPACE) return;
      const down = kind === "down";
      if (keycode === RIGHT_CTRL) ctrlDown = down;
      else spaceDown = down;
      evaluate();
    },
    reset() {
      cancelTimer();
      ctrlDown = false;
      spaceDown = false;
      latched = false;
      end();
    },
  };
}
