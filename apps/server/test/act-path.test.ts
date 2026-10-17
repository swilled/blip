import { describe, expect, it } from "vitest";
import { newId } from "@blip/protocol";
import { startServer } from "../src/server";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, type Frame, type TestClient } from "./helpers";

type ActRig = { server: Awaited<ReturnType<typeof startServer>>; extension: ReturnType<typeof startFakeExtension>; voice: TestClient };

async function rig(fakeRequestActionId?: string): Promise<ActRig> {
  const server = await startServer({
    port: 0,
    dev: true,
    fakeDelayMs: 5,
    ...(fakeRequestActionId !== undefined ? { fakeRequestActionId } : {}),
  });
  const extension = startFakeExtension({ url: server.url });
  await extension.connected;
  const voice = await bindClient(server.port, "voice", { origin: undefined });
  return { server, extension, voice };
}

async function turn(voice: TestClient, text: string): Promise<Frame[]> {
  const frames: Frame[] = [];
  voice.send("utterance", { utteranceId: newId(), text, source: "typed" });
  let sawTranscript = false;
  for (;;) {
    const frame = await voice.nextMessage(4000);
    frames.push(frame);
    if (frame.type === "transcript") sawTranscript = true;
    if (frame.type === "state" && frame.payload.busy === false && sawTranscript) return frames;
  }
}

describe("server ungated act path", () => {
  it("fills a text field, reads the DOM value back, and refreshes after the act", async () => {
    const r = await rig();
    try {
      const frames = await turn(r.voice, "fill Full name with Jane Doe");
      const answer = frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer");
      expect(answer?.payload.text).toBe("Full name is now Jane Doe.");
      expect(frames.find((frame) => frame.type === "transcript")?.payload.routedTo).toBe("grammar");

      const received = r.extension.received();
      const acts = received.filter((message) => message.type === "act.request");
      expect(acts).toHaveLength(1);
      expect(acts[0]!.payload).toMatchObject({
        action: { op: "fill", value: "Jane Doe" },
        expectedKind: "fill",
      });
      expect(received.filter((message) => message.type === "snapshot.request")).toHaveLength(2);
      expect(r.extension.elements().find((element) => element.id === acts[0]!.payload.action.targetId)?.value).toBe("Jane Doe");
      expect(frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("keeps request_action refusal ahead of a matching fill phrase", async () => {
    const r = await rig("e1");
    try {
      const frames = await turn(r.voice, "fill Full name with Jane Doe");
      expect(frames.some((frame) => frame.type === "speak" && frame.payload.text === "I can't do that yet.")).toBe(true);
      expect(r.extension.received().filter((message) => message.type === "act.request")).toHaveLength(0);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });
});
