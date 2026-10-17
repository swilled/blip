// Voice-owned loopback sidecar (PTT_DELIVERY B): carries the global hold to the voice window.
// 127.0.0.1 only, exact Origin match, no inbound messages, never logs (T-01-10, T-01-04).
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export const SIDECAR_PORT = 7778;
export const SIDECAR_ALLOWED_ORIGIN = "http://127.0.0.1:7777";

export interface PttSidecar {
  broadcast(state: "start" | "end"): void;
  /** Resolves to the bound port (useful when port 0 was requested). */
  listening: Promise<number>;
  close(): Promise<void>;
}

export interface PttSidecarOptions {
  port?: number;
  allowedOrigin?: string;
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
    // Inbound messages are never accepted.
    ws.on("message", () => ws.close(1008));
    ws.on("error", () => {});
  });
  wss.on("error", () => {});
  const listening = new Promise<number>((resolve) => {
    http.on("error", () => resolve(-1)); // port busy: holds just do not reach the window
    http.listen(port, "127.0.0.1", () => {
      const a = http.address();
      resolve(typeof a === "object" && a ? a.port : port);
    });
  });
  return {
    listening,
    broadcast(state) {
      const data = JSON.stringify({ hold: state });
      for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(data);
    },
    close() {
      return new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => http.close(() => resolve()));
      });
    },
  };
}
