// Protocol client for the voice window: hello/welcome handshake, envelopes via
// @blip/protocol, reconnect. All payload types derive from PayloadOf.
// In production the host is location.host, so the same build works against the
// mock server and the real hub.
import {
  CLOSE_CODES,
  MAX_UTTERANCE_CHARS,
  WS_PATH,
  buildFrame,
  newId,
  parseFrame,
  type Message,
  type PayloadOf,
} from "@blip/protocol";

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface SocketDeps {
  host: string;
  makeWebSocket: (url: string) => WebSocketLike;
  clientVersion: string;
  onMessage: (m: Message) => void;
  onOpenClose: (connected: boolean, info?: { fatal?: string }) => void;
  onReplaced: () => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
}

export interface VoiceSocket {
  sendUtterance(u: {
    source: "voice" | "typed";
    text: string;
    sttConfidence?: number;
    alternatives?: string[];
  }): string | null;
  sendPtt(state: PayloadOf<"ptt">["state"]): void;
  sendSpeakDone(p: PayloadOf<"speak.done">): void;
  sendSettings(outputMode: "agent-voice" | "screen-reader", rate?: number): void;
  isConnected(): boolean;
  close(): void;
}

const RECONNECT_MS = 2000;

/** Default host for the browser: location.host. */
export function defaultHost(): string {
  return location.host;
}

export function createSocket(deps: SocketDeps): VoiceSocket {
  let ws: WebSocketLike | null = null;
  let connected = false;
  let stopped = false;
  let retry: unknown = null;

  function send(frame: unknown): void {
    if (ws && connected) ws.send(JSON.stringify(frame));
  }

  function connect(): void {
    const sock = deps.makeWebSocket(`ws://${deps.host}${WS_PATH}`);
    ws = sock;
    sock.onopen = () => {
      // hello is the first frame; "connected" waits for welcome.
      sock.send(
        JSON.stringify(buildFrame("hello", { role: "voice", clientVersion: deps.clientVersion, protocolVersion: 1 })),
      );
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      const r = parseFrame(ev.data);
      if (!r.ok) return;
      const m = r.message;
      if (m.type === "welcome") {
        connected = true;
        deps.onOpenClose(true);
        return;
      }
      if (m.type === "error" && m.payload.fatal) {
        deps.onOpenClose(false, { fatal: m.payload.message });
        return;
      }
      deps.onMessage(m);
    };
    sock.onerror = () => {};
    sock.onclose = (ev) => {
      connected = false;
      ws = null;
      deps.onOpenClose(false);
      if (ev.code === CLOSE_CODES.replaced) {
        stopped = true;
        deps.onReplaced();
        return;
      }
      if (stopped) return;
      retry = deps.setTimer(() => {
        retry = null;
        connect();
      }, RECONNECT_MS);
    };
  }
  connect();

  return {
    sendUtterance(u) {
      if (!connected) return null;
      const text = u.text.trim().slice(0, MAX_UTTERANCE_CHARS).trim();
      if (!text) return null;
      const utteranceId = newId();
      const payload: PayloadOf<"utterance"> = { utteranceId, text, source: u.source };
      if (u.sttConfidence !== undefined) payload.sttConfidence = u.sttConfidence;
      if (u.alternatives) payload.alternatives = u.alternatives.map((a) => a.slice(0, MAX_UTTERANCE_CHARS)).slice(0, 3);
      send(buildFrame("utterance", payload));
      return utteranceId;
    },
    sendPtt(state) {
      send(buildFrame("ptt", { state }));
    },
    sendSpeakDone(p) {
      send(buildFrame("speak.done", p));
    },
    sendSettings(outputMode, rate) {
      send(buildFrame("settings", { outputMode, ...(rate !== undefined ? { rate } : {}) }));
    },
    isConnected: () => connected,
    close() {
      stopped = true;
      if (retry !== null) deps.clearTimer(retry);
      ws?.close();
    },
  };
}
