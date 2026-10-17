import { buildFrame, CLOSE_CODES, DEFAULT_PORT, LOOPBACK_HOST, PING_INTERVAL_MS, WS_PATH, parseFrame } from "@blip/protocol";
import type { Message } from "@blip/protocol";
import { SOCKET_PONG_TIMEOUT_MS, SocketState } from "./socket-state.js";
import { dispatchSnapshotRequest } from "./dispatch.js";
import { dispatchActRequest } from "./acts.js";

declare const __BLIP_WS_URL__: string;

const DEFAULT_SOCKET_URL = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;
const SOCKET_URL = typeof __BLIP_WS_URL__ === "string" ? __BLIP_WS_URL__ : DEFAULT_SOCKET_URL;
let socket: WebSocket | undefined;
let welcomeId: string | undefined;
let welcomed = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let pongTimer: ReturnType<typeof setTimeout> | undefined;
const socketState = new SocketState();

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
  if (pongTimer !== undefined) clearTimeout(pongTimer);
  pingTimer = undefined;
  pongTimer = undefined;
  socketState.onPong();
  welcomed = false;
  welcomeId = undefined;
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) return;
  const delay = socketState.reconnectHoldoffMs() || socketState.nextReconnectDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    ensureConnected();
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
      { actId: message.payload.actId, ok: false, error: "exception", detail: "action dispatch is not ready yet" },
      { replyTo: message.id },
    ),
  );
}

/** Handle only request/reply frames whose eventual handlers are added by later extension plans. */
function dispatch(message: Message, socketForReply: WebSocket): void {
  if (message.type === "snapshot.request") return dispatchSnapshotRequest(message, socketForReply);
  if (message.type === "act.request") {
    void dispatchActRequest(message, socketForReply);
    return;
  }
  // Remaining server-to-extension messages are intentionally inert in this first shell.
}

export function ensureConnected(): void {
  if (!isAllowedSocketUrl(SOCKET_URL)) return;
  if (!socketState.canReconnect()) return;
  if (socket !== undefined && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;

  const current = new WebSocket(SOCKET_URL);
  socket = current;
  current.addEventListener("open", () => {
    socketState.onOpen();
    const hello = buildFrame("hello", { role: "extension", clientVersion: "0.0.0", protocolVersion: 1 });
    welcomeId = hello.id;
    send(current, hello);
  });
  current.addEventListener("message", (event) => {
    const parsed = parseFrame(String(event.data));
    if (!parsed.ok) return;
    const message = parsed.message;
    if (!welcomed) {
      if (message.type === "welcome" && message.replyTo === welcomeId) {
        welcomed = true;
        pingTimer = setInterval(() => {
          if (current.readyState !== WebSocket.OPEN) return;
          socketState.onPing();
          send(current, buildFrame("ping", {}));
          if (pongTimer !== undefined) clearTimeout(pongTimer);
          pongTimer = setTimeout(() => {
            pongTimer = undefined;
            if (socketState.isPongOverdue() && socket === current && current.readyState === WebSocket.OPEN) {
              current.close();
            }
          }, SOCKET_PONG_TIMEOUT_MS);
        }, PING_INTERVAL_MS);
        return;
      }
      if (message.type === "snapshot.request") return notReady(message, current);
      if (message.type === "act.request") return notImplemented(message, current);
      return;
    }
    if (message.type === "pong") {
      socketState.onPong();
      if (pongTimer !== undefined) clearTimeout(pongTimer);
      pongTimer = undefined;
      return;
    }
    dispatch(message, current);
  });
  current.addEventListener("error", () => current.close());
  current.addEventListener("close", (event) => {
    if (socket !== current) return;
    socket = undefined;
    stopKeepalive();
    if (event.code === CLOSE_CODES.replaced) socketState.onReplaced();
    scheduleReconnect();
  });
}
