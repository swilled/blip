import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageChangeScheduler, isAuthorizedMutation } from "../src/background/changes.js";
import { registerNavigationListeners, type NavigationBrowserApi } from "../src/background/navigation.js";

describe("page change scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces per tab and keeps navigation ahead of activation and mutation", () => {
    const send = vi.fn();
    const scheduler = createPageChangeScheduler(send, { debounceMs: 60 });

    scheduler.enqueue({ tabId: 7, url: "https://forms.test/start", reason: "mutation", structuralHash: "h1" });
    scheduler.enqueue({ tabId: 8, url: "https://forms.test/other", reason: "tab-activated" });
    scheduler.enqueue({ tabId: 7, url: "https://forms.test/next", reason: "navigation" });
    scheduler.enqueue({ tabId: 7, url: "https://forms.test/next", reason: "mutation", structuralHash: "h2" });

    vi.advanceTimersByTime(59);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith({ tabId: 7, url: "https://forms.test/next", reason: "navigation", structuralHash: "h2" });
    expect(send).toHaveBeenCalledWith({ tabId: 8, url: "https://forms.test/other", reason: "tab-activated" });
  });

  it("only accepts bounded structural mutations from this extension and a real tab", () => {
    expect(isAuthorizedMutation(
      { t: "mutated", structuralHash: "a1b2c3d4", changeSignature: "shape" },
      { id: "blip-id", tab: { id: 4 } },
      "blip-id",
    )).toBe(true);
    expect(isAuthorizedMutation(
      { t: "mutated", structuralHash: "a1b2c3d4", changeSignature: "shape" },
      { id: "other-id", tab: { id: 4 } },
      "blip-id",
    )).toBe(false);
    expect(isAuthorizedMutation(
      { t: "mutated", structuralHash: "a1b2c3d4", changeSignature: "shape" },
      { id: "blip-id" },
      "blip-id",
    )).toBe(false);
    expect(isAuthorizedMutation(
      { t: "mutated", structuralHash: "a1b2c3d4", changeSignature: "shape" },
      { id: "blip-id", tab: { id: 4 } },
      "blip-id",
    )).toBe(true);
    expect(isAuthorizedMutation(
      { t: "mutated", structuralHash: "x".repeat(300), changeSignature: "shape" },
      { id: "blip-id", tab: { id: 4 } },
      "blip-id",
    )).toBe(false);
  });
});

describe("navigation and target-tab listeners", () => {
  it("registers wake events, filters background tabs, and selects the focused window page", async () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const event = (name: string) => ({
      addListener: (listener: (...args: any[]) => void) => { handlers.set(name, listener); },
    });
    const pages = new Map([
      [5, { id: 5, url: "https://forms.test/start" }],
      [6, { id: 6, url: "https://other.test/" }],
      [7, { id: 7, url: "http://127.0.0.1:7777/" }],
    ]);
    let selectedId = 5;
    const rememberTargetTab = vi.fn((tab: { id?: number; url?: string }) => {
      if (tab.id === undefined || !pages.has(tab.id) || tab.url?.includes(":7777/")) return false;
      selectedId = tab.id;
      return true;
    });
    const findTargetTab = vi.fn(async (tabId?: number) => {
      const record = pages.get(tabId ?? selectedId);
      if (!record) return undefined;
      try {
        const url = new URL(record.url);
        if ((url.protocol !== "http:" && url.protocol !== "https:") ||
          ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && ["7777", "5173"].includes(url.port))) return undefined;
      } catch { return undefined; }
      return record as { id: number; url: string };
    });
    const enqueue = vi.fn();
    const scheduler = { enqueue, cancel: vi.fn() };
    const query = vi.fn(async () => [{ id: 6, url: "https://other.test/" }]);
    const api: NavigationBrowserApi = {
      tabs: {
        onActivated: event("activated"),
        onUpdated: event("updated"),
        onRemoved: event("removed"),
        query,
      },
      webNavigation: { onCommitted: event("committed"), onHistoryStateUpdated: event("history") },
      windows: { WINDOW_ID_NONE: -1, onFocusChanged: event("focus") },
    };

    registerNavigationListeners({ api, scheduler, findTargetTab, rememberTargetTab });
    expect([...handlers.keys()]).toEqual(["committed", "history", "updated", "activated", "removed", "focus"]);

    handlers.get("committed")?.({ tabId: 5, frameId: 2, url: "https://forms.test/frame" });
    handlers.get("committed")?.({ tabId: 6, frameId: 0, url: "https://other.test/" });
    handlers.get("committed")?.({ tabId: 7, frameId: 0, url: "http://127.0.0.1:7777/" });
    await Promise.resolve();
    expect(enqueue).not.toHaveBeenCalled();

    handlers.get("history")?.({ tabId: 5, frameId: 0, url: "https://forms.test/step-two" });
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledWith({ tabId: 5, url: "https://forms.test/step-two", reason: "navigation" }));

    selectedId = 6;
    handlers.get("activated")?.({ tabId: 6 });
    await vi.waitFor(() => expect(enqueue).toHaveBeenLastCalledWith({ tabId: 6, url: "https://other.test/", reason: "tab-activated" }));

    selectedId = 5;
    handlers.get("focus")?.(12);
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 12 });
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledWith({ tabId: 6, url: "https://other.test/", reason: "tab-activated" }));
    expect(rememberTargetTab).toHaveBeenCalledWith({ id: 6, url: "https://other.test/" });
    expect(selectedId).toBe(6);
  });
});
