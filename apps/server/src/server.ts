import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_PORT, EXTENSION_ID, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { log } from "./log";
import { createHub, type Hub } from "./hub/hub";
import { hostAllowed, parseAllowedOrigin } from "./hub/guard";
import { Session, type Brain } from "./session/session";

export type StartServerOptions = {
  /** Default 7777 (D-01). 0 = ephemeral, used by tests. */
  port?: number;
  dev?: boolean;
  brain?: Brain;
  fakeDelayMs?: number;
  helloTimeoutMs?: number;
  extraVoiceOrigins?: string[];
  extensionId?: string;
};

export type RunningServer = {
  port: number;
  /** The WebSocket URL: ws://127.0.0.1:<port>/ws */
  url: string;
  session: Session;
  hub: Hub;
  close(): Promise<void>;
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const dev = options.dev ?? false;
  const extraVoiceOrigins = (options.extraVoiceOrigins ?? []).map(parseAllowedOrigin);
  const session = new Session(options.brain ?? "fake");
  let boundPort = options.port ?? DEFAULT_PORT;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!hostAllowed(req.headers.host, boundPort, dev)) {
      log("warn", { msg: "http host rejected", ...(req.headers.host !== undefined ? { host: req.headers.host } : {}) });
      return json(res, 403, { ok: false });
    }
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://x").pathname;
    } catch {
      return json(res, 404, { ok: false });
    }
    if (req.method === "GET" && pathname === "/healthz") return json(res, 200, { ok: true });
    return json(res, 404, { ok: false });
  });

  const hub = createHub({
    server,
    session,
    getPort: () => boundPort,
    dev,
    extensionId: options.extensionId ?? EXTENSION_ID,
    extraVoiceOrigins,
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // D-01: IPv4 loopback literal only. Never a wildcard address, never the "localhost" alias.
    server.listen(boundPort, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  boundPort = (server.address() as AddressInfo).port;
  log("info", { msg: "listening", host: `${LOOPBACK_HOST}:${boundPort}` });

  return {
    port: boundPort,
    url: `ws://${LOOPBACK_HOST}:${boundPort}${WS_PATH}`,
    session,
    hub,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
