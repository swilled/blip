import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtension } from "../apps/extension/build.js";
import { DEFAULT_PORT, EXTENSION_ID, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { parseAllowedOrigin } from "../apps/server/src/hub/guard.js";
import { startServer, type RunningServer } from "../apps/server/src/server.js";
import { startTestPages, type TestPagesServer } from "../tools/test-pages/serve.js";
import { resolveBrowser } from "./browser.js";

const modulePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(modulePath), "..");
const extensionDist = path.join(repoRoot, "apps", "extension", "dist");
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 200;

export type DemoBrain = "fake" | "claude";
export interface DemoOptions {
  brain: DemoBrain;
  smoke: boolean;
  help?: boolean;
}

export interface VoiceTarget {
  url: string;
  origin: string;
}

export interface ReadinessWaitOptions {
  timeoutMs: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const USAGE = `usage: npm run demo -- [--brain=fake|claude] [--smoke]
  --brain=fake|claude  local brain; defaults to fake
  --smoke              exit after extension-connected readiness and print a pass marker
  --help               show this help

The launcher always uses .chrome-profile/demo and never auto-loads the extension.`;

export function parseDemoArgs(args: string[]): DemoOptions {
  let brain: DemoBrain = "fake";
  let smoke = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--smoke") {
      smoke = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--brain") {
      const value = args[++index];
      if (value !== "fake" && value !== "claude") throw new Error("--brain must be fake or claude");
      brain = value;
    } else if (arg?.startsWith("--brain=")) {
      const value = arg.slice("--brain=".length);
      if (value !== "fake" && value !== "claude") throw new Error("--brain must be fake or claude");
      brain = value;
    } else {
      throw new Error(`unknown option: ${arg ?? "(missing)"}`);
    }
  }
  return { brain, smoke, ...(help ? { help: true } : {}) };
}

/** Accept only the HTTP loopback origins currently supported by the hub's role allowlist. */
export function resolveVoiceTarget(raw: string | undefined): VoiceTarget | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BLIP_VOICE_URL must be an absolute local HTTP URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "http:" ||
    (hostname !== "127.0.0.1" && hostname !== "localhost") ||
    url.username !== "" ||
    url.password !== "" ||
    url.port === ""
  ) {
    throw new Error("BLIP_VOICE_URL must be an HTTP URL on 127.0.0.1 or localhost with an explicit port");
  }
  const origin = `http://${hostname}:${url.port}`;
  try {
    parseAllowedOrigin(origin);
  } catch {
    throw new Error("BLIP_VOICE_URL origin is not accepted by the local voice allowlist");
  }
  return { url: url.href, origin };
}

export function demoProfilePath(root = repoRoot): string {
  return path.resolve(root, ".chrome-profile", "demo");
}

export function browserLaunchArgs(profileDirectory: string, fixtureUrl: string): string[] {
  return [
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    fixtureUrl,
  ];
}

export function voiceLaunchArgs(profileDirectory: string, voiceUrl: string): string[] {
  return [
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    voiceUrl,
  ];
}

export function classifyExtensionReadiness(connected: boolean, installedInDedicatedProfile: boolean): "connected" | "setup-required" | "timeout" {
  if (connected && installedInDedicatedProfile) return "connected";
  if (!installedInDedicatedProfile) return "setup-required";
  return "timeout";
}

export async function waitForExtensionReady(
  isReady: () => boolean | Promise<boolean>,
  options: ReadinessWaitOptions,
): Promise<boolean> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + options.timeoutMs;
  while (true) {
    if (await isReady()) return true;
    const remaining = deadline - now();
    if (remaining <= 0) return false;
    await sleep(Math.min(options.intervalMs, remaining));
  }
}

function hasExtensionSetting(preferences: unknown): boolean {
  if (typeof preferences !== "object" || preferences === null || !("extensions" in preferences)) return false;
  const extensions = (preferences as { extensions?: unknown }).extensions;
  if (typeof extensions !== "object" || extensions === null || !("settings" in extensions)) return false;
  const settings = (extensions as { settings?: unknown }).settings;
  return typeof settings === "object" && settings !== null && EXTENSION_ID in settings;
}

/** Reads only this launcher's dedicated profile to verify that it owns the extension connection. */
export async function hasExtensionInProfile(profileDirectory: string): Promise<boolean> {
  // Chromium stores unpacked extension registration in Preferences. Edge keeps
  // the same record in Secure Preferences, so check both files in the profile.
  for (const preferenceFile of ["Preferences", "Secure Preferences"]) {
    try {
      const contents = await readFile(path.join(profileDirectory, "Default", preferenceFile), "utf8");
      if (hasExtensionSetting(JSON.parse(contents))) return true;
    } catch {
      // A fresh profile may not have written both preference files yet.
    }
  }
  try {
    await access(path.join(profileDirectory, "Default", "Extensions", EXTENSION_ID));
    return true;
  } catch {
    return false;
  }
}

async function buildExtensionForDemo(): Promise<void> {
  // The demo always listens on its fixed port. An earlier E2E build may have
  // embedded a temporary port, so rebuild when the current bundle is stale.
  const socketUrl = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;
  try {
    const background = await readFile(path.join(extensionDist, "background.js"), "utf8");
    if (background.includes(socketUrl)) return;
  } catch {
    // A fresh checkout or cleaned build needs a production extension build.
  }
  await buildExtension({ socketUrl });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  await new Promise<void>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.off("exit", done);
      resolve();
    };
    const timer = setTimeout(done, 2_000);
    child.once("exit", done);
    child.kill(); // This is the exact browser child spawned by this launcher.
  });
}

