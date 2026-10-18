import { describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import type { BrowserContentItem, BrowserPageIdentity, Snapshot } from "@blip/protocol";
import { startServer } from "../src/server";
import type { AgyRoleConfig, AgyRoleSession, AgyCliAdapter } from "../src/brain/agy/session";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, sleep, type Frame, type TestClient } from "./helpers";

async function waitForFrame(client: TestClient, predicate: (frame: Frame) => boolean, timeoutMs = 3_000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await client.nextMessage(Math.max(1, deadline - Date.now()));
    if (predicate(frame)) return frame;
  }
  throw new Error("timed out waiting for expected voice frame");
}

const TASK_PAGE_URL = "http://127.0.0.1:8787/browser-task.html";
const TASK_ITEM_TEXT = "The community workshop moved to the north room. Please reply with your preferred arrival time.";

function taskSnapshot(): Snapshot {
  const snapshot = loadSnapshot("booking");
  snapshot.url = TASK_PAGE_URL;
  snapshot.origin = new URL(TASK_PAGE_URL).origin;
  snapshot.title = "Community notice board";
  snapshot.capturedAt = 100_000;
  snapshot.version = 1;
  const recipient = snapshot.elements.find((element) => element.id === "e2")!;
  recipient.inputType = "text";
  recipient.labelCandidates = [{ text: "Recipient", source: "label", confidence: 1 }];
  recipient.value = "Synthetic Contact";
  recipient.hasValue = true;
  const reply = snapshot.elements.find((element) => element.id === "e8")!;
  reply.labelCandidates = [{ text: "Reply message", source: "label", confidence: 1 }];
  reply.inputType = "textarea";
  reply.tag = "textarea";
  reply.role = "textbox";
  reply.value = null;
  reply.hasValue = false;
  snapshot.elements.push({
    id: "synthetic-send",
    frameId: 0,
    category: "action",
    tag: "button",
    inputType: "submit",
    role: "button",
    labelCandidates: [{ text: "Send message", source: "label", confidence: 1 }],
    required: false,
    requiredSource: "none",
    invalid: false,
    errorText: null,
    value: null,
    hasValue: false,
    sensitive: "none",
    disabled: false,
    visible: true,
    order: 20,
    text: "Send message",
    buttonType: "submit",
    inForm: true,
    kind: "send",
    kindReasons: ["local synthetic page"],
  });
  return snapshot;
}

function setSnapshotField(snapshot: Snapshot, id: string, value: string): void {
  const field = snapshot.elements.find((element) => element.id === id);
  if (field === undefined) throw new Error(`Missing synthetic field ${id}`);
  field.value = value;
  field.hasValue = value !== "";
}

type ScheduledTask = { callback: () => void; delayMs: number };

