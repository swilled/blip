// Core's real server in-process (dev true, fake brain) serving apps/voice/dist, plus the PTT hook and voice window.
// Imports core modules read-only. The fake extension is the default; --browser-extension selects local DOM bridge mode.
//   node --import tsx dev/mock-server/src/run-real.ts [--fixture=booking|broken] [--port=7777] [--fake-delay=1500] [--browser-extension]
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_PORT, type ActRequest } from "@blip/protocol";
import { FIXTURE_NAMES, type FixtureName } from "@blip/protocol/fixtures-loader";
import { startServer, type RunningServer } from "../../../apps/server/src/server";
import type { GatePort } from "../../../apps/server/src/voice/gate-port";
import { createStubGate } from "../../../apps/server/src/voice/gate-port";
import { createDialogueHandlers } from "../../../apps/server/src/voice/dialogue-runner";
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
    ...(opts.browserExtension ? { extensionId: DEMO_EXTENSION_ID } : {}),
    fakeDelayMs: opts.fakeDelayMs ?? 1500,
    staticRoots,
    handlers: createDialogueHandlers({
      gate: opts.gate ?? createStubGate(now),
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
    },
    strict: true,
  });
  if (!(FIXTURE_NAMES as readonly string[]).includes(values.fixture)) {
    console.error(`--fixture must be one of ${FIXTURE_NAMES.join(", ")}`);
    process.exit(2);
  }
  const real = await startReal({
    fixture: values.fixture as FixtureName,
    ...(values.port !== undefined ? { port: Number(values.port) } : {}),
    ...(values["fake-delay"] !== undefined ? { fakeDelayMs: Number(values["fake-delay"]) } : {}),
    ...(values["browser-extension"] ? { browserExtension: true } : {}),
  });
  console.log(`blip real server (fake brain, ${values.fixture}${values["browser-extension"] ? ", live Chrome form bridge" : ""}): http://127.0.0.1:${real.server.port}/`);
  const stopPtt = await startPttWire(real.server.port);
  await launchVoiceWindow({ port: real.server.port, demoExtension: Boolean(values["browser-extension"]) });
  const pidFile = join(fileURLToPath(new URL("../../../", import.meta.url)), ".demo-pid");
  writeFileSync(pidFile, String(process.pid), "utf8");
  console.log("ready. Press Ctrl+C to stop");
  const shutdown = (): void => void stopPtt().then(() => real.close()).finally(() => {
    rmSync(pidFile, { force: true });
    process.exit(0);
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
