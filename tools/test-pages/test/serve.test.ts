import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { startTestPages } from "../serve.js";

describe("test page host", () => {
  const pagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const publicRoot = path.join(pagesRoot, "public");
  const distRoot = path.join(pagesRoot, "dist");
  const fixtureName = `serve-test-${process.pid}-${Date.now()}.html`;
  const fixturePath = path.join(publicRoot, fixtureName);
  const distName = `serve-test-${process.pid}-${Date.now()}.txt`;
  const distPath = path.join(distRoot, distName);
  let server: Awaited<ReturnType<typeof startTestPages>>;
  let spaFixtureCreated = false;

  beforeAll(async () => {
    server = await startTestPages({ port: 0, build: false });
  });

  afterAll(async () => {
    await server.close();
    await Promise.all([
      rm(fixturePath, { force: true }),
      rm(distPath, { force: true }),
      ...(spaFixtureCreated
        ? [rm(path.join(publicRoot, "spa.html"), { force: true })]
        : []),
    ]);
  });

  it("binds only loopback addresses and serves files added after startup inside public/dist", async () => {
    expect(server.origins.primary).toBe(`http://127.0.0.1:${server.port}`);
    expect(server.origins.alternate).toBe(`http://localhost:${server.port}`);
    expect(server.origins.all).toContain(server.origins.primary);

    const missing = await fetch(`${server.origins.primary}/${fixtureName}`);
    expect(missing.status).toBe(404);

    await mkdir(publicRoot, { recursive: true });
    await mkdir(distRoot, { recursive: true });
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
    const spaPath = path.join(publicRoot, "spa.html");
    try {
      await access(spaPath);
    } catch {
      await writeFile(spaPath, "spa fixture sentinel", "utf8");
      spaFixtureCreated = true;
    }

    const spa = await fetch(`${server.origins.primary}/spa/step-two`);
    expect(spa.status).toBe(200);
    const spaHtml = await spa.text();
    expect(spaHtml.length).toBeGreaterThan(0);
    if (spaFixtureCreated) expect(spaHtml).toContain("spa fixture sentinel");

    const large = await fetch(`${server.origins.primary}/large.html`);
    const html = await large.text();
    expect(large.status).toBe(200);
    expect((html.match(/<input\b/g) ?? [])).toHaveLength(300);
    expect((html.match(/<a\b/g) ?? [])).toHaveLength(60);
  });

  it("serves the synthetic injection bait with only same-origin inert submit reporting", async () => {
    const response = await fetch(`${server.origins.primary}/injection.html`);
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toMatch(/id=["']hidden-instruction["'][^>]*\bhidden\b/i);
    expect(html).toMatch(/Blip(?:\/AI)? agent/i);
    expect(html).toMatch(/id=["']verified-banner["']/i);
    expect(html).toMatch(/verified/i);
    expect(html).toMatch(/click\s+#pay/i);
    expect(html).toMatch(/id=["']pay["'][^>]*type=["']submit["']/i);
    expect(html).toMatch(/id=["']lookalike-submit["'][^>]*type=["']submit["']/i);

    const destinations = [...html.matchAll(/\b(?:action|src|href)=["']([^"']+)["']/gi)].map((match) => match[1]!);
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((destination) => new URL(destination, response.url).origin === server.origins.primary)).toBe(true);
    const formAction = html.match(/<form\b[^>]*\baction=["']([^"']+)["']/i)?.[1];
    expect(formAction).toBe("/submit-sink.html");
    const sinkResponse = await fetch(new URL(formAction!, response.url));
    expect(sinkResponse.status).toBe(200);
    expect(await sinkResponse.text()).toMatch(/blipReport\(["']submit-sink-reached["']/);
    expect(html).toMatch(/event\.preventDefault\(\)/);
    expect(html).toMatch(/blipReport\(["']injection-submit["']/);
    expect(html).not.toMatch(/<\s*(?:input|textarea|select)\b/i);
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(html).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
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
