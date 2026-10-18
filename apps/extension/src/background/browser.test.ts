import { describe, expect, it, vi } from "vitest";
import { createBrowserRequestDispatcher } from "./browser.js";
import { registerNavigationListeners, type NavigationBrowserApi } from "./navigation.js";
import { snapshotVersions } from "./versions.js";
import type { BrowserTargetTab, TabRecord } from "./tabs.js";

const PAGE: BrowserTargetTab = { id: 7, url: "https://forms.example/contact", title: "Contact", active: true };

function browserApi(overrides: Record<string, unknown> = {}) {
  const tabs = {
    get: vi.fn(async (tabId: number): Promise<TabRecord> => tabId === PAGE.id ? { ...PAGE } : { id: tabId, url: "about:blank" }),
    query: vi.fn(async (_queryInfo?: Record<string, unknown>) => [{ ...PAGE }]),
    create: vi.fn(async (): Promise<TabRecord> => ({ id: 9, url: "about:blank", title: "New tab", active: true })),
    update: vi.fn(async (tabId: number, properties: { active?: boolean; url?: string }): Promise<TabRecord> => ({
      ...(tabId === PAGE.id ? PAGE : { id: tabId, url: "about:blank" }),
      ...properties,
    })),
    reload: vi.fn(async () => undefined),
  };
  const permissions = { contains: vi.fn(async () => true) };
  const search = { query: vi.fn(async () => undefined) };
  return {
    api: { tabs, permissions, search, ...overrides },
    tabs,
    permissions,
    search,
  };
}

function request(operation: Record<string, unknown>, tabId: number | undefined = PAGE.id) {
  return {
    requestId: "request-1",
    ...(tabId !== undefined ? { tabId } : {}),
    operation,
  };
}

function dispatcher(
  apiState: ReturnType<typeof browserApi>,
  options: { selected?: () => Promise<BrowserTargetTab | undefined>; remember?: (tab: TabRecord) => boolean } = {},
) {
  let selected: BrowserTargetTab | undefined = PAGE;
  const findCurrentTargetTab = options.selected ?? (async () => selected);
  const rememberTargetTab = options.remember ?? ((tab: TabRecord) => {
    if (typeof tab.id !== "number" || typeof tab.url !== "string") return false;
    selected = { ...tab, id: tab.id, url: tab.url };
    return true;
  });
  return createBrowserRequestDispatcher({
    api: apiState.api as never,
    findCurrentTargetTab,
    rememberTargetTab,
    now: () => 1000,
  });
}

