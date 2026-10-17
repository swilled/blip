import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PORT, LOOPBACK_HOST } from "@blip/protocol";
import { buildChromeArgs, launchVoiceWindow, resolveChromePath, WINDOW_TITLE } from "./launch-window";

describe("buildChromeArgs", () => {
  it("1: profile, app url, size and right-edge position", () => {
    const args = buildChromeArgs({ screenWidth: 1920 });
    expect(args.some((a) => /^--user-data-dir=.*\.chrome-profile$/.test(a))).toBe(true);
    expect(args).toContain(`--app=http://${LOOPBACK_HOST}:${DEFAULT_PORT}/`);
    expect(args).toContain("--window-size=420,720");
    expect(args).toContain("--window-position=1500,0");
  });

  it("2: the host is 127.0.0.1, never localhost", () => {
    const args = buildChromeArgs({ port: 9999 });
    expect(args).toContain("--app=http://127.0.0.1:9999/");
    expect(args.join(" ")).not.toContain("localhost");
  });
});

describe("resolveChromePath", () => {
  it("3: CHROME_PATH first, then standard locations, else an error naming CHROME_PATH", () => {
    expect(resolveChromePath({ CHROME_PATH: "C:/x/chrome.exe" }, () => true)).toBe("C:/x/chrome.exe");
    const env = { PROGRAMFILES: "C:/PF", "PROGRAMFILES(X86)": "C:/PF86", LOCALAPPDATA: "C:/LA" };
    const second = resolveChromePath(env, (p) => p === "C:/PF86/Google/Chrome/Application/chrome.exe");
    expect(second).toBe("C:/PF86/Google/Chrome/Application/chrome.exe");
    expect(() => resolveChromePath(env, () => false)).toThrow(/CHROME_PATH/);
  });
});

describe("launchVoiceWindow", () => {
  const mk = () => ({ unref: vi.fn() });
  it("4: docked does not pin; pinned pins the exact window title once", async () => {
    const pin = vi.fn(async () => ({ ok: true }));
    const spawn = vi.fn(() => mk());
    await launchVoiceWindow({ layout: "docked", spawn, pin, chromePath: "c.exe", screenWidth: 1920, log: () => {} });
    expect(pin).not.toHaveBeenCalled();
    await launchVoiceWindow({ layout: "pinned", spawn, pin, chromePath: "c.exe", screenWidth: 1920, log: () => {} });
    expect(pin).toHaveBeenCalledTimes(1);
    expect(pin).toHaveBeenCalledWith("Blip");
    const call = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(Array.isArray(call[1])).toBe(true);
    expect(call[2]).not.toHaveProperty("shell");
  });

  it("falls back to docked with a message when the pin fails", async () => {
    const lines: string[] = [];
    await launchVoiceWindow({
      layout: "pinned",
      spawn: () => mk(),
      pin: async () => ({ ok: false, error: "window not found" }),
      chromePath: "c.exe",
      screenWidth: 1920,
      log: (l) => lines.push(l),
    });
    expect(lines.join("\n")).toMatch(/not pinned/);
  });

  it("pin target equals the built page <title> exactly", () => {
    const html = readFileSync(new URL("../../../apps/voice/index.html", import.meta.url), "utf8");
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(WINDOW_TITLE);
    expect(WINDOW_TITLE).toBe("Blip");
  });
});

describe("keeping the window on top", () => {
  it("5: re-applies the pin on a timer, and not at all when repinMs is 0 or the first pin failed", async () => {
    vi.useFakeTimers();
    try {
      const mk = () => ({ unref: vi.fn() });
      const spawn = vi.fn(() => mk());
      const pin = vi.fn(async () => ({ ok: true }));
      await launchVoiceWindow({ layout: "pinned", spawn, pin, chromePath: "c.exe", screenWidth: 1920, repinMs: 1000, log: () => {} });
      expect(pin).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3100);
      expect(pin.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(pin).toHaveBeenLastCalledWith(WINDOW_TITLE);

      const pinOff = vi.fn(async () => ({ ok: true }));
      await launchVoiceWindow({ layout: "pinned", spawn, pin: pinOff, chromePath: "c.exe", screenWidth: 1920, repinMs: 0, log: () => {} });
      await vi.advanceTimersByTimeAsync(5000);
      expect(pinOff).toHaveBeenCalledTimes(1);

      const pinFail = vi.fn(async () => ({ ok: false, error: "window not found" }));
      await launchVoiceWindow({ layout: "pinned", spawn, pin: pinFail, chromePath: "c.exe", screenWidth: 1920, repinMs: 1000, log: () => {} });
      await vi.advanceTimersByTimeAsync(5000);
      expect(pinFail).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
