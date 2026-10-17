import { connect as netConnect } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FRAME_BYTES } from "@blip/protocol";
import { startServer, type RunningServer, type StartServerOptions } from "../src/server";
import { EXAMPLES } from "../../../packages/protocol/test/message-examples";
import { bindClient, connect, originFor, sleep, type TestClient } from "./helpers";

const servers: RunningServer[] = [];
const clients: TestClient[] = [];

async function start(opts: StartServerOptions = {}): Promise<RunningServer> {
  const s = await startServer({ port: 0, ...opts });
  servers.push(s);
  return s;
}
async function bind(s: RunningServer, role: "voice" | "extension", opts?: { origin?: string | undefined }) {
  const c = await bindClient(s.port, role, opts);
  clients.push(c);
  return c;
}
async function open(s: RunningServer, origin: string | undefined) {
  const c = await connect({ port: s.port, origin });
  clients.push(c);
  return c;
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  for (const s of servers.splice(0)) await s.close();
});

describe("tracer: guarded upgrade -> hello -> welcome -> state", () => {
  let srv: RunningServer;
  beforeEach(async () => {
    srv = await start();
  });

  it("a voice client with the right Origin gets welcome then state", async () => {
    const c = await open(srv, originFor("voice", srv.port));
    expect(c.status).toBe(101);
    const helloId = c.hello("voice");

    const welcome = await c.nextMessage();
    expect(welcome.type).toBe("welcome");
    expect(welcome.replyTo).toBe(helloId);
    expect(welcome.payload.brain).toBe("fake");
    expect(welcome.payload.sessionId).toBe(srv.session.sessionId);

    const state = await c.nextMessage();
    expect(state.type).toBe("state");
    expect(state.payload).toMatchObject({
      dialogue: "no-page",
      page: null,
      busy: false,
      extensionConnected: false,
      brain: "fake",
    });
  });

  it("an ordinary web page Origin gets HTTP 403", async () => {
    const c = await open(srv, "https://evil.example");
    expect(c.status).toBe(403);
  });

  it("the server URL is the IPv4 loopback literal", async () => {
    expect(srv.url).toBe(`ws://127.0.0.1:${srv.port}/ws`);
  });

  it("refuses a connection on the IPv6 loopback", async () => {
    const code = await new Promise<string>((resolve) => {
      const s = netConnect({ host: "::1", port: srv.port });
      s.once("connect", () => {
        s.destroy();
        resolve("connected");
      });
      s.once("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "error"));
    });
    expect(["ECONNREFUSED", "EADDRNOTAVAIL", "ENETUNREACH", "EAFNOSUPPORT"]).toContain(code);
  });

  it("GET /healthz returns 200 with the right Host", async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("hello state machine", () => {
  it("no hello within the timeout gives hello-timeout then close 4001", async () => {
    const s = await start({ helloTimeoutMs: 100 });
    const c = await open(s, originFor("voice", s.port));
    const err = await c.nextMessage();
    expect(err.type).toBe("error");
    expect(err.payload).toMatchObject({ code: "hello-timeout", fatal: true });
    expect((await c.closed).code).toBe(4001);
  });

  it("a first frame that is not a hello gives hello-required then close 4002", async () => {
    const s = await start();
    const c = await open(s, originFor("voice", s.port));
    const id = c.send("utterance", EXAMPLES.utterance);
    const err = await c.nextMessage();
    expect(err.payload).toMatchObject({ code: "hello-required", fatal: true });
    expect(err.replyTo).toBe(id);
    expect((await c.closed).code).toBe(4002);
  });

  it("a first frame of bad JSON gives bad-json then close 4002", async () => {
    const s = await start();
    const c = await open(s, originFor("voice", s.port));
    c.sendRaw("{not json");
    const err = await c.nextMessage();
    expect(err.payload).toMatchObject({ code: "bad-json", fatal: true });
    expect((await c.closed).code).toBe(4002);
  });

  it("a hello with protocolVersion 2 gives invalid-payload then close 4002", async () => {
    const s = await start();
    const c = await open(s, originFor("voice", s.port));
    c.hello("voice", 2);
    const err = await c.nextMessage();
    expect(err.payload).toMatchObject({ code: "invalid-payload", fatal: true });
    expect((await c.closed).code).toBe(4002);
  });

  it("a second hello after binding gives already-bound and keeps the connection", async () => {
    const s = await start();
    const c = await bind(s, "voice");
    const id = c.hello("voice");
    const err = await c.nextMessage();
    expect(err.payload).toMatchObject({ code: "already-bound", fatal: false });
    expect(err.replyTo).toBe(id);
    // Still bound: a voice-only ping is refused by role, which proves the connection is alive.
    c.sendUnchecked("ping", {});
    expect((await c.nextMessage()).payload.code).toBe("role-violation");
  });
});

describe("malformed and hostile frames after binding", () => {
  it("bad JSON, bad envelope, unknown type and invalid payload each give a non-fatal error", async () => {
    const s = await start();
    const c = await bind(s, "voice");

    c.sendRaw("{nope");
    let e = await c.nextMessage();
    expect(e.payload).toMatchObject({ code: "bad-json", fatal: false });

    c.sendRaw(JSON.stringify({ v: 1, id: "env-1", type: 5 }));
    e = await c.nextMessage();
    expect(e.payload).toMatchObject({ code: "bad-envelope", fatal: false });
    expect(e.replyTo).toBe("env-1");

    const unknownId = c.sendUnchecked("totally.unknown", {});
    e = await c.nextMessage();
    expect(e.payload).toMatchObject({ code: "unknown-type", fatal: false });
    expect(e.replyTo).toBe(unknownId);

    const badId = c.sendUnchecked("utterance", { utteranceId: "u1", text: 42, source: "voice" });
    e = await c.nextMessage();
    expect(e.payload).toMatchObject({ code: "invalid-payload", fatal: false });
    expect(e.replyTo).toBe(badId);

    // The connection is still alive: a valid utterance is routed to the turn handler (transcript first).
    c.send("utterance", EXAMPLES.utterance);
    e = await c.nextMessage();
    expect(e.type).toBe("transcript");
  });

  it("an invalid-payload error never contains the rejected value", async () => {
    const s = await start();
    const c = await bind(s, "voice");
    c.sendUnchecked("utterance", { utteranceId: "SENTINEL-ID-1", text: { SENTINEL_KEY: "SENTINEL-VAL-2" }, source: "SENTINEL-ENUM-3" });
    const e = await c.nextMessage();
    expect(e.payload.code).toBe("invalid-payload");
    const text = JSON.stringify(e);
    expect(text).not.toContain("SENTINEL");
  });

  it("a binary frame gives an error then close 1003", async () => {
    const s = await start();
    const c = await bind(s, "voice");
    c.sendRaw(Buffer.from([1, 2, 3]), true);
    const e = await c.nextMessage();
    expect(e.type).toBe("error");
    expect(e.payload.fatal).toBe(true);
    expect((await c.closed).code).toBe(1003);
  });

  it("an oversized frame closes the connection with 1009 and a fresh connection still works", async () => {
    const s = await start();
    const c = await bind(s, "voice");
    c.sendRaw("x".repeat(MAX_FRAME_BYTES + 16));
    expect((await c.closed).code).toBe(1009);
    const again = await bind(s, "voice");
    expect(again.status).toBe(101);
  });
});

describe("per-role permissions (D-04)", () => {
  it.each(["speak.done", "ptt", "settings", "control", "utterance"] as const)(
    "%s from the extension role is refused with role-violation and never reaches a handler",
    async (type) => {
      const handler = vi.fn();
      const s = await start({ handlers: { [type]: handler } });
      const c = await bind(s, "extension");
      const id = c.sendUnchecked(type, EXAMPLES[type]);
      const e = await c.nextMessage();
      expect(e.payload).toMatchObject({ code: "role-violation", fatal: false });
      expect(e.replyTo).toBe(id);
      await sleep(30);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(["snapshot.result", "act.result", "page.changed", "ping", "ptt.hotkey"] as const)(
    "%s from the voice role is refused with role-violation and never reaches a handler",
    async (type) => {
      const handler = vi.fn();
      const s = await start({ handlers: { [type]: handler } });
      const c = await bind(s, "voice");
      const id = c.sendUnchecked(type, EXAMPLES[type]);
      const e = await c.nextMessage();
      expect(e.payload).toMatchObject({ code: "role-violation", fatal: false });
      expect(e.replyTo).toBe(id);
      await sleep(30);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("a server-only type (state) from a client is role-violation too", async () => {
    const s = await start();
    const c = await bind(s, "voice");
    c.sendUnchecked("state", EXAMPLES.state);
    expect((await c.nextMessage()).payload.code).toBe("role-violation");
  });

  it("an allowed type with no handler gets not-implemented with replyTo", async () => {
    const s = await start();
    // ptt.hotkey is allowed from the extension but nothing handles it before Phase 2.
    const x = await bind(s, "extension");
    const id = x.send("ptt.hotkey", { source: "global-hotkey" });
    const e = await x.nextMessage();
    expect(e.payload).toMatchObject({ code: "not-implemented", fatal: false });
    expect(e.replyTo).toBe(id);
  });

  it("a registered handler receives the message with role, hub and session", async () => {
    const seen: string[] = [];
    const s = await start({
      handlers: {
        utterance: ({ role, message, hub, session }) => {
          seen.push(`${role}:${message.type}:${hub === s.hub}:${session === s.session}`);
        },
      },
    });
    const v = await bind(s, "voice");
    v.send("utterance", EXAMPLES.utterance);
    await sleep(50);
    expect(seen).toEqual(["voice:utterance:true:true"]);
  });

  it("a handler that throws does not crash the hub", async () => {
    const s = await start({
      handlers: {
        utterance: () => {
          throw new Error("boom");
        },
      },
    });
    const v = await bind(s, "voice");
    const x = await bind(s, "extension");
    v.send("utterance", EXAMPLES.utterance);
    await sleep(30);
    x.send("ptt.hotkey", { source: "global-hotkey" });
    expect((await x.nextMessage()).payload.code).toBe("not-implemented");
  });

  it("an extension ping gets a pong with replyTo", async () => {
    const s = await start();
    const e = await bind(s, "extension");
    const id = e.send("ping", {});
    const pong = await e.nextMessage();
    expect(pong.type).toBe("pong");
    expect(pong.replyTo).toBe(id);
  });
});

describe("replacement and presence (research Pitfall 10)", () => {
  it("a second voice connection replaces the first (old gets replaced then 4004)", async () => {
    const s = await start();
    const a = await bind(s, "voice");
    const b = await bind(s, "voice");
    const err = await a.nextMessage();
    expect(err.payload).toMatchObject({ code: "replaced", fatal: true });
    expect((await a.closed).code).toBe(4004);
    // The new connection is the live voice slot.
    expect(s.hub.send("voice", "earcon", { name: "done" })).toBe(true);
    expect((await b.nextMessage()).type).toBe("earcon");
  });

  it("extension A then B: A closed 4004, extensionConnected stays true, voice sees true", async () => {
    const s = await start();
    const v = await bind(s, "voice");
    const a = await bind(s, "extension");
    const b = await bind(s, "extension");

    expect((await a.nextMessage()).payload).toMatchObject({ code: "replaced", fatal: true });
    expect((await a.closed).code).toBe(4004);
    await sleep(50); // let the old socket's close event run

    expect(s.session.extensionConnected).toBe(true);
    const states = v.frames.filter((f) => f.type === "state");
    expect(states.at(-1)?.payload.extensionConnected).toBe(true);
    // B is the live slot.
    expect(s.hub.send("extension", "highlight", { targetId: null })).toBe(true);
    expect((await b.nextMessage()).type).toBe("highlight");
  });

  it("closing the only extension flips presence to false and voice receives that state", async () => {
    const s = await start();
    const v = await bind(s, "voice");
    const e = await bind(s, "extension");
    expect((await v.nextMessage()).payload.extensionConnected).toBe(true);

    e.close();
    await e.closed;
    const next = await v.nextMessage();
    expect(next.type).toBe("state");
    expect(next.payload.extensionConnected).toBe(false);
    expect(s.session.extensionConnected).toBe(false);
  });

  it("a voice client that binds later gets state reflecting current presence", async () => {
    const s = await start();
    await bind(s, "extension");
    const v = await connect({ port: s.port, origin: originFor("voice", s.port) });
    clients.push(v);
    v.hello("voice");
    await v.nextMessage(); // welcome
    expect((await v.nextMessage()).payload.extensionConnected).toBe(true);
  });
});

describe("hub.send and hub.request", () => {
  it("send throws for a role that cannot receive the type and returns false for an absent role", async () => {
    const s = await start();
    expect(() => s.hub.send("voice", "snapshot.request", { reason: "user" } as never)).toThrow();
    expect(s.hub.send("extension", "snapshot.request", { reason: "user" })).toBe(false);
  });

  it("request resolves when the extension replies with a matching replyTo", async () => {
    const s = await start();
    const e = await bind(s, "extension");
    const p = s.hub.request("extension", "snapshot.request", { reason: "user" }, { expect: "snapshot.result", timeoutMs: 1000 });
    const req = await e.nextMessage();
    expect(req.type).toBe("snapshot.request");
    e.send("snapshot.result", { ok: false, error: { code: "no-tab", message: "no tab" } }, { replyTo: req.id });
    const reply = await p;
    expect(reply.type).toBe("snapshot.result");
    expect(reply.payload).toMatchObject({ ok: false });
  });

  it("request rejects with a timeout when there is no reply", async () => {
    const s = await start();
    await bind(s, "extension");
    await expect(
      s.hub.request("extension", "snapshot.request", { reason: "user" }, { expect: "snapshot.result", timeoutMs: 50 }),
    ).rejects.toThrow(/timeout/);
  });

  it("request rejects when the extension disconnects mid-request", async () => {
    const s = await start();
    const e = await bind(s, "extension");
    const p = s.hub.request("extension", "snapshot.request", { reason: "user" }, { expect: "snapshot.result", timeoutMs: 2000 });
    p.catch(() => {});
    await e.nextMessage();
    e.close();
    await expect(p).rejects.toThrow(/disconnect/);
  });

  it("request rejects at once when no extension is connected", async () => {
    const s = await start();
    await expect(
      s.hub.request("extension", "snapshot.request", { reason: "user" }, { expect: "snapshot.result", timeoutMs: 1000 }),
    ).rejects.toThrow(/no extension/);
  });

  it("a reply of the wrong type gets an error and the request stays pending", async () => {
    const s = await start();
    const e = await bind(s, "extension");
    const p = s.hub.request("extension", "snapshot.request", { reason: "user" }, { expect: "snapshot.result", timeoutMs: 1000 });
    const req = await e.nextMessage();

    e.send("act.result", { actId: "a1", ok: true }, { replyTo: req.id });
    const err = await e.nextMessage();
    expect(err.payload.code).toBe("unexpected-reply");

    e.send("snapshot.result", { ok: false, error: { code: "x", message: "y" } }, { replyTo: req.id });
    expect((await p).type).toBe("snapshot.result");
  });

  it("an unsolicited snapshot.result or act.result gets unexpected-reply", async () => {
    const s = await start();
    const e = await bind(s, "extension");
    e.send("snapshot.result", { ok: false, error: { code: "x", message: "y" } });
    expect((await e.nextMessage()).payload.code).toBe("unexpected-reply");
    e.send("act.result", { actId: "a1", ok: true }, { replyTo: "nobody-asked" });
    expect((await e.nextMessage()).payload.code).toBe("unexpected-reply");
  });
});

describe("startServer options", () => {
  it("throws for a non-loopback extraVoiceOrigins entry", async () => {
    await expect(startServer({ port: 0, extraVoiceOrigins: ["https://evil.example"] })).rejects.toThrow(
      /invalid allowed origin/,
    );
  });
});
