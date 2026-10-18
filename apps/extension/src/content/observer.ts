import { changeSignature } from "../shared/signature.js";
import { captureFrameSnapshot } from "./snapshot.js";
import { isHighlightOverlayHost } from "./overlay.js";
import { elementsInComposedDocument } from "./walk.js";

export interface StructuralChange {
  structuralHash: string;
  changeSignature: string;
}

export interface StructuralObserverOptions {
  frameId?: number;
  throttleMs?: number;
  timeBudgetMs?: number;
  now?: () => number;
}

type ChromeWithClosedRoots = typeof globalThis & {
  chrome?: {
    dom?: {
      openOrClosedShadowRoot?: (element: Element) => ShadowRoot | null;
    };
  };
};

const STRUCTURAL_ATTRIBUTES = new Set([
  "autocomplete", "checked", "class", "disabled", "for", "hidden", "href", "id", "max", "min", "multiple",
  "name", "placeholder", "readonly", "required", "role", "selected", "step", "style", "title", "type", "value",
]);

function shadowRootOf(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  const chromeApi = (globalThis as ChromeWithClosedRoots).chrome?.dom?.openOrClosedShadowRoot;
  if (typeof chromeApi !== "function") return null;
  try {
    return chromeApi.call((globalThis as ChromeWithClosedRoots).chrome?.dom, element);
  } catch {
    return null;
  }
}

function isInsideOverlay(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1 && isHighlightOverlayHost(current as Element)) return true;
    const shadowHost: Element | undefined = (current as Node & { host?: Element }).host;
    current = shadowHost ?? current.parentNode;
  }
  return false;
}

function relevantMutation(record: MutationRecord): boolean {
  if (isInsideOverlay(record.target)) return false;
  if (record.type === "attributes") {
    const name = record.attributeName?.toLowerCase() ?? "";
    if (!name || name === "data-blip-id") return false;
    return STRUCTURAL_ATTRIBUTES.has(name) || name.startsWith("aria-") || name.startsWith("data-");
  }
  if (record.type === "childList") {
    const changedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    if (changedNodes.length > 0 && changedNodes.every(isInsideOverlay)) return false;
  }
  return record.type === "childList" || record.type === "characterData";
}

/** Observe useful DOM shape changes, excluding values and private extension UI state. */
export function observeStructuralChanges(
  document: Document,
  onChange: (change: StructuralChange) => void,
  options: StructuralObserverOptions = {},
): () => void {
  const view = document.defaultView;
  const MutationObserverClass = view?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof MutationObserverClass !== "function") return () => undefined;

  const throttleMs = Math.max(0, options.throttleMs ?? 500);
  const frameId = options.frameId ?? 0;
  const timeBudgetMs = options.timeBudgetMs ?? 100;
  const now = options.now ?? (() => Date.now());
  const observedRoots = new WeakSet<ShadowRoot>();
  let previousSignature = changeSignature(captureFrameSnapshot({ document, frameId, timeBudgetMs }));
  let lastPassAt = now() - throttleMs;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const watchShadowRoots = (): void => {
    const elements = elementsInComposedDocument(document, { timeBudgetMs });
    for (const element of elements) {
      if (isHighlightOverlayHost(element)) continue;
      const root = shadowRootOf(element);
      if (!root || observedRoots.has(root)) continue;
      observedRoots.add(root);
      observer.observe(root, config);
    }
  };

  const runPass = (): void => {
    timer = undefined;
    if (disposed || !pending) return;
    pending = false;
    lastPassAt = now();
    try {
      const snapshot = captureFrameSnapshot({ document, frameId, timeBudgetMs });
      const signature = changeSignature(snapshot);
      if (signature !== previousSignature) {
        previousSignature = signature;
        onChange({ structuralHash: snapshot.structuralHash, changeSignature: signature });
      }
    } finally {
      if (pending) schedulePass();
    }
  };

  const schedulePass = (): void => {
    if (disposed || timer !== undefined) return;
    const delay = Math.max(0, throttleMs - (now() - lastPassAt));
    timer = globalThis.setTimeout(runPass, delay);
  };

  const observer = new MutationObserverClass((records) => {
    if (disposed || !records.some(relevantMutation)) return;
    watchShadowRoots();
    pending = true;
    schedulePass();
  });
  const config: MutationObserverInit = { attributes: true, childList: true, characterData: true, subtree: true };
  observer.observe(document, config);
  watchShadowRoots();

  return () => {
    if (disposed) return;
    disposed = true;
    pending = false;
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = undefined;
    observer.disconnect();
  };
}
