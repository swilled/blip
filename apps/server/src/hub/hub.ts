// Loopback WebSocket hub: the single place roles and Origins are enforced (PROT-04).
//
// Upgrade: Host -> path -> Origin are all checked BEFORE handleUpgrade, so no frame is ever read from
// a connection that fails any of them (D-03). After the upgrade a connection is awaiting hello (2 s),
// then bound to exactly one role that its Origin permits (D-26). Every later frame is parsed with
// parseFrame, checked against the registry's senders (D-04) and then routed: pending request ->
// built-in ping -> handler -> not-implemented. Nothing in here logs a payload.
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  buildFrame,
  canReceive,
  canSend,
  CLOSE_CODES,
  EXTENSION_ID,
  HELLO_TIMEOUT_MS,
  isMessageType,
  MAX_FRAME_BYTES,
  parseFrame,
  WS_PATH,
  type BuildOpts,
  type Message,
  type MessageType,
  type ParseResult,
  type PayloadOf,
  type Role,
} from "@blip/protocol";
import { log } from "../log";
import { SERVER_VERSION, type Session } from "../session/session";
import { nvdaCancel, nvdaSpeak } from "../voice/nvda";
import { routeSpeech, type SpeechOutput } from "../voice/speech-routing";
import { hostAllowed, rolesForOrigin } from "./guard";

export type HandlerContext = { role: Role; message: Message; hub: Hub; session: Session };
export type Handler = (ctx: HandlerContext) => void | Promise<void>;
export type Handlers = Partial<Record<MessageType, Handler>>;

export type HubOptions = {
  server: Server;
  session: Session;
  /** Read at request time: with port 0 the real port is only known after listen. */
  getPort: () => number;
  dev: boolean;
  extensionId?: string;
  extraVoiceOrigins?: readonly string[];
  helloTimeoutMs?: number;
  handlers?: Handlers;
  /** Replace the NVDA output boundary in deterministic server-routing tests. */
  speechOutput?: SpeechOutput;
};

export type RequestOptions<E extends MessageType> = { expect: E; timeoutMs: number };

export class HubRequestError extends Error {
  readonly code: "timeout" | "disconnected" | "no-connection";
  constructor(code: HubRequestError["code"], message: string) {
    super(message);
    this.name = "HubRequestError";
    this.code = code;
  }
}

export type Hub = {
  /**
   * Send a validated frame to the live connection of `role`. `speak` uses the owning session's
   * output mode and may route through NVDA instead. Throws when the role may not receive the type;
   * returns false when the selected output is unavailable.
   */
  send<T extends MessageType>(role: Role, type: T, payload: PayloadOf<T>, opts?: BuildOpts): boolean;
  /** Send and wait for a reply carrying the matching replyTo and the expected type. */
  request<T extends MessageType, E extends MessageType>(
    role: Role,
    type: T,
    payload: PayloadOf<T>,
    opts: RequestOptions<E>,
  ): Promise<Extract<Message, { type: E }>>;
  /** Push the session's current state payload to the voice connection, if one is bound. */
  pushState(): boolean;
  close(): void;
};

type Conn = {
  ws: WebSocket;
  roles: Role[];
  role: Role | undefined;
  /** Closing or closed: further frames are ignored. */
  dead: boolean;
  helloTimer: NodeJS.Timeout | undefined;
};

