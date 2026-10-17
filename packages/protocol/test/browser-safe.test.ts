import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The package index is bundled for the browser (the extension and the voice page), so no source file
// may import a Node builtin. The fixtures loader is a separate subpath that tests and tools use.
const SRC = new URL("../src/", import.meta.url);
const files = readdirSync(SRC).filter((f) => f.endsWith(".ts") && f !== "fixtures-loader.ts");

describe("@blip/protocol is browser-safe", () => {
  it("scans a non-trivial set of source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s imports nothing from node:", (file) => {
    const text = readFileSync(new URL(file, SRC), "utf8");
    const specifiers = [
      ...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
      ...text.matchAll(/require\s*\(\s*["']([^"']+)["']/g),
    ].map((m) => m[1]!);
    expect(specifiers.filter((s) => s.startsWith("node:"))).toEqual([]);
  });

  it("does not re-export the fixtures loader from the index", () => {
    expect(readFileSync(new URL("index.ts", SRC), "utf8")).not.toMatch(/fixtures/);
  });
});
