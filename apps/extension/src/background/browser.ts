import {
  BrowserDestinationUrl,
  BrowserOperationName,
  BrowserPageUrl,
  BrowserRequestPayload,
  BrowserResultPayload,
  type BrowserOperation,
  type BrowserResultPayload as BrowserResult,
} from "@blip/protocol";
import {
  findBrowserTargetTab,
  isBrowserTargetTab,
  isSupportedTargetTab,
  rememberTargetTab,
  type BrowserTargetTab,
  type TabRecord,
} from "./tabs.js";
import { snapshotVersions } from "./versions.js";

type BrowserApi = {
  tabs?: {
    get?(tabId: number): Promise<TabRecord>;
    query?(queryInfo: Record<string, unknown>): Promise<TabRecord[]>;
    create?(properties: { active?: boolean; url?: string }): Promise<TabRecord>;
    update?(tabId: number, properties: { active?: boolean; url?: string }): Promise<TabRecord>;
    reload?(tabId: number, properties?: { bypassCache?: boolean }): Promise<void>;
  };
  search?: {
    query?(queryInfo: { text: string; disposition: "CURRENT_TAB" }): Promise<void>;
  };
  permissions?: {
    contains?(permissions: { permissions: string[] }): Promise<boolean>;
  };
};

export type BrowserRequestDependencies = {
  api?: BrowserApi;
  findCurrentTargetTab?: () => Promise<BrowserTargetTab | undefined>;
  rememberTargetTab?: (tab: TabRecord) => boolean;
  now?: () => number;
};

type FailureCode = Extract<BrowserResult, { ok: false }> extends infer Failure
  ? Failure extends { error: { code: infer Code } } ? Code : never
  : never;
type FailureOperation = Extract<BrowserResult, { ok: false }> extends infer Failure
  ? Failure extends { operation: infer Operation } ? Operation : never
  : never;

const AUTHORIZATION_TTL_MS = 30_000;
const MAX_TRACKED_AUTHORIZATIONS = 2048;
const BROWSER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function requestIdFrom(value: unknown): string {
  const candidate = objectRecord(value)?.requestId;
  return typeof candidate === "string" && BROWSER_ID_PATTERN.test(candidate) ? candidate : "invalid-browser-request";
}

function operationFrom(value: unknown): FailureOperation {
  const operation = objectRecord(objectRecord(value)?.operation)?.op;
  return BrowserOperationName.safeParse(operation).success && operation !== "unknown"
    ? operation as FailureOperation
    : "unknown" as FailureOperation;
}

function failure(
  requestId: string,
  operation: FailureOperation,
  code: FailureCode,
  message: string,
): BrowserResult {
  return BrowserResultPayload.parse({
    ok: false,
    requestId,
    operation,
    error: { code, message: Array.from(message).slice(0, 300).join("") },
  });
}

function success(requestId: string, operation: BrowserOperation["op"], result: unknown): BrowserResult {
  return BrowserResultPayload.parse({ ok: true, requestId, operation, result });
}

function apiFor(dependencies: BrowserRequestDependencies): BrowserApi | undefined {
  return dependencies.api ?? (globalThis as typeof globalThis & { chrome?: BrowserApi }).chrome;
}

function titleText(tab: TabRecord): string {
  return Array.from(typeof tab.title === "string" ? tab.title : "").slice(0, 200).join("");
}

function tabSummary(tab: BrowserTargetTab): { tabId: number; title: string; hostHint: string | null } {
  let hostHint: string | null = null;
  try {
    const url = new URL(tab.url);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "") {
      hostHint = url.hostname;
    }
  } catch {
    // Blank pages intentionally have no host hint.
  }
  return { tabId: tab.id, title: titleText(tab), hostHint };
}

function currentTabUrl(tab: BrowserTargetTab): string | undefined {
  return BrowserPageUrl.safeParse(tab.url).success ? tab.url : undefined;
}

