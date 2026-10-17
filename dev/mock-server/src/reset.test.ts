import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

type ResetFs = {
  copyFile(source: string, destination: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rm(path: string, options: { force: boolean }): Promise<void>;
};

type SpawnOptions = Record<string, unknown>;
type ResetDeps = {
  fs: ResetFs;
  spawn(command: string, args: string[], options: SpawnOptions): { unref(): void };
  kill(pid: number): void;
  fetchReady(url: string): Promise<boolean>;
  chrome: string;
  repoRoot: string;
  log(line: string): void;
};

type ResetModule = {
  resetDemo?: (deps: ResetDeps) => Promise<void>;
};

const resetPath = fileURLToPath(new URL("./reset.ts", import.meta.url));
const loadReset = new Function("url", "return import(url)") as (url: string) => Promise<ResetModule>;
const resetModule = await loadReset(pathToFileURL(resetPath).href).catch(() => ({}));

function requireResetDemo(): (deps: ResetDeps) => Promise<void> {
  expect(resetModule.resetDemo, "reset.ts must export resetDemo").toBeTypeOf("function");
  if (typeof resetModule.resetDemo !== "function") throw new Error("resetDemo export missing");
  return resetModule.resetDemo;
}

function fakeDeps(pidContents: string | null, readiness: boolean[] = [true]) {
  const repoRoot = "C:\\blip-demo";
  const events: string[] = [];
  const spawnCalls: Array<{ command: string; args: unknown; options: SpawnOptions }> = [];
  const copied: Array<{ source: string; destination: string }> = [];
  const removed: string[] = [];
  const killed: number[] = [];
  const readyUrls: string[] = [];
  let readCount = 0;

  const fs: ResetFs = {
    async copyFile(source, destination) {
      events.push("copy-profile");
      copied.push({ source, destination });
    },
    async readFile(path) {
      events.push("read-pid");
      if (pidContents === null) {
        throw Object.assign(new Error("missing pid file"), { code: "ENOENT" });
      }
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
      return { unref: () => events.push("unref") };
    },
    kill(pid) {
      events.push("kill-pid");
      killed.push(pid);
      throw new Error("process already stopped");
    },
    async fetchReady(url) {
      events.push("poll-ready");
      readyUrls.push(url);
      const result = readiness[Math.min(readCount, readiness.length - 1)] ?? false;
      readCount++;
      return result;
    },
    chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    repoRoot,
    log: (line) => events.push(`log:${line}`),
  };

  return { deps, events, spawnCalls, copied, removed, killed, readyUrls, repoRoot };
}

describe("demo reset", () => {
  it("restores the profile, replaces the previous stack, waits for readiness, then opens Chrome safely", async () => {
    const resetDemo = requireResetDemo();
    const fake = fakeDeps("31415", [false, true]);

    await resetDemo(fake.deps);

    const profilePath = join(fake.repoRoot, "fixtures", "demo", "profile.json");
    const pidPath = join(fake.repoRoot, ".demo-pid");
    expect(fake.copied).toEqual([{
      source: join(fake.repoRoot, "fixtures", "demo", "profile.template.json"),
      destination: profilePath,
    }]);
    expect(fake.killed).toEqual([31415]);
    expect(fake.removed).toEqual([pidPath]);
    expect(fake.events.indexOf("copy-profile")).toBeLessThan(fake.events.indexOf("read-pid"));
    expect(fake.events.indexOf("kill-pid")).toBeLessThan(fake.events.indexOf("remove-pid"));
    expect(fake.events.indexOf("remove-pid")).toBeLessThan(fake.events.indexOf("spawn-runner"));
    expect(fake.events.indexOf("spawn-runner")).toBeLessThan(fake.events.indexOf("poll-ready"));
    expect(fake.events.lastIndexOf("poll-ready")).toBeLessThan(fake.events.indexOf("spawn-chrome"));
    expect(fake.readyUrls).toEqual(["http://127.0.0.1:7777/", "http://127.0.0.1:7777/"]);

    const runner = fake.spawnCalls[0]!;
    expect(runner.command).toBe("node");
    expect(Array.isArray(runner.args)).toBe(true);
    expect(runner.args).toEqual(["--import", "tsx", "dev/mock-server/src/run-real.ts"]);
    expect(runner.options).toMatchObject({ cwd: fake.repoRoot, detached: true, stdio: "ignore" });
    expect(runner.options.shell).toBeUndefined();

    const chrome = fake.spawnCalls[1]!;
    expect(chrome.command).toBe(fake.deps.chrome);
    expect(Array.isArray(chrome.args)).toBe(true);
    expect(chrome.args).toEqual([
      `--user-data-dir=${join(fake.repoRoot, ".chrome-profile")}`,
      "http://127.0.0.1:7777/fixtures/forms/broken.html",
    ]);
    expect(chrome.options).toMatchObject({ cwd: fake.repoRoot, detached: true, stdio: "ignore" });
    expect(chrome.options.shell).toBeUndefined();
    expect(fake.events.filter((event) => event === "unref")).toHaveLength(2);
  });

  it.each([
    ["missing", null],
    ["non-numeric", "123abc"],
  ])("ignores a %s pid file while still removing it and starting fresh", async (_label, pidContents) => {
    const resetDemo = requireResetDemo();
    const fake = fakeDeps(pidContents, [true]);

    await resetDemo(fake.deps);

    expect(fake.killed).toEqual([]);
    expect(fake.removed).toEqual([join(fake.repoRoot, ".demo-pid")]);
    expect(fake.spawnCalls.map((call) => call.command)).toEqual([
      "node",
      fake.deps.chrome,
    ]);
  });

  it("fails clearly when the restarted server never becomes ready", async () => {
    const resetDemo = requireResetDemo();
    const fake = fakeDeps(null, [false]);
    vi.useFakeTimers();
    try {
      const pending = resetDemo(fake.deps);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).rejects.toThrow(/server .*ready.*20 seconds/i);
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
