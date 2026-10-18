// Window side of PTT_DELIVERY B: receives {hold:"start"|"end"} from the loopback sidecar.
// Anything else is dropped. Reconnects every 2000 ms.
export const HOLD_URL = "ws://127.0.0.1:7778";
const RECONNECT_MS = 2000;

export interface HoldSocketLike {
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface HoldClientDeps {
  makeWebSocket: (url: string) => HoldSocketLike;
  onHold: (state: "start" | "end") => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  url?: string;
}

export function parseHold(data: unknown): "start" | "end" | null {
  if (typeof data !== "string" || data.length > 64) return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1 || keys[0] !== "hold") return null;
  const h = (v as { hold: unknown }).hold;
  return h === "start" || h === "end" ? h : null;
}

export function createHoldClient(deps: HoldClientDeps): { close(): void } {
  let stopped = false;
  let sock: HoldSocketLike | null = null;
  function connect(): void {
    const s = deps.makeWebSocket(deps.url ?? HOLD_URL);
    sock = s;
    s.onmessage = (ev) => {
      const h = parseHold(ev.data);
      if (h) deps.onHold(h);
    };
    s.onerror = () => {};
    s.onclose = () => {
      sock = null;
      if (!stopped) deps.setTimer(connect, RECONNECT_MS);
    };
  }
  connect();
  return {
    close() {
      stopped = true;
      sock?.close();
    },
  };
}
