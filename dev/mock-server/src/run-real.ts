// Core's real server in-process (dev true, fake brain) serving apps/voice/dist, plus the PTT hook and voice window.
// Imports core modules read-only. The fake extension is the default; --browser-extension selects local DOM bridge mode.
//   node --import tsx dev/mock-server/src/run-real.ts [--fixture=booking|broken] [--port=7777] [--fake-delay=1500] [--browser-extension]
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_PORT, type ActRequest } from "@blip/protocol";
import { FIXTURE_NAMES, type FixtureName } from "@blip/protocol/fixtures-loader";
import { startServer, type RunningServer } from "../../../apps/server/src/server";
import type { GatePort } from "../../../apps/server/src/voice/gate-port";
import { createDialogueHandlers } from "../../../apps/server/src/voice/dialogue-runner";
import { createCoreDialogueGatePort } from "../../../apps/server/src/voice/core-gate-port";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import type { FakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { launchVoiceWindow } from "./launch-window";
import { startPttWire } from "./ptt-wire";
import { DEMO_EXTENSION_ID } from "./extension-id";

export { DEMO_EXTENSION_ID } from "./extension-id";

export interface RealOptions {
  port?: number;
  fixture?: FixtureName;
  fakeDelayMs?: number;
  staticDir?: string;
  gate?: GatePort;
  now?: () => number;
  onActRequest?: (request: ActRequest) => void;
  /** Use the dedicated Chrome profile and expect the manually installed local bridge. */
  browserExtension?: boolean;
}

export function buildManagedRunnerArgs(args: string[], repoRoot: string, runId: string): string[] {
  const managed: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--demo-root") {
      index++;
      continue;
    }
    if (argument.startsWith("--demo-root=")) continue;
    managed.push(argument);
  }
  return [...managed, `--demo-run-id=${runId}`, `--demo-root=${repoRoot}`];
}

export function installManagedShutdownHandlers(events: Pick<EventEmitter, "on" | "once">, shutdown: () => void): void {
  events.once("SIGINT", shutdown);
  events.once("SIGTERM", shutdown);
  events.on("message", (message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "shutdown") {
      shutdown();
    }
  });
}

export async function startReal(opts: RealOptions = {}): Promise<{
  server: RunningServer;
  extension: FakeExtension | undefined;
  close(): Promise<void>;
}> {
  const staticDir = opts.staticDir ?? fileURLToPath(new URL("../../../apps/voice/dist", import.meta.url));
  const fixturesDir = fileURLToPath(new URL("../../../fixtures/forms", import.meta.url));
  const now = opts.now ?? Date.now;
  const staticRoots = [
    ...(existsSync(staticDir) ? [{ urlPrefix: "/", dir: staticDir }] : []),
    ...(existsSync(fixturesDir) ? [{ urlPrefix: "/fixtures/forms", dir: fixturesDir }] : []),
  ];
  const server = await startServer({
    port: opts.port ?? DEFAULT_PORT,
    dev: true, // the default fake extension has no Origin; browser mode is pinned by its extension id
    brain: "fake",
    clock: now,
    ...(opts.browserExtension ? { extensionId: DEMO_EXTENSION_ID } : {}),
    fakeDelayMs: opts.fakeDelayMs ?? 1500,
    staticRoots,
    handlersFactory: (context) => createDialogueHandlers({
      gate: opts.gate ?? createCoreDialogueGatePort(context),
      now,
      ...(opts.onActRequest !== undefined ? { onActRequest: opts.onActRequest } : {}),
    }),
  });
  const extension = opts.browserExtension
    ? undefined
    : startFakeExtension({ url: server.url, fixture: opts.fixture ?? "broken" });
  try {
    await extension?.connected;
  } catch (err) {
    await server.close();
    throw err;
  }
  return {
    server,
    extension,
    async close() {
      extension?.close();
      await server.close();
    },
  };
}

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("/run-real.ts")) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      fixture: { type: "string", default: "broken" },
      port: { type: "string" },
      "fake-delay": { type: "string" },
      "browser-extension": { type: "boolean", default: false },
      "demo-run-id": { type: "string" },
      "demo-root": { type: "string" },
    },
    strict: true,
  });
  if (!(FIXTURE_NAMES as readonly string[]).includes(values.fixture)) {
    console.error(`--fixture must be one of ${FIXTURE_NAMES.join(", ")}`);
    process.exit(2);
  }
  const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  if (values["demo-root"] !== undefined && values["demo-root"] !== repoRoot) {
    console.error("--demo-root must match the repository containing run-real.ts");
    process.exit(2);
  }
  if (values["demo-run-id"] && values["demo-root"] !== repoRoot) {
    console.error("--demo-root must match the repository containing run-real.ts");
    process.exit(2);
  }
  if (!values["demo-run-id"]) {
    const runId = randomUUID();
    const child = nodeSpawn(
      process.execPath,
      [
        ...process.execArgv,
        join(repoRoot, "dev", "mock-server", "src", "run-real.ts"),
        ...buildManagedRunnerArgs(process.argv.slice(2), repoRoot, runId),
      ],
      { cwd: process.cwd(), stdio: ["inherit", "inherit", "inherit", "ipc"] },
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        if (child.connected) child.send({ type: "shutdown", signal });
      });
    }
    await new Promise<void>((resolveChild) => {
      child.once("error", (error) => {
        console.error(`could not start managed demo runner: ${error.message}`);
        process.exitCode = 1;
        resolveChild();
      });
      child.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
        resolveChild();
      });
    });
  } else {
    const pidFile = join(repoRoot, ".demo-pid");
    const readyFile = join(repoRoot, ".demo-ready");
    const runRecord = JSON.stringify({ pid: process.pid, runId: values["demo-run-id"], repoRoot });
    let real: Awaited<ReturnType<typeof startReal>> | undefined;
    let stopPtt: (() => Promise<void>) | undefined;
    let shutdownStarted = false;
    const removeOwnMarker = (path: string): void => {
      try {
        if (readFileSync(path, "utf8") === runRecord) rmSync(path, { force: true });
      } catch {
        // Marker files may already be gone or replaced by a newer reset run.
      }
    };
    const shutdown = (): void => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      void (async () => {
        try { await stopPtt?.(); } catch { /* Continue closing the demo server. */ }
        try { await real?.close(); } catch { /* Remove our markers even if close fails. */ }
        removeOwnMarker(pidFile);
        removeOwnMarker(readyFile);
        process.exit(0);
      })();
    };
    installManagedShutdownHandlers(process, shutdown);

    real = await startReal({
      fixture: values.fixture as FixtureName,
      ...(values.port !== undefined ? { port: Number(values.port) } : {}),
      ...(values["fake-delay"] !== undefined ? { fakeDelayMs: Number(values["fake-delay"]) } : {}),
      ...(values["browser-extension"] ? { browserExtension: true } : {}),
    });
    console.log(`blip real server (fake brain, ${values.fixture}${values["browser-extension"] ? ", live Chrome form bridge" : ""}): http://127.0.0.1:${real.server.port}/`);
    stopPtt = await startPttWire(real.server.port);
    await launchVoiceWindow({ port: real.server.port, demoExtension: Boolean(values["browser-extension"]) });
    writeFileSync(pidFile, runRecord, "utf8");
    writeFileSync(readyFile, runRecord, "utf8");
    console.log("ready. Press Ctrl+C to stop");
  }
}
