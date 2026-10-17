// Loopback WebSocket hub. TRACER version (plan 01-04 Task 1): guarded upgrade, hello -> welcome ->
// state for a bound client. Task 2 hardens everything after the bind.
import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  buildFrame,
  CLOSE_CODES,
  EXTENSION_ID,
  MAX_FRAME_BYTES,
  parseFrame,
  WS_PATH,
  type MessageType,
  type PayloadOf,
  type Role,
} from "@blip/protocol";
import { log } from "../log";
import type { Session } from "../session/session";
import { SERVER_VERSION } from "../session/session";
import { hostAllowed, rolesForOrigin } from "./guard";

export type HubOptions = {
  server: Server;
  session: Session;
  /** Read at request time: with port 0 the real port is only known after listen. */
  getPort: () => number;
  dev: boolean;
  extensionId?: string;
  extraVoiceOrigins?: readonly string[];
};

export type Hub = {
  send<T extends MessageType>(role: Role, type: T, payload: PayloadOf<T>): boolean;
  close(): void;
};

type Conn = { ws: WebSocket; origin: string | undefined; roles: Role[]; role: Role | undefined };

export function createHub(options: HubOptions): Hub {
  const { server, session } = options;
  const extId = options.extensionId ?? EXTENSION_ID;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const slots: Partial<Record<Role, Conn>> = {};
  const conns = new Set<Conn>();

  const rules = () => ({
    extId,
    port: options.getPort(),
    dev: options.dev,
    extraVoice: options.extraVoiceOrigins ?? [],
  });

  function reject(socket: Duplex, code: number, text: string): void {
    socket.on("error", () => {});
    socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  // D-03: Host, path and Origin are all checked before handleUpgrade, so no frame is ever read from
  // a connection that fails any of them.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const origin = req.headers.origin;
    if (!hostAllowed(req.headers.host, options.getPort(), options.dev)) {
      log("warn", { msg: "ws host rejected", ...(req.headers.host !== undefined ? { host: req.headers.host } : {}) });
      return reject(socket, 403, "Forbidden");
    }
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://x").pathname;
    } catch {
      return reject(socket, 404, "Not Found");
    }
    if (pathname !== WS_PATH) return reject(socket, 404, "Not Found");
    if (rolesForOrigin(origin, rules()).length === 0) {
      log("warn", { msg: "ws origin rejected", origin: origin ?? "(none)" });
      return reject(socket, 403, "Forbidden");
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, origin));
  });

  function sendFrame<T extends MessageType>(conn: Conn, type: T, payload: PayloadOf<T>, replyTo?: string): void {
    conn.ws.send(JSON.stringify(buildFrame(type, payload, replyTo !== undefined ? { replyTo } : {})));
  }

  function onConnection(ws: WebSocket, origin: string | undefined): void {
    const conn: Conn = { ws, origin, roles: rolesForOrigin(origin, rules()), role: undefined };
    conns.add(conn);
    ws.on("error", () => {});
    ws.on("close", () => {
      conns.delete(conn);
      if (conn.role !== undefined && slots[conn.role] === conn) delete slots[conn.role];
    });
    ws.on("message", (data) => {
      if (conn.role !== undefined) return; // tracer: nothing after the bind yet
      const r = parseFrame(data as Buffer);
      if (!r.ok || r.message.type !== "hello" || !conn.roles.includes(r.message.payload.role)) {
        ws.close(CLOSE_CODES.badHello, "bad hello");
        return;
      }
      conn.role = r.message.payload.role;
      slots[conn.role] = conn;
      sendFrame(
        conn,
        "welcome",
        { sessionId: session.sessionId, serverVersion: SERVER_VERSION, brain: session.brain },
        r.message.id,
      );
      if (conn.role === "voice") sendFrame(conn, "state", session.statePayload());
    });
  }

  return {
    send(role, type, payload) {
      const conn = slots[role];
      if (!conn) return false;
      sendFrame(conn, type, payload);
      return true;
    },
    close() {
      for (const c of conns) c.ws.terminate();
      wss.close();
    },
  };
}
