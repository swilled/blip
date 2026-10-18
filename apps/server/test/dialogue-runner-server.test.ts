import { describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
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

describe("core server dialogue runner option", () => {
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
});
