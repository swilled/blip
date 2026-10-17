import { describe, expect, it } from "vitest";
import { startServer } from "../src/server";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, type Frame, type TestClient } from "./helpers";

async function nextState(voice: TestClient, timeoutMs = 2000): Promise<Frame> {
  for (;;) {
    const frame = await voice.nextMessage(timeoutMs);
    if (frame.type === "state") return frame;
  }
}

describe("background page refresh", () => {
  it("refreshes after page.changed and pushes state without an utterance", async () => {
    const server = await startServer({ port: 0, dev: true, snapshotTimeoutMs: 500 });
    const extension = startFakeExtension({ url: server.url });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      await extension.connected;
      extension.setFixture("broken");

      const state = await nextState(voice);
      expect(state.payload.page).toMatchObject({ title: "Customer survey" });
      expect(extension.received().filter((message) => message.type === "snapshot.request")).toHaveLength(1);
      expect(extension.sent().some((message) => message.type === "page.changed")).toBe(true);
      expect(voice.frames.some((frame) => frame.type === "transcript" || frame.type === "speak")).toBe(false);
      expect(server.session.stale).toBe(false);
      expect(server.session.tabId).toBe(1);
      expect(server.session.modelAt).not.toBeNull();
    } finally {
      voice.ws.terminate();
      extension.close();
      await server.close();
    }
  });
});
