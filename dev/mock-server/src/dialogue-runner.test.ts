import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { buildFrame, parseFrame, type Message } from "@blip/protocol";
import { startReal } from "./run-real";

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe("real voice dialogue runner", () => {
  it("reads the broken form through a voice socket", async () => {
    const real = await startReal({ port: 0, fakeDelayMs: 0 });
    closers.push(() => real.close());

    const ws = new WebSocket(`ws://127.0.0.1:${real.server.port}/ws`, {
      origin: `http://127.0.0.1:${real.server.port}`,
    });
    closers.push(() => ws.terminate());
    const frames: Message[] = [];
    ws.on("message", (data) => {
      const parsed = parseFrame(data.toString());
      if (parsed.ok) frames.push(parsed.message);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.send(JSON.stringify(buildFrame("hello", { role: "voice", clientVersion: "test", protocolVersion: 1 })));
    ws.send(JSON.stringify(buildFrame("utterance", { utteranceId: "read-form", text: "read the form", source: "typed" })));

    let speak: Extract<Message, { type: "speak" }> | undefined;
    for (let i = 0; i < 400 && speak === undefined; i++) {
      speak = frames.find((frame): frame is Extract<Message, { type: "speak" }> => frame.type === "speak");
      if (speak === undefined) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(speak?.payload.text).toMatch(/^Field 1:/);
  });
});
