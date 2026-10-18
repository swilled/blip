import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server";

let root: string;
let outside: string;
let srv: RunningServer | undefined;

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), "blip-static-"));
  root = join(base, "site");
  outside = join(base, "secret.txt");
  mkdirSync(join(root, "sub"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<h1>home</h1>");
  writeFileSync(join(root, "sub", "page.html"), "<p>sub page</p>");
  writeFileSync(outside, "TOP-SECRET-OUTSIDE-ROOT");
});
afterEach(async () => {
  await srv?.close();
  srv = undefined;
  rmSync(join(root, ".."), { recursive: true, force: true });
});

function get(port: number, path: string, host = `127.0.0.1:${port}`): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, type: String(res.headers["content-type"] ?? "") }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("static serving (D-02)", () => {
  it("keeps the process build identity separate from mutable static files", async () => {
    srv = await startServer({ port: 0, voiceBuildId: "started-build", staticRoots: [{ urlPrefix: "/", dir: root }] });
    writeFileSync(join(root, "blip-build.json"), JSON.stringify({ id: "later-build" }));
    expect(JSON.parse((await get(srv.port, "/_blip/voice-runtime")).body)).toEqual({ buildId: "started-build" });
    expect((await get(srv.port, "/_blip/voice-runtime", "evil.example")).status).toBe(403);
  });
  it("serves a file, 404s a missing file and keeps /healthz ahead of static roots", async () => {
    srv = await startServer({ port: 0, staticRoots: [{ urlPrefix: "/", dir: root }] });
    const page = await get(srv.port, "/sub/page.html");
    expect(page.status).toBe(200);
    expect(page.body).toBe("<p>sub page</p>");
    expect(page.type).toContain("text/html");

    expect((await get(srv.port, "/")).body).toBe("<h1>home</h1>");
    expect((await get(srv.port, "/missing.html")).status).toBe(404);

    writeFileSync(join(root, "healthz"), "shadow");
    const health = await get(srv.port, "/healthz");
    expect(JSON.parse(health.body)).toEqual({ ok: true });
  });

  it("serves a prefixed root and prefers the longest prefix", async () => {
    srv = await startServer({
      port: 0,
      staticRoots: [
        { urlPrefix: "/", dir: root },
        { urlPrefix: "/fixtures/forms", dir: join(root, "sub") },
      ],
    });
    const prefixed = await get(srv.port, "/fixtures/forms/page.html");
    expect(prefixed.status).toBe(200);
    expect(prefixed.body).toBe("<p>sub page</p>");
    // The prefix is not a substring match: /fixtures/formsX is not served from the prefixed root.
    expect((await get(srv.port, "/fixtures/formsX/page.html")).status).toBe(404);
  });

  it("a bad Host header gets 403 for static files too", async () => {
    srv = await startServer({ port: 0, staticRoots: [{ urlPrefix: "/", dir: root }] });
    expect((await get(srv.port, "/index.html", "evil.example")).status).toBe(403);
  });

  it("does not return a file outside the root for traversal attempts", async () => {
    srv = await startServer({ port: 0, staticRoots: [{ urlPrefix: "/", dir: join(root, "sub") }] });
    for (const path of [
      "/../secret.txt",
      "/..%2f..%2fsecret.txt",
      "/%2e%2e/%2e%2e/secret.txt",
      "/%2e%2e%2f%2e%2e%2fsecret.txt",
      "/..\\..\\secret.txt",
      "/sub/../../secret.txt",
    ]) {
      const r = await get(srv.port, path);
      expect(r.body, path).not.toContain("TOP-SECRET-OUTSIDE-ROOT");
      expect([400, 403, 404], path).toContain(r.status);
    }
  });

  it("with no static roots only /healthz exists", async () => {
    srv = await startServer({ port: 0 });
    expect((await get(srv.port, "/index.html")).status).toBe(404);
    expect((await get(srv.port, "/healthz")).status).toBe(200);
  });
});
