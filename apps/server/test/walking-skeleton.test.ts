// The tracer: a typed utterance travels REPL -> hub -> fake extension -> baseline builder -> reply
// over real sockets on port 0 (roadmap criterion 2, D-24).
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { startRepl } from "../../../tools/repl/src/repl";

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
