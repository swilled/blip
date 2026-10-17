// Mock server for the voice window: speaks the frozen v1 protocol with the same Host/Origin/hello
// rules as the real hub (reuses core's guard, read-only). No utterance text is ever logged.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { AddressInfo } from "node:net";
import sirv from "sirv";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  buildFrame,
  canSend,
  CLOSE_CODES,
  EXTENSION_ID,
  HELLO_TIMEOUT_MS,
  LOOPBACK_HOST,
  MAX_FRAME_BYTES,
  newId,
  parseFrame,
  WS_PATH,
  type BuildOpts,
  type FormModel,
  type Message,
  type MessageType,
  type PayloadOf,
} from "@blip/protocol";
import { reduce, type DialogueState, type Effect } from "@blip/dialogue";
import { hostAllowed, rolesForOrigin } from "../../../apps/server/src/hub/guard";

export type MockServerOptions = {
  port: number;
  dev?: boolean;
  staticDir?: string;
  form: FormModel | null;
  delayMs?: number;
  helloTimeoutMs?: number;
};

export type MockServer = {
  listen(): Promise<number>;
  close(): Promise<void>;
  readonly port: number;
  send<T extends MessageType>(type: T, payload: PayloadOf<T>, opts?: BuildOpts): boolean;
  outstandingSpeakIds(): string[];
};

const FALLBACK_REPLY = "I can only describe the page right now.";

type Conn = { ws: WebSocket; bound: boolean; dead: boolean; helloTimer: NodeJS.Timeout | undefined };

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

