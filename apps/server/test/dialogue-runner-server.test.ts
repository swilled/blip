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
  it("applies settings to this session and routes screen-reader speech through NVDA only", async () => {
    const speechOutput = {
      speak: vi.fn(() => 0),
      cancel: vi.fn(() => 0),
    };
    const server = await startServer({ port: 0, dialogueRunner: true, brain: "fake", speechOutput });
    const voice = await bindClient(server.port, "voice");
    try {
      voice.send("settings", { outputMode: "screen-reader" });
      const stop = await waitForFrame(voice, (frame) => frame.type === "speak" && frame.payload.text === "Stopped.");
      await vi.waitFor(() => expect(server.session.outputMode).toBe("screen-reader"));

      voice.send("utterance", { utteranceId: newId(), text: "what's here", source: "typed" });
      await waitForFrame(voice, (frame) => frame.type === "transcript");
      await vi.waitFor(() => expect(speechOutput.speak).toHaveBeenCalledWith("I can't see a page yet."));

      expect(server.session.activeSpeakId).toBeNull();
      expect(voice.frames.some((frame) => frame.type === "speak" && frame.payload.text === "I can't see a page yet.")).toBe(false);

      await sleep(30);
      expect(server.session.speechCompletion(stop.payload.speakId)).toBeNull();
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
      dialogueRunner: true,
      brain: "fake",
      fakeDelayMs: 0,
      fakeRequestActionId: "submit-action",
      fakeRequestActionPhrase: "please submit it immediately",
    });
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
