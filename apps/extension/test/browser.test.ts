import { describe, expect, it } from "vitest";
import { resolveBrowser } from "../../../scripts/browser.js";

describe("real browser selection", () => {
  it("honors BLIP_BROWSER for isolated extension runs", () => {
    expect(resolveBrowser({ env: { BLIP_BROWSER: "C:\\Browser\\edge.exe" }, exists: () => false })).toBe(
      "C:\\Browser\\edge.exe",
    );
  });

  it("uses Chrome when installed and falls back to Edge", () => {
    const env = {
      ProgramFiles: "C:\\pf",
      "ProgramFiles(x86)": "C:\\pfx86",
      LOCALAPPDATA: "C:\\local",
    };
    const chrome = resolveBrowser({ env, exists: (candidate) => candidate === "C:\\pf\\Google\\Chrome\\Application\\chrome.exe" });
    const edge = resolveBrowser({ env, exists: (candidate) => candidate === "C:\\pf\\Microsoft\\Edge\\Application\\msedge.exe" });

    expect(chrome).toBe("C:\\pf\\Google\\Chrome\\Application\\chrome.exe");
    expect(edge).toBe("C:\\pf\\Microsoft\\Edge\\Application\\msedge.exe");
  });
});
