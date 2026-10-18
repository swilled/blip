import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromePath } from "./launch-window";
import { DEMO_EXTENSION_ID } from "./extension-id";

const RESET_URL = "http://127.0.0.1:7777/healthz";
const FORM_URL = "http://127.0.0.1:7777/fixtures/forms/broken.html";
const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;
const STOP_TIMEOUT_MS = 2_000;

type DemoRunRecord = { pid: number; runId: string; repoRoot: string };

type ResetChild = {
  pid: number | undefined;
  unref(): unknown;
  onExit(listener: (reason: string) => void): void;
};

type ResetSpawnOptions = {
  cwd: string;
  detached: boolean;
  stdio: "ignore";
};

export type ResetDependencies = {
  fs: {
    copyFile(source: string, destination: string): Promise<void>;
    readFile(path: string, encoding: "utf8"): Promise<string>;
    rm(path: string, options: { force: boolean }): Promise<void>;
  };
  spawn(command: string, args: string[], options: ResetSpawnOptions): ResetChild;
  kill(pid: number): void;
  processCommandLine(pid: number): Promise<string | null>;
  fetchReady(url: string): Promise<boolean>;
  newRunId(): string;
  bridgeProfile(): Promise<"demo" | "default" | null>;
  chrome: string;
  repoRoot: string;
  log(line: string): void;
};

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function isInstalledBridge(preferencesJson: string, extensionPath: string): boolean {
  try {
    const prefs = JSON.parse(preferencesJson) as {
      extensions?: { settings?: Record<string, { state?: number; path?: string }> };
    };
    const extension = prefs.extensions?.settings?.[DEMO_EXTENSION_ID];
    return Boolean(
      extension?.path &&
      resolve(extension.path).toLowerCase() === resolve(extensionPath).toLowerCase() &&
      extension.state !== 0,
    );
  } catch {
    return false;
  }
}

export function parseDemoRunRecord(contents: string): DemoRunRecord | null {
  try {
    const value = JSON.parse(contents) as Partial<DemoRunRecord>;
    if (
      Number.isSafeInteger(value.pid) && value.pid! > 0 &&
      typeof value.runId === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(value.runId) &&
      typeof value.repoRoot === "string" && value.repoRoot.length > 0
    ) {
      return { pid: value.pid!, runId: value.runId, repoRoot: value.repoRoot };
    }
  } catch {
    // Invalid or legacy PID files are never sufficient evidence to terminate a process.
  }
  return null;
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, "/").toLowerCase();
}

export function isDemoRunCommandLine(commandLine: string | null, record: DemoRunRecord, repoRoot: string): boolean {
  if (commandLine === null || normalizePath(record.repoRoot) !== normalizePath(repoRoot)) return false;
  const normalized = commandLine.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("dev/mock-server/src/run-real.ts") &&
    normalized.includes(`--demo-run-id=${record.runId.toLowerCase()}`) &&
    normalized.includes(`--demo-root=${normalizePath(repoRoot)}`) &&
    normalized.includes("--browser-extension");
}

