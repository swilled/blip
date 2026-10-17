import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEMO_EXTENSION_ID } from "./extension-id";
import { isDemoRunCommandLine, isInstalledBridge, parseDemoRunRecord, resetDemo } from "./reset";

type ResetFs = {
  copyFile(source: string, destination: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rm(path: string, options: { force: boolean }): Promise<void>;
};

type SpawnOptions = Record<string, unknown>;
type ResetDeps = {
  fs: ResetFs;
  spawn(command: string, args: string[], options: SpawnOptions): {
    pid: number | undefined;
    unref(): void;
    onExit(listener: (reason: string) => void): void;
  };
  kill(pid: number): void;
  processCommandLine(pid: number): Promise<string | null>;
  fetchReady(url: string): Promise<boolean>;
  newRunId(): string;
  bridgeProfile(): Promise<"demo" | "default" | null>;
  chrome: string;
  repoRoot: string;
  log(line: string): void;
};

const RUN_ID = "demo-run-token-123456";
const PREVIOUS_RUN_ID = "previous-run-token-123456";

function fakeDeps(
  pidContents: string | null,
  readiness: boolean[] = [true],
  bridgeProfile: "demo" | "default" | null = null,
  opts: { readyContents?: string; oldCommandLine?: string | null; exitReason?: string } = {},
) {
  const repoRoot = "C:\\blip-demo";
  const events: string[] = [];
  const spawnCalls: Array<{ command: string; args: unknown; options: SpawnOptions }> = [];
  const copied: Array<{ source: string; destination: string }> = [];
  const removed: string[] = [];
  const killed: number[] = [];
  const readyUrls: string[] = [];
  let readCount = 0;
  const currentReady = JSON.stringify({ pid: 4242, runId: RUN_ID, repoRoot });
  const oldCommandLine = opts.oldCommandLine ?? `node --import tsx ${join(repoRoot, "dev", "mock-server", "src", "run-real.ts")} --browser-extension --demo-run-id=${PREVIOUS_RUN_ID} --demo-root=${repoRoot}`;

  const fs: ResetFs = {
    async copyFile(source, destination) {
      events.push("copy-profile");
      copied.push({ source, destination });
    },
    async readFile(path) {
      if (path.endsWith(".demo-ready")) {
        events.push("read-ready");
        return opts.readyContents ?? currentReady;
      }
      events.push("read-pid");
      if (pidContents === null) throw Object.assign(new Error("missing pid file"), { code: "ENOENT" });
      return pidContents;
    },
    async rm(path) {
      events.push("remove-pid");
      removed.push(path);
    },
  };

  const deps: ResetDeps = {
    fs,
    spawn(command, args, options) {
      events.push(command === "node" ? "spawn-runner" : "spawn-chrome");
      spawnCalls.push({ command, args, options });
      return {
        pid: command === "node" ? 4242 : undefined,
        unref: () => events.push("unref"),
        onExit(listener) {
          if (opts.exitReason !== undefined) listener(opts.exitReason);
        },
      };
    },
    kill(pid) {
      events.push("kill-pid");
      killed.push(pid);
      throw new Error("process already stopped");
    },
    async processCommandLine(pid) {
      events.push("read-process-command-line");
      if (killed.includes(pid)) return null;
      return pid === 31415 ? oldCommandLine : null;
    },
    async fetchReady(url) {
      events.push("poll-ready");
      readyUrls.push(url);
      const result = readiness[Math.min(readCount, readiness.length - 1)] ?? false;
      readCount++;
      return result;
    },
    newRunId: () => RUN_ID,
    async bridgeProfile() {
      events.push("check-bridge");
      return bridgeProfile;
    },
    chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    repoRoot,
    log: (line) => events.push(`log:${line}`),
  };

  return { deps, events, spawnCalls, copied, removed, killed, readyUrls, repoRoot, currentReady };
}

describe("demo reset", () => {
  it("recognizes the unpacked bridge from Secure Preferences when Chrome omits the state field", () => {
    const extensionPath = join("C:\\blip-demo", "dev", "mock-server", "extension");
    const prefs = JSON.stringify({
      extensions: {
        settings: {
          [DEMO_EXTENSION_ID]: { path: extensionPath, location: 4 },
        },
      },
    });

    expect(isInstalledBridge(prefs, extensionPath)).toBe(true);
  });

  it("ignores a disabled bridge or one registered from another folder", () => {
    const extensionPath = join("C:\\blip-demo", "dev", "mock-server", "extension");
    const disabled = JSON.stringify({ extensions: { settings: { [DEMO_EXTENSION_ID]: { path: extensionPath, state: 0 } } } });
    const elsewhere = JSON.stringify({ extensions: { settings: { [DEMO_EXTENSION_ID]: { path: "C:\\other\\extension" } } } });

    expect(isInstalledBridge(disabled, extensionPath)).toBe(false);
    expect(isInstalledBridge(elsewhere, extensionPath)).toBe(false);
  });

  it("parses a run record and matches only a command line carrying its process token and repo root", () => {
    const record = { pid: 31415, runId: PREVIOUS_RUN_ID, repoRoot: "C:\\blip-demo" };
    expect(parseDemoRunRecord(JSON.stringify(record))).toEqual(record);
    expect(parseDemoRunRecord("31415")).toBeNull();
    expect(isDemoRunCommandLine(
      `node dev/mock-server/src/run-real.ts --browser-extension --demo-run-id=${PREVIOUS_RUN_ID} --demo-root=C:\\blip-demo`,
      record,
      record.repoRoot,
    )).toBe(true);
    expect(isDemoRunCommandLine("node unrelated.js", record, record.repoRoot)).toBe(false);
    expect(isDemoRunCommandLine(
      `node dev/mock-server/src/run-real.ts --browser-extension --demo-run-id=${PREVIOUS_RUN_ID} --demo-root=C:\\other`,
      record,
      record.repoRoot,
    )).toBe(false);
  });

  it("restores the profile, replaces the previous stack, waits for readiness, then opens Chrome safely", async () => {
    const previousRecord = JSON.stringify({ pid: 31415, runId: PREVIOUS_RUN_ID, repoRoot: "C:\\blip-demo" });
    const fake = fakeDeps(previousRecord, [false, true]);

    await resetDemo(fake.deps);

    const profilePath = join(fake.repoRoot, "fixtures", "demo", "profile.json");
    const pidPath = join(fake.repoRoot, ".demo-pid");
    expect(fake.copied).toEqual([{
      source: join(fake.repoRoot, "fixtures", "demo", "profile.template.json"),
      destination: profilePath,
    }]);
    expect(fake.killed).toEqual([31415]);
    expect(fake.removed).toEqual([pidPath, join(fake.repoRoot, ".demo-ready")]);
    expect(fake.events.indexOf("copy-profile")).toBeLessThan(fake.events.indexOf("read-pid"));
    expect(fake.events.indexOf("kill-pid")).toBeLessThan(fake.events.indexOf("remove-pid"));
    expect(fake.events.indexOf("remove-pid")).toBeLessThan(fake.events.indexOf("spawn-runner"));
    expect(fake.events.indexOf("spawn-runner")).toBeLessThan(fake.events.indexOf("poll-ready"));
    expect(fake.events.lastIndexOf("poll-ready")).toBeLessThan(fake.events.indexOf("check-bridge"));
    expect(fake.events.indexOf("check-bridge")).toBeLessThan(fake.events.indexOf("spawn-chrome"));
    expect(fake.readyUrls).toEqual(["http://127.0.0.1:7777/healthz", "http://127.0.0.1:7777/healthz"]);

    const runner = fake.spawnCalls[0]!;
    expect(runner.command).toBe("node");
    expect(Array.isArray(runner.args)).toBe(true);
    expect(runner.args).toEqual([
      "--import", "tsx", join(fake.repoRoot, "dev", "mock-server", "src", "run-real.ts"),
      "--browser-extension", `--demo-run-id=${RUN_ID}`, `--demo-root=${fake.repoRoot}`,
    ]);
    expect(runner.options).toMatchObject({ cwd: fake.repoRoot, detached: true, stdio: "ignore" });
    expect(runner.options.shell).toBeUndefined();

    const chrome = fake.spawnCalls[1]!;
    expect(chrome.command).toBe(fake.deps.chrome);
    expect(Array.isArray(chrome.args)).toBe(true);
    expect(chrome.args).toEqual([
      `--user-data-dir=${join(fake.repoRoot, ".chrome-profile-demo")}`,
      "--new-window",
      "chrome://extensions/",
      "http://127.0.0.1:7777/fixtures/forms/broken.html",
    ]);
    expect(chrome.options).toMatchObject({ cwd: fake.repoRoot, detached: true, stdio: "ignore" });
    expect(chrome.options.shell).toBeUndefined();
    expect(fake.events.filter((event) => event === "unref")).toHaveLength(2);
    expect(fake.events).toContain(`log:demo reset: load the unpacked bridge in chrome://extensions from ${join(fake.repoRoot, "dev", "mock-server", "extension")}, then reload the form`);
  });

  it("opens only the form after the bridge has been installed in the demo profile", async () => {
    const fake = fakeDeps(null, [true], "demo");

    await resetDemo(fake.deps);

    const chrome = fake.spawnCalls[1]!;
    expect(chrome.args).toEqual([
      `--user-data-dir=${join(fake.repoRoot, ".chrome-profile-demo")}`,
      "--new-window",
      "http://127.0.0.1:7777/fixtures/forms/broken.html",
    ]);
    expect(fake.events.some((event) => event.includes("load the unpacked bridge"))).toBe(false);
  });

  it("opens the form in the regular Chrome profile if the bridge is installed there", async () => {
    const fake = fakeDeps(null, [true], "default");

    await resetDemo(fake.deps);

    const chrome = fake.spawnCalls[1]!;
    expect(chrome.args).toEqual([
      "--new-window",
      "http://127.0.0.1:7777/fixtures/forms/broken.html",
    ]);
    expect(fake.events.some((event) => event.includes("load the unpacked bridge"))).toBe(false);
  });

  it.each([
    ["missing", null],
    ["non-numeric", "123abc"],
  ])("ignores a %s pid file while still removing it and starting fresh", async (_label, pidContents) => {
    const fake = fakeDeps(pidContents, [true]);

    await resetDemo(fake.deps);

    expect(fake.killed).toEqual([]);
    expect(fake.removed).toEqual([join(fake.repoRoot, ".demo-pid"), join(fake.repoRoot, ".demo-ready")]);
    expect(fake.spawnCalls.map((call) => call.command)).toEqual([
      "node",
      fake.deps.chrome,
    ]);
  });

  it("does not kill a process whose command line does not match the recorded demo run", async () => {
    const record = JSON.stringify({ pid: 31415, runId: PREVIOUS_RUN_ID, repoRoot: "C:\\blip-demo" });
    const fake = fakeDeps(record, [true], null, { oldCommandLine: "node unrelated-server.js" });

    await resetDemo(fake.deps);

    expect(fake.killed).toEqual([]);
    expect(fake.spawnCalls[0]?.command).toBe("node");
  });

  it("does not accept an unrelated service on port 7777 without this run's readiness record", async () => {
    const fake = fakeDeps(null, [true], null, {
      readyContents: JSON.stringify({ pid: 7777, runId: "unrelated-run-token-123456", repoRoot: "C:\\blip-demo" }),
    });
    vi.useFakeTimers();
    try {
      const pending = resetDemo(fake.deps);
      const rejection = expect(pending).rejects.toThrow(/server .*ready.*20 seconds/i);
      await vi.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(fake.readyUrls).toEqual([]);
      expect(fake.spawnCalls.map((call) => call.command)).toEqual(["node"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a runner that exits before writing its readiness record", async () => {
    const fake = fakeDeps(null, [true], null, { exitReason: "code 2, signal null" });

    await expect(resetDemo(fake.deps)).rejects.toThrow(/exited before becoming ready: code 2/);
    expect(fake.readyUrls).toEqual([]);
  });

  it("fails clearly when the restarted server never becomes ready", async () => {
    const fake = fakeDeps(null, [false]);
    vi.useFakeTimers();
    try {
      const pending = resetDemo(fake.deps);
      const rejection = expect(pending).rejects.toThrow(/server .*ready.*20 seconds/i);
      await vi.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(fake.spawnCalls.map((call) => call.command)).toEqual(["node"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a fictional profile with only supported autocomplete keys", () => {
    const templatePath = new URL("../../../fixtures/demo/profile.template.json", import.meta.url);
    const profile = JSON.parse(readFileSync(templatePath, "utf8")) as Record<string, unknown>;

    expect(Object.keys(profile).every((key) => ["name", "email", "tel", "given-name", "family-name"].includes(key))).toBe(true);
    expect(profile.email).toEqual(expect.stringMatching(/^[^@]+@example\.com$/));
    expect(profile.tel).toEqual(expect.stringMatching(/555/));
  });
});
