import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { EXTENSION_ID, extensionOrigin, type ActRequest, type Message, type Snapshot as SnapshotData } from "@blip/protocol";
import type { RunningServer } from "../../../server/src/server.js";
import { startTestPages, type TestPageReport, type TestPagesServer } from "../../../../tools/test-pages/serve.js";

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

export interface BrowserFixtureSession {
  pages: TestPagesServer;
  requestSnapshot(): Promise<SnapshotData>;
  requestAct(snapshot: SnapshotData, action: ActRequest["action"], expectedKind: ActRequest["expectedKind"]): Promise<Extract<Message, { type: "act.result" }>["payload"]>;
  reports(pagePath: string): Promise<TestPageReport[]>;
  evaluateInPage(expression: string): Promise<unknown>;
  close(): Promise<void>;
}

type DebuggerTarget = { type: string; url: string; webSocketDebuggerUrl: string };

async function debuggerPort(profileDir: string): Promise<number> {
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const [portText] = (await readFile(activePortFile, "utf8")).split(/\r?\n/);
      const port = Number(portText);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch {
      await delay(50);
    }
  }
  throw new Error("browser did not expose its isolated fixture debugger endpoint");
}

async function evaluateInTarget(profileDir: string, targetPageUrl: string, expression: string): Promise<unknown> {
  const port = await debuggerPort(profileDir);
  const deadline = Date.now() + 10_000;
  let debuggerTarget: DebuggerTarget | undefined;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) throw new Error(`browser debugger returned HTTP ${response.status}`);
    const targets = await response.json() as DebuggerTarget[];
    debuggerTarget = targets.find((candidate) => candidate.type === "page" && candidate.url === targetPageUrl);
    if (debuggerTarget) break;
    await delay(50);
  }
  if (!debuggerTarget) throw new Error("fixture page was not available to the isolated browser debugger");

  const connection = new WebSocket(debuggerTarget.webSocketDebuggerUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out opening the fixture debugger")), 5_000);
      connection.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      connection.addEventListener("error", () => { clearTimeout(timer); reject(new Error("fixture debugger connection failed")); }, { once: true });
    });
    const result = await new Promise<{ result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } }; error?: { message?: string } }>((resolve, reject) => {
      const id = 1;
      const timer = setTimeout(() => reject(new Error("timed out evaluating the fixture page")), 5_000);
      const onMessage = (event: MessageEvent) => {
        let message: { id?: number; result?: unknown; error?: { message?: string } };
        try { message = JSON.parse(String(event.data)) as typeof message; } catch { return; }
        if (message.id !== id) return;
        clearTimeout(timer);
        connection.removeEventListener("message", onMessage);
        resolve(message as typeof result);
      };
      connection.addEventListener("message", onMessage);
      connection.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (result.error) throw new Error(result.error.message ?? "fixture page evaluation failed");
    if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text ?? "fixture page expression threw");
    return result.result?.result?.value;
  } finally {
    connection.close();
  }
}

/** Start a fixture page in a unique browser profile connected to an isolated production-mode server. */
export async function openFixturePage(pagePath: string): Promise<BrowserFixtureSession> {
  const serverModule = await import("../../../server/src/server.js");
  const running: RunningServer = await serverModule.startServer({ port: 0, dev: false });
  const pages = await startTestPages({ port: 0, build: false });
  const browser = resolveBrowser();
  const profileDir = path.join(profileRoot, `act-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let child: ChildProcess | undefined;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (child) await stopOwnedBrowser(child);
      await pages.close();
      await running.close();
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  };

  try {
    await mkdir(profileRoot, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await buildExtension({ socketUrl: running.url });
    const normalizedPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const fixtureUrl = `${pages.origins.primary}${normalizedPath}`;
    child = spawn(browser, [
      "--headless=new",
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      fixtureUrl,
    ], { stdio: "ignore", windowsHide: true });
    let spawnError: Error | undefined;
    child.on("error", (error) => { spawnError = error; });

    const deadline = Date.now() + 30_000;
    while (!running.session.extensionConnected && Date.now() < deadline) {
      if (spawnError) throw new Error(`could not start browser ${browser}: ${spawnError.message}`);
      if (child.exitCode !== null) throw new Error(`browser exited before extension connected (code ${child.exitCode})`);
      await delay(100);
    }
    if (!running.session.extensionConnected) throw new Error("timed out waiting for the extension connection");

    return {
      pages,
      async requestSnapshot() {
        const response = await running.hub.request("extension", "snapshot.request", { reason: "user" }, {
          expect: "snapshot.result",
          timeoutMs: 10_000,
        });
        if (response.type !== "snapshot.result" || !response.payload.ok) {
          throw new Error("fixture snapshot was not available");
        }
        return response.payload.snapshot;
      },
      async requestAct(snapshot, action, expectedKind) {
        const response = await running.hub.request("extension", "act.request", {
          actId: `act-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          tabId: snapshot.tabId,
          snapshotVersion: snapshot.version,
          action,
          expectedKind,
        }, { expect: "act.result", timeoutMs: 15_000 });
        return response.payload;
      },
      async reports(path) {
        const url = `${pages.origins.primary}/__reports?page=${encodeURIComponent(path)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`fixture reports returned HTTP ${response.status}`);
        return await response.json() as TestPageReport[];
      },
      evaluateInPage(expression) {
        return evaluateInTarget(profileDir, fixtureUrl, expression);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
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
