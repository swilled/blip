import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { buildFrame, EXTENSION_ID, extensionOrigin, newId, parseFrame, type ActRequest, type FormModel, type Message, type Snapshot as SnapshotData, type StatePayload } from "@blip/protocol";
import { WebSocket as VoiceWebSocket } from "ws";
import type { RunningServer } from "../../../server/src/server.js";
import { startTestPages, type TestPageReport, type TestPagesServer } from "../../../../tools/test-pages/serve.js";
import { setLogSink } from "../../../server/src/log.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const profileRoot = path.join(repoRoot, ".chrome-profile");
const distDir = path.join(repoRoot, "apps", "extension", "dist");

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ModelObservation = {
  url: string;
  title: string;
  step?: string;
  fieldLabels: string[];
  pageErrors: string[];
};

export type StateObservation = {
  receivedAt: number;
  payload: StatePayload;
  model: ModelObservation | null;
};

function observeModel(model: FormModel | null): ModelObservation | null {
  if (!model) return null;
  return {
    url: model.url,
    title: model.title,
    ...(model.step !== undefined ? { step: model.step } : {}),
    fieldLabels: model.fields.map((field) => field.label),
    pageErrors: [...model.pageErrors],
  };
}

async function connectVoiceStateStream(
  running: RunningServer,
  onState: (payload: StatePayload) => void,
  onFrame: (message: Message) => void,
): Promise<VoiceWebSocket> {
  const voice = new VoiceWebSocket(running.url, { origin: `http://127.0.0.1:${running.port}` });
  const hello = buildFrame("hello", { role: "voice", clientVersion: "test", protocolVersion: 1 });
  return await new Promise<VoiceWebSocket>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timed out connecting the fixture state stream")), 5_000);
    voice.once("error", (error) => { clearTimeout(timeout); reject(error); });
    voice.on("message", (data) => {
      const parsed = parseFrame(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      if (!parsed.ok) return;
      onFrame(parsed.message);
      if (parsed.message.type === "welcome" && parsed.message.replyTo === hello.id) {
        clearTimeout(timeout);
        resolve(voice);
      } else if (parsed.message.type === "state") {
        onState(parsed.message.payload);
      }
    });
    voice.once("open", () => voice.send(JSON.stringify(hello)));
  });
}

