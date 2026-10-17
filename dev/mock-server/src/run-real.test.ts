import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { buildFrame, FormModel, parseFrame, type Message } from "@blip/protocol";
import { reduce } from "@blip/dialogue";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { startReal } from "./run-real";

const form = FormModel.parse(fixtureJson);
const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

describe("run-real", () => {
  it("5: real server + fake extension reply like the reducer and serve the static root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "blip-static-"));
    writeFileSync(join(dir, "index.html"), "<title>Blip</title>temp-index");
    const real = await startReal({ port: 0, fixture: "broken", fakeDelayMs: 0, staticDir: dir });
    closers.push(() => real.close());
    const port = real.server.port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://127.0.0.1:${port}` });
    closers.push(() => ws.terminate());
    const frames: Message[] = [];
    ws.on("message", (d) => {
      const r = parseFrame(d.toString());
      if (r.ok) frames.push(r.message);
    });
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
    });
    ws.send(JSON.stringify(buildFrame("hello", { role: "voice", clientVersion: "test", protocolVersion: 1 })));
    ws.send(JSON.stringify(buildFrame("utterance", { utteranceId: "u1", text: "what's here", source: "typed" })));

    const waitSpeak = async () => {
      for (let i = 0; i < 400; i++) {
        const f = frames.find((m) => m.type === "speak");
        if (f && f.type === "speak") return f;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("no speak frame");
    };
    const speak = await waitSpeak();
    const expected = reduce({ lastSpoken: null }, { type: "utterance", utterance: { utteranceId: "u1", text: "what's here", source: "typed" } }, { form })
      .effects[0] as { text: string };
    expect(speak.payload.text).toBe(expected.text);

    ws.send(JSON.stringify(buildFrame("speak.done", { speakId: speak.payload.speakId, interrupted: false })));
    await new Promise((r) => setTimeout(r, 150));
    expect(frames.find((m) => m.type === "error")).toBeUndefined();

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(await res.text()).toContain("temp-index");
  });
});
