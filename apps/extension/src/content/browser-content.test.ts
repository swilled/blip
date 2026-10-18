import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContentRequest, BrowserContentResponse } from "../shared/messages.js";
import { BrowserContentResult, type BrowserPageIdentity } from "@blip/protocol";
import { captureVisibleContent, handleBrowserContentRequest } from "./browser-content.js";
import { parseBrowserCommand } from "../../../server/src/browser/commands.js";
import { createBrowserRequestDispatcher } from "../background/browser.js";
import { installPersistentSubmitGuard } from "./submit-guard.js";

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

function openRequest(
  linkId: string,
  pageIdentity = identity,
  authorizationMode: "user-command" | "spoken" = "user-command",
): BrowserContentRequest {
  return {
    t: "browser-content",
    operation: "open-link",
    identity: pageIdentity,
    linkId,
    authorizationId: "core-auth-1",
    authorizationMode,
  };
}

function readItemRequest(itemId: string, pageIdentity = identity): BrowserContentRequest {
  return { t: "browser-content", operation: "read-item", identity: pageIdentity, itemId };
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
    installPersistentSubmitGuard(document);
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
    const listItem = document.createElement("li");
    listItem.textContent = "Unordered list row";
    document.body.append(listItem);
    const tableRow = document.createElement("tr");
    tableRow.textContent = "Table row content";
    document.body.append(tableRow);
    const accessibleRow = document.createElement("div");
    accessibleRow.setAttribute("role", "row");
    accessibleRow.textContent = "Accessible row content";
    document.body.append(accessibleRow);

    const capture = captureWithFixedClock();
    const items = capture.items?.map(({ text, visibleDate }) => ({ text, visibleDate })) ?? [];
    expect(items.slice(0, 5)).toEqual([
      { text: "Unique item 2026-10-18T12:30:00Z Unique item article text", visibleDate: "2026-10-18T12:30:00Z" },
      { text: "Tied item one 2026-10-17T09:00:00Z Tied item one article text", visibleDate: "2026-10-17T09:00:00Z" },
      { text: "Tied item two 2026-10-17T09:00:00Z Tied item two article text", visibleDate: "2026-10-17T09:00:00Z" },
      { text: "Missing date Missing date article text", visibleDate: null },
      { text: "Malformed date yesterday Malformed date article text", visibleDate: null },
    ]);
    expect(items.slice(5).map(({ text }) => text).sort()).toEqual([
      "Accessible row content", "Generic list row", "Table row content", "Unordered list row",
    ]);
    expect(new Set(capture.items?.map((item) => item.itemId)).size).toBe(capture.items?.length);
    expect(capture.items?.every((item) => item.identity === identity && item.frameId === 0)).toBe(true);
  });

  it("captures repeated unlabelled link rows as generic visible items", () => {
    const list = document.createElement("div");
    for (let index = 1; index <= 3; index += 1) {
      const row = document.createElement("div");
      const link = document.createElement("a");
      link.href = `/message/${index}`;
      link.textContent = `Subject ${index}`;
      const snippet = document.createElement("span");
      snippet.textContent = `Sender ${index} shared a detailed note about the upcoming event.`;
      row.append(link, snippet);
      list.append(row);
    }
    document.body.append(list);

    const capture = captureWithFixedClock();
    expect(capture.items?.map(({ text }) => text)).toEqual([
      "Subject 1 Sender 1 shared a detailed note about the upcoming event.",
      "Subject 2 Sender 2 shared a detailed note about the upcoming event.",
      "Subject 3 Sender 3 shared a detailed note about the upcoming event.",
    ]);
    expect(capture.items?.every((item) => contentResponse(handleBrowserContentRequest(document, readItemRequest(item.itemId), 0))
      .operation === "read-item")).toBe(true);
  });

  it("returns a valid bounded capture for a long visible article and can re-read it", () => {
    const article = document.createElement("article");
    article.textContent = "A long visible message. ".repeat(40);
    document.body.append(article);
    const capture = captureWithFixedClock();
    expect(BrowserContentResult.safeParse(capture).success).toBe(true);
    expect(Array.from(capture.items![0]!.text)).toHaveLength(400);
    expect(capture.truncated).toBe(true);
    expect(contentResponse(handleBrowserContentRequest(document, readItemRequest(capture.items![0]!.itemId), 0)).operation).toBe("read-item");
  });

  it("keeps generic item capture bounded on long inbox-style link lists", () => {
    const list = document.createElement("div");
    for (let index = 1; index <= 500; index += 1) {
      const row = document.createElement("div");
      const link = document.createElement("a");
      link.href = `/message/${index}`;
      link.textContent = `Subject ${index}`;
      const snippet = document.createElement("span");
      snippet.textContent = `Sender ${index} shared a detailed note about the upcoming event.`;
      row.append(link, snippet);
      list.append(row);
    }
    document.body.append(list);

    const capture = captureWithFixedClock();
    expect(capture.status).toBe("supported");
    expect(capture.items).toHaveLength(20);
    expect(capture.items?.[0]?.text).toContain("Sender 1");
    expect(capture.items?.[19]?.text).toContain("Sender 20");
    expect(capture.truncated).toBe(true);
  });

  it("revalidates and reads ordinary list and table rows as page items", () => {
    const listItem = document.createElement("li");
    listItem.textContent = "A visible list entry.";
    document.body.append(listItem);
    const tableRow = document.createElement("tr");
    tableRow.textContent = "A visible table entry.";
    document.body.append(tableRow);
    const capture = captureWithFixedClock();

    for (const item of capture.items ?? []) {
      const response = contentResponse(handleBrowserContentRequest(document, readItemRequest(item.itemId), 0));
      expect(response).toMatchObject({ operation: "read-item", result: { itemId: item.itemId, text: item.text } });
    }
    expect(capture.items?.map((item) => item.text)).toEqual(["A visible list entry.", "A visible table entry."]);
  });

  it("submits a page search only through one visible, uniquely identified search field", () => {
    const form = document.createElement("form");
    form.innerHTML = '<input type="search" aria-label="Search mail"><button type="submit">Search</button>';
    document.body.append(form);
    addVisibleRects();
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitted);
    captureVisibleContent(document, identity, { now: () => 0 });

    const response = handleBrowserContentRequest(document, {
      t: "browser-content", operation: "site-search", identity, query: "YouTube",
    }, 0);
    expect(contentResponse(response)).toMatchObject({ operation: "site-search", result: { status: "submitted", ...identity } });
    expect((form.querySelector("input") as HTMLInputElement).value).toBe("YouTube");
    expect(submitted).toHaveBeenCalledOnce();
    // The allowance is consumed by this search, not retained for later submits.
    form.requestSubmit(form.querySelector("button")!);
    expect(submitted).toHaveBeenCalledOnce();
  });

  it("activates implicit submit buttons and their site click handlers", () => {
    const form = document.createElement("form");
    form.innerHTML = '<input type="search" aria-label="Search"><button>Search</button>';
    document.body.append(form);
    addVisibleRects();
    const clicked = vi.fn();
    form.querySelector("button")!.addEventListener("click", clicked);
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitted);
    captureVisibleContent(document, identity, { now: () => 0 });
    handleBrowserContentRequest(document, { t: "browser-content", operation: "site-search", identity, query: "artificial intelligence" }, 0);
    expect(clicked).toHaveBeenCalledOnce();
    expect(submitted).toHaveBeenCalledOnce();
  });

  it("refuses an ambiguous site search without submitting either form", () => {
    const first = document.createElement("form");
    first.innerHTML = '<input type="search" aria-label="Search mail"><button type="submit">Search</button>';
    const second = document.createElement("form");
    second.innerHTML = '<input type="search" aria-label="Search contacts"><button type="submit">Search</button>';
    document.body.append(first, second);
    addVisibleRects();
    const submitted = vi.fn((event: Event) => event.preventDefault());
    first.addEventListener("submit", submitted);
    second.addEventListener("submit", submitted);
    captureVisibleContent(document, identity, { now: () => 0 });

    const response = handleBrowserContentRequest(document, {
      t: "browser-content", operation: "site-search", identity, query: "YouTube",
    }, 0);
    expect(response).toMatchObject({ t: "browser-content.error", code: "ambiguous" });
    expect(submitted).not.toHaveBeenCalled();
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

  it("finds readable content on a large page without walking every layout node", () => {
    for (let index = 0; index < 2500; index += 1) {
      const layout = document.createElement("div");
      document.body.append(layout);
    }
    addText("p", "The latest visible message is ready to read.");

    let ticks = 0;
    const result = captureVisibleContent(document, identity, { now: () => ticks++, timeBudgetMs: 100 });

    expect(result.status).toBe("supported");
    expect(result.blocks.map(({ text }) => text)).toEqual(["The latest visible message is ready to read."]);
  });

  it("lists only visible link labels with a host hint and identity, never URL query or fragment", () => {
    vi.spyOn(document.defaultView!.performance, "now").mockReturnValue(0);
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

  it("re-reads link visibility, connection, href, target, and safe-GET eligibility before opening", () => {
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

  it("refuses disconnected, new-context, unconfirmed external/action links, and malformed links", () => {
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
      .toMatchObject({ t: "browser-content.error", code: "unauthorized" });

    anchor.href = "javascript:alert(1)";
    const malformed = requestFor(anchor, 0, "malformed");
    expect(handleBrowserContentRequest(document, openRequest(malformed.linkId, malformed.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "invalid-target" });

    anchor.href = "https://example.test/continue";
    anchor.textContent = "Continue";
    const denied = requestFor(anchor, 0, "policy");
    expect(handleBrowserContentRequest(document, openRequest(denied.linkId, denied.identity), 0))
      .toMatchObject({ t: "browser-content.error", code: "unauthorized" });

    const confirmed = contentResponse(handleBrowserContentRequest(document,
      openRequest(denied.linkId, denied.identity, "spoken"), 0));
    expect(confirmed.operation).toBe("open-link");
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

  it("returns only the unchanged live text and visible date for a captured item", () => {
    addArticle("Current item", "2026-10-18T12:30:00Z");
    const capture = captureWithFixedClock();
    const item = capture.items![0]!;

    const response = contentResponse(handleBrowserContentRequest(document, readItemRequest(item.itemId, capture), 0));
    expect(response).toMatchObject({
      operation: "read-item",
      result: {
        itemId: item.itemId,
        text: item.text,
        visibleDate: "2026-10-18T12:30:00Z",
        identity,
        frameId: 0,
      },
    });
  });

  it("rejects an item after its visible text or date changes", () => {
    const article = addArticle("Captured item", "2026-10-18T12:30:00Z");
    const capture = captureWithFixedClock();
    const item = capture.items![0]!;
    article.querySelector("p")!.textContent = "Changed visible text";
    expect(handleBrowserContentRequest(document, readItemRequest(item.itemId, capture), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });

    const nextIdentity = { ...identity, captureId: "capture-date-change", captureRevision: 2 };
    captureVisibleContent(document, nextIdentity, { now: () => 0 });
    const time = article.querySelector("time")!;
    time.textContent = "2026-10-19T12:30:00Z";
    time.setAttribute("datetime", "2026-10-19T12:30:00Z");
    expect(handleBrowserContentRequest(document, readItemRequest(`${nextIdentity.captureId}.i0`, nextIdentity), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });
  });

  it("rejects hidden, disconnected, stale-identity, wrong-frame, and unsupported item requests", () => {
    const article = addArticle("Current item");
    const capture = captureWithFixedClock();
    const itemId = capture.items![0]!.itemId;

    article.setAttribute("hidden", "");
    expect(handleBrowserContentRequest(document, readItemRequest(itemId, capture), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });
    article.removeAttribute("hidden");

    const disconnectedIdentity = { ...identity, captureId: "capture-disconnected", captureRevision: 2 };
    captureVisibleContent(document, disconnectedIdentity, { now: () => 0 });
    const disconnectedItemId = `${disconnectedIdentity.captureId}.i0`;
    article.remove();
    expect(handleBrowserContentRequest(document, readItemRequest(disconnectedItemId, disconnectedIdentity), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });

    addArticle("Current item again");
    const currentIdentity = { ...identity, captureId: "capture-current-again", captureRevision: 3 };
    const current = captureVisibleContent(document, currentIdentity, { now: () => 0 });
    const currentItemId = current.items![0]!.itemId;
    expect(handleBrowserContentRequest(document, readItemRequest(currentItemId, { ...currentIdentity, captureRevision: 4 }), 0))
      .toMatchObject({ t: "browser-content.error", code: "stale-capture" });
    expect(handleBrowserContentRequest(document, readItemRequest(currentItemId, currentIdentity), 3))
      .toMatchObject({ t: "browser-content.error", code: "unsupported-frame" });
    expect(handleBrowserContentRequest(document, readItemRequest("unknown-item", currentIdentity), 0))
      .toMatchObject({ t: "browser-content.error", code: "not-found" });
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

  it("opens an authorized same-origin safe GET through the background tab API", async () => {
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
      operation: {
        op: "open-link", linkId: link.linkId, identity: listed.result,
        authorizationId: "core-auth-link", authorizationMode: "user-command",
      },
    };
    const opened = await dispatch(authorized);
    expect(opened).toMatchObject({ ok: true, operation: "open-link" });
    expect(navigations).toEqual(["https://example.test/dismiss"]);
    expect(currentTab().url).toBe("https://example.test/dismiss");
    const replay = await dispatch({ ...authorized, requestId: "open-replay" });
    expect(replay).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(navigations).toHaveLength(1);
  });

  it("rejects stale pages and prevents a user-command grant from opening a cross-site link", async () => {
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
        authorizationMode: "user-command",
      },
    });
    expect(external).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(current.navigations).toEqual([]);

    const spoken = browserDispatcher();
    const spokenList = await spoken.dispatch({ requestId: "links-external-confirmed", tabId: 7, operation: { op: "list-links" } });
    if (!spokenList.ok || spokenList.operation !== "list-links") throw new Error("expected link list");
    const confirmed = await spoken.dispatch({
      requestId: "open-external-confirmed", tabId: 7,
      operation: {
        op: "open-link",
        linkId: spokenList.result.links[0]!.linkId,
        identity: spokenList.result,
        authorizationId: "auth-external-confirmed",
        authorizationMode: "spoken",
      },
    });
    expect(confirmed).toMatchObject({ ok: true, operation: "open-link" });
    expect(spoken.navigations).toEqual(["https://outside.test/dismiss"]);
  });
});
