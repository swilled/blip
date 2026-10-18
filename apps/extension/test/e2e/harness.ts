import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtension } from "../../build.js";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { buildFrame, EXTENSION_ID, extensionOrigin, newId, parseFrame, type ActRequest, type FormModel, type Message, type Snapshot as SnapshotData, type StatePayload } from "@blip/protocol";
import { WebSocket as VoiceWebSocket } from "ws";
import type { RunningServer, StartServerOptions } from "../../../server/src/server.js";
import { startTestPages, type TestPageReport, type TestPagesServer } from "../../../../tools/test-pages/serve.js";
import { setLogSink } from "../../../server/src/log.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const profileRoot = path.join(repoRoot, ".chrome-profile");
const distDir = path.join(repoRoot, "apps", "extension", "dist");
const voicePublic = path.join(repoRoot, "apps", "voice", "public");

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ModelObservation = {
  url: string;
  title: string;
  snapshotVersion: number;
  structuralHash: string;
  step?: string;
  fieldLabels: string[];
  repairStatus: FormModel["repairStatus"];
  modelLabelCount: number;
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
    snapshotVersion: model.snapshotVersion,
    structuralHash: model.structuralHash,
    ...(model.step !== undefined ? { step: model.step } : {}),
    fieldLabels: model.fields.map((field) => field.label),
    repairStatus: model.repairStatus,
    modelLabelCount: model.fields.filter((field) => field.labelSource === "model").length,
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

async function stopOwnedBrowser(child: ChildProcess, profileDir?: string): Promise<void> {
  if (profileDir !== undefined) {
    // Ask only the browser using this harness-owned profile to close through its private debugger.
    // This also shuts down Chromium's subprocess tree and releases profile databases cleanly.
    try {
      const port = await debuggerPort(profileDir);
      const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json()) as {
        webSocketDebuggerUrl?: string;
      };
      if (typeof version.webSocketDebuggerUrl === "string") {
        const browserDebugger = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("timed out opening the owned browser debugger")), 2_000);
          browserDebugger.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
          browserDebugger.addEventListener("error", () => { clearTimeout(timer); reject(new Error("owned browser debugger connection failed")); }, { once: true });
        });
        browserDebugger.send(JSON.stringify({ id: 1, method: "Browser.close" }));
        await delay(100);
        browserDebugger.close();
      }
    } catch {
      // Fall back to the exact child this harness spawned below.
    }
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // This is the one child process this harness spawned. Never discover or terminate other browser PIDs.
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

export interface BrowserFixtureSession {
  pages: TestPagesServer;
  browser: string;
  extensionConnected(): boolean;
  voiceUiUrl(): string | null;
  voiceUiConnected(): boolean;
  evaluateInVoiceUi(expression: string): Promise<unknown>;
  inboundVoiceUtteranceCount(): number;
  voiceClient: VoiceClient;
  actResults(): ActResultObservation[];
  serverLogs(): string[];
  lastSpoken(): string | null;
  sessionField(label: string): SessionFieldObservation | null;
  stateEvents(): StateObservation[];
  model(): ModelObservation | null;
  pageChangedCount(): number;
  /** Send the matching voice-role completion frame for a selected spoken message. */
  sendSpeakDone(speakId: string, interrupted?: boolean): void;
  waitForState(afterCount: number, predicate: (state: StateObservation) => boolean, timeoutMs?: number): Promise<StateObservation>;
  waitForReport(pagePath: string, type: string, timeoutMs?: number): Promise<TestPageReport>;
  requestSnapshot(): Promise<SnapshotData>;
  requestAct(snapshot: SnapshotData, action: ActRequest["action"], expectedKind: ActRequest["expectedKind"]): Promise<Extract<Message, { type: "act.result" }>["payload"]>;
  reports(pagePath: string): Promise<TestPageReport[]>;
  evaluateInPage(expression: string): Promise<unknown>;
  pressEnter(selector: string): Promise<void>;
  clickElement(selector: string): Promise<void>;
  close(): Promise<void>;
}

