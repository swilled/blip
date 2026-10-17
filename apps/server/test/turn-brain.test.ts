import { describe, expect, it } from "vitest";
import { startServer } from "../src/server";
import type { ClaudeRoleConfig, ClaudeRoleSession, ClaudeSdkAdapter } from "../src/brain/claude/session";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, type Frame, type TestClient } from "./helpers";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type WatchdogTimer = { callback: () => void; delayMs: number; cancelled: boolean };

function watchdogClock() {
  const timers: WatchdogTimer[] = [];
  return {
    timers,
    schedule(callback: () => void, delayMs: number) {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel(handle: unknown) {
      (handle as WatchdogTimer).cancelled = true;
    },
  };
}

async function collectUntil(voice: TestClient, predicate: (frame: Frame) => boolean, timeoutMs = 4_000): Promise<Frame[]> {
  const frames: Frame[] = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await voice.nextMessage(Math.max(1, deadline - Date.now()));
    frames.push(frame);
    if (predicate(frame)) return frames;
  }
  throw new Error(`timed out waiting for frame; saw ${frames.map(({ type }) => type).join(", ")}`);
}

async function boot(adapter: ClaudeSdkAdapter, options: { intentWatchdog?: ReturnType<typeof watchdogClock> } = {}) {
  const server = await startServer({
    port: 0,
    dev: true,
    brain: "claude",
    claudeAdapter: adapter,
    snapshotTimeoutMs: 500,
    ...(options.intentWatchdog !== undefined ? { intentWatchdog: options.intentWatchdog } : {}),
  });
  const extension = startFakeExtension({ url: server.url });
  await extension.connected;
  const voice = await bindClient(server.port, "voice", { origin: undefined });
  return { server, extension, voice };
}

function firstCallHangAdapter() {
  const oldCall = deferred<string>();
  const calls: Array<{ role: string; prompt: string; sessionNumber: number }> = [];
  const aborted: string[] = [];
  const created: string[] = [];
  let intentSessions = 0;
  let resolveFirstCallStarted!: () => void;
  const firstCallStarted = new Promise<void>((resolve) => { resolveFirstCallStarted = resolve; });
  const adapter: ClaudeSdkAdapter = {
    createSession(config: ClaudeRoleConfig): ClaudeRoleSession {
      const sessionNumber = config.role === "intent" ? intentSessions++ : 0;
      created.push(`${config.role}:${sessionNumber}`);
      return {
        async start() { return { tools: [] }; },
        call(prompt) {
          calls.push({ role: config.role, prompt, sessionNumber });
          if (config.role !== "intent") return Promise.resolve('{"fields":[]}');
          if (sessionNumber === 0) {
            resolveFirstCallStarted();
            return oldCall.promise; // Deliberately ignores abort; the queue watchdog must still return.
          }
          return Promise.resolve('{"type":"answer","text":"replacement role answered"}');
        },
        abort() { aborted.push(`${config.role}:${sessionNumber}`); },
        async close() {},
      };
    },
  };
  return { adapter, oldCall, calls, aborted, created, firstCallStarted };
}

