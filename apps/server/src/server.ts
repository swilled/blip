import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PORT, EXTENSION_ID, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { log } from "./log";
import { createHub, type Handlers, type Hub } from "./hub/hub";
import { hostAllowed, parseAllowedOrigin } from "./hub/guard";
import { createStaticHandler, type StaticRoot } from "./hub/static";
import { Session, type Brain } from "./session/session";
import { createRefresher, type Refresher } from "./session/refresh";
import { createFakeBrain, type IntentBrain } from "./brain/fake-brain";
import { createClaudeProvider, type ClaudeProvider } from "./brain/claude/provider";
import { RepairCoordinator, type RepairProvider } from "./brain/claude/repair-coordinator";
import type { ClaudeSdkAdapter, ClaudeSessionOptions } from "./brain/claude/session";
import { handleUtterance, sayRepeat, sayStop } from "./turn";
import { handleGatedSpeakDone, invalidateGatedAction, type GatedContext } from "./act/gated";
import { createGatePort } from "./act/gate-port";
import { createVoiceGateAdapter } from "./act/voice-gate-adapter";

function clearPendingThroughVoiceGate(
  ctx: GatedContext,
  reason: "cancelled" | "page-changed",
  code: string,
): void {
  const grantId = ctx.session.pendingGatedAction?.grantId;
  if (grantId !== undefined && createVoiceGateAdapter(ctx).clear(grantId, reason)) return;
  invalidateGatedAction(ctx, reason, code);
}

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
  /** Test-only: injects a scripted SDK boundary; production loads the SDK only in Claude mode. */
  claudeAdapter?: ClaudeSdkAdapter;
  /** Narrow opt-in hooks for bounded local Claude checks; normal startup has no dispatch hooks. */
  claudeSessionHooks?: Pick<ClaudeSessionOptions,
    "beforeBootstrapDispatch" | "beforePromptDispatch" | "onStartupDiagnostic" | "startupSignal"
  >;
  /** Test seam for repair flow; production uses the repair role of the Claude provider. */
  repairProvider?: RepairProvider;
  /** Optional repair cache path; temporary directories are used in tests. */
  repairCacheDirectory?: string;
  /** Bound on a repair role call. Default 15000 ms. */
  repairTimeoutMs?: number;
  /** Message handlers by type; anything without one gets not-implemented (D-14). Plan 01-05 fills these. */
  handlers?: Handlers;
  /** Build server-integrated handlers after the Hub exists, with its live grant/executor context. */
  handlersFactory?: (context: GatedContext) => Handlers;
  /** How long a snapshot.request waits for its reply (used by plan 01-05). Default 5000. */
  snapshotTimeoutMs?: number;
  /** Maximum model age for read_form and what's_required. Default 2000. */
  freshnessMs?: number;
  /** Clock and timer seams keep the confirmation barrier deterministic in server tests. */
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  /** Test-only seam for exercising the bounded Claude intent watchdog offline. */
  intentWatchdog?: { schedule(callback: () => void, delayMs: number): unknown; cancel(handle: unknown): void };
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

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const brainMode = options.brain ?? "fake";
  const dev = options.dev ?? false;
  const extraVoiceOrigins = (options.extraVoiceOrigins ?? []).map(parseAllowedOrigin);
  const clock = options.clock ?? Date.now;
  const schedule = options.schedule;
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
  let repairCoordinator: RepairCoordinator | null = null;

  const fakeDelayMs = options.fakeDelayMs ?? 1500;
  let claudeProvider: ClaudeProvider | null = null;
  let brain: IntentBrain | ClaudeProvider;
  if (brainMode === "claude") {
    claudeProvider = await createClaudeProvider({
      ...(options.claudeAdapter !== undefined ? { adapter: options.claudeAdapter } : {}),
      ...(options.claudeSessionHooks !== undefined ? options.claudeSessionHooks : {}),
    });
    brain = claudeProvider;
  } else {
    brain = createFakeBrain({
      delayMs: fakeDelayMs,
      ...(options.fakeRequestActionId !== undefined ? { requestActionId: options.fakeRequestActionId } : {}),
      ...(options.fakeRequestActionPhrase !== undefined ? { requestActionPhrase: options.fakeRequestActionPhrase } : {}),
    });
  }

  const session = new Session(brainMode, clock);

  // Turns run one at a time so busy/state pushes and reply order stay coherent.
  let turnQueue: Promise<void> = Promise.resolve();
  const defaultHandlers: Handlers = {
    utterance: ({ message, hub: h, session: s }) => {
      const run = turnQueue.then(async () => {
        try {
          await handleUtterance({
            message,
            hub: h,
            session: s,
            freshnessMs,
            refresher,
            brain,
            ...(claudeProvider !== null ? { claudeProvider } : {}),
            clock,
            ...(schedule !== undefined ? { schedule } : {}),
            ...(options.intentWatchdog !== undefined ? { intentWatchdog: options.intentWatchdog } : {}),
          });
        } finally {
          // `handleUtterance` has sent the deterministic reply and released busy before this starts.
          repairCoordinator?.schedulePending();
        }
      });
      turnQueue = run.catch(() => {}); // a failed turn is logged by the hub and must not block the next one
      return run;
    },
    "confirm.redeem": ({ message, hub: h, session: s }) => {
      if (message.type !== "confirm.redeem") return;
      const run = turnQueue.then(async () => {
        s.busy = true;
        s.dialogue = "awaiting-confirm";
        h.pushState();
        h.send("voice", "transcript", {
          utteranceId: message.payload.utteranceId,
          heardAs: "confirmation phrase received",
          routedTo: "grammar",
        });
        try {
          const gatedContext: GatedContext = {
            hub: h,
            gatePort: createGatePort(h, s.grants),
            session: s,
            refresher,
            clock,
            ...(schedule !== undefined ? { schedule } : {}),
          };
          await createVoiceGateAdapter(gatedContext).redeem(message.payload);
        } finally {
          s.busy = false;
          s.dialogue = s.pendingGatedAction !== null
            ? s.pendingGatedAction.grantId === undefined ? "reading-back" : "awaiting-confirm"
            : s.model !== null && s.extensionConnected ? "ready" : "no-page";
          h.pushState();
          repairCoordinator?.schedulePending();
        }
      });
      turnQueue = run.catch(() => {});
      return run;
    },
    "speak.done": ({ message, hub: h, session: s }) => {
      if (message.type !== "speak.done") return;
      const gatedContext: GatedContext = { hub: h, gatePort: createGatePort(h, s.grants), session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      handleGatedSpeakDone(gatedContext, message.payload);
    },
    settings: () => {},
    ptt: ({ message, hub: h, session: s }) => {
      if (message.type !== "ptt" || message.payload.state !== "start") return;
      const gatedContext: GatedContext = { hub: h, gatePort: createGatePort(h, s.grants), session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      clearPendingThroughVoiceGate(gatedContext, "cancelled", "push-to-talk-interrupted");
    },
    control: ({ message, hub: h, session: s }) => {
      if (message.type !== "control") return;
      const gatedContext: GatedContext = { hub: h, gatePort: createGatePort(h, s.grants), session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      if (message.payload.cmd === "stop") {
        clearPendingThroughVoiceGate(gatedContext, "cancelled", "stop-command");
        return sayStop(h, s);
      }
      if (message.payload.cmd === "repeat") {
        clearPendingThroughVoiceGate(gatedContext, "cancelled", "repeat-command");
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
      const gatedContext: GatedContext = { hub: h, gatePort: createGatePort(h, s.grants), session: s, refresher, clock, ...(schedule !== undefined ? { schedule } : {}) };
      clearPendingThroughVoiceGate(gatedContext, "page-changed", "page-changed");
      s.stale = true;
      void refresher.request("refresh").then((result) => {
        if (result.ok) repairCoordinator?.schedulePending();
      });
    },
  };

  const handlers: Handlers = { ...defaultHandlers, ...options.handlers };
  const hub = createHub({
    server,
    session,
    getPort: () => boundPort,
    dev,
    extensionId: options.extensionId ?? EXTENSION_ID,
    extraVoiceOrigins,
    ...(options.helloTimeoutMs !== undefined ? { helloTimeoutMs: options.helloTimeoutMs } : {}),
    handlers,
  });

  const repairProvider = options.repairProvider ?? claudeProvider ?? undefined;
  if (repairProvider !== undefined) {
    repairCoordinator = new RepairCoordinator({
      provider: repairProvider,
      session,
      hub,
      cacheDirectory: options.repairCacheDirectory ?? join(process.env.LOCALAPPDATA ?? homedir(), "Blip", "repair-cache"),
      ...(options.repairTimeoutMs !== undefined ? { timeoutMs: options.repairTimeoutMs } : {}),
    });
  }
  refresher = createRefresher({
    hub,
    session,
    timeoutMs: snapshotTimeoutMs,
    onAccepted: (snapshot) => repairCoordinator?.accept(snapshot),
  });

  if (options.handlersFactory !== undefined) {
    Object.assign(handlers, options.handlersFactory({
      hub,
      gatePort: createGatePort(hub, session.grants),
      session,
      refresher,
      clock,
      ...(schedule !== undefined ? { schedule } : {}),
    }));
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // D-01: IPv4 loopback literal only. Never a wildcard address, never the "localhost" alias.
    server.listen(boundPort, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  }).catch(async (error: unknown) => {
    await claudeProvider?.close();
    throw error;
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
    close: async () => {
      repairCoordinator?.close();
      hub.close();
      const serverClosed = new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await Promise.all([serverClosed, claudeProvider?.close() ?? Promise.resolve()]);
    },
  };
}
