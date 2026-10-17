// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { setLogSink } from "../../../server/src/log.js";
import { startServer, type RunningServer } from "../../../server/src/server.js";
import { startTestPages, type TestPagesServer } from "../../../../tools/test-pages/serve.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const profileRoot = path.join(repoRoot, ".chrome-profile");
const distDir = path.join(repoRoot, "apps", "extension", "dist");
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const enabled = process.env["BLIP_E2E_BROWSER"] === "1" && process.env["BLIP_E2E_LONG"] === "1";

function extensionBinds(lines: string[]): string[] {
  return lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as { msg?: string; role?: string };
      return entry.msg === "connection bound" && entry.role === "extension";
    } catch {
      return false;
    }
  });
}

function extensionCloses(lines: string[]): string[] {
  return lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as { msg?: string; role?: string };
      return entry.msg === "connection closed" && entry.role === "extension";
    } catch {
      return false;
    }
  });
}

async function waitForBind(lines: string[], after: number, running: RunningServer, child: ChildProcess, browser: string): Promise<void> {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`spawned browser exited (code ${child.exitCode})`);
    if (extensionBinds(lines.slice(after)).length > 0 && running.session.extensionConnected) return;
    await delay(100);
  }
  throw new Error(`timed out waiting for extension bind in ${browser}`);
}

async function stopOwnedBrowser(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // This is the exact child spawned by this test; never discover or terminate another browser PID.
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

describe("optional long MV3 idle and outage evidence", () => {
  it.skipIf(!enabled)("keeps one connection through 75 seconds idle and reconnects after a 40-second outage", async () => {
    const browser = resolveBrowser();
    const profileDir = path.join(profileRoot, `idle-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const logs: string[] = [];
    const previousLogSink = setLogSink((line) => logs.push(line));
    let pages: TestPagesServer | undefined;
    let child: ChildProcess | undefined;
    let first: RunningServer | undefined;
    let second: RunningServer | undefined;
    let firstClosed = false;

    try {
      first = await startServer({ port: 0, dev: false });
      pages = await startTestPages({ port: 0, build: false });
      await mkdir(profileRoot, { recursive: true });
      await mkdir(profileDir, { recursive: true });
      await buildExtension({ socketUrl: first.url });
      child = spawn(browser, [
        "--headless=new",
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        `${pages.origins.primary}/vanilla.html`,
      ], { stdio: "ignore", windowsHide: true });
      let spawnError: Error | undefined;
      child.on("error", (error) => { spawnError = error; });
      const firstBindOffset = logs.length;
      const startupDeadline = Date.now() + 35_000;
      while (Date.now() < startupDeadline && !first.session.extensionConnected) {
        if (spawnError) throw new Error(`could not start ${browser}: ${spawnError.message}`);
        if (child.exitCode !== null) throw new Error(`spawned browser exited (code ${child.exitCode})`);
        await delay(100);
      }
      expect(first.session.extensionConnected).toBe(true);
      await waitForBind(logs, firstBindOffset, first, child, browser);

      // Verify one connected extension stays bound throughout a multi-minute-style idle slice.
      for (let elapsed = 0; elapsed < 75_000; elapsed += 5_000) {
        await delay(5_000);
        expect(first.session.extensionConnected).toBe(true);
      }
      expect(extensionBinds(logs)).toHaveLength(1);
      expect(extensionCloses(logs)).toHaveLength(0);

      const restartOffset = logs.length;
      const port = first.port;
      await first.close();
      firstClosed = true;
      // Let the 30-second MV3 reconnect alarm fire while the service is unavailable.
      await delay(40_000);
      second = await startServer({ port, dev: false });
      expect(second.port).toBe(port);
      await waitForBind(logs, restartOffset, second, child, browser);
      expect(extensionBinds(logs)).toHaveLength(2);
      expect(second.session.extensionConnected).toBe(true);

      const pageReadyCount = pages.reports.filter((report) => report.page === "/vanilla.html" && report.type === "page-ready").length;
      expect(pageReadyCount).toBe(1);
    } finally {
      if (child) await stopOwnedBrowser(child);
      if (second) await second.close();
      if (first && !firstClosed) await first.close();
      if (pages) await pages.close();
      setLogSink(previousLogSink);
      await rm(profileDir, { recursive: true, force: true });
    }
  }, 210_000);
});
