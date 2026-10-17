import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { EXTENSION_ID, extensionOrigin } from "@blip/protocol";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const profileRoot = path.join(repoRoot, ".chrome-profile");
const distDir = path.join(repoRoot, "apps", "extension", "dist");

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function stopOwnedBrowser(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // This is the one child process this harness spawned. Never discover or terminate other browser PIDs.
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

/** Start production mode and an isolated headless browser profile, then await the real MV3 worker bind. */
export async function runConnectionSmoke(): Promise<{ browser: string; extensionOrigin: string; log: string }> {
  const serverModule = await import(new URL("../../../server/src/server.ts", import.meta.url).href);
  const logModule = await import(new URL("../../../server/src/log.ts", import.meta.url).href);
  const { startServer } = serverModule as { startServer: (options: { port: number; dev: false }) => Promise<any> };
  const { setLogSink } = logModule as { setLogSink: (sink?: (line: string) => void) => (line: string) => void };
  const running = await startServer({ port: 0, dev: false });
  const logs: string[] = [];
  const previousLogSink = setLogSink((line) => logs.push(line));
  const browser = resolveBrowser();
  const profileDir = path.join(profileRoot, `smoke-${process.pid}-${Date.now()}`);
  let child: ChildProcess | undefined;
  let spawnError: Error | undefined;

  try {
    if (running.config.dev !== false || running.config.extensionId !== EXTENSION_ID) {
      throw new Error("smoke server must use the pinned extension id in production mode");
    }
    await mkdir(profileRoot, { recursive: true });
    await buildExtension({ socketUrl: running.url });
    const pageUrl = `http://127.0.0.1:${running.port}/healthz`;
    const args = [
      "--headless=new",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      pageUrl,
    ];
    child = spawn(browser, args, { stdio: "ignore", windowsHide: true });
    child.on("error", (error) => {
      spawnError = error;
    });

    const deadline = Date.now() + 30_000;
    let boundLine: string | undefined;
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`could not start browser ${browser}: ${spawnError.message}`);
      if (child.exitCode !== null) throw new Error(`browser exited before extension bound (code ${child.exitCode})`);
      boundLine = logs.find((line) => {
        try {
          const entry = JSON.parse(line) as { msg?: string; role?: string };
          return entry.msg === "connection bound" && entry.role === "extension";
        } catch {
          return false;
        }
      });
      if (boundLine) break;
      await delay(100);
    }
    if (!boundLine) throw new Error(`timed out waiting for connection bound role=extension; logs: ${logs.join(" | ")}`);
    if (!running.session.extensionConnected) throw new Error("server log bound but extension session is not connected");

    const expectedOrigin = extensionOrigin(EXTENSION_ID);
    return { browser, extensionOrigin: expectedOrigin, log: boundLine };
  } finally {
    if (child) await stopOwnedBrowser(child);
    await running.close();
    setLogSink(previousLogSink);
    await rm(profileDir, { recursive: true, force: true });
  }
}
