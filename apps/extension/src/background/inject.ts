const BLIP_PAGE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLIP_PAGE_PORTS = new Set(["7777", "5173"]);

function isBlipPage(url: URL): boolean {
  return BLIP_PAGE_HOSTS.has(url.hostname) && BLIP_PAGE_PORTS.has(url.port);
}

function shouldInject(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  if (tab.id === undefined || tab.url === undefined) return false;
  try {
    const url = new URL(tab.url);
    return (url.protocol === "http:" || url.protocol === "https:") && !isBlipPage(url);
  } catch {
    return false;
  }
}

/** Best-effort reinjection for tabs that were already open when Blip was installed or updated. */
export async function injectExistingTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  const targets = tabs.filter(shouldInject);
  await Promise.allSettled(
    targets.map((tab) =>
      Promise.resolve().then(() =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"],
        }),
      ),
    ),
  );
}
