import { snapshotVersions } from "./versions.js";

const BLIP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLIP_PORTS = new Set(["7777", "5173"]);

export type TabRecord = { id?: number; url?: string; title?: string; lastAccessed?: number; active?: boolean };
export type TargetTab = TabRecord & { id: number; url: string };

type TabsApi = {
  onActivated?: { addListener(listener: (info: { tabId: number }) => void): void };
  onRemoved?: { addListener(listener: (tabId: number) => void): void };
  get(tabId: number): Promise<TabRecord>;
  query(queryInfo: Record<string, never>): Promise<TabRecord[]>;
};

function browserTabs(): TabsApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: { tabs?: TabsApi } }).chrome?.tabs;
}

function isBlipUrl(url: URL): boolean {
  return BLIP_HOSTS.has(url.hostname) && BLIP_PORTS.has(url.port);
}

export function isSupportedTargetTab(tab: TabRecord): tab is TargetTab {
  if (tab.id === undefined || typeof tab.url !== "string") return false;
  try {
    const url = new URL(tab.url);
    return (url.protocol === "http:" || url.protocol === "https:") && !isBlipUrl(url);
  } catch {
    return false;
  }
}

/** Update the retained page when focus moves to another browser window. */
export function rememberTargetTab(tab: TabRecord): boolean {
  if (!isSupportedTargetTab(tab)) return false;
  mostRecentlyActivatedTargetId = tab.id;
  return true;
}

/** Pure selection rule for tests and the browser-backed tab query. */
export function selectTargetTabFromTabs<T extends TabRecord>(
  tabs: readonly T[],
  requestedTabId?: number,
): T | undefined {
  if (requestedTabId !== undefined) {
    return tabs.find((tab) => tab.id === requestedTabId && isSupportedTargetTab(tab));
  }

  return tabs
    .filter((tab) => isSupportedTargetTab(tab))
    .sort((left, right) =>
      (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0) || Number(Boolean(right.active)) - Number(Boolean(left.active)),
    )[0];
}

let mostRecentlyActivatedTargetId: number | undefined;

/** Keep the prior page selected while the user switches to Blip's own voice tab. */
export function registerTargetTabTracking(): void {
  const tabs = browserTabs();
  if (!tabs?.onActivated || !tabs.onRemoved) return;
  tabs.onActivated.addListener(({ tabId }) => {
    void tabs.get(tabId).then((tab) => {
      if (isSupportedTargetTab(tab)) mostRecentlyActivatedTargetId = tabId;
    }).catch(() => undefined);
  });
  tabs.onRemoved.addListener((tabId) => {
    if (mostRecentlyActivatedTargetId === tabId) mostRecentlyActivatedTargetId = undefined;
    snapshotVersions.forget(tabId);
  });
}

export async function findTargetTab(requestedTabId?: number): Promise<TargetTab | undefined> {
  const tabsApi = browserTabs();
  if (!tabsApi) return undefined;
  if (requestedTabId !== undefined) {
    try {
      const requested = await tabsApi.get(requestedTabId);
      return isSupportedTargetTab(requested) ? requested : undefined;
    } catch {
      return undefined;
    }
  }

  let tabs: TabRecord[];
  try {
    tabs = await tabsApi.query({});
  } catch {
    return undefined;
  }

  if (mostRecentlyActivatedTargetId !== undefined) {
    const remembered = tabs.find((tab) => tab.id === mostRecentlyActivatedTargetId && isSupportedTargetTab(tab));
    if (remembered && isSupportedTargetTab(remembered)) return remembered;
    mostRecentlyActivatedTargetId = undefined;
  }
  const selected = selectTargetTabFromTabs(tabs);
  return selected && isSupportedTargetTab(selected) ? selected : undefined;
}

