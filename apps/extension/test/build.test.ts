import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { EXTENSION_ID, EXTENSION_PUBLIC_KEY } from "@blip/protocol";
import { isAllowedSocketUrl } from "../src/background/socket.js";

const manifestTemplate = JSON.parse(
  readFileSync(path.join(process.cwd(), "apps", "extension", "manifest.template.json"), "utf8"),
) as Record<string, unknown>;

describe("MV3 extension build inputs", () => {
  it("pins the extension identity and the minimal MV3 permissions", () => {
    expect(manifestTemplate["manifest_version"]).toBe(3);
    expect(manifestTemplate["minimum_chrome_version"]).toBe("116");
    expect(manifestTemplate["key"]).toBe("__EXTENSION_PUBLIC_KEY__");
    expect(EXTENSION_PUBLIC_KEY).toBeTruthy();
    expect(EXTENSION_ID).toBe("gipmmdbdhebfpfoabhdpkenijaljeclp");
    expect(manifestTemplate["permissions"]).toEqual(["tabs", "scripting", "alarms", "storage", "webNavigation"]);
    expect(manifestTemplate["host_permissions"]).toEqual(["<all_urls>"]);
    expect(manifestTemplate).not.toHaveProperty("externally_connectable");
    expect(manifestTemplate).not.toHaveProperty("web_accessible_resources");
  });

  it("injects into related frames and excludes Blip's own loopback pages", () => {
    const contentScripts = manifestTemplate["content_scripts"] as Array<Record<string, unknown>>;
    expect(contentScripts).toHaveLength(1);
    expect(contentScripts[0]).toMatchObject({
      all_frames: true,
      run_at: "document_idle",
      match_about_blank: true,
      match_origin_as_fallback: true,
    });
    expect(contentScripts[0]?.["exclude_matches"]).toEqual([
      "http://127.0.0.1:7777/*",
      "http://localhost:7777/*",
      "http://127.0.0.1:5173/*",
      "http://localhost:5173/*",
    ]);
  });

  it("accepts only explicit loopback test WebSocket URLs for /ws", () => {
    expect(isAllowedSocketUrl("ws://127.0.0.1:7777/ws")).toBe(true);
    expect(isAllowedSocketUrl("ws://127.0.0.1:43123/ws")).toBe(true);
    for (const value of [
      "ws://localhost:7777/ws",
      "wss://127.0.0.1:7777/ws",
      "ws://127.0.0.1/ws",
      "ws://127.0.0.1:0/ws",
      "ws://127.0.0.1:7777/other",
      "ws://127.0.0.1:7777/ws?x=1",
      "ws://example.com:7777/ws",
    ]) {
      expect(isAllowedSocketUrl(value), value).toBe(false);
    }
  });
});
