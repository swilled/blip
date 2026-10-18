// Window side of Design D docking. Talks to the loopback sidecar (same socket server as the global
// hold) on its own connection: sends {dock} and {drag}, receives {docked}, {zone} and {dockAvailable}.
// Anything else from the sidecar is dropped.
import { HOLD_URL, type HoldSocketLike } from "./hold-client";

export type DockEdge = "left" | "right" | "top";
const RECONNECT_MS = 2000;

export type DockEvent =
  | { kind: "docked"; edge: DockEdge }
  | { kind: "zone"; zone: DockEdge | null }
  | { kind: "available"; available: boolean };

function edgeOf(value: unknown): DockEdge | null {
  return value === "left" || value === "right" || value === "top" ? value : null;
}

export function parseDockEvent(data: unknown): DockEvent | null {
  if (typeof data !== "string" || data.length > 64) return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  const rec = v as Record<string, unknown>;
  if (keys[0] === "docked") {
    const edge = edgeOf(rec.docked);
    return edge ? { kind: "docked", edge } : null;
  }
  if (keys[0] === "zone") {
    const zone = rec.zone === null ? null : edgeOf(rec.zone);
    return zone !== null || rec.zone === null ? { kind: "zone", zone } : null;
  }
  if (keys[0] === "dockAvailable" && typeof rec.dockAvailable === "boolean") return { kind: "available", available: rec.dockAvailable };
  return null;
}

export interface DockSocketLike extends HoldSocketLike {
  readyState: number;
  send(data: string): void;
}

export interface DockClientDeps {
  makeWebSocket: (url: string) => DockSocketLike;
  onEvent: (event: DockEvent) => void;
  onConnection?: (connected: boolean) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  url?: string;
}

export interface DockClient {
  dock(edge: DockEdge): boolean;
  drag(phase: "start" | "end" | "cancel"): boolean;
  close(): void;
}

const OPEN = 1;

export function createDockClient(deps: DockClientDeps): DockClient {
  let stopped = false;
  let sock: DockSocketLike | null = null;
  function connect(): void {
    const s = deps.makeWebSocket(deps.url ?? HOLD_URL);
    sock = s;
    s.onopen = () => deps.onConnection?.(true);
    s.onmessage = (ev) => {
      if (stopped || sock !== s) return;
      const event = parseDockEvent(ev.data);
      if (event) deps.onEvent(event);
    };
    s.onerror = () => {};
    s.onclose = () => {
      if (sock !== s) return;
      deps.onConnection?.(false);
      sock = null;
      if (!stopped) deps.setTimer(connect, RECONNECT_MS);
    };
  }
  function send(message: object): boolean {
    if (!sock || sock.readyState !== OPEN) return false;
    sock.send(JSON.stringify(message));
    return true;
  }
  connect();
  return {
    dock: (edge) => send({ dock: edge }),
    drag: (phase) => send({ drag: phase }),
    close() {
      stopped = true;
      sock?.close();
    },
  };
}
