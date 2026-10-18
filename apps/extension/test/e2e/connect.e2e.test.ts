// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import { resolveBrowser } from "../../../../scripts/browser.js";
import { runConnectionSmoke } from "./harness.js";

describe("browser discovery", () => {
  it("lets BLIP_BROWSER override all discovery", () => {
    expect(resolveBrowser({ env: { BLIP_BROWSER: "C:\\test\\browser.exe" }, exists: () => false })).toBe(
      "C:\\test\\browser.exe",
    );
  });

  it("checks Chrome before Edge and falls back to Edge", () => {
    const env = {
      ProgramFiles: "C:\\pf",
      "ProgramFiles(x86)": "C:\\pfx86",
      LOCALAPPDATA: "C:\\local",
    };
    const checked: string[] = [];
    const browser = resolveBrowser({
      env,
      exists: (candidate) => {
        checked.push(candidate);
        return candidate === "C:\\pf\\Microsoft\\Edge\\Application\\msedge.exe";
      },
    });
    expect(browser).toBe("C:\\pf\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(checked[0]).toBe("C:\\pf\\Google\\Chrome\\Application\\chrome.exe");
    expect(checked.at(-1)).toBe("C:\\pf\\Microsoft\\Edge\\Application\\msedge.exe");
  });
});

describe("production-origin extension connection", () => {
  const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
  it.skipIf(!enabled)("binds a real browser service worker with the pinned extension origin", async () => {
    const result = await runConnectionSmoke();
    expect(result.extensionOrigin).toBe("chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp");
    expect(result.log).toContain('"msg":"connection bound"');
    expect(result.log).toContain('"role":"extension"');
  }, 35_000);
});
