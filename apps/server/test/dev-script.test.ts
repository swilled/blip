// Spawns the real command `npm run dev -- ...` through a shell (Windows needs one) and drives it
// like a developer would (roadmap criterion 2). Through a shell the node child is a grandchild, so
// every spawned tree is killed with taskkill /T in a finally block; killing only the shell would
// leave a node process holding the port.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { connect as tcpConnect } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bindClient } from "./helpers";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const BOOKING_SENTENCE = "Hotel booking. 9 fields, 6 required, 3 actions.";

type Run = { child: ChildProcess; out: () => string; err: () => string; exited: Promise<number | null> };

function run(args: string): Run {
  const child = spawn(`npm run dev -- ${args}`, {
    cwd: repoRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    // Own process group on POSIX so the whole tree can be signalled.
    detached: process.platform !== "win32",
  });
  let out = "";
  let err = "";
  child.stdout?.on("data", (d) => (out += d));
  child.stderr?.on("data", (d) => (err += d));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return { child, out: () => out, err: () => err, exited };
}

/** Kill the shell and everything it started. */
function killTree(r: Run): void {
  const pid = r.child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function waitFor(r: Run, pattern: RegExp, timeoutMs = 25000): Promise<RegExpExecArray> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = pattern.exec(r.out());
    if (m) return m;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${pattern}\nstdout:\n${r.out()}\nstderr:\n${r.err()}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function exitWithin(r: Run, ms: number): Promise<number | null> {
  return Promise.race([
    r.exited,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`did not exit within ${ms} ms\nstdout:\n${r.out()}\nstderr:\n${r.err()}`)), ms)),
  ]);
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = tcpConnect({ host: "127.0.0.1", port });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

describe("npm run dev (D-21)", () => {
  it("--brain=fake answers 'what's here' with the booking sentence and exits 0 on /quit", async () => {
    const r = run("--brain=fake --port 0");
    try {
      const listening = await waitFor(r, /listening on ws:\/\/127\.0\.0\.1:(\d+)\/ws \(brain=fake, dev=true\)/);
      const port = Number(listening[1]);
      await waitFor(r, /fake extension attached \(booking\)/);
      await waitFor(r, /^ready\. type an utterance, or \/quit$/m);
      r.child.stdin?.write("what's here\n");
      await waitFor(r, new RegExp(`speak\\[answer\\]: ${BOOKING_SENTENCE.replace(/\./g, "\\.")}`));
      r.child.stdin?.write("/quit\n");
      expect(await exitWithin(r, 10000)).toBe(0);
      expect(await portIsOpen(port)).toBe(false);
    } finally {
      killTree(r);
    }
  }, 60000);

  it("a piped stdin that ends right after its line still gets the reply, then exits 0", async () => {
    const r = run("--port 0");
    try {
      await waitFor(r, /^ready\. type an utterance, or \/quit$/m);
      r.child.stdin?.end("what's required\n");
      await waitFor(r, /speak\[answer\]: 6 required: Full name, Email address/);
      expect(await exitWithin(r, 10000)).toBe(0);
    } finally {
      killTree(r);
    }
  }, 60000);

  it("--fixture=broken serves the broken page", async () => {
    const r = run("--fixture=broken --port 0");
    try {
      await waitFor(r, /fake extension attached \(broken\)/);
      await waitFor(r, /^ready\. /m);
      r.child.stdin?.write("describe\n");
      await waitFor(r, /speak\[answer\]: Customer survey\. 5 fields, 2 required, 2 actions\./);
      r.child.stdin?.write("/quit\n");
      expect(await exitWithin(r, 10000)).toBe(0);
    } finally {
      killTree(r);
    }
  }, 60000);

  it("an unknown brain mode exits 2 without initializing the provider", async () => {
    const r = run("--brain=remote");
    try {
      expect(await exitWithin(r, 30000)).toBe(2);
      expect(r.err()).toContain("--brain must be fake or claude");
    } finally {
      killTree(r);
    }
  }, 60000);

  it("an unknown fixture exits 2", async () => {
    const r = run("--fixture=nope --port 0");
    try {
      expect(await exitWithin(r, 30000)).toBe(2);
      expect(r.err()).toContain("--fixture must be one of");
    } finally {
      killTree(r);
    }
  }, 60000);

  it("--no-repl stays up so a no-Origin voice client receives welcome then state", async () => {
    const r = run("--no-repl --port 0");
    try {
      const listening = await waitFor(r, /listening on ws:\/\/127\.0\.0\.1:(\d+)\/ws/);
      await waitFor(r, /^ready\. waiting for a voice client/m);
      const port = Number(listening[1]);
      // bindClient asserts welcome then state; the state must show the fake extension attached.
      const voice = await bindClient(port, "voice", { origin: undefined });
      try {
        voice.send("utterance", { utteranceId: "u1", text: "what's here", source: "typed" });
        const transcript = await voice.nextMessage(5000);
        expect(transcript.type).toBe("transcript");
        let speak = await voice.nextMessage(5000);
        while (speak.type !== "speak") speak = await voice.nextMessage(5000);
        expect(speak.payload.text).toBe(BOOKING_SENTENCE);
      } finally {
        voice.ws.terminate();
      }
      expect(await portIsOpen(port)).toBe(true);
    } finally {
      killTree(r);
    }
  }, 60000);

  it("--no-fake-extension keeps the REPL available while waiting for a real browser extension", async () => {
    const r = run("--no-fake-extension --port 0");
    try {
      const listening = await waitFor(r, /listening on ws:\/\/127\.0\.0\.1:(\d+)\/ws/);
      const port = Number(listening[1]);
      await waitFor(r, /^fake extension disabled; waiting for the real extension$/m);
      await waitFor(r, /^ready\. type an utterance, or \/quit$/m);
      const voice = await bindClient(port, "voice", { origin: undefined });
      try {
        const state = voice.frames.find((frame) => frame.type === "state");
        expect(state?.payload.extensionConnected).toBe(false);
      } finally {
        voice.ws.terminate();
      }
      r.child.stdin?.write("/quit\n");
      expect(await exitWithin(r, 10000)).toBe(0);
      expect(await portIsOpen(port)).toBe(false);
    } finally {
      killTree(r);
    }
  }, 60000);
});