export type VoiceClient = {
  /** Send one real voice-role utterance and collect inbound frames through its idle state push. */
  sendUtterance(text: string, timeoutMs?: number): Promise<Message[]>;
  /** All inbound frames seen on the voice-role socket, including state, speak and error frames. */
  frames(): Message[];
};

export type OpenFixturePageOptions = {
  /** Start a clean native-browser baseline without the extension. Defaults to true. */
  withExtension?: boolean;
  /** Test-only fake-brain trigger; when paired with an id, only this exact phrase requests an action. */
  fakeRequestActionId?: string;
  fakeRequestActionPhrase?: string;
  /** Optional server brain used only by explicit local integration checks. */
  brain?: StartServerOptions["brain"];
  /** Narrow hooks for a bounded synthetic real-AGY CLI integration check. */
  agySessionHooks?: StartServerOptions["agySessionHooks"];
  /** Avoid dispatching a page repair turn during an intent-only live check. */
  disableRepairModel?: boolean;
  /** Browser executable for the harness-owned profile. */
  browserExecutable?: string;
  /** Withhold speech completion frames when testing the post-speech confirmation barrier. */
  autoCompleteSpeech?: boolean;
  /** Route voice utterances through the voice workstream reducer and the core grant-bound Executor. */
  dialogueRunner?: boolean;
  /** Open the first-party browser voice client alongside the fixture page. */
  voiceUi?: boolean;
  /** Fixed fixture port is reserved for checks that must prewarm the exact demo cache identity. */
  pagePort?: number;
  /** Dedicated repair cache path for an explicitly bounded local integration check. */
  repairCacheDirectory?: string;
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

async function debuggerPort(profileDir: string, timeoutMs = 10_000): Promise<number> {
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
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

type DebuggerResponse = {
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
};

async function sendDebuggerCommand(
  profileDir: string,
  targetPageUrl: string,
  method: string,
  params: Record<string, unknown>,
): Promise<DebuggerResponse> {
      const port = await debuggerPort(profileDir, 500);
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
    const result = await new Promise<DebuggerResponse>((resolve, reject) => {
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
      connection.send(JSON.stringify({ id, method, params }));
    });
    return result;
  } finally {
    connection.close();
  }
}

async function evaluateInTarget(profileDir: string, targetPageUrl: string, expression: string): Promise<unknown> {
  const result = await sendDebuggerCommand(profileDir, targetPageUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.error) throw new Error(result.error.message ?? "fixture page evaluation failed");
  if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text ?? "fixture page expression threw");
  return result.result?.result?.value;
}

