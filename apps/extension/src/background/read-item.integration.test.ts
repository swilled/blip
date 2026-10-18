import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserRequestPayload } from "@blip/protocol";
import type { Hub } from "../../../server/src/hub/hub.js";
import { Session } from "../../../server/src/session/session.js";
import { createBrowserExecutor } from "../../../server/src/browser/executor.js";
import { handleBrowserContentRequest } from "../content/browser-content.js";
import { createBrowserRequestDispatcher } from "./browser.js";

const PAGE = "https://synthetic.example/messages";
const TAB = { id: 7, url: PAGE, title: "Synthetic message list", active: true };

function addVisibleRects(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}),
  } as DOMRect);
}

function addSyntheticItem(): HTMLElement {
  const article = document.createElement("article");
  const heading = document.createElement("h2");
  heading.textContent = "Synthetic update";
  const date = document.createElement("time");
  date.textContent = "2026-10-18T12:30:00Z";
  date.setAttribute("datetime", "2026-10-18T12:30:00Z");
  const paragraph = document.createElement("p");
  paragraph.textContent = "Synthetic DOM body for the integration test.";
  article.append(heading, date, paragraph);
  document.body.append(article);
  return article;
}

describe("synthetic BrowserExecutor to live read-item route", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    vi.spyOn(document.defaultView!.performance, "now").mockReturnValue(0);
    addVisibleRects();
  });

  afterEach(() => vi.restoreAllMocks());

  it("captures and reads an unchanged item through the real extension dispatcher", async () => {
    const article = addSyntheticItem();
    let tab = { ...TAB };
    const api = { tabs: { get: async () => ({ ...tab }) } };
    const dispatcher = createBrowserRequestDispatcher({
      api: api as never,
      findCurrentTargetTab: async () => tab,
      rememberTargetTab: () => true,
      sendContentMessage: async (_tabId, request) => handleBrowserContentRequest(document, request, 0),
    });
    const hub = {
      request: async (role: string, type: string, payload: BrowserRequestPayload) => {
        expect(role).toBe("extension");
        expect(type).toBe("browser.request");
        return { payload: await dispatcher(payload) };
      },
    } as unknown as Hub;
    const session = new Session("fake");
    session.extensionConnected = true;
    session.tabId = TAB.id;
    const executor = createBrowserExecutor({ hub, session });

    const captured = await executor.execute({ op: "capture" });
    expect(captured).toMatchObject({ ok: true, payload: { ok: true, operation: "capture" } });
    if (!captured.ok || !captured.payload.ok || captured.payload.operation !== "capture") {
      throw new Error("expected a successful synthetic capture");
    }
    const item = captured.payload.result.items?.[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("expected one captured synthetic item");

    const read = await executor.execute({ op: "read-item", itemId: item.itemId, identity: captured.payload.result });
    expect(read).toMatchObject({ ok: true, payload: { ok: true, operation: "read-item", result: item } });
    expect(session.browserCapture?.identity).toMatchObject({
      captureId: item.identity.captureId,
      captureRevision: item.identity.captureRevision,
      tabId: item.identity.tabId,
      pageUrl: item.identity.pageUrl,
    });
    expect(session.browserCapture?.items).toContainEqual(item);

    article.querySelector("p")!.textContent = "Changed after the read capture.";
    const changed = await executor.execute({ op: "read-item", itemId: item.itemId, identity: captured.payload.result });
    expect(changed).toMatchObject({
      ok: true,
      payload: { ok: false, operation: "read-item", error: { code: "stale-capture" } },
    });
    expect(JSON.stringify(changed)).not.toContain("Changed after the read capture.");
    expect(session.browserCapture?.items).toContainEqual(item);

    tab = { ...tab, url: "https://synthetic.example/changed" };
    const changedPage = await executor.execute({ op: "read-item", itemId: item.itemId, identity: captured.payload.result });
    expect(changedPage).toMatchObject({
      ok: true,
      payload: { ok: false, operation: "read-item", error: { code: "stale-page" } },
    });
  });
});