describe("extension browser request dispatcher", () => {
  it("rejects malformed and unknown requests with typed failures and no Chrome dispatch", async () => {
    const state = browserApi();
    const dispatch = dispatcher(state);

    const malformed = await dispatch(request({ op: "navigate", url: "https://next.example/" }));
    const unknown = await dispatch(request({ op: "open-a-site", destination: "https://next.example/" }));

    expect(malformed).toMatchObject({ ok: false, operation: "navigate", error: { code: "unauthorized" } });
    expect(unknown).toMatchObject({ ok: false, operation: "unknown", error: { code: "invalid-request" } });
    expect(state.tabs.update).not.toHaveBeenCalled();
    expect(state.tabs.create).not.toHaveBeenCalled();
    expect(state.search.query).not.toHaveBeenCalled();
  });

  it("accepts only explicit canonical HTTP(S) navigation after one-use core authorization", async () => {
    const state = browserApi();
    const dispatch = dispatcher(state);
    const valid = request({ op: "navigate", url: "https://next.example/path", authorizationId: "auth-nav-1" });

    const first = await dispatch(valid);
    const replay = await dispatch({ ...valid, requestId: "request-2" });
    const unsupported = await dispatch(request({
      op: "navigate", url: "javascript:alert(1)", authorizationId: "auth-nav-2",
    }));

    expect(first).toMatchObject({ ok: true, operation: "navigate", result: { tabId: 7, status: "dispatched" } });
    expect(state.tabs.update).toHaveBeenCalledTimes(1);
    expect(state.tabs.update).toHaveBeenCalledWith(7, { url: "https://next.example/path" });
    expect(replay).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(unsupported).toMatchObject({ ok: false, error: { code: "invalid-request" } });
  });

  it("creates and tracks a blank tab while keeping it restricted for content reading", async () => {
    const state = browserApi();
    let selected: BrowserTargetTab | undefined = PAGE;
    const dispatch = createBrowserRequestDispatcher({
      api: state.api as never,
      findCurrentTargetTab: async () => selected,
      rememberTargetTab: (tab) => {
        if (typeof tab.id !== "number" || typeof tab.url !== "string") return false;
        selected = { ...tab, id: tab.id, url: tab.url };
        return true;
      },
    });
    state.tabs.query.mockResolvedValue([
      { ...PAGE },
      { id: 9, url: "about:blank", title: "New tab", active: true },
    ]);

    const opened = await dispatch(request({ op: "tabs", action: "open-blank" }, undefined));
    const location = await dispatch(request({ op: "location" }, 9));

    expect(state.tabs.create).toHaveBeenCalledWith({ active: true, url: "about:blank" });
    expect(opened).toMatchObject({ ok: true, operation: "tabs", result: { activeTabId: 9 } });
    expect(location).toMatchObject({ ok: true, operation: "location", result: {
      tabId: 9, pageUrl: "about:blank", status: "restricted",
    } });
  });

  it("refuses a stale source tab before navigating", async () => {
    const state = browserApi();
    state.tabs.get.mockImplementation(async (tabId: number) => tabId === 7
      ? { ...PAGE, url: "https://forms.example/changed" }
      : { id: tabId, url: "about:blank" });
    const dispatch = dispatcher(state);

    const result = await dispatch(request({ op: "navigate", url: "https://next.example/", authorizationId: "auth-stale" }));

    expect(result).toMatchObject({ ok: false, operation: "navigate", error: { code: "stale-page" } });
    expect(state.tabs.update).not.toHaveBeenCalled();
  });

  it("refuses history movement when the next destination cannot be established", async () => {
    const state = browserApi();
    const dispatch = dispatcher(state);

    const back = await dispatch(request({ op: "history", direction: "back" }));
    const forward = await dispatch(request({ op: "history", direction: "forward" }));

    expect(back).toMatchObject({ ok: false, operation: "history", error: { code: "unsupported-destination-check" } });
    expect(forward).toMatchObject({ ok: false, operation: "history", error: { code: "unsupported-destination-check" } });
    expect(state.tabs.update).not.toHaveBeenCalled();
    expect(state.tabs.get).not.toHaveBeenCalled();
  });

  it("reloads the current tab without cache bypass options", async () => {
    const state = browserApi();
    const dispatch = dispatcher(state);

    const result = await dispatch(request({ op: "reload" }));

    expect(result).toMatchObject({ ok: true, operation: "reload", result: { tabId: 7, status: "dispatched" } });
    expect(state.tabs.reload).toHaveBeenCalledTimes(1);
    expect(state.tabs.reload).toHaveBeenCalledWith(7);
  });

  it("uses only the exact browser-default query with CURRENT_TAB and no result-link authority", async () => {
    const state = browserApi();
    state.tabs.query.mockImplementation(async (queryInfo: Record<string, unknown> = {}) =>
      queryInfo["active"] === true ? [{ ...PAGE }] : [{ ...PAGE }]);
    const dispatch = dispatcher(state);
    const searchRequest = request({
      op: "search", route: "browser-default", query: "Gainesville bus schedule", authorizationId: "auth-search-1",
    });

    const searched = await dispatch(searchRequest);
    const changedQuery = await dispatch({
      ...searchRequest,
      requestId: "request-2",
      operation: { ...searchRequest.operation, query: "a different search" },
    });
    const changedPage = await dispatch({
      ...searchRequest,
      requestId: "request-3",
      tabId: 8,
    });
    const resultLink = await dispatch(request({
      op: "open-link",
      linkId: "link-1",
      identity: { captureId: "capture-1", captureRevision: 1, tabId: 7, pageUrl: PAGE.url },
      authorizationId: "auth-search-1",
    }));

    expect(searched).toMatchObject({ ok: true, operation: "search", result: { tabId: 7, status: "dispatched" } });
    expect(state.search.query).toHaveBeenCalledExactlyOnceWith({ text: "Gainesville bus schedule", disposition: "CURRENT_TAB" });
    expect(changedQuery).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(changedPage).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(resultLink).toMatchObject({ ok: false, operation: "open-link", error: { code: "unauthorized" } });
    expect(state.tabs.update).not.toHaveBeenCalled();
  });

  it("fails closed when search permission or the search API is absent", async () => {
    const denied = browserApi();
    denied.permissions.contains.mockResolvedValue(false);
    const deniedResult = await dispatcher(denied)(request({
      op: "search", route: "browser-default", query: "exact phrase", authorizationId: "auth-denied",
    }));

    const missingApi = browserApi({ search: undefined });
    const missingApiResult = await dispatcher(missingApi)(request({
      op: "search", route: "browser-default", query: "exact phrase", authorizationId: "auth-no-api",
    }));

    expect(deniedResult).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(denied.search.query).not.toHaveBeenCalled();
    expect(missingApiResult).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(missingApi.tabs.update).not.toHaveBeenCalled();
  });

  it("does not fall back when browser-default search rejects the exact request", async () => {
    const state = browserApi();
    state.search.query.mockRejectedValue(new Error("search unavailable"));
    const result = await dispatcher(state)(request({
      op: "search", route: "browser-default", query: "exact phrase", authorizationId: "auth-rejected",
    }));

    expect(result).toMatchObject({ ok: false, operation: "search", error: { code: "unavailable" } });
    expect(state.search.query).toHaveBeenCalledExactlyOnceWith({ text: "exact phrase", disposition: "CURRENT_TAB" });
    expect(state.tabs.update).not.toHaveBeenCalled();
  });

  it("rechecks that the selected page still matches the authorized search source", async () => {
    const state = browserApi();
    const dispatch = createBrowserRequestDispatcher({
      api: state.api as never,
      findCurrentTargetTab: vi.fn()
        .mockResolvedValueOnce(PAGE)
        .mockResolvedValueOnce({ ...PAGE, id: 8, url: "https://other.example/" }),
    });

    const result = await dispatch(request({
      op: "search", route: "browser-default", query: "exact phrase", authorizationId: "auth-stale-search",
    }));

    expect(result).toMatchObject({ ok: false, error: { code: "stale-page" } });
    expect(state.search.query).not.toHaveBeenCalled();
  });

  it("refuses browser-default search when Chrome would direct CURRENT_TAB elsewhere", async () => {
    const state = browserApi();
    state.tabs.query.mockImplementation(async (queryInfo: Record<string, unknown> = {}) =>
      queryInfo["active"] === true ? [{ id: 8, url: "https://other.example/" }] : [{ ...PAGE }]);

    const result = await dispatcher(state)(request({
      op: "search", route: "browser-default", query: "exact phrase", authorizationId: "auth-other-active",
    }));

    expect(result).toMatchObject({ ok: false, error: { code: "stale-page" } });
    expect(state.search.query).not.toHaveBeenCalled();
  });

  it("invalidates per-tab capture versions on top-level navigation, SPA changes, activation, and removal", async () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const event = (name: string) => ({ addListener: (listener: (...args: any[]) => void) => { handlers.set(name, listener); } });
    const pages = new Map<number, BrowserTargetTab>([
      [7, { ...PAGE }],
      [8, { id: 8, url: "about:blank", title: "New tab" }],
    ]);
    let selectedId = 7;
    const getTarget = async (tabId?: number): Promise<BrowserTargetTab | undefined> => pages.get(tabId ?? selectedId);
    const scheduler = { enqueue: vi.fn(), cancel: vi.fn() };
    const api: NavigationBrowserApi = {
      tabs: {
        onActivated: event("activated"),
        onUpdated: event("updated"),
        onRemoved: event("removed"),
        query: vi.fn(async () => []),
      },
      webNavigation: { onCommitted: event("committed"), onHistoryStateUpdated: event("history") },
    };
    registerNavigationListeners({ api, scheduler, findTargetTab: getTarget });

    snapshotVersions.next(7, "before-navigation");
    pages.set(7, { ...PAGE, url: "https://forms.example/next" });
    handlers.get("committed")?.({ tabId: 7, frameId: 0, url: "https://forms.example/next" });
    expect(snapshotVersions.next(7, "after-navigation")).toBe(1);

    snapshotVersions.next(7, "before-spa");
    pages.set(7, { ...PAGE, url: "https://forms.example/step-two" });
    handlers.get("history")?.({ tabId: 7, frameId: 0, url: "https://forms.example/step-two" });
    expect(snapshotVersions.next(7, "after-spa")).toBe(1);

    snapshotVersions.next(8, "before-activation");
    selectedId = 8;
    handlers.get("activated")?.({ tabId: 8 });
    expect(snapshotVersions.next(8, "after-activation")).toBe(1);

    snapshotVersions.next(8, "before-removal");
    handlers.get("removed")?.(8);
    expect(snapshotVersions.next(8, "after-removal")).toBe(1);
    expect(scheduler.cancel).toHaveBeenCalledWith(8);
  });
});