function refuse(socket: Duplex, code: number, text: string): void {
  socket.on("error", () => {});
  socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function createMockServer(options: MockServerOptions): MockServer {
  const dev = options.dev ?? false;
  const delayMs = options.delayMs ?? 0;
  const helloTimeoutMs = options.helloTimeoutMs ?? HELLO_TIMEOUT_MS;
  const form = options.form;
  let actualPort = options.port;

  const serve = options.staticDir !== undefined ? sirv(options.staticDir, { dev: true, single: false }) : undefined;
  const http: Server = createServer((req, res) => {
    if (serve !== undefined) return serve(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
    res.statusCode = 404;
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const conns = new Set<Conn>();
  let voice: Conn | undefined;
  let dialogue: DialogueState = { lastSpoken: null };
  const outstanding = new Set<string>();
  let pendingTimer: NodeJS.Timeout | undefined;

  function rawSend(conn: Conn, frame: unknown): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(frame));
  }
  function sendTo<T extends MessageType>(conn: Conn, type: T, payload: PayloadOf<T>, opts: BuildOpts = {}): void {
    rawSend(conn, buildFrame(type, payload, opts));
  }
  function closeConn(conn: Conn, code: number, reason: string): void {
    conn.dead = true;
    clearTimeout(conn.helloTimer);
    conn.ws.close(code, reason);
  }
  function fatal(conn: Conn, code: string, message: string, closeCode: number, replyTo?: string): void {
    sendTo(conn, "error", { code, message, fatal: true }, replyTo !== undefined ? { replyTo } : {});
    closeConn(conn, closeCode, code);
  }

  function statePayload(busy: boolean): PayloadOf<"state"> {
    return {
      dialogue: form === null ? "no-page" : "ready",
      page:
        form === null
          ? null
          : {
              url: form.url,
              title: form.title,
              fieldCount: form.fields.length,
              requiredEmpty: form.fields.filter((f) => f.required && !f.hasValue).length,
            },
      busy,
      extensionConnected: true,
      brain: "fake",
    };
  }

  function speak(conn: Conn, text: string, category: PayloadOf<"speak">["category"], interrupt: boolean): void {
    const speakId = newId();
    outstanding.add(speakId);
    sendTo(conn, "speak", { speakId, text, category, interrupt });
  }

  function cancelPending(conn: Conn): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
      sendTo(conn, "state", statePayload(false));
    }
  }

  function applyEffects(conn: Conn, effects: Effect[]): void {
    for (const e of effects) {
      if (e.kind === "speak") speak(conn, e.text, e.category, false);
      else if (e.kind === "earcon") sendTo(conn, "earcon", { name: e.name });
      else if (e.kind === "parseIntent") speak(conn, FALLBACK_REPLY, "answer", false);
      else speak(conn, "Stopped.", "answer", true);
    }
  }

  function onUtterance(conn: Conn, utterance: PayloadOf<"utterance">): void {
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    const result = reduce(dialogue, { type: "utterance", utterance }, { form });
    const routedTo = result.effects.some((e) => e.kind === "parseIntent") ? "model" : "grammar";
    sendTo(conn, "transcript", { utteranceId: utterance.utteranceId, heardAs: utterance.text, routedTo });
    sendTo(conn, "state", statePayload(true));
    sendTo(conn, "earcon", { name: "thinking" });
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      dialogue = result.state;
      applyEffects(conn, result.effects);
      sendTo(conn, "state", statePayload(false));
    }, delayMs);
  }

  function onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    if (conn.dead) return;
    if (isBinary) return fatal(conn, "bad-json", "binary frames are not accepted", 1003);
    const r = parseFrame(toBuffer(data));
    if (!conn.bound) {
      if (!r.ok) return fatal(conn, r.code, r.message, CLOSE_CODES.badHello, r.id);
      const m = r.message;
      if (m.type !== "hello") return fatal(conn, "hello-required", "the first frame must be a hello", CLOSE_CODES.badHello, m.id);
      if (m.payload.role !== "voice") {
        return fatal(conn, "role-origin-mismatch", "this connection may not claim that role", CLOSE_CODES.roleOriginMismatch, m.id);
      }
      return bind(conn, m.id);
    }
    if (!r.ok) {
      return sendTo(conn, "error", { code: r.code, message: r.message, fatal: false }, r.id !== undefined ? { replyTo: r.id } : {});
    }
    const msg: Message = r.message;
    if (!canSend("voice", msg.type)) {
      return sendTo(conn, "error", { code: "role-violation", message: "this role may not send that message type", fatal: false }, { replyTo: msg.id });
    }
    switch (msg.type) {
      case "utterance":
        return onUtterance(conn, msg.payload);
      case "ptt":
        if (msg.payload.state === "start") cancelPending(conn);
        return;
      case "speak.done":
        outstanding.delete(msg.payload.speakId);
        return;
      case "control":
        if (msg.payload.cmd === "stop") {
          cancelPending(conn);
          speak(conn, "Stopped.", "answer", true);
        } else if (msg.payload.cmd === "repeat" && dialogue.lastSpoken !== null) {
          speak(conn, dialogue.lastSpoken, "answer", false);
        }
        return;
      default:
        return;
    }
  }

  function bind(conn: Conn, helloId: string): void {
    clearTimeout(conn.helloTimer);
    const old = voice;
    conn.bound = true;
    voice = conn;
    if (old !== undefined && old !== conn) {
      sendTo(old, "error", { code: "replaced", message: "a newer connection took over this role", fatal: true });
      closeConn(old, CLOSE_CODES.replaced, "replaced");
    }
    sendTo(conn, "welcome", { sessionId: newId(), serverVersion: "mock", brain: "fake" }, { replyTo: helloId });
    sendTo(conn, "state", statePayload(false));
  }

  http.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!hostAllowed(req.headers.host, actualPort, dev)) return refuse(socket, 403, "Forbidden");
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://x").pathname;
    } catch {
      return refuse(socket, 404, "Not Found");
    }
    if (pathname !== WS_PATH) return refuse(socket, 404, "Not Found");
    const roles = rolesForOrigin(req.headers.origin, { extId: EXTENSION_ID, port: actualPort, dev, extraVoice: [] });
    if (!roles.includes("voice")) return refuse(socket, 403, "Forbidden");
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: Conn = { ws, bound: false, dead: false, helloTimer: undefined };
      conns.add(conn);
      ws.on("error", () => {});
      ws.on("close", () => {
        conn.dead = true;
        clearTimeout(conn.helloTimer);
        conns.delete(conn);
        if (voice === conn) {
          voice = undefined;
          if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            pendingTimer = undefined;
          }
        }
      });
      ws.on("message", (data, isBinary) => {
        try {
          onMessage(conn, data, isBinary);
        } catch {
          // A handler bug must not take the mock down; nothing is logged (utterances are private).
        }
      });
      conn.helloTimer = setTimeout(() => {
        if (!conn.dead && !conn.bound) fatal(conn, "hello-timeout", "no hello received in time", CLOSE_CODES.helloTimeout);
      }, helloTimeoutMs);
    });
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(options.port, LOOPBACK_HOST, () => {
          actualPort = (http.address() as AddressInfo).port;
          resolve(actualPort);
        });
      });
    },
    close() {
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      for (const c of conns) {
        clearTimeout(c.helloTimer);
        c.ws.terminate();
      }
      wss.close();
      return new Promise((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
    },
    get port() {
      return actualPort;
    },
    send(type, payload, opts) {
      if (voice === undefined) return false;
      sendTo(voice, type, payload, opts);
      return true;
    },
    outstandingSpeakIds() {
      return [...outstanding];
    },
  };
}
