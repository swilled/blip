// Pure push-to-talk state machine: hold Right Ctrl + Space (D-02).
// Keeps only two booleans; every other keycode is ignored and never stored (T-01-04).

export const RIGHT_CTRL = 3613;
export const SPACE = 57;

export interface PttStateOptions {
  onChange: (state: "start" | "end", reason?: "reset") => void;
}

export interface PttState {
  handle(kind: "down" | "up", keycode: number): void;
  reset(): void;
}

export function createPttState(opts: PttStateOptions): PttState {
  let ctrlDown = false;
  let spaceDown = false;
  let active = false;

  function end(reason?: "reset"): void {
    if (!active) return;
    active = false;
    opts.onChange("end", reason);
  }

  function evaluate(): void {
    const bothReleased = !ctrlDown && !spaceDown;
    const both = ctrlDown && spaceDown;
    if (both && !active) {
      active = true;
      opts.onChange("start");
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
      ctrlDown = false;
      spaceDown = false;
      end("reset");
    },
  };
}
