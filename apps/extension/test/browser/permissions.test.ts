import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "manifest.template.json"), "utf8"),
) as Record<string, unknown>;

describe("browser-default search permission", () => {
  it("declares only the search API permission and keeps the Chrome 116 minimum", () => {
    expect(manifest["minimum_chrome_version"]).toBe("116");
    expect(manifest["permissions"]).toEqual(["tabs", "scripting", "alarms", "storage", "webNavigation", "search"]);
  });
});
