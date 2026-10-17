import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_PORT, EXTENSION_ID, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { log } from "./log";
import { createHub, type Handlers, type Hub } from "./hub/hub";
import { hostAllowed, parseAllowedOrigin } from "./hub/guard";
import { createStaticHandler, type StaticRoot } from "./hub/static";
import { Session, type Brain } from "./session/session";
import { createRefresher, type Refresher } from "./session/refresh";
import { createFakeBrain } from "./brain/fake-brain";
import { handleUtterance, sayRepeat, sayStop } from "./turn";
import { handleGatedSpeakDone, invalidateGatedAction, type GatedContext } from "./act/gated";

export type StartServerOptions = {
  /** Default 7777 (D-01). 0 = ephemeral, used by tests. */
  port?: number;
  dev?: boolean;
  brain?: Brain;
  fakeDelayMs?: number;
  helloTimeoutMs?: number;
  extraVoiceOrigins?: string[];
  extensionId?: string;
  /** Test-only: the fake brain answers every model-routed utterance with request_action for this id. */
  fakeRequestActionId?: string;
  /** Test-only: with fakeRequestActionId, trigger request_action only for this exact utterance. */
  fakeRequestActionPhrase?: string;
  /** Message handlers by type; anything without one gets not-implemented (D-14). Plan 01-05 fills these. */
  handlers?: Handlers;
  /** How long a snapshot.request waits for its reply (used by plan 01-05). Default 5000. */
  snapshotTimeoutMs?: number;
  /** Maximum model age for read_form and what's_required. Default 2000. */
  freshnessMs?: number;
  /** Clock and timer seams keep the confirmation barrier deterministic in server tests. */
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  /** Optional static roots (voice build, form fixtures). Behind the same Host check as everything else. */
  staticRoots?: StaticRoot[];
};

/** Resolved settings the later plans read (fake brain delay, snapshot timeout). */
export type ServerConfig = {
  dev: boolean;
  brain: Brain;
  fakeDelayMs: number;
  snapshotTimeoutMs: number;
  freshnessMs: number;
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

/** Shared by startServer, the server CLI and the dev runner (D-21). All of them map it to exit code 2. */
export const CLAUDE_BRAIN_UNAVAILABLE =
  "--brain=claude is not available yet: the Claude brain arrives in Phase 4. Use --brain=fake.";

export class BrainUnavailableError extends Error {
  constructor() {
    super(CLAUDE_BRAIN_UNAVAILABLE);
    this.name = "BrainUnavailableError";
  }
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  if (options.brain === "claude") throw new BrainUnavailableError();
  const dev = options.dev ?? false;
  const extraVoiceOrigins = (options.extraVoiceOrigins ?? []).map(parseAllowedOrigin);
  const clock = options.clock ?? Date.now;
  const schedule = options.schedule;
  const session = new Session(options.brain ?? "fake", clock);
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

  const snapshotTimeoutMs = options.snapshotTimeoutMs ?? 5000;
  const freshnessMs = options.freshnessMs ?? 2000;
  let refresher: Refresher;

  const fakeDelayMs = options.fakeDelayMs ?? 1500;
  const brain = createFakeBrain({
    delayMs: fakeDelayMs,
    ...(options.fakeRequestActionId !== undefined ? { requestActionId: options.fakeRequestActionId } : {}),
    ...(options.fakeRequestActionPhrase !== undefined ? { requestActionPhrase: options.fakeRequestActionPhrase } : {}),
  });

  // Turns run one at a time so busy/state pushes and reply order stay coherent.
  let turnQueue: Promise<void> = Promise.resolve();
  const defaultHandlers: Handlers = {
    utterance: ({ message, hub: h, session: s }) => {
      const run = turnQueue.then(() =>
        handleUtterance({
          message,
          hub: h,
          session: s,
          freshnessMs,
          refresher,
          brain,
          clock,
          ...(schedule !== undefined ? { schedule } : {}),
        }),
      );
      turnQueue = run.catch(() => {}); // a failed turn is logged by the hub and must not block the next one
      return run;
    },
    "speak.done": ({ message, hub: h, session: s }) => {
      if (message.type !== "speak.done") return;
      const gatedContext: GatedContext = { hub: h, session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      handleGatedSpeakDone(gatedContext, message.payload);
    },
    settings: () => {},
    ptt: ({ message, hub: h, session: s }) => {
      if (message.type !== "ptt" || message.payload.state !== "start") return;
      const gatedContext: GatedContext = { hub: h, session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      invalidateGatedAction(gatedContext, "cancelled", "push-to-talk-interrupted");
    },
    control: ({ message, hub: h, session: s }) => {
      if (message.type !== "control") return;
      const gatedContext: GatedContext = { hub: h, session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      if (message.payload.cmd === "stop") {
        invalidateGatedAction(gatedContext, "cancelled", "stop-command");
        return sayStop(h, s);
      }
      if (message.payload.cmd === "repeat") {
        invalidateGatedAction(gatedContext, "cancelled", "repeat-command");
        return sayRepeat(h, s);
      }
      // reconnect-browser has nothing to reconnect yet.
      h.send(
        "voice",
        "error",
        { code: "not-implemented", message: "the server has no handler for that command yet", fatal: false },
        { replyTo: message.id },
      );
    },
    "page.changed": ({ hub: h, session: s }) => {
      const gatedContext: GatedContext = { hub: h, session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      invalidateGatedAction(gatedContext, "page-changed", "page-changed");
      s.stale = true;
      void refresher.request("refresh");
    },
  };

  const hub = createHub({
    server,
    session,
    getPort: () => boundPort,
    dev,
    extensionId: options.extensionId ?? EXTENSION_ID,
    extraVoiceOrigins,
    ...(options.helloTimeoutMs !== undefined ? { helloTimeoutMs: options.helloTimeoutMs } : {}),
    handlers: { ...defaultHandlers, ...options.handlers },
  });

  refresher = createRefresher({ hub, session, timeoutMs: snapshotTimeoutMs });

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
      fakeDelayMs,
      snapshotTimeoutMs,
      freshnessMs,
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