async function waitForPreviousRunToStop(
  deps: ResetDependencies,
  record: DemoRunRecord,
): Promise<void> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const commandLine = await deps.processCommandLine(record.pid);
    if (!isDemoRunCommandLine(commandLine, record, deps.repoRoot)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Previous demo server PID ${record.pid} did not stop within 2 seconds`);
}

async function waitForServer(
  deps: ResetDependencies,
  readyFile: string,
  runId: string,
  pid: number,
  getExitReason: () => string | null,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const exitReason = getExitReason();
    if (exitReason !== null) throw new Error(`Demo server exited before becoming ready: ${exitReason}`);
    try {
      const ready = parseDemoRunRecord(await deps.fs.readFile(readyFile, "utf8"));
      if (
        ready?.pid === pid && ready.runId === runId && normalizePath(ready.repoRoot) === normalizePath(deps.repoRoot) &&
        await deps.fetchReady(RESET_URL)
      ) return;
    } catch {
      // The readiness marker and health endpoint are expected to be absent while the runner boots.
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)));
    }
  }
  throw new Error(`Demo server did not become ready within 20 seconds at ${RESET_URL}`);
}

export async function resetDemo(deps: ResetDependencies): Promise<void> {
  const profileTemplate = join(deps.repoRoot, "fixtures", "demo", "profile.template.json");
  const profile = join(deps.repoRoot, "fixtures", "demo", "profile.json");
  const pidFile = join(deps.repoRoot, ".demo-pid");
  const readyFile = join(deps.repoRoot, ".demo-ready");

  await deps.fs.copyFile(profileTemplate, profile);
  deps.log("demo reset: restored fictional profile");

  let pidContents: string | undefined;
  try {
    pidContents = await deps.fs.readFile(pidFile, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const previous = pidContents === undefined ? null : parseDemoRunRecord(pidContents);
  if (previous !== null && normalizePath(previous.repoRoot) === normalizePath(deps.repoRoot)) {
    const commandLine = await deps.processCommandLine(previous.pid);
    if (isDemoRunCommandLine(commandLine, previous, deps.repoRoot)) {
      try {
        deps.kill(previous.pid);
      } catch {
        // The old process may already have exited.
      }
      await waitForPreviousRunToStop(deps, previous);
    } else {
      deps.log(`demo reset: left PID ${previous.pid} alone because its command line did not match this demo run`);
    }
  } else if (pidContents?.trim()) {
    deps.log("demo reset: ignored an unverified legacy or stale PID record");
  }
  await deps.fs.rm(pidFile, { force: true });
  await deps.fs.rm(readyFile, { force: true });

  const runId = deps.newRunId();
  const runner = deps.spawn(
    "node",
    [
      "--import", "tsx", join(deps.repoRoot, "dev", "mock-server", "src", "run-real.ts"),
      "--browser-extension", `--demo-run-id=${runId}`, `--demo-root=${resolve(deps.repoRoot)}`,
    ],
    { cwd: deps.repoRoot, detached: true, stdio: "ignore" },
  );
  if (!Number.isSafeInteger(runner.pid) || runner.pid! <= 0) {
    throw new Error("Demo server process did not provide a valid PID");
  }
  let exitReason: string | null = null;
  runner.onExit((reason) => { exitReason ??= reason; });
  runner.unref();

  await waitForServer(deps, readyFile, runId, runner.pid!, () => exitReason);
  deps.log("demo reset: server is ready");

  const bridgeProfile = await deps.bridgeProfile();
  const demoProfileArg = `--user-data-dir=${join(deps.repoRoot, ".chrome-profile-demo")}`;
  const chrome = deps.spawn(
    deps.chrome,
    [
      ...(bridgeProfile === "default" ? [] : [demoProfileArg]),
      "--new-window",
      ...(bridgeProfile ? [] : ["chrome://extensions/"]),
      FORM_URL,
    ],
    { cwd: deps.repoRoot, detached: true, stdio: "ignore" },
  );
  chrome.unref();
  if (!bridgeProfile) {
    deps.log(`demo reset: load the unpacked bridge in chrome://extensions from ${join(deps.repoRoot, "dev", "mock-server", "extension")}, then reload the form`);
  }
  deps.log("demo reset: opened the broken form in Chrome");
}

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("/reset.ts")) {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  void resetDemo({
    fs: { copyFile, readFile, rm },
    spawn(command, args, options) {
      const child = nodeSpawn(command, args, options as never);
      return {
        pid: child.pid,
        unref: () => child.unref(),
        onExit(listener) {
          child.once("error", (error) => listener(`failed to start: ${error.message}`));
          child.once("exit", (code, signal) => listener(`code ${String(code)}, signal ${String(signal)}`));
        },
      };
    },
    kill: (pid) => process.kill(pid),
    processCommandLine(pid) {
      if (process.platform !== "win32") return Promise.resolve(null);
      return new Promise((resolveCommandLine) => {
        nodeExecFile(
          "powershell.exe",
          [
            "-NoProfile", "-NonInteractive", "-Command",
            "$process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$env:BLIP_PID); if ($process) { $process.CommandLine }",
          ],
          {
            encoding: "utf8",
            windowsHide: true,
            env: { ...process.env, BLIP_PID: String(pid) },
          },
          (error, stdout) => resolveCommandLine(error ? null : stdout.trim() || null),
        );
      });
    },
    async fetchReady(url) {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
      } catch {
        return false;
      }
    },
    newRunId: randomUUID,
    async bridgeProfile() {
      const extensionPath = join(repoRoot, "dev", "mock-server", "extension");
      const candidates: Array<{ name: "demo" | "default"; userData: string }> = [
        { name: "demo", userData: join(repoRoot, ".chrome-profile-demo") },
        ...(process.env.LOCALAPPDATA
          ? [{ name: "default" as const, userData: join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data") }]
          : []),
      ];
      for (const candidate of candidates) {
        for (const prefsName of ["Secure Preferences", "Preferences"]) {
          try {
            const prefs = await readFile(join(candidate.userData, "Default", prefsName), "utf8");
            if (isInstalledBridge(prefs, extensionPath)) {
              return candidate.name;
            }
          } catch {
            // A profile may not have been initialized, or this preference file may not exist yet.
          }
        }
      }
      return null;
    },
    chrome: resolveChromePath(),
    repoRoot,
    log: (line) => console.log(line),
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
