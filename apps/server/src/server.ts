import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_PORT, EXTENSION_ID, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { log } from "./log";
import { createHub, type Handlers, type Hub } from "./hub/hub";
import { hostAllowed, parseAllowedOrigin } from "./hub/guard";
import { createStaticHandler, type StaticRoot } from "./hub/static";
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
  /** Message handlers by type; anything without one gets not-implemented (D-14). Plan 01-05 fills these. */
  handlers?: Handlers;
  /** How long a snapshot.request waits for its reply (used by plan 01-05). Default 5000. */
  snapshotTimeoutMs?: number;
  /** Optional static roots (voice build, form fixtures). Behind the same Host check as everything else. */
  staticRoots?: StaticRoot[];
};

/** Resolved settings the later plans read (fake brain delay, snapshot timeout). */
export type ServerConfig = {
  dev: boolean;
  brain: Brain;
  fakeDelayMs: number;
  snapshotTimeoutMs: number;
  extensionId: string;
};

export type RunningServer = {
  port: number;
  /** The WebSocket URL: ws://127.0.0.1:<port>/ws */
  url: string;
  httpServer: Server;
  config: ServerConfig;
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
  const serveStatic =
    options.staticRoots && options.staticRoots.length > 0 ? createStaticHandler(options.staticRoots) : undefined;

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
    // /healthz stays ahead of static roots so a static file can never shadow it.
    if (req.method === "GET" && pathname === "/healthz") return json(res, 200, { ok: true });
    if (serveStatic === undefined) return json(res, 404, { ok: false });
    serveStatic(req, res)
      .then((served) => {
        if (!served && !res.headersSent) json(res, 404, { ok: false });
      })
      .catch(() => {
        if (!res.headersSent) json(res, 500, { ok: false });
        else res.end();
      });
  });

  const hub = createHub({
    server,
    session,
    getPort: () => boundPort,
    dev,
    extensionId: options.extensionId ?? EXTENSION_ID,
    extraVoiceOrigins,
    ...(options.helloTimeoutMs !== undefined ? { helloTimeoutMs: options.helloTimeoutMs } : {}),
    ...(options.handlers ? { handlers: options.handlers } : {}),
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
    httpServer: server,
    config: {
      dev,
      brain: session.brain,
      fakeDelayMs: options.fakeDelayMs ?? 1500,
      snapshotTimeoutMs: options.snapshotTimeoutMs ?? 5000,
      extensionId: options.extensionId ?? EXTENSION_ID,
    },
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
