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
  valueDebounceMs?: number;
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
const VALUE_ROLES = new Set(["textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "radiogroup", "switch", "spinbutton", "slider", "option"]);

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

function isAriaRadioStateMutation(record: MutationRecord): boolean {
  if (record.type !== "attributes" || record.attributeName?.toLowerCase() !== "aria-checked") return false;
  const target = record.target as Element;
  return target.getAttribute("role")?.trim().toLowerCase() === "radio" ||
    target.closest('[role="radio"], [role="radiogroup"]') !== null;
}

function isFormValueEvent(event: Event): boolean {
  const target = event.target as (EventTarget & { nodeType?: number; localName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null }) | null;
  if (!target || target.nodeType !== 1) return false;
  const element = target as Element;
  if (isInsideOverlay(element)) return false;
  if (["input", "select", "textarea"].includes(element.localName)) return true;
  const editable = element.getAttribute("contenteditable")?.trim().toLowerCase();
  if (target.isContentEditable || editable === "" || editable === "true" || editable === "plaintext-only") return true;
  return VALUE_ROLES.has(element.getAttribute("role")?.trim().toLowerCase() ?? "");
}

function isFormResetEvent(event: Event): boolean {
  const target = event.target as (EventTarget & { nodeType?: number; localName?: string }) | null;
  return event.type === "reset" && target?.nodeType === 1 && target.localName === "form";
}

/** Observe DOM shape and control-state changes without putting field values in the notification. */
export function observeStructuralChanges(
  document: Document,
  onChange: (change: StructuralChange) => void,
  options: StructuralObserverOptions = {},
): () => void {
  const view = document.defaultView;
  const MutationObserverClass = view?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof MutationObserverClass !== "function") return () => undefined;

  const throttleMs = Math.max(0, options.throttleMs ?? 500);
  const valueDebounceMs = Math.max(0, options.valueDebounceMs ?? 120);
  const frameId = options.frameId ?? 0;
  const timeBudgetMs = options.timeBudgetMs ?? 100;
  const now = options.now ?? (() => Date.now());
  const observedRoots = new WeakSet<ShadowRoot>();
  let previousSignature = changeSignature(captureFrameSnapshot({ document, frameId, timeBudgetMs }));
  let lastPassAt = now() - throttleMs;
  let pending = false;
  let pendingRadioStateChange = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let valueTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const observedValueRoots: Array<Document | ShadowRoot> = [];
  const handledValueEvents = new WeakSet<Event>();

  const signalValueChange = (event: Event): void => {
    if (disposed || handledValueEvents.has(event) || (!isFormValueEvent(event) && !isFormResetEvent(event))) return;
    handledValueEvents.add(event);
    if (valueTimer !== undefined) globalThis.clearTimeout(valueTimer);
    valueTimer = globalThis.setTimeout(() => {
      valueTimer = undefined;
      if (disposed) return;
      try {
        const snapshot = captureFrameSnapshot({ document, frameId, timeBudgetMs });
        previousSignature = changeSignature(snapshot);
        // The signal contains only structural hashes; the live field contents stay in the
        // subsequent extension-only snapshot response and never enter the mutation message.
        onChange({ structuralHash: snapshot.structuralHash, changeSignature: previousSignature });
      } catch {
        // A transient page read failure must not take down the content script.
      }
    }, valueDebounceMs);
  };

  const observeValueRoot = (root: Document | ShadowRoot): void => {
    if (observedValueRoots.includes(root)) return;
    observedValueRoots.push(root);
    for (const type of ["input", "change", "reset"]) root.addEventListener(type, signalValueChange, true);
  };

  const watchShadowRoots = (): void => {
    const elements = elementsInComposedDocument(document, { timeBudgetMs });
    for (const element of elements) {
      if (isHighlightOverlayHost(element)) continue;
      const root = shadowRootOf(element);
      if (!root || observedRoots.has(root)) continue;
      observedRoots.add(root);
      observer.observe(root, config);
      observeValueRoot(root);
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
      const radioStateChanged = pendingRadioStateChange;
      pendingRadioStateChange = false;
      if (signature !== previousSignature || radioStateChanged) {
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
    if (records.some(isAriaRadioStateMutation)) pendingRadioStateChange = true;
    pending = true;
    schedulePass();
  });
  const config: MutationObserverInit = { attributes: true, childList: true, characterData: true, subtree: true };
  observer.observe(document, config);
  observeValueRoot(document);
  watchShadowRoots();

  return () => {
    if (disposed) return;
    disposed = true;
    pending = false;
    if (timer !== undefined) globalThis.clearTimeout(timer);
    if (valueTimer !== undefined) globalThis.clearTimeout(valueTimer);
    timer = undefined;
    valueTimer = undefined;
    observer.disconnect();
    for (const root of observedValueRoots) {
      for (const type of ["input", "change", "reset"]) root.removeEventListener(type, signalValueChange, true);
    }
    observedValueRoots.length = 0;
  };
}
