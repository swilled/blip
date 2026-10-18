// Voice-owned loopback sidecar (PTT_DELIVERY B): carries the global hold to the voice window.
// 127.0.0.1 only, exact Origin match, never logs (T-01-10, T-01-04). The only inbound messages are
// window-docking requests ({dock} / {drag}), and only when a window handler is wired; anything else
// closes the socket.
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export const SIDECAR_PORT = 7778;
export const SIDECAR_ALLOWED_ORIGIN = "http://127.0.0.1:7777";

export type WindowRequest =
  | { dock: "left" | "right" | "top" }
  | { drag: "start" | "end" | "cancel" };

export type WindowEvent =
  | { zone: "left" | "right" | "top" | null }
  | { docked: "left" | "right" | "top" }
  | { dockAvailable: boolean };

export interface PttSidecar {
  broadcast(state: "start" | "end", reason?: "reset"): void;
  broadcastWindow(event: WindowEvent): void;
  /** Resolves to the bound port (useful when port 0 was requested). */
  listening: Promise<number>;
  close(): Promise<void>;
}

export interface PttSidecarOptions {
  port?: number;
  allowedOrigin?: string;
  onWindowRequest?: (request: WindowRequest) => void;
  /** Sent to each new connection, so the window knows whether docking works here. */
  windowHello?: () => WindowEvent;
}

export function parseWindowRequest(data: unknown): WindowRequest | null {
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
  if (keys[0] === "dock" && (rec.dock === "left" || rec.dock === "right" || rec.dock === "top")) return { dock: rec.dock };
  if (keys[0] === "drag" && (rec.drag === "start" || rec.drag === "end" || rec.drag === "cancel")) return { drag: rec.drag };
  return null;
}

export function startPttSidecar(opts: PttSidecarOptions = {}): PttSidecar {
  const port = opts.port ?? SIDECAR_PORT;
  const allowed = opts.allowedOrigin ?? SIDECAR_ALLOWED_ORIGIN;
  const http = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    server: http,
    verifyClient: (info: { origin?: string }) => info.origin === allowed,
  });
  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (raw, isBinary) => {
      const request = !isBinary && opts.onWindowRequest ? parseWindowRequest(String(raw)) : null;
      if (!request) {
        ws.close(1008);
        return;
      }
      opts.onWindowRequest?.(request);
    });
    ws.on("error", () => {});
    if (opts.windowHello) ws.send(JSON.stringify(opts.windowHello()));
  });
  wss.on("error", () => {});
  const listening = new Promise<number>((resolve) => {
    http.once("error", () => resolve(-1)); // port busy: holds just do not reach the window
    http.listen(port, "127.0.0.1", () => {
      const a = http.address();
      resolve(typeof a === "object" && a ? a.port : port);
    });
  });
  const send = (data: string): void => {
    for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(data);
  };
  return {
    listening,
    broadcast(state, reason) {
      send(JSON.stringify({ hold: state, ...(reason ? { reason } : {}) }));
    },
    broadcastWindow(event) {
      send(JSON.stringify(event));
    },
    close() {
      return new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        if (!http.listening) {
          resolve();
          return;
        }
        wss.close(() => http.close(() => resolve()));
      });
    },
  };
}
