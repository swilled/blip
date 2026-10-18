import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContentRequest, BrowserContentResponse } from "../shared/messages.js";
import type { BrowserPageIdentity } from "@blip/protocol";
import { captureVisibleContent, handleBrowserContentRequest } from "./browser-content.js";
import { parseBrowserCommand } from "../../../server/src/browser/commands.js";
import { createBrowserRequestDispatcher } from "../background/browser.js";

const PAGE = "https://example.test/article?session=private#part";
const identity: BrowserPageIdentity = {
  captureId: "capture-test",
  captureRevision: 1,
  tabId: 7,
  pageUrl: PAGE,
};

function addVisibleRects(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}),
  } as DOMRect);
}

function addText(tag: string, text: string, parent: Element = document.body): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function addArticle(title: string, visibleDate?: string, datetime = visibleDate): HTMLElement {
  const article = document.createElement("article");
  addText("h2", title, article);
  if (visibleDate !== undefined) {
    const time = document.createElement("time");
    if (datetime !== undefined) time.setAttribute("datetime", datetime);
    time.textContent = visibleDate;
    article.append(time);
  }
  addText("p", `${title} article text`, article);
  document.body.append(article);
  return article;
}

function captureWithFixedClock(pageIdentity: BrowserPageIdentity = identity) {
  return captureVisibleContent(document, pageIdentity, { now: () => 0 });
}

function contentResponse(response: BrowserContentResponse): Extract<BrowserContentResponse, { t: "browser-content.result" }> {
  if (response.t !== "browser-content.result") throw new Error(response.message);
  return response;
}

function openRequest(linkId: string, pageIdentity = identity): BrowserContentRequest {
  return {
    t: "browser-content",
    operation: "open-link",
    identity: pageIdentity,
    linkId,
    authorizationId: "core-auth-1",
  };
}

function browserDispatcher() {
  let tab = { id: 7, url: PAGE, title: "Example" };
  const navigations: string[] = [];
  const api = {
    tabs: {
      get: async () => tab,
      update: async (_tabId: number, properties: { active?: boolean; url?: string }) => {
        tab = { ...tab, ...properties };
        if (properties.url) navigations.push(properties.url);
        return tab;
      },
    },
  };
  const dispatch = createBrowserRequestDispatcher({
    api: api as never,
    findCurrentTargetTab: async () => tab as never,
    rememberTargetTab: () => true,
    sendContentMessage: async (_tabId, request) => handleBrowserContentRequest(document, request, 0),
  });
  return { dispatch, navigations, currentTab: () => tab };
}

