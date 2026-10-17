import { connect as netConnect } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server";
import { connect } from "./helpers";

let srv: RunningServer;

beforeEach(async () => {
  srv = await startServer({ port: 0 });
});
afterEach(async () => {
  await srv.close();
});

const voiceOrigin = () => `http://127.0.0.1:${srv.port}`;

describe("tracer: guarded upgrade -> hello -> welcome -> state", () => {
  it("a voice client with the right Origin gets welcome then state", async () => {
    const c = await connect({ port: srv.port, origin: voiceOrigin() });
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
    c.close();
  });

  it("an ordinary web page Origin gets HTTP 403", async () => {
    const c = await connect({ port: srv.port, origin: "https://evil.example" });
    expect(c.status).toBe(403);
  });

  it("the HTTP listener is bound to 127.0.0.1", async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    expect(res.status).toBe(200);
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
    expect(await res.json()).toEqual({ ok: true });
  });
});