async function liveCurrentTab(
  api: BrowserApi,
  dependencies: BrowserRequestDependencies,
  requestedTabId?: number,
  expectedUrl?: string,
): Promise<BrowserTargetTab | undefined> {
  const findCurrent = dependencies.findCurrentTargetTab ?? (() => findBrowserTargetTab());
  let selected: BrowserTargetTab | undefined;
  try {
    selected = await findCurrent();
  } catch {
    return undefined;
  }
  if (!selected || (requestedTabId !== undefined && selected.id !== requestedTabId) ||
      (expectedUrl !== undefined && selected.url !== expectedUrl) || !api.tabs?.get) return undefined;

  try {
    const live = await api.tabs.get(selected.id);
    if (!isBrowserTargetTab(live) || live.url !== selected.url ||
        (expectedUrl !== undefined && live.url !== expectedUrl)) return undefined;
    return live;
  } catch {
    return undefined;
  }
}

async function listTabs(api: BrowserApi, dependencies: BrowserRequestDependencies, requestId: string): Promise<BrowserResult> {
  if (!api.tabs?.query) return failure(requestId, "tabs", "unavailable", "The browser tab list is unavailable.");
  let tabs: TabRecord[];
  try {
    tabs = await api.tabs.query({});
  } catch {
    return failure(requestId, "tabs", "unavailable", "The browser tab list is unavailable.");
  }

  const supported = tabs.filter(isBrowserTargetTab);
  const selected = await (dependencies.findCurrentTargetTab ?? (() => findBrowserTargetTab()))().catch(() => undefined);
  const result = {
    activeTabId: selected && supported.some((tab) => tab.id === selected.id) ? selected.id : null,
    tabs: supported.slice(0, 50).map((tab) => tabSummary(tab)),
    truncated: supported.length > 50,
  };
  return success(requestId, "tabs", result);
}

function authorizationId(operation: BrowserOperation): string | undefined {
  if (operation.op === "navigate" || operation.op === "search" || operation.op === "open-link") {
    return operation.authorizationId;
  }
  return undefined;
}

