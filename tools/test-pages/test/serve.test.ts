import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { startTestPages } from "../serve.js";

describe("test page host", () => {
  const fixtureName = `serve-test-${process.pid}-${Date.now()}.html`;
  const fixturePath = path.resolve("tools/test-pages/public", fixtureName);
  const distName = `serve-test-${process.pid}-${Date.now()}.txt`;
  const distPath = path.resolve("tools/test-pages/dist", distName);
  let server: Awaited<ReturnType<typeof startTestPages>>;
  let spaFixtureCreated = false;
  let rootDir = "";

  beforeAll(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "blip-test-pages-"));
    server = await startTestPages({ port: 0, build: false });
  });

  afterAll(async () => {
    await server.close();
    await Promise.all([
      rm(fixturePath, { force: true }),
      rm(distPath, { force: true }),
      ...(spaFixtureCreated
        ? [rm(path.resolve("tools/test-pages/public/spa.html"), { force: true })]
        : []),
      rm(rootDir, { recursive: true, force: true }),
    ]);
  });

  it("binds only loopback addresses and serves files added after startup inside public/dist", async () => {
    expect(server.origins.primary).toBe(`http://127.0.0.1:${server.port}`);
    expect(server.origins.alternate).toBe(`http://localhost:${server.port}`);
    expect(server.origins.all).toContain(server.origins.primary);

    const missing = await fetch(`${server.origins.primary}/${fixtureName}`);
    expect(missing.status).toBe(404);

    await writeFile(fixturePath, "ORIGIN|ALT_ORIGIN", "utf8");
    const publicResponse = await fetch(`${server.origins.primary}/${fixtureName}`);
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.text()).toBe(`${server.origins.primary}|${server.origins.alternate}`);

    await writeFile(distPath, "built fixture", "utf8");
    const distResponse = await fetch(`${server.origins.primary}/${distName}`);
    expect(distResponse.status).toBe(200);
    expect(await distResponse.text()).toBe("built fixture");
  });

  it("routes /spa paths to the SPA fixture and generates the large page", async () => {
    const spaPath = path.resolve("tools/test-pages/public/spa.html");
    try {
      await readFile(spaPath);
    } catch {
      await writeFile(spaPath, "spa fixture sentinel", "utf8");
      spaFixtureCreated = true;
    }

    const spa = await fetch(`${server.origins.primary}/spa/step-two`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain(spaFixtureCreated ? "spa fixture sentinel" : "<!doctype html>");

    const large = await fetch(`${server.origins.primary}/large.html`);
    const html = await large.text();
    expect(large.status).toBe(200);
    expect((html.match(/<input\b/g) ?? [])).toHaveLength(300);
    expect((html.match(/<a\b/g) ?? [])).toHaveLength(60);
  });

  it.each([
    ["literal traversal", "/../package.json"],
    ["encoded traversal", "/%2e%2e/package.json"],
    ["encoded slash traversal", "/%2e%2e%2fpackage.json"],
    ["encoded backslash", "/%5c..%5cpackage.json"],
    ["encoded NUL", "/%00package.json"],
  ])("rejects %s", async (_name, requestPath) => {
    const response = await rawRequest(server.port, requestPath);
    expect([400, 403]).toContain(response.status);
  });

  it("accepts bounded JSON reports and returns only the 500 newest records", async () => {
    server.clearReports();
    for (let index = 0; index < 502; index += 1) {
      const response = await fetch(`${server.origins.primary}/__report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: index % 2 === 0 ? "even" : "odd", index }),
      });
      expect(response.status).toBe(204);
    }

    const all = await fetch(`${server.origins.primary}/__reports`);
    const records = (await all.json()) as Array<{ page: string; index: number }>;
    expect(all.status).toBe(200);
    expect(records).toHaveLength(500);
    expect(records[0]?.index).toBe(501);
    expect(records.at(-1)?.index).toBe(2);

    const filtered = await fetch(`${server.origins.primary}/__reports?page=odd`);
    const oddRecords = (await filtered.json()) as Array<{ page: string; index: number }>;
    expect(oddRecords.every((record) => record.page === "odd")).toBe(true);
    expect(oddRecords[0]?.index).toBe(501);
    expect(server.reports).toHaveLength(500);
  });

  it("rejects invalid JSON and bodies larger than 64 KB", async () => {
    const invalid = await fetch(`${server.origins.primary}/__report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    expect(invalid.status).toBe(400);

    const oversized = await fetch(`${server.origins.primary}/__report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(65_536) }),
    });
    expect(oversized.status).toBe(413);
  });
});

function rawRequest(port: number, requestPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: requestPath, method: "GET" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (body += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on("error", reject);
    request.end();
  });
}
