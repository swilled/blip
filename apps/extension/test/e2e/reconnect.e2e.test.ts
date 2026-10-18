// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { EXTENSION_ID } from "@blip/protocol";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const distDir = path.join(repoRoot, "apps", "extension", "dist");
const profileRoot = path.join(repoRoot, ".chrome-profile");
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function stopOwnedBrowser(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

describe("extension server restart recovery", () => {
  const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

  it.skipIf(!enabled)("reconnects after a same-port server restart without page refresh", async () => {
    const serverUrl = new URL("../../../server/src/server.ts", import.meta.url);
    const logUrl = new URL("../../../server/src/log.ts", import.meta.url);
    const serverModule = await import(serverUrl.href);
    const logModule = await import(logUrl.href);
    const { startServer } = serverModule as { startServer: (options: { port: number; dev: false }) => Promise<any> };
    const { setLogSink } = logModule as {
      setLogSink: (sink?: (line: string) => void) => (line: string) => void;
    };
    const logs: string[] = [];
    const previousLogSink = setLogSink((line) => logs.push(line));
    const browser = resolveBrowser();
    const profileDir = path.join(profileRoot, `reconnect-${process.pid}-${Date.now()}`);
    let child: ChildProcess | undefined;
    const servers: Array<{ port: number; session: { extensionConnected: boolean }; close(): Promise<void> }> = [];
    const closedServers = new Set<object>();
    let spawnError: Error | undefined;

    const waitForBind = async (after: number, label: string): Promise<string> => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (spawnError) throw new Error(`could not start browser ${browser}: ${spawnError.message}`);
        if (child?.exitCode !== null && child?.exitCode !== undefined) {
          throw new Error(`browser exited before ${label} (code ${child.exitCode})`);
        }
        const line = logs.slice(after).find((entry) => {
          try {
            const parsed = JSON.parse(entry) as { msg?: string; role?: string };
            return parsed.msg === "connection bound" && parsed.role === "extension";
          } catch {
            return false;
          }
        });
        if (line) return line;
        await delay(100);
      }
      throw new Error(`timed out waiting for ${label}; logs: ${logs.join(" | ")}`);
    };

    try {
      const first = await startServer({ port: 0, dev: false });
      servers.push(first);
      if (first.config.extensionId !== EXTENSION_ID) throw new Error("server did not use the pinned extension id");
      await mkdir(profileRoot, { recursive: true });
      await mkdir(profileDir, { recursive: true });
      await buildExtension({ socketUrl: first.url });

      child = spawn(
        browser,
        [
          "--headless=new",
          `--user-data-dir=${profileDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          `--disable-extensions-except=${distDir}`,
          `--load-extension=${distDir}`,
          "--disable-features=DisableLoadExtensionCommandLineSwitch",
          `http://127.0.0.1:${first.port}/healthz`,
        ],
        { stdio: "ignore", windowsHide: true },
      );
      child.on("error", (error) => {
        spawnError = error;
      });

      const firstBind = await waitForBind(0, "initial extension connection");
      expect(first.session.extensionConnected).toBe(true);

      const restartLogStart = logs.length;
      await first.close();
      closedServers.add(first);
      const second = await startServer({ port: first.port, dev: false });
      servers.push(second);
      expect(second.port).toBe(first.port);

      const restartedBind = await waitForBind(restartLogStart, "extension reconnection after server restart");
      expect(second.session.extensionConnected).toBe(true);
      expect(firstBind).toContain('"role":"extension"');
      expect(restartedBind).toContain('"role":"extension"');
    } finally {
      try {
        if (child) await stopOwnedBrowser(child);
        for (const server of servers.reverse()) {
          if (!closedServers.has(server)) await server.close();
        }
        await rm(profileDir, { recursive: true, force: true });
      } finally {
        setLogSink(previousLogSink);
      }
    }
  }, 75_000);
});
