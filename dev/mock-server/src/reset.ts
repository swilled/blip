import { spawn as nodeSpawn } from "node:child_process";
import { copyFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromePath } from "./launch-window";
import { DEMO_EXTENSION_ID } from "./extension-id";

const RESET_URL = "http://127.0.0.1:7777/";
const FORM_URL = "http://127.0.0.1:7777/fixtures/forms/broken.html";
const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

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
  spawn(command: string, args: string[], options: ResetSpawnOptions): { unref(): unknown };
  kill(pid: number): void;
  fetchReady(url: string): Promise<boolean>;
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

async function waitForServer(fetchReady: (url: string) => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if (await fetchReady(RESET_URL)) return;
    } catch {
      // A connection error is expected while the restarted process boots.
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

  await deps.fs.copyFile(profileTemplate, profile);
  deps.log("demo reset: restored fictional profile");

  let pidContents: string | undefined;
  try {
    pidContents = await deps.fs.readFile(pidFile, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const pidText = pidContents?.trim();
  if (pidText && /^\d+$/.test(pidText)) {
    const pid = Number(pidText);
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        deps.kill(pid);
      } catch {
        // The old process may already have exited.
      }
    }
  }
  await deps.fs.rm(pidFile, { force: true });

  const runner = deps.spawn(
    "node",
    ["--import", "tsx", "dev/mock-server/src/run-real.ts", "--browser-extension"],
    { cwd: deps.repoRoot, detached: true, stdio: "ignore" },
  );
  runner.unref();

  await waitForServer(deps.fetchReady);
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
    spawn: (command, args, options) => nodeSpawn(command, args, options as never),
    kill: (pid) => process.kill(pid),
    async fetchReady(url) {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
      } catch {
        return false;
      }
    },
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
