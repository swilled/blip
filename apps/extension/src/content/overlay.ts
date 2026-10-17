export interface HighlightOverlay {
  /** Show the outline on a live element; null clears it. */
  highlight(target: Element | null): void;
  clear(): void;
  dispose(): void;
}

export interface ContentOverlayTestBridge {
  host: HTMLDivElement;
  root: ShadowRoot;
  box: HTMLDivElement;
}

const overlays = new WeakMap<Document, HighlightOverlay>();
const bridges = new WeakMap<Document, ContentOverlayTestBridge>();
const overlayHosts = new WeakSet<Element>();

function setStyles(element: HTMLElement, values: Readonly<Record<string, string>>): void {
  for (const [property, value] of Object.entries(values)) element.style.setProperty(property, value);
}

/** True only for a host created in this isolated content-script world. */
export function isHighlightOverlayHost(element: Element): boolean {
  return overlayHosts.has(element);
}

/**
 * Open the closed root only from extension-side tests. Page scripts do not share
 * the content script's isolated JavaScript world and cannot call this bridge.
 */
export function openOverlayForContentTest(document: Document): ContentOverlayTestBridge | undefined {
  return bridges.get(document);
}

/** Create or retrieve the one page-local outline used by production acts. */
export function getHighlightOverlay(document: Document = globalThis.document): HighlightOverlay {
  const existing = overlays.get(document);
  if (existing) return existing;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.tabIndex = -1;
  host.inert = true;
  setStyles(host, {
    position: "fixed",
    inset: "0",
    "z-index": "2147483647",
    "pointer-events": "none",
    overflow: "visible",
  });

  const root = host.attachShadow({ mode: "closed" });
  const box = document.createElement("div");
  setStyles(box, {
    position: "fixed",
    "box-sizing": "border-box",
    border: "3px solid #00e5ff",
    outline: "2px solid #111111",
    "outline-offset": "1px",
    "background-color": "transparent",
    "pointer-events": "none",
    visibility: "hidden",
    "z-index": "2147483647",
  });
  root.appendChild(box);
  document.documentElement?.appendChild(host);
  overlayHosts.add(host);

  const bridge = { host, root, box };
  bridges.set(document, bridge);

  const view = document.defaultView;
  let activeTarget: Element | null = null;
  let mutationObserver: MutationObserver | undefined;
  let listening = false;

  const hideBox = (): void => box.style.setProperty("visibility", "hidden");

  const updateBox = (): void => {
    const target = activeTarget;
    if (!target) {
      hideBox();
      return;
    }
    if (!target.isConnected) {
      controller.clear();
      return;
    }

    let rect: DOMRect;
    try {
      rect = target.getBoundingClientRect();
    } catch {
      hideBox();
      return;
    }
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) {
      hideBox();
      return;
    }
    setStyles(box, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(0, rect.width)}px`,
      height: `${Math.max(0, rect.height)}px`,
      visibility: "visible",
    });
  };

  const onViewportChange = (): void => updateBox();
  const onDocumentMutation = (): void => updateBox();

  const detachListeners = (): void => {
    if (listening) {
      view?.removeEventListener("scroll", onViewportChange, true);
      view?.removeEventListener("resize", onViewportChange);
      view?.visualViewport?.removeEventListener("scroll", onViewportChange);
      view?.visualViewport?.removeEventListener("resize", onViewportChange);
      listening = false;
    }
    mutationObserver?.disconnect();
    mutationObserver = undefined;
  };

  const attachListeners = (): void => {
    if (listening) return;
    view?.addEventListener("scroll", onViewportChange, true);
    view?.addEventListener("resize", onViewportChange);
    view?.visualViewport?.addEventListener("scroll", onViewportChange);
    view?.visualViewport?.addEventListener("resize", onViewportChange);
    listening = true;
    if (view && typeof view.MutationObserver === "function") {
      mutationObserver = new view.MutationObserver(onDocumentMutation);
      mutationObserver.observe(document.documentElement ?? document, { childList: true, subtree: true });
    }
  };

  const controller: HighlightOverlay = {
    highlight(target) {
      if (target === null) {
        controller.clear();
        return;
      }
      activeTarget = target;
      attachListeners();
      updateBox();
    },
    clear() {
      activeTarget = null;
      hideBox();
      detachListeners();
    },
    dispose() {
      controller.clear();
      host.remove();
      overlays.delete(document);
      bridges.delete(document);
    },
  };

  overlays.set(document, controller);
  return controller;
}
