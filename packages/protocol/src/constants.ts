// Wire constants shared by the server, the extension, the voice UI and the tools.
// Browser-safe: this file must never import a node: builtin.

export const PROTOCOL_VERSION = 1 as const;

/** D-01: fixed port, loopback only. Use the IPv4 literal, never "localhost" (can resolve to ::1). */
export const DEFAULT_PORT = 7777;
export const LOOPBACK_HOST = "127.0.0.1";
/** D-02: one endpoint, role claimed in the first `hello` frame. */
export const WS_PATH = "/ws";

export const HELLO_TIMEOUT_MS = 2000;
/** D-06: the extension sends `ping` this often (keeps the MV3 service worker alive). */
export const PING_INTERVAL_MS = 20000;
export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
export const MAX_UTTERANCE_CHARS = 500;

/** Application-range WebSocket close codes. */
export const CLOSE_CODES = {
  helloTimeout: 4001,
  badHello: 4002,
  roleOriginMismatch: 4003,
  replaced: 4004,
} as const;

/**
 * Documented server-level error codes. The wire field `ErrorMsg.code` stays a plain string so a
 * code added later never breaks an older parser (D-17); this list is documentation plus a test aid.
 */
export const ERROR_CODES = [
  "bad-json",
  "bad-envelope",
  "unknown-type",
  "invalid-payload",
  "role-violation",
  "role-origin-mismatch",
  "hello-required",
  "hello-timeout",
  "already-bound",
  "not-implemented",
  "unexpected-reply",
  "replaced",
] as const;

/** D-12: labels below this confidence (or with labelSource "inferred") are hedged when spoken. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