describe("bounded visible browser content", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    addVisibleRects();
  });

  afterEach(() => vi.restoreAllMocks());

  it("omits hidden, inert, nested, control, form, script, and style content", () => {
    addText("h1", "Visible title");
    addText("p", "Visible paragraph");
    const section = document.createElement("section");
    const outer = document.createElement("p");
    outer.append(document.createTextNode("Outer paragraph "));
    const nested = document.createElement("p");
    nested.textContent = "Nested duplicate";
    outer.append(nested);
    section.append(outer);
    document.body.append(section);
    const hidden = addText("p", "Hidden paragraph");
    hidden.setAttribute("hidden", "");
    const inert = document.createElement("div");
    inert.setAttribute("inert", "");
    inert.append(Object.assign(document.createElement("p"), { textContent: "Inert paragraph" }));
    document.body.append(inert);
    const form = document.createElement("form");
    form.innerHTML = "<p>Form metadata</p><input value='SECRET-CONTROL-VALUE'><textarea>SECRET-TEXTAREA-VALUE</textarea>";
    document.body.append(form);
    const script = document.createElement("script");
    script.type = "application/json";
    script.textContent = "Script text";
    document.body.append(script);
    const style = document.createElement("style");
    style.textContent = "body { --hidden-style-text: 'Style text'; }";
    document.head.append(style);

    const result = captureWithFixedClock();
    expect(result.blocks.map((block) => block.text)).toEqual(["Visible title", "Visible paragraph", "Outer paragraph"]);
    expect(JSON.stringify(result)).not.toContain("SECRET-");
    expect(JSON.stringify(result)).not.toContain("Nested duplicate");
    expect(JSON.stringify(result)).not.toContain(script.textContent);
    expect(JSON.stringify(result)).not.toContain(style.textContent);
  });

  it("bounds blocks, each block, total Unicode code points, and reports content truncation", () => {
    for (let index = 0; index < 21; index += 1) addText("p", "😀".repeat(450));
    const result = captureWithFixedClock();
    expect(result.status).toBe("supported");
    expect(result.blocks.length).toBeLessThanOrEqual(20);
    expect(result.blocks.every((block) => Array.from(block.text).length <= 400)).toBe(true);
    expect(result.blocks.reduce((sum, block) => sum + Array.from(block.text).length, 0)).toBeLessThanOrEqual(4000);
    expect(result.truncated).toBe(true);
    expect(result.blocks[0]?.text).toBe("😀".repeat(400));
  });

  it("captures generic article and list items with only corroborated visible semantic dates", () => {
    addArticle("Unique item", "2026-10-18T12:30:00Z");
    addArticle("Tied item one", "2026-10-17T09:00:00Z");
    addArticle("Tied item two", "2026-10-17T09:00:00Z");
    addArticle("Missing date");
    addArticle("Malformed date", "yesterday", "2026-10-15T09:00:00Z");
    const roleItem = document.createElement("div");
    roleItem.setAttribute("role", "listitem");
    roleItem.textContent = "Generic list row";
    document.body.append(roleItem);

    const capture = captureWithFixedClock();
    expect(capture.items?.map(({ text, visibleDate }) => ({ text, visibleDate }))).toEqual([
      { text: "Unique item 2026-10-18T12:30:00Z Unique item article text", visibleDate: "2026-10-18T12:30:00Z" },
      { text: "Tied item one 2026-10-17T09:00:00Z Tied item one article text", visibleDate: "2026-10-17T09:00:00Z" },
      { text: "Tied item two 2026-10-17T09:00:00Z Tied item two article text", visibleDate: "2026-10-17T09:00:00Z" },
      { text: "Missing date Missing date article text", visibleDate: null },
      { text: "Malformed date yesterday Malformed date article text", visibleDate: null },
      { text: "Generic list row", visibleDate: null },
    ]);
    expect(new Set(capture.items?.map((item) => item.itemId)).size).toBe(capture.items?.length);
    expect(capture.items?.every((item) => item.identity === identity && item.frameId === 0)).toBe(true);
  });

  it("omits hidden and nested item duplicates and bounds captured item text", () => {
    const outer = document.createElement("article");
    outer.append(document.createTextNode("Outer record"));
    const nested = document.createElement("div");
    nested.setAttribute("role", "listitem");
    nested.textContent = "Nested duplicate";
    outer.append(nested);
    document.body.append(outer);
    const hidden = addArticle("Hidden record", "2026-10-18T12:30:00Z");
    hidden.setAttribute("hidden", "");
    const inert = document.createElement("article");
    inert.setAttribute("inert", "");
    inert.textContent = "Inert record";
    document.body.append(inert);
    const form = document.createElement("article");
    form.innerHTML = "<p>Article form</p><input value='SECRET-CONTROL-VALUE'><textarea>SECRET-TEXTAREA-VALUE</textarea>";
    const wrapper = document.createElement("form");
    wrapper.append(form);
    document.body.append(wrapper);
    for (let index = 0; index < 21; index += 1) addArticle(`Bounded ${index}`, "2026-10-18T12:30:00Z");

    const capture = captureWithFixedClock();
    expect(capture.items?.[0]?.text).toBe("Outer record");
    expect(capture.items?.some((item) => item.text.includes("Nested duplicate"))).toBe(false);
    expect(capture.items?.some((item) => item.text.includes("Hidden record"))).toBe(false);
    expect(capture.items?.some((item) => item.text.includes("Inert record"))).toBe(false);
    expect(JSON.stringify(capture.items)).not.toContain("SECRET-");
    expect(capture.items?.length).toBeLessThanOrEqual(20);
    expect(capture.items?.every((item) => Array.from(item.text).length <= 400)).toBe(true);
    expect(capture.items?.reduce((sum, item) => sum + Array.from(item.text).length, 0)).toBeLessThanOrEqual(4000);
    expect(capture.truncated).toBe(true);
  });

  it("returns distinct empty, restricted, and elapsed-budget outcomes", () => {
    expect(captureWithFixedClock().status).toBe("empty");
    expect(captureWithFixedClock({ ...identity, pageUrl: "chrome://settings/" }).status).toBe("restricted");
    addText("p", "slow page");
    let tick = 0;
    expect(captureVisibleContent(document, identity, { timeBudgetMs: 0, now: () => ++tick }).status).toBe("timeout");
  });

  it("lists only visible link labels with a host hint and identity, never URL query or fragment", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://outside.test/path?token=hidden#secret";
    anchor.append(document.createTextNode("Read article"));
    const hidden = document.createElement("span");
    hidden.style.display = "none";
    hidden.textContent = " invisible credential";
    anchor.append(hidden);
    document.body.append(anchor);
    const hiddenLink = document.createElement("a");
    hiddenLink.href = "/hidden";
    hiddenLink.textContent = "Do not list";
    hiddenLink.setAttribute("aria-hidden", "true");
    document.body.append(hiddenLink);

    const response = contentResponse(handleBrowserContentRequest(document, {
      t: "browser-content", operation: "list-links", identity,
    }, 0));
    expect(response.operation).toBe("list-links");
    if (response.operation !== "list-links") throw new Error("expected link list");
    expect(response.result.links).toHaveLength(1);
    expect(response.result.links[0]).toMatchObject({ label: "Read article", hostHint: "outside.test", identity, frameId: 0 });
    expect(JSON.stringify(response.result)).not.toContain("token=hidden");
    expect(JSON.stringify(response.result)).not.toContain("secret");
    expect(JSON.stringify(response.result)).not.toContain("invisible credential");
  });

  it("re-reads link visibility, connection, href, target, and same-origin policy before opening", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.test/dismiss";
    anchor.textContent = "Dismiss";
    document.body.append(anchor);
    const capture = captureWithFixedClock();
    const list = contentResponse(handleBrowserContentRequest(document, {
      t: "browser-content", operation: "list-links", identity: { ...identity, captureId: "capture-open", captureRevision: 2 },
    }, 0));
    if (list.operation !== "list-links") throw new Error("expected link list");
    const linkId = list.result.links[0]!.linkId;
    const currentIdentity = list.result;

    expect(capture.status).toBe("supported");
    expect(contentResponse(handleBrowserContentRequest(document, openRequest(linkId, currentIdentity), 0)).operation).toBe("open-link");

    anchor.href = "https://example.test/changed";
    const changed = handleBrowserContentRequest(document, openRequest(linkId, currentIdentity), 0);
    expect(changed).toMatchObject({ t: "browser-content.error", code: "stale-capture" });
  });

  it("refuses disconnected, new-context, external, malformed, and policy-denied links", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.test/dismiss";
    anchor.textContent = "Dismiss";
    document.body.append(anchor);
    const capture = captureWithFixedClock({ ...identity, captureId: "capture-refuse", captureRevision: 3 });

    const requestFor = (link: HTMLAnchorElement, index: number, suffix: string) => {
      const nextIdentity = { ...identity, captureId: `capture-${suffix}`, captureRevision: index + 10 };
      const listed = contentResponse(handleBrowserContentRequest(document, {
        t: "browser-content", operation: "list-links", identity: nextIdentity,
      }, 0));
      if (listed.operation !== "list-links") throw new Error("expected list result");
      return { identity: listed.result, linkId: listed.result.links[index]!.linkId };
    };

    const disconnected = requestFor(anchor, 0, "disconnected");
    anchor.remove();
    expect(handleBrowserContentRequest(document, openRequest(disconnected.linkId, disconnected.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });

    anchor.href = "https://example.test/dismiss";
    document.body.append(anchor);
    anchor.target = "_blank";
    const newContext = requestFor(anchor, 0, "target");
    expect(handleBrowserContentRequest(document, openRequest(newContext.linkId, newContext.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "invalid-target" });

    anchor.target = "";
    anchor.href = "https://outside.test/dismiss";
    const external = requestFor(anchor, 0, "external");
    expect(handleBrowserContentRequest(document, openRequest(external.linkId, external.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "unsupported-destination-check" });

    anchor.href = "javascript:alert(1)";
    const malformed = requestFor(anchor, 0, "malformed");
    expect(handleBrowserContentRequest(document, openRequest(malformed.linkId, malformed.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "invalid-target" });

    anchor.href = "https://example.test/continue";
    anchor.textContent = "Continue";
    const denied = requestFor(anchor, 0, "policy");
    expect(handleBrowserContentRequest(document, openRequest(denied.linkId, denied.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "unsupported-destination-check" });
    expect(capture.status).toBe("supported");
  });

  it("rejects child-frame requests and stale content IDs", () => {
    addText("p", "Current paragraph");
    const capture = captureWithFixedClock();
    const contentId = capture.blocks[0]!.contentId;
    const request: BrowserContentRequest = {
      t: "browser-content", operation: "read-content", identity, contentId, kind: "paragraph",
    };
    expect(handleBrowserContentRequest(document, request, 3)).toMatchObject({
      t: "browser-content.error", code: "unsupported-frame",
    });
    expect(handleBrowserContentRequest(document, { ...request, identity: { ...identity, captureRevision: 2 } }, 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });
  });

  it("rejects a bare link request without authorization and duplicate user-selected labels", () => {
    const first = document.createElement("a");
    first.href = "/dismiss";
    first.textContent = "Dismiss";
    const second = first.cloneNode(true) as HTMLAnchorElement;
    document.body.append(first, second);
    const capture = captureWithFixedClock();
    expect(capture.blocks).toHaveLength(0);
    const result = parseBrowserCommand("open link dismiss", {
      identity,
      blocks: capture.blocks,
      links: [
        { linkId: "link-one", label: "Dismiss", hostHint: "example.test", identity, frameId: 0 },
        { linkId: "link-two", label: "Dismiss", hostHint: "example.test", identity, frameId: 0 },
      ],
    });
    expect(result).toMatchObject({ type: "clarify" });
  });

  it("routes typed capture, find, and scroll through the active page identity", async () => {
    addText("p", "Current page text");
    const { dispatch } = browserDispatcher();
    const captured = await dispatch({ requestId: "capture-1", tabId: 7, operation: { op: "capture" } });
    expect(captured).toMatchObject({ ok: true, operation: "capture" });
    if (!captured.ok || captured.operation !== "capture") throw new Error("expected capture");
    const findResult = await dispatch({
      requestId: "find-1", tabId: 7, operation: { op: "find", query: "Current page", identity: captured.result },
    });
    expect(findResult).toMatchObject({ ok: true, operation: "find", result: { found: true, matchCount: 1 } });

    const view = document.defaultView!;
    Object.defineProperty(view, "scrollY", { configurable: true, writable: true, value: 0 });
    vi.spyOn(view, "scrollBy").mockImplementation(() => {
      Object.defineProperty(view, "scrollY", { configurable: true, writable: true, value: 300 });
    });
    const scrollResult = await dispatch({
      requestId: "scroll-1", tabId: 7,
      operation: { op: "scroll", direction: "down", pixels: 300, identity: captured.result },
    });
    expect(scrollResult).toMatchObject({ ok: true, operation: "scroll", result: { moved: true } });

    const target = document.querySelector("p") as HTMLParagraphElement;
    let blockTop = 100;
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: blockTop, left: 0, top: blockTop, right: 10, bottom: blockTop + 10,
      width: 10, height: 10, toJSON: () => ({}),
    } as DOMRect));
    const scrollIntoView = vi.fn(() => { blockTop = 0; });
    Object.defineProperty(target, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const contentId = captured.result.blocks[0]!.contentId;
    const targetScroll = await dispatch({
      requestId: "scroll-target-1", tabId: 7,
      operation: { op: "scroll", contentId, kind: "paragraph", identity: captured.result },
    });
    expect(targetScroll).toMatchObject({ ok: true, operation: "scroll", result: { moved: true } });
    expect(scrollIntoView).toHaveBeenCalledOnce();

    const refreshedCapture = await dispatch({ requestId: "capture-2", tabId: 7, operation: { op: "capture" } });
    expect(refreshedCapture).toMatchObject({ ok: true, operation: "capture" });
    const staleTarget = await dispatch({
      requestId: "scroll-target-stale", tabId: 7,
      operation: { op: "scroll", contentId, kind: "paragraph", identity: captured.result },
    });
    expect(staleTarget).toMatchObject({ ok: false, error: { code: "stale-capture" } });
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("opens only authorized live click-safe links through the background tab API", async () => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.test/dismiss";
    anchor.textContent = "Dismiss";
    document.body.append(anchor);
    const { dispatch, navigations, currentTab } = browserDispatcher();
    const listed = await dispatch({ requestId: "links-1", tabId: 7, operation: { op: "list-links" } });
    expect(listed).toMatchObject({ ok: true, operation: "list-links" });
    if (!listed.ok || listed.operation !== "list-links") throw new Error("expected links");
    const link = listed.result.links[0]!;
    const bare = await dispatch({
      requestId: "open-bare", tabId: 7,
      operation: { op: "open-link", linkId: link.linkId, identity: listed.result } as never,
    });
    expect(bare).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(navigations).toEqual([]);

    const authorized = {
      requestId: "open-authorized", tabId: 7,
      operation: { op: "open-link", linkId: link.linkId, identity: listed.result, authorizationId: "core-auth-link" },
    };
    const opened = await dispatch(authorized);
    expect(opened).toMatchObject({ ok: true, operation: "open-link" });
    expect(navigations).toEqual(["https://example.test/dismiss"]);
    expect(currentTab().url).toBe("https://example.test/dismiss");
    const replay = await dispatch({ ...authorized, requestId: "open-replay" });
    expect(replay).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(navigations).toHaveLength(1);
  });

  it("rejects stale page identities and cross-site live link destinations before navigation", async () => {
    const anchor = document.createElement("a");
    anchor.href = "https://outside.test/dismiss";
    anchor.textContent = "Dismiss";
    document.body.append(anchor);
    const stale = browserDispatcher();
    const listed = await stale.dispatch({ requestId: "links-stale", tabId: 7, operation: { op: "list-links" } });
    if (!listed.ok || listed.operation !== "list-links") throw new Error("expected link list");
    const link = listed.result.links[0]!;
    stale.currentTab().url = "https://example.test/changed";
    const staleResult = await stale.dispatch({
      requestId: "open-stale", tabId: 7,
      operation: { op: "open-link", linkId: link.linkId, identity: listed.result, authorizationId: "auth-stale" },
    });
    expect(staleResult).toMatchObject({ ok: false, error: { code: "stale-page" } });
    expect(stale.navigations).toEqual([]);

    const current = browserDispatcher();
    const currentList = await current.dispatch({ requestId: "links-external", tabId: 7, operation: { op: "list-links" } });
    if (!currentList.ok || currentList.operation !== "list-links") throw new Error("expected link list");
    const external = await current.dispatch({
      requestId: "open-external", tabId: 7,
      operation: {
        op: "open-link",
        linkId: currentList.result.links[0]!.linkId,
        identity: currentList.result,
        authorizationId: "auth-external",
      },
    });
    expect(external).toMatchObject({ ok: false, error: { code: "unsupported-destination-check" } });
    expect(current.navigations).toEqual([]);
  });
});