/** Create an injectable dispatcher so API behavior and stale state can be tested without Chrome. */
export function createBrowserRequestDispatcher(dependencies: BrowserRequestDependencies = {}) {
  const usedAuthorizations = new Map<string, number>();
  const now = dependencies.now ?? Date.now;

  function consumeAuthorization(id: string): boolean {
    const currentTime = now();
    for (const [usedId, expiresAt] of usedAuthorizations) {
      if (expiresAt <= currentTime) usedAuthorizations.delete(usedId);
    }
    if (usedAuthorizations.has(id) || usedAuthorizations.size >= MAX_TRACKED_AUTHORIZATIONS) return false;
    usedAuthorizations.set(id, currentTime + AUTHORIZATION_TTL_MS);
    return true;
  }

  function authorizationWasUsed(id: string): boolean {
    const currentTime = now();
    for (const [usedId, expiresAt] of usedAuthorizations) {
      if (expiresAt <= currentTime) usedAuthorizations.delete(usedId);
    }
    return usedAuthorizations.has(id);
  }

  async function dispatchValid(request: Extract<ReturnType<typeof BrowserRequestPayload.parse>, object>): Promise<BrowserResult> {
    const { requestId, tabId, operation } = request;
    const api = apiFor(dependencies);
    if (!api) return failure(requestId, operation.op, "unavailable", "Browser APIs are unavailable.");

    if (operation.op === "history") {
      return failure(requestId, "history", "unsupported-destination-check", "The next history destination cannot be verified safely.");
    }

    if (operation.op === "tabs") {
      if (operation.action === "list") return listTabs(api, dependencies, requestId);

      if (operation.action === "open-blank") {
        if (!api.tabs?.create) return failure(requestId, "tabs", "unavailable", "A blank tab could not be created.");
        try {
          const created = await api.tabs.create({ active: true, url: "about:blank" });
          if (!isBrowserTargetTab(created) || created.url !== "about:blank") {
            return failure(requestId, "tabs", "unavailable", "The browser did not create a blank tab.");
          }
          (dependencies.rememberTargetTab ?? rememberTargetTab)(created);
          snapshotVersions.forget(created.id);
          return listTabs(api, dependencies, requestId);
        } catch {
          return failure(requestId, "tabs", "unavailable", "A blank tab could not be created.");
        }
      }

      const targetId = operation.targetTabId;
      if (targetId === undefined || !api.tabs?.get || !api.tabs.update) {
        return failure(requestId, "tabs", "invalid-target", "That tab is no longer available.");
      }
      try {
        const target = await api.tabs.get(targetId);
        if (!isBrowserTargetTab(target)) return failure(requestId, "tabs", "invalid-target", "That tab is not a supported browser target.");
        const rechecked = await api.tabs.get(targetId);
        if (!isBrowserTargetTab(rechecked) || rechecked.url !== target.url) {
          return failure(requestId, "tabs", "stale-page", "That tab changed before it could be activated.");
        }
        const activated = await api.tabs.update(targetId, { active: true });
        if (activated.id !== targetId || (activated.url !== undefined && activated.url !== target.url)) {
          return failure(requestId, "tabs", "stale-page", "That tab changed while it was being activated.");
        }
        const remembered = { ...activated, id: targetId, url: activated.url ?? target.url };
        (dependencies.rememberTargetTab ?? rememberTargetTab)(remembered);
        snapshotVersions.forget(targetId);
        return listTabs(api, dependencies, requestId);
      } catch {
        return failure(requestId, "tabs", "invalid-target", "That tab is no longer available.");
      }
    }

    if (operation.op === "location") {
      const current = await liveCurrentTab(api, dependencies, tabId);
      if (!current) return failure(requestId, "location", tabId === undefined ? "unsupported-page" : "stale-page", "The current browser tab is unavailable or changed.");
      const pageUrl = currentTabUrl(current);
      if (!pageUrl) return failure(requestId, "location", "restricted-page", "This browser page cannot be read safely.");
      return success(requestId, "location", {
        tabId: current.id,
        pageUrl,
        title: titleText(current),
        status: isSupportedTargetTab(current) ? "supported" : "restricted",
      });
    }

    if (operation.op === "navigate") {
      const parsedDestination = BrowserDestinationUrl.safeParse(operation.url);
      if (!parsedDestination.success) return failure(requestId, "navigate", "invalid-target", "Navigation requires a canonical HTTP(S) destination.");
      if (authorizationId(operation) === undefined) return failure(requestId, "navigate", "unauthorized", "Navigation requires core authorization.");
      if (authorizationWasUsed(operation.authorizationId)) return failure(requestId, "navigate", "unauthorized", "This browser authorization was already used or expired.");
      if (!api.tabs?.update) return failure(requestId, "navigate", "unavailable", "Browser navigation is unavailable.");
      const current = await liveCurrentTab(api, dependencies, tabId);
      if (!current) return failure(requestId, "navigate", "stale-page", "The authorized source tab changed before navigation.");
      const beforeUrl = current.url;
      const rechecked = await liveCurrentTab(api, dependencies, current.id, beforeUrl);
      if (!rechecked) return failure(requestId, "navigate", "stale-page", "The authorized source page changed before navigation.");
      if (!consumeAuthorization(operation.authorizationId)) return failure(requestId, "navigate", "unauthorized", "This browser authorization was already used or expired.");
      try {
        const updated = await api.tabs.update(current.id, { url: parsedDestination.data });
        if (updated.id !== current.id) return failure(requestId, "navigate", "stale-page", "The target tab changed during navigation.");
        (dependencies.rememberTargetTab ?? rememberTargetTab)({ ...updated, id: current.id, url: parsedDestination.data });
        snapshotVersions.forget(current.id);
        return success(requestId, "navigate", { tabId: current.id, status: "dispatched" });
      } catch {
        return failure(requestId, "navigate", "exception", "The browser rejected the authorized destination.");
      }
    }

    if (operation.op === "reload") {
      const current = await liveCurrentTab(api, dependencies, tabId);
      if (!current) return failure(requestId, "reload", "stale-page", "The current browser tab changed before reload.");
      const rechecked = await liveCurrentTab(api, dependencies, current.id, current.url);
      if (!rechecked) return failure(requestId, "reload", "stale-page", "The current browser page changed before reload.");
      if (!api.tabs?.reload) return failure(requestId, "reload", "unavailable", "Browser reload is unavailable.");
      try {
        await api.tabs.reload(current.id);
        snapshotVersions.forget(current.id);
        return success(requestId, "reload", { tabId: current.id, status: "dispatched" });
      } catch {
        return failure(requestId, "reload", "exception", "The browser could not reload this page.");
      }
    }

    if (operation.op === "search") {
      if (authorizationId(operation) === undefined) return failure(requestId, "search", "unauthorized", "Search requires core authorization.");
      if (authorizationWasUsed(operation.authorizationId)) return failure(requestId, "search", "unauthorized", "This browser authorization was already used or expired.");
      if (operation.route !== "browser-default") {
        return failure(requestId, "search", "unavailable", "Site search is handled by the core form workflow.");
      }
      const current = await liveCurrentTab(api, dependencies, tabId);
      if (!current) return failure(requestId, "search", "stale-page", "The authorized search source tab changed.");
      const sourceUrl = current.url;
      let hasPermission = false;
      try {
        hasPermission = await api.permissions?.contains?.({ permissions: ["search"] }) === true;
      } catch {
        hasPermission = false;
      }
      if (!hasPermission || !api.search?.query) {
        return failure(requestId, "search", "unavailable", "Browser-default search is unavailable without its API permission.");
      }
      const rechecked = await liveCurrentTab(api, dependencies, current.id, sourceUrl);
      if (!rechecked) return failure(requestId, "search", "stale-page", "The authorized search source page changed before dispatch.");
      if (!consumeAuthorization(operation.authorizationId)) return failure(requestId, "search", "unauthorized", "This browser authorization was already used or expired.");
      try {
        await api.search.query({ text: operation.query, disposition: "CURRENT_TAB" });
        snapshotVersions.forget(current.id);
        return success(requestId, "search", { tabId: current.id, status: "dispatched" });
      } catch {
        return failure(requestId, "search", "unavailable", "Browser-default search failed; no fallback was used.");
      }
    }

    if (operation.op === "open-link") {
      if (authorizationId(operation) === undefined) return failure(requestId, "open-link", "unauthorized", "Opening a link requires core authorization.");
      if (authorizationWasUsed(operation.authorizationId)) return failure(requestId, "open-link", "unauthorized", "This browser authorization was already used or expired.");
      const current = await liveCurrentTab(api, dependencies, tabId);
      if (!current || current.id !== operation.identity.tabId || current.url !== operation.identity.pageUrl) {
        return failure(requestId, "open-link", "stale-page", "The selected link no longer belongs to the current page.");
      }
      if (!consumeAuthorization(operation.authorizationId)) return failure(requestId, "open-link", "unauthorized", "This browser authorization was already used or expired.");
      return failure(requestId, "open-link", "unavailable", "The extension has no current visible-link capture to open.");
    }

    return failure(requestId, operation.op, "unavailable", "This browser operation is not available in the extension yet.");
  }

  return async (input: unknown): Promise<BrowserResult> => {
    const parsed = BrowserRequestPayload.safeParse(input);
    if (!parsed.success) {
      const requestId = requestIdFrom(input);
      const operation = operationFrom(input);
      const candidateOperation = objectRecord(objectRecord(input)?.operation);
      const id = candidateOperation?.authorizationId;
      const missingAuthorization = (operation === "navigate" || operation === "search" || operation === "open-link") &&
        (typeof id !== "string" || id.length === 0);
      return failure(
        requestId,
        operation,
        missingAuthorization ? "unauthorized" : "invalid-request",
        missingAuthorization ? "This operation requires core authorization." : "The browser request is malformed.",
      );
    }

    try {
      const result = await dispatchValid(parsed.data);
      const checked = BrowserResultPayload.safeParse(result);
      return checked.success
        ? checked.data
        : failure(parsed.data.requestId, parsed.data.operation.op, "exception", "The extension could not validate its browser result.");
    } catch {
      return failure(parsed.data.requestId, parsed.data.operation.op, "exception", "The extension could not complete this browser operation.");
    }
  };
}

const defaultBrowserRequestDispatcher = createBrowserRequestDispatcher();

/** Validate and execute one typed browser.request without exposing raw Chrome APIs to the core. */
export function dispatchBrowserRequest(request: unknown): Promise<BrowserResult> {
  return defaultBrowserRequestDispatcher(request);
}
