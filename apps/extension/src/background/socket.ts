import { buildFrame, DEFAULT_PORT, LOOPBACK_HOST, PING_INTERVAL_MS, WS_PATH, parseFrame } from "@blip/protocol";
import type { Message } from "@blip/protocol";

declare const __BLIP_WS_URL__: string;

const DEFAULT_SOCKET_URL = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;
const SOCKET_URL = typeof __BLIP_WS_URL__ === "string" ? __BLIP_WS_URL__ : DEFAULT_SOCKET_URL;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000] as const;

let socket: WebSocket | undefined;
let welcomeId: string | undefined;
let welcomed = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let reconnectAttempt = 0;

export function isAllowedSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return (
      url.protocol === "ws:" &&
      url.hostname === LOOPBACK_HOST &&
      url.port !== "" &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65535 &&
      url.pathname === WS_PATH &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function send(socketForSend: WebSocket, frame: unknown): void {
  if (socketForSend.readyState === WebSocket.OPEN) socketForSend.send(JSON.stringify(frame));
}

function stopKeepalive(): void {
  if (pingTimer !== undefined) clearInterval(pingTimer);
  pingTimer = undefined;
  welcomed = false;
  welcomeId = undefined;
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) return;
  const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
}

function notReady(message: Extract<Message, { type: "snapshot.request" }>, socketForReply: WebSocket): void {
  send(
    socketForReply,
    buildFrame(
      "snapshot.result",
      { ok: false, error: { code: "not-ready", message: "snapshot capture is not implemented yet" } },
      { replyTo: message.id },
    ),
  );
}

function notImplemented(message: Extract<Message, { type: "act.request" }>, socketForReply: WebSocket): void {
  send(
    socketForReply,
    buildFrame(
      "act.result",
      { actId: message.payload.actId, ok: false, error: "exception", detail: "action dispatch is not implemented yet" },
      { replyTo: message.id },
    ),
  );
}

/** Handle only request/reply frames whose eventual handlers are added by later extension plans. */
function dispatch(message: Message, socketForReply: WebSocket): void {
  if (message.type === "snapshot.request") return notReady(message, socketForReply);
  if (message.type === "act.request") return notImplemented(message, socketForReply);
  // Remaining server-to-extension messages are intentionally inert in this first shell.
}

export function connect(): void {
  if (!isAllowedSocketUrl(SOCKET_URL)) return;
  if (socket !== undefined && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;

  const current = new WebSocket(SOCKET_URL);
  socket = current;
  current.addEventListener("open", () => {
    reconnectAttempt = 0;
    const hello = buildFrame("hello", { role: "extension", clientVersion: "0.0.0", protocolVersion: 1 });
    welcomeId = hello.id;
    send(current, hello);
  });
  current.addEventListener("message", (event) => {
    const parsed = parseFrame(String(event.data));
    if (!parsed.ok) return;
    const message = parsed.message;
    if (!welcomed) {
      if (message.type !== "welcome" || message.replyTo !== welcomeId) return;
      welcomed = true;
      pingTimer = setInterval(() => send(current, buildFrame("ping", {})), PING_INTERVAL_MS);
      return;
    }
    if (message.type === "pong") return;
    dispatch(message, current);
  });
  current.addEventListener("error", () => current.close());
  current.addEventListener("close", () => {
    if (socket === current) socket = undefined;
    stopKeepalive();
    scheduleReconnect();
  });
}