/** Real loopback clients with a local-only snapshot/browser/act responder and no AGY process. */
async function startConfiguredTaskDemo(options: { delayFirstItemCapture?: boolean } = {}) {
  let now = 100_000;
  let snapshot = taskSnapshot();
  let captureRevision = 1;
  let captureId = "synthetic-capture-1";
  let recipientValue = "Synthetic Contact";
  let draftValue = "";
  let successfulPageResult = true;
  let sendDispatches = 0;
  let draftNumber = 0;
  let itemCaptureCount = 0;
  const scheduled: ScheduledTask[] = [];
  const identity = (): BrowserPageIdentity => ({
    captureId,
    captureRevision,
    tabId: snapshot.tabId,
    pageUrl: snapshot.url,
  });
  const items = (): BrowserContentItem[] => [{
    itemId: "notice-current",
    text: TASK_ITEM_TEXT,
    visibleDate: "2026-10-18T12:00:00Z",
    identity: identity(),
    frameId: 0,
  }];
  const adapter: AgyCliAdapter = {
    createSession(config: AgyRoleConfig): AgyRoleSession {
      let bootstrapped = false;
      return {
        async start() { return { agent: config.agent, permissionMode: "request-review", tools: [] }; },
        async call(prompt = "") {
          if (!bootstrapped) {
            bootstrapped = true;
            return config.role === "intent" ? '{"type":"describe"}' : config.role === "content" ? '{"prose":"Ready."}' : '{"fields":[]}';
          }
          if (config.role === "content") {
            if (prompt.includes('"type":"summary"')) {
              return JSON.stringify({ prose: "The message asks you to confirm your preferred arrival time." });
            }
            draftNumber += 1;
            return JSON.stringify({ prose: draftNumber % 2 === 1
              ? "I can arrive before the workshop begins."
              : "I can arrive at the updated time." });
          }
          return config.role === "intent" ? '{"type":"unknown"}' : '{"fields":[]}';
        },
        abort() {},
        async close() {},
      };
    },
  };
  const server = await startServer({
    port: 0,
    brain: "agy",
    agyAdapter: adapter,
    repairProvider: {
      async repairFormModel() { return { fields: [] }; },
      async abortRole() {},
      async recreateRole() {},
    },
    dialogueRunner: true,
    fakeDelayMs: 0,
    snapshotTimeoutMs: 1_000,
    clock: () => now,
    schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
  });
  const extension = await bindClient(server.port, "extension");
  let accepting = true;
  const responder = (async () => {
    while (accepting) {
      let frame: Frame;
      try { frame = await extension.nextMessage(30_000); } catch { return; }
      if (frame.type === "snapshot.request") {
        snapshot = structuredClone(snapshot);
        snapshot.capturedAt += 1;
        setSnapshotField(snapshot, "e2", recipientValue);
        setSnapshotField(snapshot, "e8", draftValue);
        if (frame.payload.reason === "post-act" && successfulPageResult) {
          snapshot.alerts = [...snapshot.alerts, "Message successfully sent."];
        }
        extension.send("snapshot.result", { ok: true, snapshot }, { replyTo: frame.id });
      } else if (frame.type === "browser.request") {
        const request = frame.payload;
        if (request.operation.op === "tabs" && request.operation.action === "open-blank") {
          snapshot.tabId += 1;
          captureId = `synthetic-capture-tab-${snapshot.tabId}`;
          captureRevision += 1;
          extension.send("browser.result", {
            ok: true,
            requestId: request.requestId,
            operation: "tabs",
            result: { activeTabId: snapshot.tabId, tabs: [], truncated: false },
          }, { replyTo: frame.id });
        } else if (request.operation.op === "navigate") {
          snapshot.url = TASK_PAGE_URL;
          snapshot.origin = new URL(TASK_PAGE_URL).origin;
          captureId = `synthetic-capture-gmail-${snapshot.tabId}`;
          captureRevision += 1;
          extension.send("browser.result", {
            ok: true,
            requestId: request.requestId,
            operation: "navigate",
            result: { tabId: snapshot.tabId, status: "dispatched" },
          }, { replyTo: frame.id });
        } else if (request.operation.op === "capture") {
          itemCaptureCount += 1;
          extension.send("browser.result", {
            ok: true,
            requestId: request.requestId,
            operation: "capture",
            result: {
              ...identity(),
              status: "supported",
              blocks: [],
              items: options.delayFirstItemCapture === true && itemCaptureCount === 1 ? [] : items(),
              truncated: false,
            },
          }, { replyTo: frame.id });
        } else if (request.operation.op === "list-links") {
          extension.send("browser.result", {
            ok: true,
            requestId: request.requestId,
            operation: "list-links",
            result: { ...identity(), status: "empty", links: [], truncated: false },
          }, { replyTo: frame.id });
        } else if (request.operation.op === "read-item") {
          const item = items().find((candidate) => candidate.itemId === request.operation.itemId)!;
          extension.send("browser.result", {
            ok: true,
            requestId: request.requestId,
            operation: "read-item",
            result: item,
          }, { replyTo: frame.id });
        } else {
          extension.send("browser.result", {
            ok: false,
            requestId: request.requestId,
            operation: request.operation.op,
            error: { code: "unavailable", message: "Synthetic operation not implemented." },
          }, { replyTo: frame.id });
        }
      } else if (frame.type === "act.request") {
        const request = frame.payload;
        if (request.action.op === "fill") {
          draftValue = request.action.value;
          extension.send("act.result", { actId: request.actId, ok: true, observedValue: draftValue }, { replyTo: frame.id });
        } else if (request.action.op === "click" && request.action.targetId === "synthetic-send") {
          sendDispatches += 1;
          extension.send("act.result", { actId: request.actId, ok: true, liveKind: "send" }, { replyTo: frame.id });
        } else {
          extension.send("act.result", { actId: request.actId, ok: false, error: "exception" }, { replyTo: frame.id });
        }
      }
    }
  })();
  void responder.catch(() => {});
  let voice = await bindClient(server.port, "voice");
  return {
    server,
    get voice() { return voice; },
    extension,
    scheduled,
    get draftValue() { return draftValue; },
    get sendDispatches() { return sendDispatches; },
    get itemCaptureCount() { return itemCaptureCount; },
    get now() { return now; },
    setNow(value: number) { now = value; },
    setSuccessfulPageResult(value: boolean) { successfulPageResult = value; },
    setRecipientValue(value: string) { recipientValue = value; },
    setVoice(value: TestClient) { voice = value; },
    changePage() {
      snapshot = structuredClone(snapshot);
      snapshot.tabId += 1;
      snapshot.url = "http://127.0.0.1:8787/other.html";
      snapshot.origin = new URL(snapshot.url).origin;
      snapshot.capturedAt += 1;
      captureId = "synthetic-capture-after-tab-change";
      captureRevision += 1;
      extension.send("page.changed", { tabId: snapshot.tabId, url: snapshot.url, reason: "tab-activated" });
    },
    async stop() {
      accepting = false;
      voice.close();
      extension.close();
      await server.close();
    },
  };
}