describe("Claude turn routing and watchdog recovery", () => {
  it("releases a hung queued turn, recreates the production-provider role, and ignores late output", async () => {
    const f = firstCallHangAdapter();
    const watchdog = watchdogClock();
    const r = await boot(f.adapter, { intentWatchdog: watchdog });
    try {
      r.voice.send("utterance", { utteranceId: "hung-intent", text: "what is the weather today", source: "typed" });
      r.voice.send("utterance", { utteranceId: "queued-intent", text: "what is tomorrow's weather", source: "typed" });

      await f.firstCallStarted;
      expect(watchdog.timers[0]?.delayMs).toBe(4_000);
      watchdog.timers[0]!.callback();

      const fallbackFrames = await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.text === "I couldn't understand that");
      expect(fallbackFrames.some((frame) => frame.type === "speak" && frame.payload.text === "what is the weather today")).toBe(false);

      const answerFrames = await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.text === "replacement role answered");
      expect(f.calls.filter((call) => call.role === "intent")).toHaveLength(2);
      expect(f.created.filter((name) => name.startsWith("intent:")).length).toBe(2);
      expect(f.aborted).toContain("intent:0");
      await collectUntil(r.voice, (frame) => frame.type === "state" && frame.payload.busy === false);
      expect(r.server.session.busy).toBe(false);

      f.oldCall.resolve('{"type":"request_action","actionId":"e10"}');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(r.server.session.pendingGatedAction).toBeNull();
      expect(r.extension.received().filter((message) => message.type === "act.request")).toHaveLength(0);
      expect(r.voice.frames.filter((frame) => frame.type === "speak" && frame.payload.text === "I couldn't understand that")).toHaveLength(1);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("keeps grammar and parsed field phrases local in Claude mode", async () => {
    const calls: string[] = [];
    const adapter: ClaudeSdkAdapter = {
      createSession(config) {
        return {
          async start() { return { tools: [] }; },
          async call(prompt) { calls.push(`${config.role}:${prompt}`); return '{"type":"describe"}'; },
          abort() {},
          async close() {},
        };
      },
    };
    const r = await boot(adapter);
    try {
      r.voice.send("utterance", { utteranceId: "local-grammar", text: "describe this page", source: "typed" });
      const grammar = await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.category === "answer");
      expect(grammar.find((frame) => frame.type === "transcript")?.payload.routedTo).toBe("grammar");
      expect(calls).toEqual([]);

      r.voice.send("utterance", { utteranceId: "local-fill", text: "fill Full name with Ada", source: "typed" });
      const field = await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.text.includes("is now Ada"));
      expect(field.find((frame) => frame.type === "transcript")?.payload.routedTo).toBe("grammar");
      expect(calls).toEqual([]);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("withholds a password-shaped utterance from the provider and speech", async () => {
    const calls: string[] = [];
    const adapter: ClaudeSdkAdapter = {
      createSession(config) {
        return {
          async start() { return { tools: [] }; },
          async call(prompt) { calls.push(`${config.role}:${prompt}`); return '{"type":"describe"}'; },
          abort() {},
          async close() {},
        };
      },
    };
    const r = await boot(adapter);
    try {
      const sentinel = "offline-password-sentinel-642";
      r.voice.send("utterance", { utteranceId: "private-intent", text: `my password is ${sentinel}`, source: "typed" });
      await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.category === "answer");
      expect(calls).toEqual([]);
      const transcriptAndSpeech = r.voice.frames
        .filter((frame) => frame.type === "transcript" || frame.type === "speak")
        .map((frame) => JSON.stringify(frame.payload))
        .join("\n");
      expect(transcriptAndSpeech).not.toContain(sentinel);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it.each([
    ["provider failure", async (_prompt: string) => { throw new Error("offline provider failure"); }, 1],
    ["second invalid result", async (_prompt: string) => '{"type":"describe","extra":true}', 2],
  ])("speaks the exact fallback and does not echo input after %s", async (_name, answer, expectedCalls) => {
    let intentCalls = 0;
    const adapter: ClaudeSdkAdapter = {
      createSession(config) {
        return {
          async start() { return { tools: [] }; },
          async call(prompt) {
            if (config.role !== "intent") return '{"fields":[]}';
            intentCalls += 1;
            return answer(prompt);
          },
          abort() {},
          async close() {},
        };
      },
    };
    const r = await boot(adapter);
    try {
      const sentinel = "private-request-sentinel";
      r.voice.send("utterance", { utteranceId: "failed-intent", text: `do something ${sentinel}`, source: "typed" });
      const frames = await collectUntil(r.voice, (frame) => frame.type === "speak" && frame.payload.text === "I couldn't understand that");
      await collectUntil(r.voice, (frame) => frame.type === "state" && frame.payload.busy === false);
      expect(intentCalls).toBe(expectedCalls);
      expect(frames.some((frame) => frame.type === "speak" && frame.payload.text === "I couldn't understand that")).toBe(true);
      const speech = r.voice.frames.filter((frame) => frame.type === "speak").map((frame) => frame.payload.text).join("\n");
      expect(speech).not.toContain(sentinel);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });
});
