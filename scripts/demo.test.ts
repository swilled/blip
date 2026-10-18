import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EXTENSION_ID } from "@blip/protocol";
import { startServer } from "../apps/server/src/server.js";
import {
  browserLaunchArgs,
  buildVoiceClientForDemo,
  classifyExtensionReadiness,
  demoProfilePath,
  demoRepairCachePath,
  demoVoiceProfilePath,
  demoVoiceStaticRoot,
  hasExtensionInProfile,
  parseDemoArgs,
  resolveVoiceTarget,
  voiceLaunchArgs,
  waitForExtensionReady,
  readVoiceBuildId,
} from "./demo.js";

describe("local demo launcher inputs", () => {
  it("defaults to the offline fake brain and supports an explicit smoke run", () => {
    expect(parseDemoArgs([])).toEqual({ brain: "fake", smoke: false });
    expect(parseDemoArgs(["--brain=fake", "--smoke"])).toEqual({ brain: "fake", smoke: true });
    expect(parseDemoArgs(["--brain=agy"])).toEqual({ brain: "agy", smoke: false });
  });

  it("rejects unknown flags and brain modes", () => {
    expect(() => parseDemoArgs(["--brain=other"])).toThrow("--brain must be fake or agy");
    expect(() => parseDemoArgs(["--unsafe"])).toThrow("unknown option");
  });

  it("always uses the repo-local demo profile", () => {
    expect(demoProfilePath("C:\\repo")).toBe("C:\\repo\\.chrome-profile\\demo");
    expect(demoRepairCachePath("C:\\repo")).toBe("C:\\repo\\.chrome-profile\\demo-repair-cache-v1");
    expect(demoVoiceProfilePath("C:\\repo")).toBe("C:\\repo\\.chrome-profile\\demo-voice");
  });

  it("serves the built Phase 4 voice client instead of the legacy public page", () => {
    expect(demoVoiceStaticRoot("C:\\repo")).toEqual({
      urlPrefix: "/voice",
      dir: "C:\\repo\\apps\\voice\\dist",
    });
  });

  it("launches only the local fixture in the isolated profile without extension-load flags", () => {
    const args = browserLaunchArgs("C:\\repo\\.chrome-profile\\demo", "http://127.0.0.1:7790/injection.html");
    expect(args).toContain("--user-data-dir=C:\\repo\\.chrome-profile\\demo");
    expect(args).toContain("http://127.0.0.1:7790/injection.html");
    expect(args.some((arg) => arg.includes("--load-extension"))).toBe(false);
    expect(args.some((arg) => arg.includes("--user-data-dir=C:\\Users\\pranav\\AppData"))).toBe(false);
  });

  it("launches the voice window in an isolated profile without the extension", () => {
    const args = voiceLaunchArgs("C:\\repo\\.chrome-profile\\demo-voice", "http://127.0.0.1:7777/voice/");
    expect(args).toContain("--user-data-dir=C:\\repo\\.chrome-profile\\demo-voice");
    expect(args).toContain("--app=http://127.0.0.1:7777/voice/");
    expect(args.some((arg) => arg.includes("--load-extension"))).toBe(false);
  });
});

describe("Phase 4 voice client in the demo", () => {
  it("builds and serves the current voice controls at /voice", async () => {
    await buildVoiceClientForDemo();
    const server = await startServer({ port: 0, dev: true, staticRoots: [demoVoiceStaticRoot()] });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/voice/`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain("Speech output");
      expect(html).toContain("Screen reader (NVDA)");
      expect(html).toContain("Blip voice speed");
      expect(html).toContain("id=\"hold-to-talk\"");
      expect(html).toContain("id=\"speech-rate-value\"");
      expect(html).not.toContain("Talk to Blip");
      const identity = await readVoiceBuildId();
      expect(html).toContain(identity);
      expect(await (await fetch(`http://127.0.0.1:${server.port}/voice/blip-build.json`)).json()).toMatchObject({ id: identity });
    } finally {
      await server.close();
    }
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
    expect(classifyExtensionReadiness(true, false)).toBe("setup-required");
  });

  it("detects unpacked extensions in Edge Secure Preferences", async () => {
    const profileDirectory = await mkdtemp(path.join(tmpdir(), "blip-demo-profile-"));
    const defaultDirectory = path.join(profileDirectory, "Default");
    try {
      await mkdir(defaultDirectory, { recursive: true });
      await writeFile(path.join(defaultDirectory, "Secure Preferences"), JSON.stringify({
        extensions: { settings: { [EXTENSION_ID]: { path: "C:\\repo\\apps\\extension\\dist" } } },
      }));

      await expect(hasExtensionInProfile(profileDirectory)).resolves.toBe(true);
    } finally {
      await rm(profileDirectory, { recursive: true, force: true });
    }
  });
});
