import { describe, expect, it } from "vitest";
import {
  browserLaunchArgs,
  classifyExtensionReadiness,
  demoProfilePath,
  parseDemoArgs,
  resolveVoiceTarget,
  waitForExtensionReady,
} from "./demo.js";

describe("local demo launcher inputs", () => {
  it("defaults to the offline fake brain and supports an explicit smoke run", () => {
    expect(parseDemoArgs([])).toEqual({ brain: "fake", smoke: false });
    expect(parseDemoArgs(["--brain=fake", "--smoke"])).toEqual({ brain: "fake", smoke: true });
    expect(parseDemoArgs(["--brain=claude"])).toEqual({ brain: "claude", smoke: false });
  });

  it("rejects unknown flags and brain modes", () => {
    expect(() => parseDemoArgs(["--brain=other"])).toThrow("--brain must be fake or claude");
    expect(() => parseDemoArgs(["--unsafe"])).toThrow("unknown option");
  });

  it("always uses the repo-local demo profile", () => {
    expect(demoProfilePath("C:\\repo")).toBe("C:\\repo\\.chrome-profile\\demo");
  });

  it("launches only the local fixture in the isolated profile without extension-load flags", () => {
    const args = browserLaunchArgs("C:\\repo\\.chrome-profile\\demo", "http://127.0.0.1:7790/injection.html");
    expect(args).toContain("--user-data-dir=C:\\repo\\.chrome-profile\\demo");
    expect(args).toContain("http://127.0.0.1:7790/injection.html");
    expect(args.some((arg) => arg.includes("--load-extension"))).toBe(false);
    expect(args.some((arg) => arg.includes("--user-data-dir=C:\\Users\\pranav\\AppData"))).toBe(false);
  });
});

describe("optional voice target", () => {
  it("is absent when no local client URL is configured", () => {
    expect(resolveVoiceTarget(undefined)).toBeUndefined();
  });

  it("keeps only an explicit loopback HTTP URL and its exact origin", () => {
    expect(resolveVoiceTarget("http://127.0.0.1:5173/voice?mode=local")).toEqual({
      url: "http://127.0.0.1:5173/voice?mode=local",
      origin: "http://127.0.0.1:5173",
    });
    expect(resolveVoiceTarget("http://localhost:4173/")?.origin).toBe("http://localhost:4173");
  });

  it.each([
    "https://localhost:5173/voice",
    "http://example.com/voice",
    "http://127.0.0.1/voice",
    "http://user:pass@127.0.0.1:5173/voice",
    "file:///tmp/voice.html",
  ])("rejects a voice URL that the local server cannot safely allowlist: %s", (url) => {
    expect(() => resolveVoiceTarget(url)).toThrow();
  });
});

describe("extension readiness gate", () => {
  it("does not treat a browser launch as extension readiness", async () => {
    let now = 0;
    const result = await waitForExtensionReady(() => false, {
      timeoutMs: 4,
      intervalMs: 2,
      sleep: async (ms) => { now += ms; },
      now: () => now,
    });
    expect(result).toBe(false);
    expect(now).toBe(4);
  });

  it("returns as soon as the server observes the extension connection", async () => {
    let checks = 0;
    const connected = await waitForExtensionReady(() => ++checks === 3, {
      timeoutMs: 100,
      intervalMs: 1,
      sleep: async () => {},
    });
    expect(connected).toBe(true);
    expect(checks).toBe(3);
  });

  it("classifies a missing unpacked install as setup-required", () => {
    expect(classifyExtensionReadiness(false, false)).toBe("setup-required");
    expect(classifyExtensionReadiness(false, true)).toBe("timeout");
    expect(classifyExtensionReadiness(true, false)).toBe("connected");
  });
});
