import { findTargetTab, isSupportedTargetTab, type TabRecord, type TargetTab } from "./tabs.js";
import type { PageChange, PageChangeScheduler } from "./changes.js";

type Event<T extends (...args: never[]) => void> = { addListener(listener: T): void; removeListener?(listener: T): void };
type NavigationDetails = { tabId: number; frameId: number; url: string };

export type NavigationBrowserApi = {
  tabs?: {
    onActivated?: Event<(info: { tabId: number }) => void>;
    onUpdated?: Event<(tabId: number, changeInfo: { url?: string; status?: string }, tab: TabRecord) => void>;
    onRemoved?: Event<(tabId: number) => void>;
    query?(queryInfo: Record<string, unknown>): Promise<TabRecord[]>;
  };
  webNavigation?: {
    onCommitted?: Event<(details: NavigationDetails) => void>;
    onHistoryStateUpdated?: Event<(details: NavigationDetails) => void>;
  };
  windows?: {
    WINDOW_ID_NONE?: number;
    onFocusChanged?: Event<(windowId: number) => void>;
  };
};

export type NavigationDependencies = {
  api?: NavigationBrowserApi;
  scheduler: PageChangeScheduler;
  findTargetTab?: (tabId?: number) => Promise<TargetTab | undefined>;
};

async function selectedTarget(
  tabId: number,
  getTarget: (tabId?: number) => Promise<TargetTab | undefined>,
): Promise<TargetTab | undefined> {
  const [requested, selected] = await Promise.all([getTarget(tabId), getTarget()]);
  if (!requested || selected?.id !== tabId) return undefined;
  return requested;
}

function safePage(tabId: number, url: string): TargetTab | undefined {
  const tab = { id: tabId, url };
  return isSupportedTargetTab(tab) ? tab : undefined;
}

/** Register service-worker event handlers synchronously; each async handler fails closed. */
export function registerNavigationListeners(dependencies: NavigationDependencies): () => void {
  const api = dependencies.api ?? globalThis.chrome;
  const tabs = api?.tabs;
  const webNavigation = api?.webNavigation;
  const windows = api?.windows;
  const getTarget = dependencies.findTargetTab ?? findTargetTab;
  const listeners: Array<() => void> = [];

  const register = <T extends (...args: never[]) => void>(event: Event<T> | undefined, listener: T): void => {
    if (!event) return;
    event.addListener(listener);
    if (event.removeListener) listeners.push(() => event.removeListener?.(listener));
  };

  const emit = async (tabId: number, reason: PageChange["reason"], eventUrl?: string): Promise<void> => {
    if (!Number.isSafeInteger(tabId) || tabId < 0) return;
    const tab = await selectedTarget(tabId, getTarget);
    const url = eventUrl ?? tab?.url;
    if (!tab || typeof url !== "string" || !safePage(tabId, url)) return;
    dependencies.scheduler.enqueue({ tabId, url, reason });
  };

  register(webNavigation?.onCommitted, (details: NavigationDetails) => {
    if (details.frameId === 0) void emit(details.tabId, "navigation", details.url);
  });
  register(webNavigation?.onHistoryStateUpdated, (details: NavigationDetails) => {
    if (details.frameId === 0) void emit(details.tabId, "navigation", details.url);
  });
  register(tabs?.onUpdated, (tabId: number, changeInfo: { url?: string; status?: string }, tab: TabRecord) => {
    if (typeof changeInfo.url === "string") void emit(tabId, "navigation", changeInfo.url);
    else if (changeInfo.status === "complete" && typeof tab.url === "string") void emit(tabId, "navigation", tab.url);
  });
  register(tabs?.onActivated, ({ tabId }: { tabId: number }) => {
    void emit(tabId, "tab-activated");
  });
  register(tabs?.onRemoved, (tabId: number) => dependencies.scheduler.cancel(tabId));
  register(windows?.onFocusChanged, (windowId: number) => {
    if (windowId === (windows?.WINDOW_ID_NONE ?? -1) || !tabs?.query) return;
    void tabs.query({ active: true, windowId }).then((activeTabs) => {
      const tab = activeTabs[0];
      if (tab?.id !== undefined && typeof tab.url === "string") void emit(tab.id, "tab-activated", tab.url);
    }).catch(() => undefined);
  });

  return () => { for (const remove of listeners) remove(); };
}
