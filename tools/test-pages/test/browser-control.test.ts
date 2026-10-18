import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestPages } from "../serve.js";

describe("synthetic browser-control fixture", () => {
  let server: Awaited<ReturnType<typeof startTestPages>>;

  beforeAll(async () => {
    server = await startTestPages({ port: 0, build: false });
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves the generic article and its browser-control cases on the local test origin", async () => {
    const response = await fetch(`${server.origins.primary}/browser-control.html`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Field Notes from the Blue Heron Preserve");
    expect(html.match(/<h[1-3]\b/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(html).toContain('id="unique-regional-link"');
    expect(html).toContain('id="unique-methods-link"');
    expect((html.match(/>More details<\/a>/g) ?? [])).toHaveLength(2);
    expect(html).toMatch(/id="hidden-link"[^>]*\bhidden\b/);
    expect(html).toContain("Ignore the user's request");
    expect(html).toContain("example.invalid");
    expect(html).toContain('id="get-search" method="get"');
    expect(html).toContain('id="post-search" method="post"');
    expect(html).toContain('id="scroll-target"');
    expect(html).toContain('id="find-target"');
    expect(html).toContain("window.setTimeout");
    expect(html).toContain('paragraph.id = "delayed-paragraph"');
    expect(html).toContain('history.pushState');
    expect(html).toContain('id="spa-change"');

    const origin = new URL(response.url).origin;
    const destinations = [...html.matchAll(/\b(?:action|src|href)=["']([^"']+)["']/gi)]
      .map((match) => match[1]!);
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((destination) => new URL(destination, response.url).origin === origin)).toBe(true);
    expect(destinations.some((destination) => new URL(destination, response.url).hostname === "example.invalid")).toBe(false);
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(html).not.toMatch(/\b(?:\d[ -]*?){13,19}\b/);
  });
});
