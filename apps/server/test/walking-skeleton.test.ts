// The walking skeleton over real sockets on port 0 (roadmap criterion 2, D-23, D-24). No fake timers,
// no Chrome, no voice UI, no Claude. Servers and clients are always closed in finally blocks.
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { newId } from "@blip/protocol";
import { startServer, type RunningServer, type StartServerOptions } from "../src/server";
import { startFakeExtension, type FakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { startRepl } from "../../../tools/repl/src/repl";
import { bindClient, sleep, type Frame, type TestClient } from "./helpers";

/** Collects everything written to the REPL output and lets a test wait for a line. */
function captureOutput() {
  const out = new PassThrough();
  const lines: string[] = [];
  let buffer = "";
  const waiters: Array<() => void> = [];
  out.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
    for (const w of waiters.splice(0)) w();
  });
  async function waitFor(predicate: (line: string) => boolean, timeoutMs = 4000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = lines.find(predicate);
      if (hit !== undefined) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for a line; saw:\n${lines.join("\n")}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }
  return { out, lines, waitFor };
}

type Rig = {
  server: RunningServer;
  voice: TestClient;
  extension: FakeExtension | undefined;
  cleanup(): Promise<void>;
};

/** A dev server, a raw voice client (welcome and first state consumed) and optionally the fake extension. */
async function rig(opts: { extension?: boolean; fixture?: "booking" | "broken"; server?: StartServerOptions } = {}): Promise<Rig> {
  const server = await startServer({ port: 0, dev: true, brain: "fake", fakeDelayMs: 50, ...opts.server });
  let extension: FakeExtension | undefined;
  if (opts.extension !== false) {
    extension = startFakeExtension({ url: server.url, ...(opts.fixture ? { fixture: opts.fixture } : {}) });
    await extension.connected;
  }
  const voice = await bindClient(server.port, "voice", { origin: undefined });
  return {
    server,
    voice,
    extension,
    async cleanup() {
      voice.ws.terminate();
      extension?.close();
      await server.close();
    },
  };
}

/** Send one utterance and collect frames until the turn's closing (non-busy) state push. */
async function turn(voice: TestClient, text: string): Promise<Frame[]> {
  const frames: Frame[] = [];
  voice.send("utterance", { utteranceId: newId(), text, source: "typed" });
  let sawTranscript = false;
  for (;;) {
    const f = await voice.nextMessage(4000);
    frames.push(f);
    if (f.type === "transcript") sawTranscript = true;
    if (f.type === "state" && f.payload.busy === false && sawTranscript) return frames;
  }
}

/** The frames a UI would act on: drops the busy=true state push that follows each transcript. */
const meaningful = (frames: Frame[]) => frames.filter((f) => !(f.type === "state" && f.payload.busy === true));
const speaks = (frames: Frame[]) => frames.filter((f) => f.type === "speak");

describe("walking skeleton tracer", () => {
  it("answers 'what's here' with the booking field and required counts", async () => {
    const server: RunningServer = await startServer({ port: 0, dev: true, brain: "fake", fakeDelayMs: 50 });
    const extension = startFakeExtension({ url: server.url });
    const input = new PassThrough();
    const cap = captureOutput();
    const repl = startRepl({ url: server.url, input, output: cap.out });
    try {
      await extension.connected;
      await repl.ready;
      input.write("what's here\n");
      const line = await cap.waitFor((l) => l.startsWith("speak[answer]:"));
      expect(line).toBe("speak[answer]: Hotel booking. 9 fields, 6 required, 3 actions.");
      // The final state push shows the page title.
      await cap.waitFor((l) => l.startsWith("state:") && l.includes("page=Hotel booking") && l.includes("busy=false"));
      expect(cap.lines.some((l) => l.startsWith("welcome: session="))).toBe(true);
    } finally {
      repl.close();
      extension.close();
      await server.close();
    }
  });
});

