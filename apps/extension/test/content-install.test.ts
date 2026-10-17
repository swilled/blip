import { beforeEach, describe, expect, it, vi } from "vitest";

type RuntimeMessageListener = (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => void;

describe("install-time content injection", () => {
  let tabsQuery: ReturnType<typeof vi.fn>;
  let executeScript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    tabsQuery = vi.fn().mockResolvedValue([
      { id: 1, url: "https://forms.example/app" },
      { id: 2, url: "http://forms.example/legacy" },
      { id: 3, url: "http://127.0.0.1:7777/" },
      { id: 4, url: "http://localhost:5173/" },
      { id: 5, url: "chrome://extensions/" },
      { id: 6 },
    ]);
    executeScript = vi.fn().mockResolvedValue([]);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        tabs: { query: tabsQuery },
        scripting: { executeScript },
        runtime: { id: "blip-extension-id", onMessage: { addListener: vi.fn() } },
      },
    });
    delete (globalThis as Record<string, unknown>).__blipContentShellInstalled;
  });

  it("injects all frames into existing HTTP(S) tabs and skips Blip and browser pages", async () => {
    const { injectExistingTabs } = await import("../src/background/inject.js");

    await injectExistingTabs();

    expect(tabsQuery).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 1, allFrames: true },
      files: ["content.js"],
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 2, allFrames: true },
      files: ["content.js"],
    });
  });

  it("continues injecting other tabs when one tab rejects injection", async () => {
    tabsQuery.mockResolvedValue([
      { id: 10, url: "https://one.example/" },
      { id: 11, url: "https://two.example/" },
      { id: 12, url: "https://three.example/" },
    ]);
    executeScript.mockImplementation(({ target }: { target: { tabId: number } }) =>
      target.tabId === 11 ? Promise.reject(new Error("tab closed")) : Promise.resolve([]),
    );

    const { injectExistingTabs } = await import("../src/background/inject.js");
    await expect(injectExistingTabs()).resolves.toBeUndefined();

    expect(executeScript).toHaveBeenCalledTimes(3);
    expect(executeScript.mock.calls.map(([details]) => details.target.tabId)).toEqual([10, 11, 12]);
  });
});

describe("content message listener installation", () => {
  let listeners: RuntimeMessageListener[];

  beforeEach(() => {
    vi.resetModules();
    listeners = [];
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "blip-extension-id",
          onMessage: { addListener: (listener: RuntimeMessageListener) => listeners.push(listener) },
        },
      },
    });
    delete (globalThis as Record<string, unknown>).__blipContentShellInstalled;
  });

  it("installs one ping listener across repeated injections and answers only this extension", async () => {
    await import("../src/content/index.js");
    vi.resetModules();
    await import("../src/content/index.js");

    expect(listeners).toHaveLength(1);
    const sendResponse = vi.fn();
    listeners[0]?.({ type: "blip.ping" }, { id: "another-extension" }, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();

    listeners[0]?.({ type: "blip.ping" }, { id: "blip-extension-id" }, sendResponse);
    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });
});