type Pending = {
  conn: Conn;
  expect: MessageType;
  resolve: (m: never) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

/** Error text built from the failure code, issue paths and zod messages only, never input values. */
function errorText(r: Extract<ParseResult, { ok: false }>): string {
  const issues = (r.issues ?? [])
    .slice(0, 5)
    .map((i) => `${i.path === "" ? "(root)" : i.path}: ${i.message}`)
    .join("; ");
  const text = issues === "" ? r.message : `${r.message} (${issues})`;
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

export function createHub(options: HubOptions): Hub {
  const { server, session } = options;
  const extId = options.extensionId ?? EXTENSION_ID;
  const helloTimeoutMs = options.helloTimeoutMs ?? HELLO_TIMEOUT_MS;
  const handlers: Handlers = options.handlers ?? {};
  const speechOutput = options.speechOutput ?? { speak: nvdaSpeak, cancel: nvdaCancel };
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const slots: Partial<Record<Role, Conn>> = {};
  const conns = new Set<Conn>();
  const pending = new Map<string, Pending>();

  const rules = () => ({
    extId,
    port: options.getPort(),
    dev: options.dev,
    extraVoice: options.extraVoiceOrigins ?? [],
  });

  // ---- upgrade guard --------------------------------------------------------------------------

  function refuse(socket: Duplex, code: number, text: string): void {
    socket.on("error", () => {});
    socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const origin = req.headers.origin;
    if (!hostAllowed(req.headers.host, options.getPort(), options.dev)) {
      log("warn", { msg: "ws host rejected", host: req.headers.host ?? "(none)" });
      return refuse(socket, 403, "Forbidden");
    }
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://x").pathname;
    } catch {
      return refuse(socket, 404, "Not Found");
    }
    if (pathname !== WS_PATH) return refuse(socket, 404, "Not Found");
    if (rolesForOrigin(origin, rules()).length === 0) {
      // Logged verbatim (sanitized) so a real extension sending an unexpected Origin is easy to spot.
      log("warn", { msg: "ws origin rejected", origin: origin ?? "(none)" });
      return refuse(socket, 403, "Forbidden");
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, origin));
  });

  // ---- sending --------------------------------------------------------------------------------

  function rawSend(conn: Conn, frame: unknown): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(frame));
  }

  function sendTo<T extends MessageType>(conn: Conn, type: T, payload: PayloadOf<T>, opts: BuildOpts = {}): string {
    const frame = buildFrame(type, payload, opts);
    rawSend(conn, frame);
    return frame.id;
  }

  function sendError(conn: Conn, code: string, message: string, fatal: boolean, replyTo?: string): void {
    sendTo(conn, "error", { code, message, fatal }, replyTo !== undefined ? { replyTo } : {});
  }

  function closeConn(conn: Conn, code: number, reason: string): void {
    conn.dead = true;
    clearTimeout(conn.helloTimer);
    conn.ws.close(code, reason);
  }

  function fatal(conn: Conn, code: string, message: string, closeCode: number, replyTo?: string): void {
    log("warn", { msg: "fatal protocol error", ...(conn.role ? { role: conn.role } : {}), code });
    sendError(conn, code, message, true, replyTo);
    closeConn(conn, closeCode, code);
  }

  // ---- pending requests -----------------------------------------------------------------------

  function rejectPendingFor(conn: Conn, why: string): void {
    for (const [id, p] of pending) {
      if (p.conn !== conn) continue;
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(new HubRequestError("disconnected", `disconnected: ${why}`));
    }
  }

  // ---- connection lifecycle -------------------------------------------------------------------

  function onConnection(ws: WebSocket, origin: string | undefined): void {
    const conn: Conn = { ws, roles: rolesForOrigin(origin, rules()), role: undefined, dead: false, helloTimer: undefined };
    conns.add(conn);
    // A client that overruns maxPayload makes ws emit an error before it closes with 1009.
    ws.on("error", () => log("warn", { msg: "socket error", ...(conn.role ? { role: conn.role } : {}) }));
    ws.on("close", () => onClose(conn));
    ws.on("message", (data, isBinary) => {
      try {
        onMessage(conn, data, isBinary);
      } catch {
        log("error", { msg: "message handler failed", ...(conn.role ? { role: conn.role } : {}) });
      }
    });
    conn.helloTimer = setTimeout(() => {
      if (!conn.dead && conn.role === undefined) {
        fatal(conn, "hello-timeout", "no hello received in time", CLOSE_CODES.helloTimeout);
      }
    }, helloTimeoutMs);
  }

  function onClose(conn: Conn): void {
    conn.dead = true;
    clearTimeout(conn.helloTimer);
    conns.delete(conn);
    rejectPendingFor(conn, "connection closed");
    const role = conn.role;
    // Pitfall 10: clear the slot only if it still holds THIS connection. A replaced connection's late
    // close event must not wipe its successor.
    if (role !== undefined && slots[role] === conn) {
      delete slots[role];
      if (role === "extension") {
        session.extensionConnected = false;
        hub.pushState();
      } else {
        session.voiceConnected = false;
      }
      log("info", { msg: "connection closed", role });
    }
  }

  function bind(conn: Conn, role: Role, helloId: string): void {
    clearTimeout(conn.helloTimer);
    const old = slots[role];
    conn.role = role;
    slots[role] = conn;
    if (old !== undefined && old !== conn) {
      log("info", { msg: "connection replaced", role });
      rejectPendingFor(old, "connection replaced");
      sendError(old, "replaced", "a newer connection took over this role", true);
      closeConn(old, CLOSE_CODES.replaced, "replaced");
    }
    sendTo(conn, "welcome", { sessionId: session.sessionId, serverVersion: SERVER_VERSION, brain: session.brain }, { replyTo: helloId });
    log("info", { msg: "connection bound", role });
    if (role === "voice") {
      session.voiceConnected = true;
      sendTo(conn, "state", session.statePayload());
    } else {
      session.extensionConnected = true;
      hub.pushState();
    }
  }

  // ---- inbound --------------------------------------------------------------------------------

  function onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    if (conn.dead) return;
    if (isBinary) {
      fatal(conn, "bad-json", "binary frames are not accepted", 1003);
      return;
    }
    const r = parseFrame(toBuffer(data));

    if (conn.role === undefined) {
      log("debug", {
        msg: "frame before hello",
        bytes: r.bytes,
        ...(r.ok ? { type: r.message.type, id: r.message.id } : { code: r.code }),
      });
      if (!r.ok) return fatal(conn, r.code, errorText(r), CLOSE_CODES.badHello, r.id);
      const m = r.message;
      if (m.type !== "hello") {
        return fatal(conn, "hello-required", "the first frame must be a hello", CLOSE_CODES.badHello, m.id);
      }
      const role = m.payload.role;
      if (!conn.roles.includes(role)) {
        return fatal(conn, "role-origin-mismatch", "this Origin may not claim that role", CLOSE_CODES.roleOriginMismatch, m.id);
      }
      return bind(conn, role, m.id);
    }

    const role = conn.role;
    if (!r.ok) {
      log("debug", { msg: "frame rejected", role, bytes: r.bytes, code: r.code, ...(r.id ? { id: r.id } : {}) });
      // A known type from the wrong role is a role violation whatever its payload looks like.
      if (r.code === "invalid-payload" && r.type !== undefined && isMessageType(r.type) && !canSend(role, r.type)) {
        return sendError(conn, "role-violation", "this role may not send that message type", false, r.id);
      }
      return sendError(conn, r.code, errorText(r), false, r.id);
    }

    const msg = r.message;
    log("debug", { msg: "frame in", role, type: msg.type, id: msg.id, bytes: r.bytes });
    if (!canSend(role, msg.type)) {
      log("warn", { msg: "role violation", role, type: msg.type, id: msg.id });
      return sendError(conn, "role-violation", "this role may not send that message type", false, msg.id);
    }
    if (msg.type === "hello") {
      return sendError(conn, "already-bound", "this connection already said hello", false, msg.id);
    }
    route(conn, role, msg);
  }

  function route(conn: Conn, role: Role, msg: Message): void {
    // 1. A reply to one of our requests.
    if (msg.replyTo !== undefined) {
      const p = pending.get(msg.replyTo);
      if (p !== undefined) {
        if (p.conn !== conn || msg.type !== p.expect) {
          return sendError(conn, "unexpected-reply", "that is not the reply the server is waiting for", false, msg.id);
        }
        clearTimeout(p.timer);
        pending.delete(msg.replyTo);
        p.resolve(msg as never);
        return;
      }
    }
    // 2. Keepalive.
    if (msg.type === "ping") {
      sendTo(conn, "pong", {}, { replyTo: msg.id });
      return;
    }
    // 3. A registered handler.
    const handler = handlers[msg.type];
    if (handler !== undefined) {
      const failed = () => log("error", { msg: "handler failed", role, type: msg.type, id: msg.id });
      try {
        const out = handler({ role, message: msg, hub, session });
        if (out instanceof Promise) out.catch(failed);
      } catch {
        failed();
      }
      return;
    }
    // 4. Nothing to do with it.
    if (msg.type === "snapshot.result" || msg.type === "act.result") {
      return sendError(conn, "unexpected-reply", "no request is waiting for that reply", false, msg.id);
    }
    sendError(conn, "not-implemented", "the server has no handler for that message yet", false, msg.id);
  }

  // ---- public API -----------------------------------------------------------------------------

  const hub: Hub = {
    send(role, type, payload, opts = {}) {
      if (!canReceive(role, type)) throw new Error(`role ${role} cannot receive ${type}`);
      if (role === "voice" && type === "speak") {
        if (session.outputMode !== "agent-voice" && !session.voiceConnected) return false;
        const voicePayload = payload as PayloadOf<"speak">;
        return routeSpeech(session.outputMode, voicePayload, () => {
          const voiceConn = slots.voice;
          if (voiceConn === undefined) return false;
          sendTo(voiceConn, type, payload, opts);
          return true;
        }, speechOutput);
      }
      const conn = slots[role];
      if (conn === undefined) return false;
      sendTo(conn, type, payload, opts);
      return true;
    },

    request(role, type, payload, opts) {
      if (!canReceive(role, type)) {
        return Promise.reject(new Error(`role ${role} cannot receive ${type}`));
      }
      const conn = slots[role];
      if (conn === undefined) {
        return Promise.reject(new HubRequestError("no-connection", `no ${role} connection`));
      }
      return new Promise((resolve, reject) => {
        const frame = buildFrame(type, payload);
        const timer = setTimeout(() => {
          pending.delete(frame.id);
          reject(new HubRequestError("timeout", `request timeout: ${type} got no reply within ${opts.timeoutMs} ms`));
        }, opts.timeoutMs);
        pending.set(frame.id, { conn, expect: opts.expect, resolve: resolve as (m: never) => void, reject, timer });
        rawSend(conn, frame);
      });
    },

    pushState() {
      return hub.send("voice", "state", session.statePayload());
    },

    close() {
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        pending.delete(id);
        p.reject(new HubRequestError("disconnected", "disconnected: hub closed"));
      }
      for (const c of conns) {
        clearTimeout(c.helloTimer);
        c.ws.terminate();
      }
      wss.close();
    },
  };

  return hub;
}