type DemoRig = Awaited<ReturnType<typeof startConfiguredTaskDemo>>;
type PendingTaskGate = NonNullable<DemoRig["server"]["session"]["pendingGatedAction"]>;

function sendVoiceUtterance(client: TestClient, text: string, source: "voice" | "typed" = "voice"): void {
  client.send("utterance", { utteranceId: newId(), text, source });
}

async function speakText(client: TestClient, text: string, timeoutMs = 5_000): Promise<Frame> {
  return waitForFrame(client, (frame) => frame.type === "speak" && frame.payload.text === text, timeoutMs);
}

async function prepareCurrentPageTask(rig: DemoRig): Promise<void> {
  if (rig.server.session.model === null) {
    sendVoiceUtterance(rig.voice, "what's here");
    await waitForFrame(rig.voice, (frame) => frame.type === "speak" && frame.payload.category === "answer");
  }
  if (rig.server.session.browserCapture?.items?.length !== 1) {
    sendVoiceUtterance(rig.voice, "read the page");
    await waitForFrame(rig.voice, (frame) => frame.type === "speak" && frame.payload.category === "answer");
    await vi.waitFor(() => expect(rig.server.session.browserCapture?.items).toHaveLength(1));
  }
}

async function prepareObservedDraft(rig: DemoRig): Promise<void> {
  sendVoiceUtterance(rig.voice, "Draft a response");
  const initialReadback = await waitForFrame(rig.voice, (frame) => frame.type === "speak" && frame.payload.text.startsWith("Current draft in Reply message:"));
  expect(initialReadback.payload.text).toContain("I can arrive before the workshop begins.");
  expect(rig.server.session.activePageTask?.lastObservedDraftValue).toBeTruthy();
  sendVoiceUtterance(rig.voice, "Make it shorter");
  const revisedReadback = await waitForFrame(rig.voice, (frame) => frame.type === "speak" && frame.payload.text.startsWith("Current draft in Reply message:"));
  expect(revisedReadback.payload.text).toContain("I can arrive at the updated time.");
  expect(rig.server.session.activePageTask?.lastObservedDraftValue).toContain("updated time");
}

async function beginObservedDraftSend(rig: DemoRig): Promise<PendingTaskGate> {
  sendVoiceUtterance(rig.voice, "yes, that's good");
  const prompt = await waitForFrame(rig.voice, (frame) => frame.type === "speak" && frame.payload.category === "confirm-prompt");
  expect(prompt.payload.text).toContain("Recipient: Recipient, Synthetic Contact.");
  expect(prompt.payload.text).toContain("Current message draft: I can arrive at the updated time.");
  expect(prompt.payload.text).toContain("Would you like me to send it? Say yes to send");
  const pending = rig.server.session.pendingGatedAction;
  if (pending === null) throw new Error("Core task send did not create its read-back grant state.");
  return pending;
}

async function armObservedDraftSend(rig: DemoRig): Promise<PendingTaskGate> {
  const pending = await beginObservedDraftSend(rig);
  rig.voice.send("speak.done", { speakId: pending.speakId, interrupted: false });
  await sleep(20);
  const cooldown = rig.scheduled.find((entry) => entry.delayMs === 1_000);
  expect(cooldown, "PHASE8_COMPOSITION_GAP: task read-back completion must reach the core gate").toBeDefined();
  if (cooldown === undefined) throw new Error("Tracked task read-back did not schedule its one-second guard.");
  rig.scheduled.splice(rig.scheduled.indexOf(cooldown), 1);
  rig.setNow(rig.now + 1_000);
  cooldown.callback();
  await waitForFrame(rig.voice, (frame) => frame.type === "confirm.armed" && frame.payload.speakId === pending.speakId);
  return pending;
}

