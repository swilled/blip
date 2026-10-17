// PROT-04 attack tests (roadmap success criterion 4). Real sockets, port 0, no mocks.
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXTENSION_ID, extensionOrigin } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { executeGatedAction } from "../src/act/gated";
import { LOG_KEYS, setLogSink } from "../src/log";
import type { Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";
import { startServer, type RunningServer, type StartServerOptions } from "../src/server";
import { bindClient, connect, originFor, sleep, type TestClient } from "./helpers";

const servers: RunningServer[] = [];
const clients: TestClient[] = [];

async function start(opts: StartServerOptions = {}): Promise<RunningServer> {
  const s = await startServer({ port: 0, ...opts });
  servers.push(s);
  return s;
}
async function open(s: RunningServer, origin: string | undefined, extra: { headers?: Record<string, string>; path?: string } = {}) {
  const c = await connect({ port: s.port, origin, ...extra });
  clients.push(c);
  return c;
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  for (const s of servers.splice(0)) await s.close();
});

/** Plain HTTP GET with an arbitrary Host header (fetch forbids overriding Host). */
function httpGet(port: number, path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("PROT-04 origin and role guard", () => {
  it("D-26: the server binds 127.0.0.1 only", async () => {
    const s = await start();
    const addr = s.httpServer.address();
    expect(addr).toMatchObject({ address: "127.0.0.1", family: "IPv4", port: s.port });
  });

  it("D-26: ordinary-page, wrong-port and null Origins get 403 before any frame is read", async () => {
    const s = await start();
    for (const origin of [
      "https://evil.example",
      "http://evil.example",
      `http://127.0.0.1:${s.port + 1}`,
      `http://127.0.0.1:${s.port}/`,
      `https://127.0.0.1:${s.port}`,
      "null",
      `chrome-extension://${"a".repeat(32)}`,
    ]) {
      const c = await open(s, origin);
      expect(c.status, `origin ${origin}`).toBe(403);
    }
    expect(s.session.extensionConnected).toBe(false);
  });

  it("D-26: a hello claiming extension from the voice Origin gets role-origin-mismatch then 4003, and the reverse likewise", async () => {
    const s = await start();

    const voiceAsExt = await open(s, originFor("voice", s.port));
    voiceAsExt.hello("extension");
    const e1 = await voiceAsExt.nextMessage();
    expect(e1.payload).toMatchObject({ code: "role-origin-mismatch", fatal: true });
    expect((await voiceAsExt.closed).code).toBe(4003);

    const extAsVoice = await open(s, extensionOrigin());
    extAsVoice.hello("voice");
    const e2 = await extAsVoice.nextMessage();
    expect(e2.payload).toMatchObject({ code: "role-origin-mismatch", fatal: true });
    expect((await extAsVoice.closed).code).toBe(4003);

    // Neither failed claim bound a role.
    expect(s.hub.send("voice", "earcon", { name: "done" })).toBe(false);
    expect(s.hub.send("extension", "highlight", { targetId: null })).toBe(false);
  });

  it("D-26: an utterance from an extension-role connection is refused with role-violation and no handler runs", async () => {
    const handler = vi.fn();
    const s = await start({ handlers: { utterance: handler } });
    const ext = await bindClient(s.port, "extension");
    clients.push(ext);
    const id = ext.send("utterance", { utteranceId: "u1", text: "submit the form", source: "typed" });
    const err = await ext.nextMessage();
    expect(err.payload).toMatchObject({ code: "role-violation", fatal: false });
    expect(err.replyTo).toBe(id);
    const doneId = ext.send("speak.done", { speakId: "untrusted-completion", interrupted: false });
    const doneErr = await ext.nextMessage();
    expect(doneErr.payload).toMatchObject({ code: "role-violation", fatal: false });
    expect(doneErr.replyTo).toBe(doneId);
    await sleep(50);
    expect(handler).not.toHaveBeenCalled();

    // Control: the same frame from the voice role does reach the handler.
    const voice = await bindClient(s.port, "voice");
    clients.push(voice);
    voice.send("utterance", { utteranceId: "u2", text: "describe the page", source: "typed" });
    await sleep(50);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ role: "voice" });
  });

  it("D-26: a rebound Host header is refused on upgrade and on HTTP, and no Origin is refused unless dev", async () => {
    const s = await start();
    const rebound = await open(s, originFor("voice", s.port), { headers: { Host: "evil.example" } });
    expect(rebound.status).toBe(403);
    const wrongPort = await open(s, originFor("voice", s.port), { headers: { Host: `127.0.0.1:${s.port + 1}` } });
    expect(wrongPort.status).toBe(403);

    expect((await httpGet(s.port, "/healthz", "evil.example")).status).toBe(403);
    expect((await httpGet(s.port, "/healthz", `127.0.0.1:${s.port}`)).status).toBe(200);
    // localhost is only a valid Host under --dev.
    expect((await httpGet(s.port, "/healthz", `localhost:${s.port}`)).status).toBe(403);

    expect((await open(s, undefined)).status).toBe(403);

    const dev = await start({ dev: true });
    expect((await httpGet(dev.port, "/healthz", `localhost:${dev.port}`)).status).toBe(200);
    for (const role of ["voice", "extension"] as const) {
      const c = await bindClient(dev.port, role, { origin: undefined });
      clients.push(c);
      expect(c.status).toBe(101);
    }
  });
});