async function stopOwnedBrowser(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // This is the one child process this harness spawned. Never discover or terminate other browser PIDs.
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

export interface BrowserFixtureSession {
  pages: TestPagesServer;
  voiceClient: VoiceClient;
  actResults(): ActResultObservation[];
  serverLogs(): string[];
  lastSpoken(): string | null;
  sessionField(label: string): SessionFieldObservation | null;
  stateEvents(): StateObservation[];
  model(): ModelObservation | null;
  pageChangedCount(): number;
  waitForState(afterCount: number, predicate: (state: StateObservation) => boolean, timeoutMs?: number): Promise<StateObservation>;
  waitForReport(pagePath: string, type: string, timeoutMs?: number): Promise<TestPageReport>;
  requestSnapshot(): Promise<SnapshotData>;
  requestAct(snapshot: SnapshotData, action: ActRequest["action"], expectedKind: ActRequest["expectedKind"]): Promise<Extract<Message, { type: "act.result" }>["payload"]>;
  reports(pagePath: string): Promise<TestPageReport[]>;
  evaluateInPage(expression: string): Promise<unknown>;
  close(): Promise<void>;
}

export type VoiceClient = {
  /** Send one real voice-role utterance and collect inbound frames through its idle state push. */
  sendUtterance(text: string, timeoutMs?: number): Promise<Message[]>;
  /** All inbound frames seen on the voice-role socket, including state, speak and error frames. */
  frames(): Message[];
};

type VoiceClientRig = { socket: VoiceWebSocket; frames: Message[] };
type ActResultObservation = Extract<Message, { type: "act.result" }>['payload'];
type SessionFieldObservation = { label: string; sensitive: string; value: string | null; hasValue: boolean };

/** A voice-role client with the same speak completion behavior as the REPL and voice UI. */
export function voiceClient(rig: VoiceClientRig): VoiceClient {
  return {
    frames: () => rig.frames.slice(),
    async sendUtterance(text, timeoutMs = 20_000) {
      const start = rig.frames.length;
      const utteranceId = newId();
      rig.socket.send(JSON.stringify(buildFrame("utterance", { utteranceId, text, source: "typed" })));
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const received = rig.frames.slice(start);
        const transcriptIndex = received.findIndex((message) =>
          message.type === "transcript" && message.payload.utteranceId === utteranceId,
        );
        if (transcriptIndex >= 0 && received.slice(transcriptIndex + 1).some((message) =>
          message.type === "state" && message.payload.busy === false,
        )) return received;
        await delay(10);
      }
      throw new Error("timed out waiting for the voice turn to return to idle");
    },
  };
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
  const stateEvents: StateObservation[] = [];
  const voiceFrames: Message[] = [];
  const actResultRecords: ActResultObservation[] = [];
  const serverLogLines: string[] = [];
  let pageChangedCount = 0;
  const previousLogSink = setLogSink((line) => {
    serverLogLines.push(line);
    try {
      const entry = JSON.parse(line) as { msg?: unknown; type?: unknown };
      if (entry.msg === "frame in" && entry.type === "page.changed") pageChangedCount += 1;
    } catch {
      // Test instrumentation intentionally retains only a count, never a log line or page payload.
    }
  });
  let voice: VoiceWebSocket | undefined;
  let child: ChildProcess | undefined;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (child) await stopOwnedBrowser(child);
      if (voice) {
        await new Promise<void>((resolve) => {
          if (voice?.readyState === VoiceWebSocket.CLOSED) return resolve();
          const timer = setTimeout(() => { voice?.terminate(); resolve(); }, 1_000);
          voice?.once("close", () => { clearTimeout(timer); resolve(); });
          voice?.close();
        });
      }
      await pages.close();
      await running.close();
    } finally {
      setLogSink(previousLogSink);
      await rm(profileDir, { recursive: true, force: true });
    }
  };

  try {
    await mkdir(profileRoot, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    voice = await connectVoiceStateStream(running, (payload) => {
      stateEvents.push({ receivedAt: Date.now(), payload, model: observeModel(running.session.model) });
    }, (message) => {
      voiceFrames.push(message);
      if (message.type === "speak" && voice?.readyState === VoiceWebSocket.OPEN) {
        voice.send(JSON.stringify(buildFrame("speak.done", { speakId: message.payload.speakId, interrupted: false })));
      }
    });
    const originalRequest = running.hub.request.bind(running.hub) as (...args: any[]) => Promise<Message>;
    (running.hub as unknown as { request: (...args: any[]) => Promise<Message> }).request = async (...args: any[]) => {
      const result = await originalRequest(...args);
      if (args[1] === "act.request" && result.type === "act.result") actResultRecords.push(result.payload);
      return result;
    };
    const client = voiceClient({ socket: voice, frames: voiceFrames });
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
      voiceClient: client,
      actResults: () => actResultRecords.map((result) => ({ ...result })),
      serverLogs: () => serverLogLines.slice(),
      lastSpoken: () => running.session.lastSpoken,
      sessionField(label) {
        const field = running.session.model?.fields.find((candidate) => candidate.label === label);
        return field === undefined ? null : {
          label: field.label,
          sensitive: field.sensitive,
          value: field.value,
          hasValue: field.hasValue,
        };
      },
      stateEvents: () => stateEvents.slice(),
      model: () => observeModel(running.session.model),
      pageChangedCount: () => pageChangedCount,
      async waitForState(afterCount, predicate, timeoutMs = 15_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const match = stateEvents.slice(afterCount).find(predicate);
          if (match) return match;
          await delay(20);
        }
        throw new Error("timed out waiting for the expected server state update");
      },
      async waitForReport(pagePath, type, timeoutMs = 15_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const url = `${pages.origins.primary}/__reports?page=${encodeURIComponent(pagePath)}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`fixture reports returned HTTP ${response.status}`);
          const records = await response.json() as TestPageReport[];
          const match = records.find((report) => report.type === type);
          if (match) return match;
          await delay(25);
        }
        throw new Error(`timed out waiting for the ${type} fixture report`);
      },
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
