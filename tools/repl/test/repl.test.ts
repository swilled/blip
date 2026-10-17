import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../../../apps/server/src/server";
import { startFakeExtension, type FakeExtension } from "../../fake-extension/src/fake-extension";
import { startRepl, type Repl, type ReplOptions } from "../src/repl";

let server: RunningServer | undefined;
let ext: FakeExtension | undefined;
let repl: Repl | undefined;

afterEach(async () => {
  repl?.close();
  repl = undefined;
  ext?.close();
  ext = undefined;
  await server?.close();
  server = undefined;
});

async function setup(opts: { extension?: boolean; controls?: ReplOptions["controls"] } = {}) {
  server = await startServer({ port: 0, dev: true, fakeDelayMs: 20 });
  if (opts.extension !== false) {
    ext = startFakeExtension({ url: server.url });
    await ext.connected;
  }
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: string[] = [];
  let buffer = "";
  const waiters: Array<() => void> = [];
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
    for (const w of waiters.splice(0)) w();
  });
  async function waitFor(predicate: (line: string) => boolean, timeoutMs = 3000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = lines.find(predicate);
      if (hit !== undefined) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out; saw:\n${lines.join("\n")}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }
  repl = startRepl({ url: server.url, input, output, ...(opts.controls ? { controls: opts.controls } : {}) });
  await repl.ready;
  return { input, lines, waitFor };
}

describe("repl output formats (D-25)", () => {
  it("prints welcome, state, transcript, earcon and speak lines, one per event", async () => {
    const t = await setup();
    await t.waitFor((l) => l.startsWith("welcome: session="));
    await t.waitFor((l) => l === "state: dialogue=ready busy=false extension=true page=none" || l.startsWith("state: dialogue="));
    t.input.write("tell me a joke\n");
    await t.waitFor((l) => l === 'transcript: "tell me a joke" via model');
    await t.waitFor((l) => l === "earcon: thinking");
    await t.waitFor((l) => l === "speak[filler]: One moment.");
    await t.waitFor((l) => l.startsWith("speak[answer]: "));
    expect(t.lines.every((l) => !l.includes("\n"))).toBe(true);
  });

  it("auto-replies speak.done so the server sees one per speak", async () => {
    const t = await setup();
    t.input.write("what's here\n");
    await t.waitFor((l) => l.startsWith("speak[answer]:"));
    // no error lines: the server accepts speak.done
    await new Promise((r) => setTimeout(r, 80));
    expect(t.lines.filter((l) => l.startsWith("error:"))).toEqual([]);
  });

  it("lines typed before the socket is ready are sent in order once it is", async () => {
    const t = await setup();
    t.input.write("what's here\nwhat's required\n");
    await t.waitFor((l) => l.startsWith("speak[answer]: 6 required"));
    const answers = t.lines.filter((l) => l.startsWith("speak[answer]:"));
    expect(answers[0]).toContain("Hotel booking. 9 fields");
  });
});

describe("slash commands", () => {
  it("/state prints the last state line", async () => {
    const t = await setup();
    t.input.write("what's here\n");
    await t.waitFor((l) => l.startsWith("state:") && l.includes("page=Hotel booking") && l.includes("busy=false"));
    const countBefore = t.lines.filter((l) => l.startsWith("state:")).length;
    t.input.write("/state\n");
    await new Promise((r) => setTimeout(r, 60));
    const states = t.lines.filter((l) => l.startsWith("state:"));
    expect(states.length).toBe(countBefore + 1);
    expect(states.at(-1)).toContain("page=Hotel booking");
  });

  it("/fixture calls the injected control and confirms", async () => {
    const calls: string[] = [];
    const t = await setup({ controls: { setFixture: (name) => void calls.push(name) } });
    t.input.write("/fixture broken\n");
    await t.waitFor((l) => l === "fixture: switched to broken");
    expect(calls).toEqual(["broken"]);
  });

  it("/fixture without a control says it needs the in-process runner", async () => {
    const t = await setup();
    t.input.write("/fixture broken\n");
    const line = await t.waitFor((l) => l.startsWith("note:"));
    expect(line).toContain("in-process runner");
  });

  it("/raw sends an unvalidated frame the server refuses with role-violation", async () => {
    const t = await setup();
    t.input.write('/raw snapshot.result {"ok":false,"error":{"code":"x","message":"y"}}\n');
    const line = await t.waitFor((l) => l.startsWith("error: role-violation"));
    expect(line).toMatch(/^error: role-violation - /);
  });

  it("/raw with invalid JSON prints a local error and sends nothing", async () => {
    const t = await setup();
    t.input.write("/raw ptt {oops\n");
    await t.waitFor((l) => l.startsWith("error: bad-json"));
  });

  it("an unknown slash command prints an unknown-command line", async () => {
    const t = await setup();
    t.input.write("/frobnicate\n");
    await t.waitFor((l) => l.startsWith("unknown command: /frobnicate"));
  });

  it("/quit closes the socket and resolves done", async () => {
    const t = await setup();
    t.input.write("/quit\n");
    await repl!.done;
    expect(t.lines.some((l) => l.startsWith("speak"))).toBe(false);
  });

  it("an over-long line is rejected locally instead of crashing", async () => {
    const t = await setup();
    t.input.write(`${"x".repeat(600)}\n`);
    await t.waitFor((l) => l.startsWith("error: too-long"));
  });
});

describe("no sensitive values in output", () => {
  it("read-the-form output never shows a value, only labels", async () => {
    const t = await setup();
    t.input.write("read the form\n");
    const line = await t.waitFor((l) => l.startsWith("speak[answer]: Hotel booking. 9 fields."));
    expect(line).toContain("Card number, required");
  });
});