describe("path, dev origins and extra origins", () => {
  it("a path other than /ws gets 404 on upgrade", async () => {
    const s = await start();
    const c = await open(s, originFor("voice", s.port), { path: "/other" });
    expect(c.status).toBe(404);
  });

  it("an unknown HTTP path gets 404", async () => {
    const s = await start();
    expect((await httpGet(s.port, "/nope", `127.0.0.1:${s.port}`)).status).toBe(404);
  });

  it("dev voice origins are accepted for voice when dev and rejected when not", async () => {
    const prod = await start();
    expect((await open(prod, "http://localhost:5173")).status).toBe(403);
    expect((await open(prod, `http://localhost:${prod.port}`)).status).toBe(403);

    const dev = await start({ dev: true });
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", `http://localhost:${dev.port}`]) {
      const c = await bindClient(dev.port, "voice", { origin });
      clients.push(c);
      expect(c.status, origin).toBe(101);
    }
  });

  it("a dev voice origin cannot claim the extension role", async () => {
    const dev = await start({ dev: true });
    const c = await open(dev, "http://localhost:5173");
    c.hello("extension");
    expect((await c.nextMessage()).payload.code).toBe("role-origin-mismatch");
    expect((await c.closed).code).toBe(4003);
  });

  it("a custom extraVoiceOrigins entry is accepted for voice only, and only under dev", async () => {
    const dev = await start({ dev: true, extraVoiceOrigins: ["http://localhost:4321"] });
    const ok = await bindClient(dev.port, "voice", { origin: "http://localhost:4321" });
    clients.push(ok);
    const bad = await open(dev, "http://localhost:4321");
    bad.hello("extension");
    expect((await bad.nextMessage()).payload.code).toBe("role-origin-mismatch");

    const prod = await start({ extraVoiceOrigins: ["http://localhost:4321"] });
    expect((await open(prod, "http://localhost:4321")).status).toBe(403);
  });

  it("the pinned extension id is the only extension origin", async () => {
    const s = await start();
    expect(extensionOrigin()).toBe(`chrome-extension://${EXTENSION_ID}`);
    const good = await bindClient(s.port, "extension");
    clients.push(good);
    expect(good.status).toBe(101);
    const other = await open(s, `chrome-extension://${"b".repeat(32)}`);
    expect(other.status).toBe(403);
  });

  it("frames are not read from a connection whose upgrade was refused", async () => {
    const s = await start();
    const c = await open(s, "https://evil.example");
    expect(c.status).toBe(403);
    expect(c.frames).toEqual([]);
  });
});

describe("gated audit privacy", () => {
  it("records a refusal with only sanitized kind, target, outcome, and reason fields", async () => {
    const snapshot = loadSnapshot("booking");
    const session = new Session("fake", () => 10_000);
    session.extensionConnected = true;
    session.applySnapshot(snapshot);
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    const hub = {
      send: vi.fn(() => true),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = { request: vi.fn(async () => ({ ok: true, applied: true, snapshot } as const)) };
    try {
      await executeGatedAction(
        { hub, session, refresher, clock: () => 10_000 },
        { type: "request_action", actionId: "missing-target" },
      );

      const entry = JSON.parse(lines.at(-1)!) as Record<string, string>;
      expect(entry).toMatchObject({ msg: "gated action refused", id: "missing-target", code: "target-not-found" });
      expect(Object.keys(entry).every((key) => (LOG_KEYS as readonly string[]).includes(key))).toBe(true);
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(snapshot.url);
      expect(serialized).not.toContain(buildBaselineFormModel(snapshot).title);
      expect(serialized).not.toContain("Full name");
      expect(serialized).not.toContain("submit survey");
    } finally {
      setLogSink(previous);
    }
  });
});