async function pressEnterInTarget(profileDir: string, targetPageUrl: string, selector: string): Promise<void> {
  const selectorLiteral = JSON.stringify(selector);
  const focused = await evaluateInTarget(profileDir, targetPageUrl, `(() => {
    const target = document.querySelector(${selectorLiteral});
    if (!(target instanceof HTMLElement) || target.matches(':disabled')) return false;
    target.focus();
    return document.activeElement === target;
  })()`);
  if (focused !== true) throw new Error(`could not focus the Enter target ${selector}`);

  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchKeyEvent", {
    type: "char",
    text: "\r",
    unmodifiedText: "\r",
    ...key,
  });
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function clickElementInTarget(profileDir: string, targetPageUrl: string, selector: string): Promise<void> {
  const selectorLiteral = JSON.stringify(selector);
  const box = await evaluateInTarget(profileDir, targetPageUrl, `(() => {
    const target = document.querySelector(${selectorLiteral});
    if (!(target instanceof HTMLElement) || target.matches(':disabled')) return null;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!box || typeof box !== "object" || !("x" in box) || !("y" in box) ||
      typeof box.x !== "number" || typeof box.y !== "number") {
    throw new Error(`could not locate a visible pointer target ${selector}`);
  }

  const point = { x: box.x, y: box.y };
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed", ...point, button: "left", clickCount: 1,
  });
  await sendDebuggerCommand(profileDir, targetPageUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased", ...point, button: "left", clickCount: 1,
  });
}

/** Start a fixture page in a unique browser profile connected to an isolated production-mode server. */
export async function openFixturePage(
  pagePath: string,
  options: OpenFixturePageOptions = {},
): Promise<BrowserFixtureSession> {
  const withExtension = options.withExtension ?? true;
  const autoCompleteSpeech = options.autoCompleteSpeech ?? true;
  const serverModule = await import("../../../server/src/server.js");
  const running: RunningServer = await serverModule.startServer({
    port: 0,
    dev: false,
    staticRoots: [{ urlPrefix: "/voice", dir: voicePublic }],
    ...(options.brain !== undefined ? { brain: options.brain } : {}),
    ...(options.agySessionHooks !== undefined ? { agySessionHooks: options.agySessionHooks } : {}),
    ...(options.repairCacheDirectory !== undefined ? { repairCacheDirectory: options.repairCacheDirectory } : {}),
    ...(options.disableRepairModel === true
      ? {
          repairProvider: {
            repairFormModel: async () => ({ fields: [] }),
            abortRole: async () => {},
            recreateRole: async () => {},
          },
        }
      : {}),
    ...(options.fakeRequestActionId !== undefined ? { fakeRequestActionId: options.fakeRequestActionId } : {}),
    ...(options.fakeRequestActionPhrase !== undefined ? { fakeRequestActionPhrase: options.fakeRequestActionPhrase } : {}),
    ...(options.dialogueRunner === true ? { dialogueRunner: true } : {}),
  });
  const pages = await startTestPages({ port: options.pagePort ?? 0, build: false });
  const browser = options.browserExecutable ?? resolveBrowser();
  const profileDir = path.join(profileRoot, `act-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const voiceProfileDir = path.join(profileRoot, `voice-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
  let voiceChild: ChildProcess | undefined;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (voiceChild) await stopOwnedBrowser(voiceChild, voiceProfileDir);
      if (child) await stopOwnedBrowser(child, profileDir);
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
      await Promise.all([
        rm(profileDir, { recursive: true, force: true }),
        rm(voiceProfileDir, { recursive: true, force: true }),
      ]);
    }
  };

  try {
    await mkdir(profileRoot, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    voice = await connectVoiceStateStream(running, (payload) => {
      stateEvents.push({ receivedAt: Date.now(), payload, model: observeModel(running.session.model) });
    }, (message) => {
      voiceFrames.push(message);
      if (autoCompleteSpeech && message.type === "speak" && voice?.readyState === VoiceWebSocket.OPEN) {
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
    if (withExtension) await buildExtension({ socketUrl: running.url });
    const normalizedPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const fixtureUrl = `${pages.origins.primary}${normalizedPath}`;
    const voiceUiUrl = options.voiceUi === true ? `http://127.0.0.1:${running.port}/voice/` : null;
    const browserArgs = [
      "--headless=new",
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      ...(withExtension
        ? [
            `--disable-extensions-except=${distDir}`,
            `--load-extension=${distDir}`,
            "--disable-features=DisableLoadExtensionCommandLineSwitch",
          ]
        : ["--disable-extensions"]),
      fixtureUrl,
    ];
    child = spawn(browser, browserArgs, { stdio: "ignore", windowsHide: true });
    let spawnError: Error | undefined;
    child.on("error", (error) => { spawnError = error; });

    const deadline = Date.now() + 30_000;
    while (withExtension && !running.session.extensionConnected && Date.now() < deadline) {
      if (spawnError) throw new Error(`could not start browser ${browser}: ${spawnError.message}`);
      if (child.exitCode !== null) throw new Error(`browser exited before extension connected (code ${child.exitCode})`);
      await delay(100);
    }
    if (withExtension && !running.session.extensionConnected) throw new Error("timed out waiting for the extension connection");

    const pageDeadline = Date.now() + 15_000;
    let pageReady = false;
    while (!pageReady && Date.now() < pageDeadline) {
      try {
        const documentComplete = await evaluateInTarget(profileDir, fixtureUrl, "document.readyState") === "complete";
        const pageReportedReady = pages.reports.some((report) =>
          report.page === normalizedPath && report.type === "page-ready",
        );
        pageReady = documentComplete && (withExtension || pageReportedReady);
        if (!pageReady) await delay(50);
      } catch {
        await delay(50);
      }
    }
    if (!pageReady) throw new Error("fixture page did not finish loading in its isolated browser profile");
    if (voiceUiUrl !== null) {
      // Seed the voice window with the accepted page state before it connects. That keeps the
      // warning E2E focused on warning playback rather than racing the initial user utterance.
      const response = await running.hub.request("extension", "snapshot.request", { reason: "user" }, {
        expect: "snapshot.result",
        timeoutMs: 10_000,
      });
      if (response.type !== "snapshot.result" || !response.payload.ok ||
          !running.session.applySnapshot(response.payload.snapshot, { updateDialogue: false })) {
        throw new Error("voice UI fixture could not seed the accepted page state");
      }
      running.hub.pushState();
      await mkdir(voiceProfileDir, { recursive: true });
      const voiceBrowserArgs = [
        "--headless=new",
        `--user-data-dir=${voiceProfileDir}`,
        "--remote-debugging-port=0",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        voiceUiUrl,
      ];
      voiceChild = spawn(browser, voiceBrowserArgs, { stdio: "ignore", windowsHide: true });
      let voiceSpawnError: Error | undefined;
      voiceChild.on("error", (error) => { voiceSpawnError = error; });
      const voiceDeadline = Date.now() + 30_000;
      let voiceUiReady = false;
      while (!voiceUiReady && Date.now() < voiceDeadline) {
        if (voiceSpawnError) throw new Error(`could not start the isolated voice UI browser: ${voiceSpawnError.message}`);
        if (voiceChild.exitCode !== null) throw new Error(`voice UI browser exited before connecting (code ${voiceChild.exitCode})`);
        try {
          const complete = await evaluateInTarget(voiceProfileDir, voiceUiUrl, "document.readyState") === "complete";
          const connected = await evaluateInTarget(
            voiceProfileDir,
            voiceUiUrl,
            "document.querySelector('#connection')?.dataset.connected === 'true'",
          ) === true;
          voiceUiReady = complete && connected;
        } catch {
          await delay(50);
        }
        if (!voiceUiReady) await delay(50);
      }
      if (!voiceUiReady) throw new Error("first-party voice UI did not connect in its isolated browser profile");
    }

    return {
      pages,
      browser,
      extensionConnected: () => running.session.extensionConnected,
      voiceUiUrl: () => voiceUiUrl,
      voiceUiConnected: () => running.session.voiceConnected,
      evaluateInVoiceUi(expression) {
        if (voiceUiUrl === null) throw new Error("voice UI was not opened for this fixture");
        return evaluateInTarget(voiceProfileDir, voiceUiUrl, expression);
      },
      inboundVoiceUtteranceCount() {
        return serverLogLines.filter((line) => {
          try {
            const event = JSON.parse(line) as { msg?: unknown; role?: unknown; type?: unknown };
            return event.msg === "frame in" && event.role === "voice" && event.type === "utterance";
          } catch { return false; }
        }).length;
      },
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
      sendSpeakDone(speakId, interrupted = false) {
        if (voice?.readyState !== VoiceWebSocket.OPEN) throw new Error("voice-role socket is not open");
        voice.send(JSON.stringify(buildFrame("speak.done", { speakId, interrupted })));
      },
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
      pressEnter(selector) {
        return pressEnterInTarget(profileDir, fixtureUrl, selector);
      },
      clickElement(selector) {
        return clickElementInTarget(profileDir, fixtureUrl, selector);
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
      "--remote-debugging-port=0",
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
    if (child) await stopOwnedBrowser(child, profileDir);
    await running.close();
    setLogSink(previousLogSink);
    await rm(profileDir, { recursive: true, force: true });
  }
}