describe("turn frame order (D-23)", () => {
  it("grammar route: transcript (grammar), speak, state; no earcon, no filler", async () => {
    const r = await rig();
    try {
      const frames = meaningful(await turn(r.voice, "what's here"));
      expect(frames.map((f) => f.type)).toEqual(["transcript", "speak", "state"]);
      expect(frames[0]!.payload.routedTo).toBe("grammar");
      expect(frames[1]!.payload).toMatchObject({
        category: "answer",
        interrupt: false,
        text: "Hotel booking. 9 fields, 6 required, 3 actions.",
      });
      expect(frames[2]!.payload).toMatchObject({ busy: false, dialogue: "ready", extensionConnected: true });
      expect(frames[2]!.payload.page).toMatchObject({ title: "Hotel booking", fieldCount: 9, requiredEmpty: 6 });
    } finally {
      await r.cleanup();
    }
  });

  it("model route: transcript (model), earcon thinking, filler, delayed answer, state", async () => {
    const r = await rig({ server: { fakeDelayMs: 100 } });
    try {
      const start = performance.now();
      const frames = await turn(r.voice, "please book a flight to mars");
      const elapsed = performance.now() - start;
      const m = meaningful(frames);
      expect(m.map((f) => f.type)).toEqual(["transcript", "earcon", "speak", "speak", "state"]);
      expect(m[0]!.payload.routedTo).toBe("model");
      expect(m[1]!.payload.name).toBe("thinking");
      expect(m[2]!.payload.category).toBe("filler");
      expect(m[3]!.payload.category).toBe("answer");
      expect(elapsed).toBeGreaterThanOrEqual(95); // lower bound only
    } finally {
      await r.cleanup();
    }
  });

  it("the voice client receives welcome then state from this server (roadmap criterion 5)", async () => {
    const server = await startServer({ port: 0, dev: true });
    try {
      // bindClient itself asserts welcome then state, in that order.
      const voice = await bindClient(server.port, "voice", { origin: undefined });
      voice.ws.terminate();
    } finally {
      await server.close();
    }
  });
});

describe("brain selection (D-21)", () => {
  it("startServer itself rejects brain claude with the Phase 4 message", async () => {
    await expect(startServer({ port: 0, brain: "claude" })).rejects.toThrow(/not available yet.*Phase 4/);
  });
});

describe("determinism (D-23)", () => {
  it("the same input gives the same text across turns and across server instances", async () => {
    const texts: string[][] = [];
    for (let instance = 0; instance < 2; instance++) {
      const r = await rig();
      try {
        const run: string[] = [];
        for (const utterance of ["what's here", "what's here", "tell me a joke", "tell me a joke"]) {
          run.push(...speaks(await turn(r.voice, utterance)).map((f) => f.payload.text as string));
        }
        texts.push(run);
      } finally {
        await r.cleanup();
      }
    }
    expect(texts[0]).toEqual(texts[1]);
    // describe x2 (1 speak each) + model x2 (filler + answer each)
    expect(texts[0]!.length).toBe(6);
    expect(texts[0]![0]).toBe(texts[0]![1]);
    expect(texts[0]![3]).toBe(texts[0]![5]);
  });
});

describe("grammar commands", () => {
  it("what's required and read the form use labels only", async () => {
    const r = await rig();
    try {
      const req = speaks(await turn(r.voice, "which fields are required"))[0]!;
      expect(req.payload.text).toBe(
        "6 required: Full name, Email address, Check-in date, Room type, Bed preference, Card number.",
      );
      const form = speaks(await turn(r.voice, "read the form"))[0]!;
      expect(form.payload.text.startsWith("Hotel booking. 9 fields. 1: Full name, required.")).toBe(true);
    } finally {
      await r.cleanup();
    }
  });

  it("the broken fixture is described with hedged labels", async () => {
    const r = await rig({ fixture: "broken" });
    try {
      expect(speaks(await turn(r.voice, "describe"))[0]!.payload.text).toBe("Customer survey. 5 fields, 2 required, 2 actions.");
      expect(speaks(await turn(r.voice, "what's required"))[0]!.payload.text).toBe(
        "2 required: probably q2 email, probably How did you hear about us.",
      );
    } finally {
      await r.cleanup();
    }
  });

  it("stop sends a speak with interrupt true; repeat re-sends the last spoken text", async () => {
    const r = await rig();
    try {
      const nothing = speaks(await turn(r.voice, "repeat"))[0]!;
      expect(nothing.payload.text).toBe("There's nothing to repeat.");

      const said = speaks(await turn(r.voice, "what's here"))[0]!.payload.text;
      const stop = speaks(await turn(r.voice, "stop"))[0]!;
      expect(stop.payload.interrupt).toBe(true);
      const again = speaks(await turn(r.voice, "say that again"))[0]!;
      expect(again.payload.text).toBe(said);
    } finally {
      await r.cleanup();
    }
  });
});

describe("fail-closed brain (T-01-26, GATE-05 foundation)", () => {
  it("a requested action is refused: no act.request reaches the extension and nothing is armed", async () => {
    const r = await rig({ server: { fakeRequestActionId: "e10" } });
    try {
      const frames = await turn(r.voice, "go ahead and book it");
      const spoken = speaks(frames).map((f) => f.payload.text);
      expect(spoken).toContain("I can't do that yet.");
      await sleep(100);
      expect(r.extension!.received().filter((m) => m.type === "act.request")).toHaveLength(0);
      expect(r.voice.frames.some((f) => f.type === "confirm.armed")).toBe(false);
    } finally {
      await r.cleanup();
    }
  });

  it("the default brain never requests an action either", async () => {
    const r = await rig();
    try {
      for (const text of ["submit the form", "click book room", "pay now"]) await turn(r.voice, text);
      expect(r.extension!.received().filter((m) => m.type === "act.request")).toHaveLength(0);
      expect(r.voice.frames.some((f) => f.type === "confirm.armed")).toBe(false);
    } finally {
      await r.cleanup();
    }
  });
});

