import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const FORM_URL = "http://127.0.0.1:7777/fixtures/forms/broken.html";

describe("local Chrome bridge lifecycle", () => {
  it("reports a page change after pageshow so a form reset invalidates the cached model", async () => {
    const source = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
    const sent: Array<Record<string, unknown>> = [];
    const listeners = new Map<string, (event: unknown) => void>();
    const document = {
      title: "Customer survey",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const chrome = {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: (message: Record<string, unknown>) => sent.push(message),
      },
    };

    runInNewContext(source, {
      document,
      location: { href: FORM_URL, origin: "http://127.0.0.1:7777" },
      window: { addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) },
      chrome,
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Array,
      Map,
      Set,
      String,
      Number,
      Object,
    });

    const pageshow = listeners.get("pageshow");
    expect(pageshow).toBeDefined();
    pageshow?.({ persisted: true });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(sent).toContainEqual(expect.objectContaining({
      kind: "blip.page-changed",
      reason: "history-restored",
    }));
  });

  it("notifies the runner after Chrome completes a navigation to the demo form", () => {
    const source = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
    const sent: string[] = [];
    const listeners: Record<string, (...args: any[]) => void> = {};
    const socket = {
      readyState: 1,
      addEventListener: () => {},
      send: (text: string) => sent.push(text),
      close: () => {},
    };
    const MockWebSocket = Object.assign(function MockWebSocket() { return socket; }, { OPEN: 1 });
    const chrome = {
      runtime: {
        lastError: null,
        onMessage: { addListener: (listener: (...args: any[]) => void) => { listeners.runtimeMessage = listener; } },
      },
      tabs: {
        onUpdated: { addListener: (listener: (...args: any[]) => void) => { listeners.tabUpdated = listener; } },
        onActivated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        sendMessage: (_tabId: number, _message: unknown, callback: (response: unknown) => void) => callback({ structuralHash: "blip-1" }),
        get: (tabId: number, callback: (tab: unknown) => void) => callback({ id: tabId, url: FORM_URL }),
        query: (_query: unknown, callback: (tabs: unknown[]) => void) => callback([]),
      },
    };

    runInNewContext(source, {
      chrome,
      WebSocket: MockWebSocket,
      crypto: { randomUUID: () => "test-frame-id" },
      Date,
      Math,
      JSON,
      URL,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    });

    expect(listeners.tabUpdated).toBeDefined();
    listeners.tabUpdated?.(7, { status: "complete" }, { id: 7, url: FORM_URL });
    const pageChange = sent.map((text) => JSON.parse(text) as { type: string; payload: { reason?: string } })
      .find((frame) => frame.type === "page.changed");
    expect(pageChange?.payload.reason).toBe("navigation");
  });
});