function sendRedeem(
  client: TestClient,
  pending: PendingTaskGate,
  overrides: { source?: "voice" | "typed"; omitSource?: boolean; grantId?: string; speakId?: string; phrase?: string } = {},
): void {
  const payload = {
    grantId: overrides.grantId ?? pending.grantId!,
    speakId: overrides.speakId ?? pending.speakId,
    utteranceId: newId(),
    phrase: overrides.phrase ?? "send this email",
    ...(overrides.omitSource ? {} : { source: overrides.source ?? "voice" }),
  };
  client.send("confirm.redeem", payload);
}

describe("core server dialogue runner option", () => {
  it("keeps direct browser navigation available while model startup is pending", async () => {
    const adapter: AgyCliAdapter = {
      createSession(config) {
        return {
          async start() { return { agent: config.agent, permissionMode: "request-review", tools: [] }; },
          async call() { return new Promise<string>(() => {}); },
          abort() {}, async close() {},
        };
      },
    };
    const server = await startServer({ port: 0, brain: "agy", dialogueRunner: true, agyAdapter: adapter, deferAgyStartup: true });
    const extension = await bindClient(server.port, "extension");
    const voice = await bindClient(server.port, "voice");
    try {
      sendVoiceUtterance(voice, "Open https://www.wikipedia.org/");
      const request = await waitForFrame(extension, (frame) => frame.type === "browser.request");
      expect(request.payload.operation).toMatchObject({ op: "navigate", url: "https://www.wikipedia.org/" });
      extension.send("browser.result", {
        ok: true, requestId: request.payload.requestId, operation: "navigate", result: { tabId: 11, status: "dispatched" },
      }, { replyTo: request.id });
      await speakText(voice, "Opened the requested website.");
    } finally { voice.close(); extension.close(); await server.close(); }
  });

  it.each([
    ["Gmail.", "Gmail", "https://gmail.com/"],
    ["Open Wikipedia", "Wikipedia", "https://www.wikipedia.org/"],
  ])("routes a named site through the configured runner with no form: %s", async (text, target, url) => {
    const adapter: AgyCliAdapter = {
      createSession(config) {
        return {
          async start() { return { agent: config.agent, permissionMode: "request-review", tools: [] }; },
          async call(prompt = "") {
            return prompt.includes("Classify the user's browser request")
              ? `\`\`\`json\n${JSON.stringify({ intent: "navigate", target, destinationUrl: url })}\n\`\`\``
              : config.role === "intent" ? '{"type":"describe"}' : '{"fields":[]}';
          },
          abort() {},
          async close() {},
        };
      },
    };
    const server = await startServer({ port: 0, dialogueRunner: true, brain: "agy", agyAdapter: adapter });
    const extension = await bindClient(server.port, "extension");
    const voice = await bindClient(server.port, "voice");
    try {
      expect(server.session.model).toBeNull();
      sendVoiceUtterance(voice, text);
      const request = await waitForFrame(extension, (frame) => ["browser.request", "snapshot.request"].includes(frame.type));
      expect(request.type).toBe("browser.request");
      expect(request.payload.operation).toMatchObject({ op: "navigate", url });
      extension.send("browser.result", {
        ok: true, requestId: request.payload.requestId, operation: "navigate", result: { tabId: 11, status: "dispatched" },
      }, { replyTo: request.id });
      await speakText(voice, "Opened the requested website.");
    } finally {
      voice.close(); extension.close(); await server.close();
    }
  });

  it("opens a direct website from a new tab and reloads without requiring a page snapshot", async () => {
    const server = await startServer({ port: 0, dialogueRunner: true, brain: "fake", fakeDelayMs: 0 });
    const extension = await bindClient(server.port, "extension");
    const voice = await bindClient(server.port, "voice");
    try {
      sendVoiceUtterance(voice, "new tab");
      const blankRequest = await waitForFrame(extension, (frame) => frame.type === "browser.request");
      expect(blankRequest.payload.operation).toEqual({ op: "tabs", action: "open-blank" });
      extension.send("browser.result", {
        ok: true,
        requestId: blankRequest.payload.requestId,
        operation: "tabs",
        result: { activeTabId: 9, tabs: [], truncated: false },
      }, { replyTo: blankRequest.id });
      await speakText(voice, "Opened a blank tab.");
      expect(server.session.tabId).toBe(9);

      sendVoiceUtterance(voice, "Can you open https://mail.google.com/");
      const navigateRequest = await waitForFrame(extension, (frame) => frame.type === "browser.request");
      expect(navigateRequest.payload).toMatchObject({
        operation: { op: "navigate", url: "https://mail.google.com/" },
      });
      extension.send("browser.result", {
        ok: true,
        requestId: navigateRequest.payload.requestId,
        operation: "navigate",
        result: { tabId: 9, status: "dispatched" },
      }, { replyTo: navigateRequest.id });
      await speakText(voice, "Opened the requested website.");

      sendVoiceUtterance(voice, "Can you reload this page?");
      const reloadRequest = await waitForFrame(extension, (frame) => frame.type === "browser.request");
      expect(reloadRequest.payload).toMatchObject({ tabId: 9, operation: { op: "reload" } });
      extension.send("browser.result", {
        ok: true,
        requestId: reloadRequest.payload.requestId,
        operation: "reload",
        result: { tabId: 9, status: "dispatched" },
      }, { replyTo: reloadRequest.id });
      await speakText(voice, "Reloaded the current page.");
      expect(server.session.pendingGatedAction).toBeNull();
    } finally {
      voice.close();
      extension.close();
      await server.close();
    }
  });

  it("tracks rate-only acknowledgement speech and rejects invalid settings", async () => {
    const server = await startServer({ port: 0, dialogueRunner: true });
    const voice = await bindClient(server.port, "voice");
    try {
      voice.send("settings", { outputMode: "agent-voice", rate: 1.26 });
      const faster = await waitForFrame(voice, f => f.type === "speak" && f.payload.text === "Speaking faster.");
      expect(faster.payload.interrupt).toBe(false);
      expect(server.session.speechCompletion(faster.payload.speakId)).toBeNull();
      expect(server.session.activeSpeakId).toBe(faster.payload.speakId);
      voice.send("speak.done", { speakId: faster.payload.speakId, interrupted: false });
      await vi.waitFor(() => expect(server.session.speechCompletion(faster.payload.speakId)?.interrupted).toBe(false));
      voice.send("settings", { outputMode: "agent-voice", rate: 0.79 });
      const slower = await waitForFrame(voice, f => f.type === "speak" && f.payload.text === "Speaking slower.");
      expect(slower.payload.speakId).not.toBe(faster.payload.speakId);
      voice.send("settings", { outputMode: "agent-voice", rate: 1.1 });
      await waitForFrame(voice, f => f.type === "error" && f.payload.code === "invalid-speech-rate");
      expect(server.session.speechRate).toBe(0.79);
    } finally { voice.close(); await server.close(); }
  });
  it("reports unavailable NVDA once and falls back to tracked agent-voice speech", async () => {
    const speechOutput = {
      speak: vi.fn(() => 0),
      cancel: vi.fn(() => 0),
      completionSignal: "unavailable" as const,
    };
    const server = await startServer({ port: 0, dialogueRunner: true, brain: "fake", speechOutput });
    const voice = await bindClient(server.port, "voice");
    try {
      voice.send("settings", { outputMode: "screen-reader" });
      const stop = await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.text === "Stopped.");
      const unavailable = await waitForFrame(voice, (frame) => frame.type === "error" && frame.payload.code === "nvda-completion-unavailable");
      const warning = await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.category === "error");
      await vi.waitFor(() => expect(server.session.outputMode).toBe("agent-voice"));
      expect(unavailable.payload.fatal).toBe(false);
      expect(warning.payload.text).toContain("NVDA speech completion is unavailable");
      expect(warning.payload.speakId).not.toBe(stop.payload.speakId);

      // Re-selecting an unsupported mode keeps the fallback and does not repeat the announcement.
      voice.send("settings", { outputMode: "both" });
      await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.text === "Stopped.");
      await vi.waitFor(() => expect(server.session.outputMode).toBe("agent-voice"));
      expect(voice.frames.filter((frame) => frame.type === "error" && frame.payload.code === "nvda-completion-unavailable")).toHaveLength(1);
      expect(voice.frames.filter((frame) => frame.type === "speak" && frame.payload.text.includes("NVDA speech completion is unavailable"))).toHaveLength(1);

      voice.send("utterance", { utteranceId: newId(), text: "what's here", source: "typed" });
      await waitForFrame(voice, (frame) => frame.type === "transcript");
      const answer = await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.text === "I can't see a page yet.");

      expect(speechOutput.speak).not.toHaveBeenCalled();
      expect(speechOutput.cancel).not.toHaveBeenCalled();
      expect(server.session.activeSpeakId).toBe(answer.payload.speakId);
      expect(server.session.speechCompletion(answer.payload.speakId)).toBeNull();

      voice.send("speak.done", { speakId: answer.payload.speakId, interrupted: false });
      await vi.waitFor(() => expect(server.session.speechCompletion(answer.payload.speakId)?.interrupted).toBe(false));
      const completion = server.session.speechCompletion(answer.payload.speakId);
      voice.send("speak.done", { speakId: answer.payload.speakId, interrupted: true });
      await sleep(30);
      expect(server.session.speechCompletion(answer.payload.speakId)).toEqual(completion);
    } finally {
      voice.close();
      await server.close();
    }
  });

  it("routes deterministic voice grammar through the installed reducer", async () => {
    const server = await startServer({ port: 0, dialogueRunner: true, brain: "fake" });
    const voice = await bindClient(server.port, "voice");
    try {
      voice.send("utterance", { utteranceId: newId(), text: "what's here", source: "typed" });
      const transcript = await waitForFrame(voice, (frame) => frame.type === "transcript");
      expect(transcript.payload.routedTo).toBe("grammar");
      const answer = await waitForFrame(voice, (frame) => frame.type === "speak");
      expect(answer.payload.text).toBe("I can't see a page yet.");
      expect(answer.payload.speakId).toEqual(expect.any(String));
    } finally {
      voice.close();
      await server.close();
    }
  });

  it("does not let a model gated-action suggestion bypass reducer confirmation", async () => {
    const server = await startServer({
      port: 0,
      dev: true,
      dialogueRunner: true,
      brain: "fake",
      fakeDelayMs: 0,
      fakeRequestActionId: "submit-action",
      fakeRequestActionPhrase: "please submit it immediately",
    });
    const extension = startFakeExtension({ url: server.url, fixture: "booking" });
    await extension.connected;
    const voice = await bindClient(server.port, "voice");
    try {
      voice.send("utterance", {
        utteranceId: newId(),
        text: "please submit it immediately",
        source: "typed",
      });
      const error = await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.category === "error");
      expect(error.payload.text).toContain("I can't act on that request directly");
      expect(voice.frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
    } finally {
      voice.close();
      extension.close();
      await server.close();
    }
  });

  it("routes reducer-unmatched utterances through the configured Agy provider", async () => {
    const calls: Array<{ role: string; prompt: string }> = [];
    const adapter: AgyCliAdapter = {
      createSession(config: AgyRoleConfig): AgyRoleSession {
        let firstCall = true;
        return {
          async start() { return { agent: config.agent, permissionMode: "request-review", tools: [] }; },
          async call(prompt) {
            calls.push({ role: config.role, prompt });
            if (firstCall) {
              firstCall = false;
              return config.role === "intent" ? '{"type":"describe"}' : '{"fields":[]}';
            }
            return config.role === "intent"
              ? '{"type":"answer","text":"Agy handled this synthetic question."}'
              : '{"fields":[]}';
          },
          abort() {},
          async close() {},
        };
      },
    };
    const server = await startServer({
      port: 0,
      dev: true,
      brain: "agy",
      agyAdapter: adapter,
      dialogueRunner: true,
      snapshotTimeoutMs: 1_000,
    });
    const extension = startFakeExtension({ url: server.url, fixture: "booking" });
    await extension.connected;
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      const question = "Tell me the reason for this page.";
      voice.send("utterance", { utteranceId: newId(), text: question, source: "typed" });
      const answer = await waitForFrame(
        voice,
        (frame) => frame.type === "speak" && frame.payload.text === "Agy handled this synthetic question.",
      );
      expect(answer.payload.category).toBe("answer");
      expect(calls.some((call) => call.role === "intent" && call.prompt.includes(question))).toBe(true);
    } finally {
      voice.close();
      extension.close();
      await server.close();
    }
  });

  it("demo configured Phase 8 handler composition", async () => {
    const rig = await startConfiguredTaskDemo({ delayFirstItemCapture: true });
    try {
      sendVoiceUtterance(rig.voice, "Open a new tab");
      await speakText(rig.voice, "Opened a blank tab.");
      sendVoiceUtterance(rig.voice, "Open https://mail.google.com/");
      await speakText(rig.voice, "Opened the requested website.");
      expect(rig.server.session.model).toBeNull();

      sendVoiceUtterance(rig.voice, "What's the latest email I have?");
      await speakText(rig.voice, TASK_ITEM_TEXT);
      expect(rig.itemCaptureCount).toBe(2);
      expect(rig.server.session.activePageTask?.itemId).toBe("notice-current");

      sendVoiceUtterance(rig.voice, "Could you summarize it again?");
      await speakText(rig.voice, "The message asks you to confirm your preferred arrival time.");
      expect(rig.server.session.model).toBeNull();

      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);
      expect(pending.grantId).toBeDefined();
      expect(rig.server.session.activePageTask?.associatedGrantId).toBe(pending.grantId);

      sendRedeem(rig.voice, pending, { source: "voice", phrase: "yes" });
      await speakText(rig.voice, "The page confirms the action.");
      expect(rig.sendDispatches).toBe(1);
      expect(rig.server.session.pendingGatedAction).toBeNull();
      expect(rig.server.session.activePageTask).toBeNull();
    } finally {
      await rig.stop();
    }
  });

  it("configured runner reports unverified when the synthetic page returns no fresh confirmation", async () => {
    const rig = await startConfiguredTaskDemo();
    try {
      await prepareCurrentPageTask(rig);
      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);
      rig.setSuccessfulPageResult(false);
      sendRedeem(rig.voice, pending, { source: "voice" });
      await speakText(rig.voice, "I couldn't verify the page outcome.");
      expect(rig.sendDispatches).toBe(1);
      expect(rig.voice.frames.some((frame) => frame.type === "speak" && frame.payload.text === "The page confirms the action.")).toBe(false);
    } finally {
      await rig.stop();
    }
  });

  it("keeps the revised draft when the user declines the final send question", async () => {
    const rig = await startConfiguredTaskDemo();
    try {
      sendVoiceUtterance(rig.voice, "Open a new tab");
      await speakText(rig.voice, "Opened a blank tab.");
      sendVoiceUtterance(rig.voice, "Open https://mail.google.com/");
      await speakText(rig.voice, "Opened the requested website.");
      sendVoiceUtterance(rig.voice, "Read my latest email to me");
      await speakText(rig.voice, TASK_ITEM_TEXT);
      sendVoiceUtterance(rig.voice, "Could you summarize it again?");
      await speakText(rig.voice, "The message asks you to confirm your preferred arrival time.");
      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);

      sendRedeem(rig.voice, pending, { source: "voice", phrase: "no" });
      await speakText(rig.voice, "Okay, I left it as a draft.");
      expect(rig.sendDispatches).toBe(0);
      expect(rig.server.session.pendingGatedAction).toBeNull();
      expect(rig.draftValue).toContain("updated time");
    } finally {
      await rig.stop();
    }
  });

  it.each([
    ["missing source", { omitSource: true }],
    ["typed source", { source: "typed" as const }],
    ["typed yes", { phrase: "yes", source: "typed" as const }],
    ["wrong phrase", { phrase: "submit survey" }],
    ["stale grant", { grantId: "stale-grant-id" }],
    ["stale speak", { speakId: "stale-speak-id" }],
  ] as const)("server gate rejects %s through the configured runner", async (_name, redemption) => {
    const rig = await startConfiguredTaskDemo();
    try {
      await prepareCurrentPageTask(rig);
      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);
      sendRedeem(rig.voice, pending, redemption);
      await sleep(40);
      expect(rig.sendDispatches).toBe(0);
      expect(rig.server.session.pendingGatedAction).toBeNull();
    } finally {
      await rig.stop();
    }
  });

  it.each([
    ["typed exact phrase", "send this email", "typed" as const],
    ["bare voice affirmation", "yes", "voice" as const],
  ] as const)("ordinary utterance route cannot redeem a task grant with %s", async (_name, text, source) => {
    const rig = await startConfiguredTaskDemo();
    try {
      await prepareCurrentPageTask(rig);
      await prepareObservedDraft(rig);
      await armObservedDraftSend(rig);
      sendVoiceUtterance(rig.voice, text, source);
      await sleep(80);
      expect(rig.sendDispatches).toBe(0);
    } finally {
      await rig.stop();
    }
  });

  it.each([
    ["task identity", (pending: PendingTaskGate) => {
      pending.binding.pageTask!.taskId = "mutated-task-id";
    }],
    ["page identity", (pending: PendingTaskGate) => {
      pending.binding.pageTask!.sourceIdentity.pageUrl = "http://127.0.0.1:8787/other.html";
    }],
    ["draft binding", (_pending: PendingTaskGate, rig: DemoRig) => {
      rig.server.session.activePageTask!.lastObservedDraftValue = "mutated outside the task";
    }],
    ["recipient binding", (_pending: PendingTaskGate, rig: DemoRig) => {
      rig.setRecipientValue("Changed Contact");
    }],
    ["action target binding", (pending: PendingTaskGate) => {
      pending.binding.pageTask!.targetId = "mutated-send-target";
    }],
  ] as const)("server gate rejects a changed %s binding", async (_name, mutate) => {
    const rig = await startConfiguredTaskDemo();
    try {
      await prepareCurrentPageTask(rig);
      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);
      (mutate as (current: PendingTaskGate, demo: DemoRig) => void)(pending, rig);
      sendRedeem(rig.voice, pending, { source: "voice" });
      await sleep(50);
      expect(rig.sendDispatches).toBe(0);
      expect(rig.server.session.pendingGatedAction).toBeNull();
    } finally {
      await rig.stop();
    }
  });

  it.each(["interrupted speech", "stop", "repeat", "cancel", "ptt", "settings", "page changed"] as const)(
    "configured runner invalidates a task grant on %s",
    async (invalidation) => {
      const rig = await startConfiguredTaskDemo();
      try {
        await prepareCurrentPageTask(rig);
        await prepareObservedDraft(rig);
        if (invalidation === "interrupted speech") {
          const active = await beginObservedDraftSend(rig);
          rig.voice.send("speak.done", { speakId: active.speakId, interrupted: true });
          await vi.waitFor(() => expect(rig.server.session.pendingGatedAction).toBeNull());
          sendRedeem(rig.voice, active, { grantId: "interrupted-no-grant", source: "voice" });
          await sleep(30);
          expect(rig.sendDispatches).toBe(0);
          return;
        }
        const pending = await armObservedDraftSend(rig);
        if (invalidation === "stop" || invalidation === "repeat") {
          rig.voice.send("control", { cmd: invalidation });
        } else if (invalidation === "cancel") {
          sendVoiceUtterance(rig.voice, "cancel task");
        } else if (invalidation === "ptt") {
          rig.voice.send("ptt", { state: "start" });
        } else if (invalidation === "settings") {
          rig.voice.send("settings", { outputMode: "screen-reader" });
        } else {
          rig.changePage();
        }
        await vi.waitFor(() => expect(rig.server.session.pendingGatedAction).toBeNull());
        sendRedeem(rig.voice, pending, { source: "voice" });
        await sleep(30);
        expect(rig.sendDispatches).toBe(0);
      } finally {
        await rig.stop();
      }
    },
  );

  it("disconnect/reconnect and direct voice replacement invalidate the configured task grant", async () => {
    const rig = await startConfiguredTaskDemo();
    let replacementRig: DemoRig | undefined;
    let replacement: TestClient | undefined;
    try {
      await prepareCurrentPageTask(rig);
      await prepareObservedDraft(rig);
      const pending = await armObservedDraftSend(rig);
      rig.voice.close();
      await vi.waitFor(() => expect(rig.server.session.voiceConnected).toBe(false));
      replacement = await bindClient(rig.server.port, "voice");
      rig.setVoice(replacement);
      sendRedeem(replacement, pending, { source: "voice" });
      await sleep(30);
      expect(rig.sendDispatches).toBe(0);
      replacement.close();

      replacementRig = await startConfiguredTaskDemo();
      await prepareCurrentPageTask(replacementRig);
      await prepareObservedDraft(replacementRig);
      const replaced = await armObservedDraftSend(replacementRig);
      const successor = await bindClient(replacementRig.server.port, "voice");
      replacementRig.setVoice(successor);
      sendRedeem(successor, replaced, { source: "voice" });
      await sleep(30);
      expect(replacementRig.sendDispatches).toBe(0);
      expect(replacementRig.server.session.voiceConnected).toBe(true);
      successor.close();
    } finally {
      replacement?.close();
      await rig.stop();
      await replacementRig?.stop();
    }
  });
});
