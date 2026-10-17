import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  buildFrame,
  buildRawFrame,
  canReceive,
  CLOSE_CODES,
  FormModel,
  MAX_UTTERANCE_CHARS,
  parseFrame,
  type Message,
  type MessageType,
  type PayloadOf,
} from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { reduce } from "@blip/dialogue";
import { buildBaselineFormModel } from "../../../apps/server/src/baseline/index";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { createMockServer } from "./server";

const form = FormModel.parse(fixtureJson);
const servers: ReturnType<typeof createMockServer>[] = [];
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  for (const s of servers.splice(0)) await s.close();
});

async function start(opts: { dev?: boolean; delayMs?: number; helloTimeoutMs?: number } = {}) {
  const s = createMockServer({ port: 0, form, ...opts });
  servers.push(s);
  const port = await s.listen();
  return { s, port };
}

class Client {
  frames: Message[] = [];
  raw: string[] = [];
  closeCode: number | undefined;
  ws: WebSocket;
  constructor(url: string, origin?: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(url, { ...(origin !== undefined ? { origin } : {}), headers });
    clients.push(this.ws);
    this.ws.on("message", (d) => {
      const text = d.toString();
      this.raw.push(text);
      const r = parseFrame(text);
      if (r.ok) this.frames.push(r.message);
    });
    this.ws.on("close", (code) => {
      this.closeCode = code;
    });
    this.ws.on("error", () => {});
  }
  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
      this.ws.once("unexpected-response", (_q, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
  }
  send<T extends MessageType>(type: T, payload: PayloadOf<T>): void {
    this.ws.send(JSON.stringify(buildFrame(type, payload)));
  }
  async waitFor<T extends MessageType>(type: T, timeoutMs = 2000): Promise<Extract<Message, { type: T }>> {
    const t0 = Date.now();
    for (;;) {
      const i = this.frames.findIndex((f) => f.type === type);
      if (i >= 0) return this.frames.splice(i, 1)[0] as Extract<Message, { type: T }>;
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${type}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  async waitClose(timeoutMs = 2000): Promise<number> {
    const t0 = Date.now();
    while (this.closeCode === undefined) {
      if (Date.now() - t0 > timeoutMs) throw new Error("timeout waiting for close");
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.closeCode;
  }
}

const hello = { role: "voice", clientVersion: "test", protocolVersion: 1 } as const;
const origin = (port: number) => `http://127.0.0.1:${port}`;

async function voice(port: number): Promise<Client> {
  const c = new Client(`ws://127.0.0.1:${port}/ws`, origin(port));
  await c.opened();
  c.send("hello", hello);
  await c.waitFor("welcome");
  await c.waitFor("state");
  return c;
}

const utt = (text: string, id = "u1") => ({ utteranceId: id, text, source: "typed" as const });
const expectedText = reduce({ lastSpoken: null }, { type: "utterance", utterance: utt("what's here") }, { form }).effects[0] as {
  text: string;
};

describe("mock server", () => {
  it("1: hello yields welcome then state", async () => {
    const { port } = await start();
    const c = new Client(`ws://127.0.0.1:${port}/ws`, origin(port));
    await c.opened();
    c.send("hello", hello);
    const w = await c.waitFor("welcome");
    expect(w.payload.brain).toBe("fake");
    const st = await c.waitFor("state");
    expect(st.payload.dialogue).toBe("ready");
    expect(st.payload.page?.title).toBe(form.title);
  });

  it("2: origin rules", async () => {
    const { port } = await start();
    for (const o of ["http://evil.example", `http://localhost:${port}`, undefined]) {
      const c = new Client(`ws://127.0.0.1:${port}/ws`, o);
      await expect(c.opened()).rejects.toThrow("HTTP 403");
    }
    const dev = await start({ dev: true });
    const ok = new Client(`ws://127.0.0.1:${dev.port}/ws`, `http://localhost:${dev.port}`);
    await ok.opened();
  });

  it("3: path and Host", async () => {
    const { port } = await start();
    const bad = new Client(`ws://127.0.0.1:${port}/ui`, origin(port));
    await expect(bad.opened()).rejects.toThrow("HTTP 404");
    const host = new Client(`ws://127.0.0.1:${port}/ws`, origin(port), { Host: "evil.example" });
    await expect(host.opened()).rejects.toThrow("HTTP 403");
  });

  it("4: hello timeout, non-hello, wrong role", async () => {
    const { port } = await start({ helloTimeoutMs: 100 });
    const a = new Client(`ws://127.0.0.1:${port}/ws`, origin(port));
    await a.opened();
    expect(await a.waitClose()).toBe(CLOSE_CODES.helloTimeout);

    const b = new Client(`ws://127.0.0.1:${port}/ws`, origin(port));
    await b.opened();
    b.send("control", { cmd: "stop" });
    expect(await b.waitClose()).toBe(CLOSE_CODES.badHello);

    const c = new Client(`ws://127.0.0.1:${port}/ws`, origin(port));
    await c.opened();
    c.send("hello", { ...hello, role: "extension" });
    expect(await c.waitClose()).toBe(CLOSE_CODES.roleOriginMismatch);
  });

  it("5: what's here yields the counts-first speak", async () => {
    const { port } = await start();
    const c = await voice(port);
    c.send("utterance", utt("what's here"));
    const t = await c.waitFor("transcript");
    expect(t.payload.utteranceId).toBe("u1");
    const sp = await c.waitFor("speak");
    expect(sp.payload.text).toBe(expectedText.text);
    expect(sp.payload.text).toBe("Customer survey. 5 fields, 2 required, 2 actions.");
    expect(sp.payload.category).toBe("answer");
    expect(sp.payload.interrupt).toBe(false);
    expect(sp.payload.speakId.length).toBeGreaterThan(0);
  });

  it("6: unmatched utterance", async () => {
    const { port } = await start();
    const c = await voice(port);
    c.send("utterance", utt("fill in my name"));
    const sp = await c.waitFor("speak");
    expect(sp.payload.text).toBe("I can only describe the page right now.");
  });

  it("7: bad input yields error frames and the connection stays usable", async () => {
    const { port } = await start();
    const c = await voice(port);
    c.ws.send("{not json");
    const e1 = await c.waitFor("error");
    expect(e1.payload.code).toBe("bad-json");
    expect(e1.payload.fatal).toBe(false);
    c.ws.send(JSON.stringify(buildRawFrame("utterance", utt(""))));
    const e2 = await c.waitFor("error");
    expect(e2.payload.code).toBe("invalid-payload");
    c.ws.send(JSON.stringify(buildRawFrame("utterance", utt("x".repeat(MAX_UTTERANCE_CHARS + 1)))));
    const e3 = await c.waitFor("error");
    expect(e3.payload.fatal).toBe(false);
    expect(e3.payload.message).not.toContain("xxxxxxxx");
    c.send("utterance", utt("what's here"));
    await c.waitFor("speak");
  });

  it("8: delayMs delays the speak", async () => {
    const { port } = await start({ delayMs: 300 });
    const c = await voice(port);
    const t0 = Date.now();
    c.send("utterance", utt("what's here"));
    await c.waitFor("speak", 3000);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
  });

  it("9: every outbound frame round-trips parseFrame and is receivable by voice", async () => {
    const { port } = await start();
    const c = await voice(port);
    c.send("utterance", utt("what's here"));
    c.send("utterance", utt("hmm", "u2"));
    c.ws.send("nope");
    await c.waitFor("error");
    await new Promise((r) => setTimeout(r, 100));
    const seen = new Set<string>();
    expect(c.raw.length).toBeGreaterThan(5);
    for (const raw of c.raw) {
      const r = parseFrame(raw);
      expect(r.ok).toBe(true);
      if (r.ok) {
        seen.add(r.message.type);
        expect(canReceive("voice", r.message.type)).toBe(true);
      }
    }
    for (const t of ["welcome", "state", "transcript", "earcon", "speak", "error"]) expect(seen.has(t), t).toBe(true);
  });

  it("10: ptt start cancels a pending reply; speak.done clears outstanding ids", async () => {
    const { s, port } = await start({ delayMs: 300 });
    const c = await voice(port);
    c.send("utterance", utt("what's here"));
    await c.waitFor("transcript");
    c.send("ptt", { state: "start" });
    await new Promise((r) => setTimeout(r, 500));
    expect(c.frames.find((f) => f.type === "speak")).toBeUndefined();

    c.send("utterance", utt("what's here", "u2"));
    const sp = await c.waitFor("speak", 3000);
    expect(s.outstandingSpeakIds()).toContain(sp.payload.speakId);
    c.send("speak.done", { speakId: sp.payload.speakId, interrupted: false });
    await new Promise((r) => setTimeout(r, 100));
    expect(s.outstandingSpeakIds()).not.toContain(sp.payload.speakId);
  });

  it("11: control stop yields an interrupting Stopped.", async () => {
    const { port } = await start();
    const c = await voice(port);
    c.send("control", { cmd: "stop" });
    const sp = await c.waitFor("speak");
    expect(sp.payload.text).toBe("Stopped.");
    expect(sp.payload.interrupt).toBe(true);
  });

  it("12: a second voice connection replaces the first", async () => {
    const { port } = await start();
    const a = await voice(port);
    await voice(port);
    expect(await a.waitClose()).toBe(CLOSE_CODES.replaced);
  });

  it("13: fixture has not drifted from core's baseline builder", () => {
    expect(fixtureJson).toEqual(JSON.parse(JSON.stringify(buildBaselineFormModel(loadSnapshot("broken")))));
    expect(FormModel.safeParse(fixtureJson).success).toBe(true);
  });
});