describe("handlers (D-14)", () => {
  it("ptt, settings and speak.done are accepted silently", async () => {
    const r = await rig();
    try {
      r.voice.send("ptt", { state: "start" });
      r.voice.send("ptt", { state: "end" });
      r.voice.send("settings", { outputMode: "agent-voice" });
      r.voice.send("speak.done", { speakId: "nope", interrupted: false });
      await sleep(100);
      expect(r.voice.frames.filter((f) => f.type === "error")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("control stop and repeat behave like the grammar; reconnect-browser is not implemented", async () => {
    const r = await rig();
    try {
      await turn(r.voice, "what's here");
      r.voice.send("control", { cmd: "stop" });
      const stop = await r.voice.nextMessage();
      expect(stop.type).toBe("speak");
      expect(stop.payload.interrupt).toBe(true);
      r.voice.send("control", { cmd: "repeat" });
      const repeat = await r.voice.nextMessage();
      expect(repeat.payload.text).toBe("Hotel booking. 9 fields, 6 required, 3 actions.");
      const id = r.voice.send("control", { cmd: "reconnect-browser" });
      const err = await r.voice.nextMessage();
      expect(err.type).toBe("error");
      expect(err.payload.code).toBe("not-implemented");
      expect(err.replyTo).toBe(id);
    } finally {
      await r.cleanup();
    }
  });

  it("ptt.hotkey from the extension is not implemented", async () => {
    const server = await startServer({ port: 0, dev: true });
    try {
      const ext = await bindClient(server.port, "extension", { origin: undefined });
      const id = ext.send("ptt.hotkey", { source: "global-hotkey" });
      const err = await ext.nextMessage();
      expect(err.payload.code).toBe("not-implemented");
      expect(err.replyTo).toBe(id);
      ext.ws.terminate();
    } finally {
      await server.close();
    }
  });
});

describe("page freshness", () => {
  it("page.changed makes the next describe re-request a snapshot; otherwise the cache is reused", async () => {
    const r = await rig();
    try {
      const requests = () => r.extension!.received().filter((m) => m.type === "snapshot.request").length;
      await turn(r.voice, "what's here");
      expect(requests()).toBe(1);
      await turn(r.voice, "what's here");
      expect(requests()).toBe(1);
      r.extension!.emitPageChanged("mutation");
      await sleep(100);
      await turn(r.voice, "what's here");
      expect(requests()).toBe(2);
    } finally {
      await r.cleanup();
    }
  });

  it("switching fixtures changes what is described", async () => {
    const r = await rig();
    try {
      expect(speaks(await turn(r.voice, "describe"))[0]!.payload.text).toContain("Hotel booking");
      r.extension!.setFixture("broken");
      await sleep(100);
      expect(speaks(await turn(r.voice, "describe"))[0]!.payload.text).toContain("Customer survey");
    } finally {
      await r.cleanup();
    }
  });

  it("with no extension connected the reply says the page cannot be seen and returns promptly", async () => {
    const r = await rig({ extension: false });
    try {
      const start = performance.now();
      const frames = await turn(r.voice, "what's here");
      expect(performance.now() - start).toBeLessThan(1000);
      expect(speaks(frames)[0]!.payload.text).toBe("I can't see the page because the browser extension is not connected.");
      expect(frames.at(-1)!.payload).toMatchObject({ busy: false, dialogue: "no-page", extensionConnected: false });
    } finally {
      await r.cleanup();
    }
  });

  it("a snapshot request that times out replies 'I couldn't read the page.'", async () => {
    const server = await startServer({ port: 0, dev: true, fakeDelayMs: 10, snapshotTimeoutMs: 150 });
    // A silent extension: binds, then ignores snapshot.request.
    const silent = await bindClient(server.port, "extension", { origin: undefined });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      const frames = await turn(voice, "what's here");
      expect(speaks(frames)[0]!.payload).toMatchObject({ text: "I couldn't read the page.", category: "error" });
    } finally {
      voice.ws.terminate();
      silent.ws.terminate();
      await server.close();
    }
  });

  it("a failed snapshot result replies 'I couldn't read the page.'", async () => {
    const server = await startServer({ port: 0, dev: true, snapshotTimeoutMs: 1000 });
    const ext = await bindClient(server.port, "extension", { origin: undefined });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      const pending = turn(voice, "what's here");
      const req = await ext.nextMessage();
      expect(req.type).toBe("snapshot.request");
      ext.sendUnchecked("snapshot.result", { ok: false, error: { code: "no-tab", message: "no tab" } }, { replyTo: req.id });
      expect(speaks(await pending)[0]!.payload.text).toBe("I couldn't read the page.");
    } finally {
      voice.ws.terminate();
      ext.ws.terminate();
      await server.close();
    }
  });
});
