// Shared test client: a real `ws` client against a real port-0 server (Origin behavior is only real
// on a real handshake). No mocks, no fake timers.
import { WebSocket } from "ws";
import {
  buildFrame,
  buildRawFrame,
  type MessageType,
  type PayloadOf,
  type Role,
} from "@blip/protocol";

export type Frame = {
  v: number;
  id: string;
  type: string;
  replyTo?: string;
  ts: number;
  payload: any;
};

export type TestClient = {
  ws: WebSocket;
  /** 101 when the upgrade succeeded, otherwise the HTTP status of the rejection. */
  status: number;
  /** Every frame received so far, in order. */
  frames: Frame[];
  /** Resolves with the next unread frame, rejects on timeout. */
  nextMessage(timeoutMs?: number): Promise<Frame>;
  /** Send a schema-validated frame; returns its id. */
  send<T extends MessageType>(type: T, payload: PayloadOf<T>, opts?: { id?: string; replyTo?: string }): string;
  /** Send a frame with no validation (attack tooling). Returns its id. */
  sendUnchecked(type: string, payload: unknown, opts?: { id?: string; replyTo?: string }): string;
  sendRaw(data: string | Buffer, binary?: boolean): void;
  hello(role: Role, protocolVersion?: number): string;
  closed: Promise<{ code: number; reason: string }>;
  close(): void;
};

export type ConnectOptions = {
  port: number;
  origin?: string | undefined;
  headers?: Record<string, string>;
  path?: string;
  /** Test-only override of the connect host (default 127.0.0.1). */
  host?: string;
};

export function connect(opts: ConnectOptions): Promise<TestClient> {
  const url = `ws://${opts.host ?? "127.0.0.1"}:${opts.port}${opts.path ?? "/ws"}`;
  const ws = new WebSocket(url, {
    ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
    ...(opts.headers ? { headers: opts.headers } : {}),
  });
  const frames: Frame[] = [];
  let cursor = 0;
  let waiter: (() => void) | undefined;
  ws.on("message", (data) => {
    frames.push(JSON.parse(data.toString()) as Frame);
    waiter?.();
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  // A rejected upgrade also ends in a close event on the client; keep the promise from being unhandled.
  closed.catch(() => {});

  const client: TestClient = {
    ws,
    status: 0,
    frames,
    async nextMessage(timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      while (cursor >= frames.length) {
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`nextMessage timed out after ${timeoutMs} ms`);
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, left);
          waiter = () => {
            clearTimeout(t);
            resolve();
          };
        });
        waiter = undefined;
      }
      return frames[cursor++]!;
    },
    send(type, payload, o = {}) {
      const frame = buildFrame(type, payload, o);
      ws.send(JSON.stringify(frame));
      return frame.id;
    },
    sendUnchecked(type, payload, o = {}) {
      const frame = buildRawFrame(type, payload, o);
      ws.send(JSON.stringify(frame));
      return frame.id;
    },
    sendRaw(data, binary = false) {
      ws.send(data, { binary });
    },
    hello(role, protocolVersion = 1) {
      return client.sendUnchecked("hello", { role, clientVersion: "test", protocolVersion });
    },
    closed,
    close() {
      ws.close();
    },
  };

  return new Promise<TestClient>((resolve, reject) => {
    ws.once("open", () => {
      client.status = 101;
      resolve(client);
    });
    ws.once("unexpected-response", (_req, res) => {
      client.status = res.statusCode ?? 0;
      res.resume();
      resolve(client);
    });
    ws.once("error", (err) => reject(err));
  });
}

/** Sleep helper for "nothing should have happened" assertions. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
