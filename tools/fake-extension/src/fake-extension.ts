// A stand-in for the Chrome extension (D-22): connects as role extension, serves a fixture snapshot
// and (later in this plan) applies acts to an in-memory copy. It never opens a gate.
import { WebSocket } from "ws";
import { buildFrame, parseFrame, type Message, type Snapshot } from "@blip/protocol";
import { loadSnapshot, type FixtureName } from "@blip/protocol/fixtures-loader";

export type FakeExtensionOptions = {
  /** ws://127.0.0.1:<port>/ws */
  url: string;
  fixture?: FixtureName;
  /** Sent as the Origin header; omitted by default (works against a server started with dev true). */
  origin?: string;
  pingMs?: number;
  tabId?: number;
};

export type FakeExtension = {
  /** Resolves once the server's welcome arrives; rejects if the connection fails first. */
  connected: Promise<void>;
  fixtureName(): FixtureName;
  close(): void;
};

export function startFakeExtension(options: FakeExtensionOptions): FakeExtension {
  const fixture: FixtureName = options.fixture ?? "booking";
  const tabId = options.tabId ?? 1;
  const snapshot: Snapshot = { ...loadSnapshot(fixture), tabId };

  const ws = new WebSocket(options.url, options.origin !== undefined ? { origin: options.origin } : {});

  const send = (frame: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  };

  const connected = new Promise<void>((resolve, reject) => {
    let welcomed = false;
    ws.once("error", (err) => {
      if (!welcomed) reject(err);
    });
    ws.once("close", () => {
      if (!welcomed) reject(new Error("closed before welcome"));
    });
    ws.on("open", () => {
      send(buildFrame("hello", { role: "extension", clientVersion: "fake-extension", protocolVersion: 1 }));
    });
    ws.on("message", (data) => {
      // D-18: every inbound frame goes through parseFrame; anything invalid is dropped.
      const parsed = parseFrame(Array.isArray(data) ? Buffer.concat(data) : (data as Buffer));
      if (!parsed.ok) return;
      const message: Message = parsed.message;
      if (message.type === "welcome" && !welcomed) {
        welcomed = true;
        resolve();
      } else if (message.type === "snapshot.request") {
        send(buildFrame("snapshot.result", { ok: true, snapshot }, { replyTo: message.id }));
      }
    });
  });
  connected.catch(() => {});

  return {
    connected,
    fixtureName: () => fixture,
    close: () => ws.terminate(),
  };
}