async function runDemo(options: DemoOptions): Promise<number> {
  const voiceTarget = resolveVoiceTarget(process.env["BLIP_VOICE_URL"]);
  const browser = resolveBrowser(); // Honors BLIP_BROWSER and the existing Chrome/Edge resolver.
  const profileDirectory = demoProfilePath();
  const children: ChildProcess[] = [];
  let server: RunningServer | undefined;
  let pages: TestPagesServer | undefined;
  let closing = false;

  const cleanup = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    for (const child of children.reverse()) await stopChild(child);
    await pages?.close();
    await server?.close();
  };

  try {
    await buildExtensionForDemo();
    await mkdir(profileDirectory, { recursive: true });
    server = await startServer({
      port: DEFAULT_PORT,
      dev: true,
      brain: options.brain,
      extraVoiceOrigins: voiceTarget === undefined ? [] : [voiceTarget.origin],
    });
    pages = await startTestPages({ port: 0, build: true });
    const fixtureUrl = `${pages.origins.primary}/injection.html`;
    process.stdout.write(`Browser: ${browser}\n`);
    process.stdout.write(`Profile: ${profileDirectory}\n`);
    process.stdout.write(`Server: ws://127.0.0.1:${server.port}/ws (brain=${options.brain})\n`);
    process.stdout.write(`Local fixture: ${fixtureUrl}\n`);
    process.stdout.write(`Load unpacked once from: ${extensionDist}\n`);
    if (voiceTarget === undefined) process.stdout.write("Voice client: not configured (BLIP_VOICE_URL is unset)\n");

    const browserChild = spawn(browser, browserLaunchArgs(profileDirectory, fixtureUrl), {
      stdio: "ignore",
      windowsHide: true,
    });
    children.push(browserChild);
    let launchError: Error | undefined;
    browserChild.once("error", (error) => { launchError = error; });

    const dedicatedExtensionPresent = await hasExtensionInProfile(profileDirectory);
    if (!dedicatedExtensionPresent && !options.smoke) {
      process.stdout.write(
        `DEMO_SETUP_REQUIRED: Load unpacked at chrome://extensions or edge://extensions in this dedicated profile using ${extensionDist}; this command will keep waiting for readiness.\n`,
      );
    }
    let finishSignal!: () => void;
    let stopped = false;
    const stopPromise = new Promise<void>((resolve) => { finishSignal = resolve; });
    const onStop = () => {
      stopped = true;
      finishSignal();
    };
    process.once("SIGINT", onStop);
    process.once("SIGTERM", onStop);

    const readiness = waitForExtensionReady(async () => {
      if (launchError !== undefined) throw launchError;
      if (browserChild.exitCode !== null) throw new Error(`browser exited before extension readiness (code ${browserChild.exitCode})`);
      return server!.session.extensionConnected && await hasExtensionInProfile(profileDirectory);
    }, { timeoutMs: options.smoke ? READY_TIMEOUT_MS : Number.POSITIVE_INFINITY, intervalMs: READY_POLL_MS });
    const ready = await Promise.race([
      readiness,
      stopPromise.then(() => false),
    ]);
    process.off("SIGINT", onStop);
    process.off("SIGTERM", onStop);

    if (stopped) {
      await cleanup();
      return 0;
    }

    if (!ready) {
      const installed = await hasExtensionInProfile(profileDirectory);
      const outcome = classifyExtensionReadiness(server.session.extensionConnected, installed);
      if (outcome === "setup-required") {
        process.stderr.write(
          `DEMO_SETUP_REQUIRED: Load unpacked at chrome://extensions or edge://extensions in this dedicated profile using ${extensionDist}, then rerun npm run demo -- --brain=fake --smoke.\n`,
        );
        return 2;
      }
      process.stderr.write("DEMO_EXTENSION_TIMEOUT: the dedicated profile extension did not connect to the server before the readiness timeout.\n");
      return 1;
    }

    if (voiceTarget !== undefined) {
      const voiceChild = spawn(browser, voiceLaunchArgs(profileDirectory, voiceTarget.url), {
        stdio: "ignore",
        windowsHide: true,
      });
      children.push(voiceChild);
      await new Promise<void>((resolve, reject) => {
        voiceChild.once("error", reject);
        voiceChild.once("spawn", resolve);
      });
      process.stdout.write(`Voice client opened: ${voiceTarget.url}\n`);
    }

    if (options.smoke) {
      await cleanup();
      process.stdout.write("BLIP_DEMO_SMOKE=PASS extension-connected=true profile=dedicated\n");
      return 0;
    }

    process.stdout.write("DEMO_READY: extension-connected=true profile=dedicated\n");
    process.stdout.write("Press Ctrl+C to stop the local demo.\n");
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      browserChild.once("exit", stop);
    });
    await cleanup();
    return 0;
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

async function main(): Promise<number> {
  let options: DemoOptions;
  try {
    options = parseDemoArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  return runDemo(options);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === path.resolve(modulePath)) {
  void main()
    .then((code) => { process.exitCode = code; })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
