import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { SIDECAR_ALLOWED_ORIGIN, startPttSidecar, type PttSidecar } from "./ptt-sidecar";

let sc: PttSidecar | null = null;
const clients: WebSocket[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  await sc?.close();
  sc = null;
});

async function boot(): Promise<number> {
  sc = startPttSidecar({ port: 0 });
  return sc.listening;
}

function connect(port: number, origin?: string): Promise<{ ws: WebSocket; msgs: string[]; opened: boolean }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin === undefined ? {} : { origin });
    clients.push(ws);
    const msgs: string[] = [];
    ws.on("message", (d) => msgs.push(String(d)));
    ws.on("open", () => resolve({ ws, msgs, opened: true }));
    ws.on("error", () => resolve({ ws, msgs, opened: false }));
  });
}

describe("ptt sidecar", () => {
  it("broadcasts hold start and end to an allowed origin", async () => {
    const port = await boot();
    const c = await connect(port, SIDECAR_ALLOWED_ORIGIN);
    expect(c.opened).toBe(true);
    sc!.broadcast("start");
    sc!.broadcast("end");
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.map((m) => JSON.parse(m))).toEqual([{ hold: "start" }, { hold: "end" }]);
  });

  it("refuses a foreign origin and a missing origin", async () => {
    const port = await boot();
    expect((await connect(port, "http://evil.example")).opened).toBe(false);
    expect((await connect(port)).opened).toBe(false);
  });

  it("binds to loopback only", async () => {
    const port = await boot();
    expect(port).toBeGreaterThan(0);
    const net = await import("node:net");
    // An http server bound to 127.0.0.1 answers there.
    const ok = await new Promise<boolean>((res) => {
      const s = net.connect(port, "127.0.0.1", () => {
        s.destroy();
        res(true);
      });
      s.on("error", () => res(false));
    });
    expect(ok).toBe(true);
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./ptt-sidecar.ts", import.meta.url), "utf8");
    expect(src).toContain('"127.0.0.1"');
    expect(src).not.toContain("console.log");
  });
});
