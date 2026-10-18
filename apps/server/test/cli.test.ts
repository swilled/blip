// Spawns the real CLI (node --import tsx apps/server/src/main.ts). Windows leaves orphans when a
// child is not killed, so every spawned process is killed in a finally block.
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { connect } from "./helpers";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function launch(args: string[]): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts", ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

type Outcome = { code: number | null; stdout: string; stderr: string };

function collect(child: ChildProcess): { out: () => string; err: () => string } {
  let out = "";
  let err = "";
  child.stdout?.on("data", (d) => (out += d));
  child.stderr?.on("data", (d) => (err += d));
  return { out: () => out, err: () => err };
}

/** Run to completion (for invalid invocations that must exit on their own). */
async function runToExit(args: string[]): Promise<Outcome> {
  const child = launch(args);
  const io = collect(child);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`CLI did not exit: ${io.err()}`)), 10000);
      child.once("exit", (c) => {
        clearTimeout(t);
        resolve(c);
      });
    });
    return { code, stdout: io.out(), stderr: io.err() };
  } finally {
    child.kill();
  }
}

describe("CLI flags (D-21)", () => {
  it("--dev --port 0 prints one listening line and serves a no-Origin voice client", async () => {
    const child = launch(["--dev", "--port", "0"]);
    const io = collect(child);
    try {
      const line = await new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no listening line: ${io.err()}`)), 15000);
        const poll = setInterval(() => {
          const m = /listening on ws:\/\/127\.0\.0\.1:\d+\/ws \(brain=fake, dev=true\)/.exec(io.out());
          if (m) {
            clearInterval(poll);
            clearTimeout(t);
            resolve(m[0]);
          }
        }, 25);
        child.once("exit", () => {
          clearInterval(poll);
          clearTimeout(t);
          reject(new Error(`CLI exited early: ${io.err()}`));
        });
      });
      expect(io.out().trim().split("\n")).toHaveLength(1);
      const port = Number(/:(\d+)\/ws/.exec(line)![1]);

      const c = await connect({ port, origin: undefined });
      expect(c.status).toBe(101);
      c.hello("voice");
      const welcome = await c.nextMessage();
      expect(welcome.type).toBe("welcome");
      expect(welcome.payload.brain).toBe("fake");
      c.close();
    } finally {
      child.kill();
    }
  });

  it("an unknown brain mode exits 2 without starting a provider", async () => {
    const r = await runToExit(["--brain=remote"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--brain must be fake or agy/);
  });

  it("--allow-origin without --dev exits 2", async () => {
    const r = await runToExit(["--allow-origin", "http://localhost:5173"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--dev/);
  });

  it("--allow-origin with a non-loopback origin exits 2 and names it", async () => {
    const r = await runToExit(["--allow-origin", "https://evil.example", "--dev"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("https://evil.example");
  });

  it("an unknown flag exits 2", async () => {
    const r = await runToExit(["--nope"]);
    expect(r.code).toBe(2);
  });

  it("a bad --fake-delay exits 2", async () => {
    const r = await runToExit(["--fake-delay", "-5"]);
    expect(r.code).toBe(2);
  });
});
