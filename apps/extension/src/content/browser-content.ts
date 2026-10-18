import {
  BrowserContentItem,
  BrowserPageUrl,
  type BrowserContentBlock,
  type BrowserContentItem as BrowserContentItemType,
  type BrowserContentResult,
  type BrowserLinkListResult,
  type BrowserPageIdentity,
} from "@blip/protocol";
import { classifyAction } from "@blip/policy/classify";
import { boundedText } from "./text.js";
import { isVisible } from "./visibility.js";
import type { BrowserContentRequest, BrowserContentResponse } from "../shared/messages.js";

const CONTENT_SELECTOR = "h1,h2,h3,h4,h5,h6,p";
const SKIPPED_TAGS = new Set([
  "script", "style", "noscript", "template", "iframe", "frame", "input", "textarea", "select",
  "option", "button", "form", "fieldset", "svg", "canvas",
]);
const INTERACTIVE_ROLES = new Set([
  "button", "checkbox", "combobox", "listbox", "menuitem", "option", "radio", "searchbox",
  "slider", "spinbutton", "switch", "tab", "textbox",
]);
const TEXT_BLOCK_TAGS = new Set([
  "article", "blockquote", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "p", "section", "time",
]);
const MAX_BLOCKS = 20;
const MAX_ITEMS = 20;
const MAX_BLOCK_CODE_POINTS = 400;
const MAX_TOTAL_CODE_POINTS = 4000;
const MAX_LINKS = 100;
const DEFAULT_TIME_BUDGET_MS = 100;

type CaptureOptions = { now?: () => number; timeBudgetMs?: number };
type ElementEntry = { contentId: string; kind: "heading" | "paragraph"; element: Element };
type ItemEntry = { itemId: string; element: Element };
type LinkEntry = { linkId: string; element: HTMLAnchorElement; href: string; rawHref: string; target: string; label: string };
type CaptureState = {
  identity: BrowserPageIdentity;
  frameId: number;
  blocks: Map<string, ElementEntry>;
  items: Map<string, ItemEntry>;
  links: Map<string, LinkEntry>;
  linksTruncated: boolean;
};

const captureByDocument = new WeakMap<Document, CaptureState>();

function identityMatches(left: BrowserPageIdentity, right: BrowserPageIdentity): boolean {
  return left.captureId === right.captureId && left.captureRevision === right.captureRevision &&
    left.tabId === right.tabId && left.pageUrl === right.pageUrl;
}

function restrictedResult(identity: BrowserPageIdentity): BrowserContentResult {
  return { ...identity, status: "restricted", blocks: [], truncated: false };
}

function failedResult(identity: BrowserPageIdentity, status: "timeout" | "capture-failed"): BrowserContentResult {
  return { ...identity, status, blocks: [], truncated: false };
}

function childCandidateKind(element: Element): "heading" | "paragraph" | null {
  if (/^h[1-6]$/.test(element.localName)) return "heading";
  return element.localName === "p" ? "paragraph" : null;
}

function itemCandidate(element: Element): boolean {
  return element.localName === "article" || (element.getAttribute("role") ?? "").trim().toLocaleLowerCase() === "listitem";
}

function hasItemAncestor(element: Element): boolean {
  let parent = element.parentElement;
  while (parent && parent.localName !== "body" && parent.localName !== "html") {
    if (itemCandidate(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function hasNestedItemAncestor(element: Element, root: Element): boolean {
  let parent = element.parentElement;
  while (parent && parent !== root) {
    if (itemCandidate(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function textBlockAncestor(element: Element, root: Element): Element | null {
  let current: Element | null = element;
  while (current) {
    if (TEXT_BLOCK_TAGS.has(current.localName)) return current;
    if (current === root) return null;
    current = current.parentElement;
  }
  return null;
}

function containsElement(ancestor: Element, descendant: Element): boolean {
  return ancestor === descendant || ancestor.contains(descendant);
}

function hasContentAncestor(element: Element): boolean {
  let parent = element.parentElement;
  while (parent && parent.localName !== "body" && parent.localName !== "html") {
    if (childCandidateKind(parent) !== null) return true;
    parent = parent.parentElement;
  }
  return false;
}

function excluded(element: Element): boolean {
  if (SKIPPED_TAGS.has(element.localName) || element.hasAttribute("contenteditable")) return true;
  if (INTERACTIVE_ROLES.has((element.getAttribute("role") ?? "").trim().toLocaleLowerCase())) return true;
  if (element.closest("form, [inert], [hidden], [aria-hidden='true']")) return true;
  return false;
}

/** Collect bounded, normalized text while skipping hidden descendants and never reading controls. */
function visibleText(
  element: Element,
  maxCodePoints: number,
  now: () => number,
  deadline: number,
  options: { skipNestedContentCandidates?: boolean; skipNestedItems?: boolean } = {},
): { text: string; truncated: boolean; timedOut: boolean } {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
  let output = "";
  let points = 0;
  let pendingSpace = false;
  let previousBlock: Element | null = null;
  let timedOut = false;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (now() > deadline) { timedOut = true; break; }
    const parent = node.parentElement;
    if (!parent || excluded(parent) || !isVisible(parent) ||
        (options.skipNestedContentCandidates !== false && parent !== element && childCandidateKind(parent) !== null) ||
        (options.skipNestedItems === true && parent !== element &&
          (itemCandidate(parent) || hasNestedItemAncestor(parent, element)))) continue;
    const currentBlock = textBlockAncestor(parent, element);
    if (currentBlock && previousBlock && currentBlock !== previousBlock &&
        !containsElement(currentBlock, previousBlock) && !containsElement(previousBlock, currentBlock)) {
      pendingSpace = output.length > 0;
    }
    if (currentBlock) previousBlock = currentBlock;
    const raw = node.nodeValue ?? "";
    for (const point of raw) {
      if (now() > deadline) { timedOut = true; break; }
      if (/[\u200B-\u200D\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(point)) continue;
      if (/\s/u.test(point)) {
        pendingSpace = output.length > 0;
        continue;
      }
      if (pendingSpace) {
        if (points >= maxCodePoints) return { text: output, truncated: true, timedOut };
        output += " ";
        points += 1;
        pendingSpace = false;
      }
      if (points >= maxCodePoints) return { text: output, truncated: true, timedOut };
      output += point;
      points += 1;
    }
    if (timedOut) break;
  }
  return { text: output.trim(), truncated: false, timedOut };
}

function visibleDateEvidence(
  element: Element,
  now: () => number,
  deadline: number,
): { value: string | null; timedOut: boolean } {
  const stack = Array.from(element.children).reverse();
  let evidence: string | null = null;
  let sawTime = false;
  while (stack.length > 0) {
    if (now() > deadline) return { value: null, timedOut: true };
    const current = stack.pop()!;
    if (itemCandidate(current) || excluded(current)) continue;
    if (!isVisible(current)) continue;
    if (current.localName === "time") {
      sawTime = true;
      const visibleTextResult = visibleText(current, 100, now, deadline, { skipNestedContentCandidates: false });
      if (visibleTextResult.timedOut) return { value: null, timedOut: true };
      const visibleDate = visibleTextResult.text;
      const datetime = current.getAttribute("datetime") ?? "";
      if (visibleTextResult.truncated || !BrowserContentItem.shape.visibleDate.safeParse(visibleDate).success ||
          !BrowserContentItem.shape.visibleDate.safeParse(datetime).success || Date.parse(visibleDate) !== Date.parse(datetime)) {
        return { value: null, timedOut: false };
      }
      if (evidence !== null && Date.parse(evidence) !== Date.parse(datetime)) return { value: null, timedOut: false };
      evidence = datetime;
    }
    for (let child = current.lastElementChild; child; child = child.previousElementSibling) stack.push(child);
  }
  return { value: sawTime ? evidence : null, timedOut: false };
}

function currentState(document: Document, identity: BrowserPageIdentity, frameId: number): CaptureState | null {
  const state = captureByDocument.get(document);
  return state !== undefined && state.frameId === frameId && identityMatches(state.identity, identity) ? state : null;
}

function failure(request: BrowserContentRequest, code: "stale-capture" | "stale-page" | "unsupported-frame" | "not-found" | "ambiguous" | "invalid-target" | "unsupported-destination-check" | "timeout" | "exception", message: string): BrowserContentResponse {
  return { t: "browser-content.error", operation: request.operation, code, message };
}

/**
 * Capture visible headings, paragraphs, generic semantic items, and anchor labels from the top document.
 * The capture ID is generated by the extension background and is intentionally not derived
 * from page text. The same identity is attached to every block and link.
 */
export function captureVisibleContent(
  document: Document,
  identity: BrowserPageIdentity,
  options: CaptureOptions = {},
): BrowserContentResult {
  const now = options.now ?? (() => document.defaultView?.performance.now() ?? performance.now());
  const startedAt = now();
  const deadline = startedAt + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const frameId = 0;
  const state: CaptureState = { identity, frameId, blocks: new Map(), items: new Map(), links: new Map(), linksTruncated: false };
  captureByDocument.set(document, state);

  if (!BrowserPageUrl.safeParse(identity.pageUrl).success || !/^https?:/i.test(identity.pageUrl)) {
    return restrictedResult(identity);
  }

  const root = document.body ?? document.documentElement;
  if (!root) return { ...identity, status: "empty", blocks: [], truncated: false };

  const stack: Array<{ element: Element; next: Element | null }> = [{ element: root, next: root.firstElementChild }];
  const rawBlocks: Array<{ kind: "heading" | "paragraph"; element: Element; text: string; truncated: boolean }> = [];
  const rawItems: Array<{ element: Element; text: string; truncated: boolean; visibleDate: string | null }> = [];
  const rawLinks: Array<{ element: HTMLAnchorElement; href: string; rawHref: string; target: string; label: string }> = [];
  let blocksTruncated = false;
  let itemsTruncated = false;
  let linksTruncated = false;
  let timedOut = false;

  while (stack.length > 0) {
    if (now() > deadline) { timedOut = true; break; }
    const frame = stack[stack.length - 1]!;
    if (frame.next === null) { stack.pop(); continue; }
    const element = frame.next;
    frame.next = element.nextElementSibling;
    if (SKIPPED_TAGS.has(element.localName)) continue;
    stack.push({ element, next: element.firstElementChild });

    if (excluded(element) || !isVisible(element)) continue;
    if (element.localName === "a" && !element.hasAttribute("download")) {
      const textResult = visibleText(element, 200, now, deadline);
      if (textResult.timedOut) { timedOut = true; break; }
      const accessible = textResult.text || boundedText(element.getAttribute("aria-label"), 200, 200);
      const label = boundedText(accessible, 200, 400);
      const href = (element as HTMLAnchorElement).href || "";
      if (label !== "" && href !== "") {
        if (rawLinks.length < MAX_LINKS) rawLinks.push({
          element: element as HTMLAnchorElement,
          href,
          rawHref: element.getAttribute("href") ?? "",
          target: element.getAttribute("target") ?? "",
          label,
        });
        else linksTruncated = true;
      }
    }

    const kind = childCandidateKind(element);
    if (kind !== null && !hasContentAncestor(element)) {
      const textResult = visibleText(element, MAX_BLOCK_CODE_POINTS + 1, now, deadline);
      if (textResult.timedOut) { timedOut = true; break; }
      if (textResult.text !== "") {
        if (rawBlocks.length < MAX_BLOCKS) rawBlocks.push({
          kind,
          element,
          text: boundedText(textResult.text, MAX_BLOCK_CODE_POINTS, MAX_BLOCK_CODE_POINTS * 2),
          truncated: textResult.truncated || Array.from(textResult.text).length > MAX_BLOCK_CODE_POINTS,
        });
        else blocksTruncated = true;
      }
    }

    if (itemCandidate(element) && !hasItemAncestor(element)) {
      const textResult = visibleText(element, MAX_BLOCK_CODE_POINTS + 1, now, deadline, {
        skipNestedContentCandidates: false,
        skipNestedItems: true,
      });
      if (textResult.timedOut) { timedOut = true; break; }
      if (textResult.text !== "") {
        const dateResult = visibleDateEvidence(element, now, deadline);
        if (dateResult.timedOut) { timedOut = true; break; }
        if (rawItems.length < MAX_ITEMS) {
          rawItems.push({
            element,
            text: boundedText(textResult.text, MAX_BLOCK_CODE_POINTS + 1, (MAX_BLOCK_CODE_POINTS + 1) * 2),
            truncated: textResult.truncated || Array.from(textResult.text).length > MAX_BLOCK_CODE_POINTS,
            visibleDate: dateResult.value,
          });
        } else {
          itemsTruncated = true;
        }
      }
    }
  }

  if (timedOut || now() > deadline) {
    captureByDocument.delete(document);
    return failedResult(identity, "timeout");
  }

  const blocks: BrowserContentBlock[] = [];
  let total = 0;
  let blockTruncated = blocksTruncated;
  for (const raw of rawBlocks) {
    if (blocks.length >= MAX_BLOCKS) { blockTruncated = true; break; }
    let text = raw.text;
    const count = Array.from(text).length;
    if (raw.truncated || count > MAX_BLOCK_CODE_POINTS) blockTruncated = true;
    if (total + count > MAX_TOTAL_CODE_POINTS) {
      const remaining = MAX_TOTAL_CODE_POINTS - total;
      text = boundedText(text, remaining, remaining * 2);
      blockTruncated = true;
    }
    if (text === "") continue;
    const contentId = `${identity.captureId}.b${blocks.length}`.slice(0, 64);
    blocks.push({ contentId, kind: raw.kind, text, identity, frameId });
    state.blocks.set(contentId, { contentId, kind: raw.kind, element: raw.element });
    total += Array.from(text).length;
    if (total >= MAX_TOTAL_CODE_POINTS) {
      if (rawBlocks.length > blocks.length) blockTruncated = true;
      break;
    }
  }

  const items: BrowserContentItemType[] = [];
  let itemTotal = 0;
  let truncated = blockTruncated || itemsTruncated;
  for (const raw of rawItems) {
    if (items.length >= MAX_ITEMS) { truncated = true; break; }
    let text = raw.text;
    const count = Array.from(text).length;
    if (raw.truncated || count > MAX_BLOCK_CODE_POINTS) truncated = true;
    if (itemTotal + count > MAX_TOTAL_CODE_POINTS) {
      const remaining = MAX_TOTAL_CODE_POINTS - itemTotal;
      text = boundedText(text, remaining, remaining * 2);
      truncated = true;
    }
    if (text === "") continue;
    const itemId = `${identity.captureId.slice(0, 56)}.i${items.length}`;
    const item: BrowserContentItemType = { itemId, text, visibleDate: raw.visibleDate, identity, frameId };
    items.push(item);
    state.items.set(itemId, { itemId, element: raw.element });
    itemTotal += Array.from(text).length;
    if (itemTotal >= MAX_TOTAL_CODE_POINTS) {
      if (rawItems.length > items.length) truncated = true;
      break;
    }
  }

  state.linksTruncated = linksTruncated;
  for (const raw of rawLinks.slice(0, MAX_LINKS)) {
    const linkId = `${identity.captureId}.l${state.links.size}`.slice(0, 64);
    state.links.set(linkId, { linkId, element: raw.element, href: raw.href, rawHref: raw.rawHref, target: raw.target, label: raw.label });
  }

  captureByDocument.set(document, state);
  return {
    ...identity,
    status: blocks.length === 0 && items.length === 0 && rawLinks.length === 0 ? "empty" : "supported",
    blocks,
    items,
    truncated,
  };
}

function hostHint(href: string): string | null {
  try {
    const parsed = new URL(href);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.username === "" && parsed.password === ""
      ? parsed.hostname.toLocaleLowerCase()
      : null;
  } catch {
    return null;
  }
}

function listLinks(state: CaptureState): BrowserLinkListResult {
  const links = [...state.links.values()].slice(0, MAX_LINKS).map((entry) => ({
    linkId: entry.linkId,
    label: entry.label,
    hostHint: hostHint(entry.href),
    identity: state.identity,
    frameId: state.frameId,
  }));
  return {
    ...state.identity,
    status: links.length === 0 ? "empty" : "supported",
    links,
    truncated: state.linksTruncated,
  };
}

function readBlock(document: Document, request: Extract<BrowserContentRequest, { operation: "read-content" }>, frameId: number): BrowserContentResponse {
  const state = currentState(document, request.identity, frameId);
  if (!state) return failure(request, "stale-capture", "That page content capture is no longer current.");
  const entry = state.blocks.get(request.contentId);
  if (!entry || entry.kind !== request.kind || !entry.element.isConnected || excluded(entry.element) || !isVisible(entry.element)) {
    return failure(request, "not-found", "That visible content block is no longer available.");
  }
  const textResult = visibleText(entry.element, MAX_BLOCK_CODE_POINTS, () => document.defaultView?.performance.now() ?? performance.now(),
    (document.defaultView?.performance.now() ?? performance.now()) + DEFAULT_TIME_BUDGET_MS);
  if (textResult.timedOut) return failure(request, "timeout", "The selected content took too long to read.");
  if (textResult.text === "") return failure(request, "not-found", "That visible content block is empty.");
  const block: BrowserContentBlock = {
    contentId: entry.contentId,
    kind: entry.kind,
    text: boundedText(textResult.text, MAX_BLOCK_CODE_POINTS, MAX_BLOCK_CODE_POINTS * 2),
    identity: state.identity,
    frameId: state.frameId,
  };
  return {
    t: "browser-content.result",
    operation: "read-content",
    result: { ...state.identity, status: "supported", blocks: [block], truncated: textResult.truncated },
  };
}

function openLink(document: Document, request: Extract<BrowserContentRequest, { operation: "open-link" }>, frameId: number): BrowserContentResponse {
  const state = currentState(document, request.identity, frameId);
  if (!state) return failure(request, "stale-capture", "That link list is no longer current.");
  const entry = state.links.get(request.linkId);
  if (!entry) return failure(request, "not-found", "That visible link is no longer available.");
  const anchor = entry.element;
  if (!anchor.isConnected || excluded(anchor) || !isVisible(anchor) || anchor.closest("form") !== null) {
    return failure(request, "stale-capture", "The selected link is no longer visible on this page.");
  }
  const liveHref = anchor.href;
  if (liveHref !== entry.href || (anchor.getAttribute("href") ?? "") !== entry.rawHref ||
      (anchor.getAttribute("target") ?? "") !== entry.target || anchor.hasAttribute("download")) {
    return failure(request, "stale-capture", "The selected link changed after it was listed.");
  }
  const rawTarget = (anchor.getAttribute("target") ?? "").trim().toLocaleLowerCase();
  if (rawTarget !== "" && rawTarget !== "_self") {
    return failure(request, "invalid-target", "Links that open another context are not supported.");
  }
  let destination: URL;
  try { destination = new URL(liveHref); } catch { return failure(request, "invalid-target", "The selected link has an invalid destination."); }
  if ((destination.protocol !== "http:" && destination.protocol !== "https:") || destination.username !== "" || destination.password !== "") {
    return failure(request, "invalid-target", "The selected link destination is not a safe web address.");
  }
  if (destination.origin !== new URL(state.identity.pageUrl).origin) {
    return failure(request, "unsupported-destination-check", "The current link policy does not permit this destination.");
  }
  const liveLabelResult = visibleText(anchor, 200, () => document.defaultView?.performance.now() ?? performance.now(),
    (document.defaultView?.performance.now() ?? performance.now()) + DEFAULT_TIME_BUDGET_MS);
  if (liveLabelResult.timedOut) return failure(request, "timeout", "The selected link took too long to validate.");
  const liveLabel = boundedText(liveLabelResult.text || anchor.getAttribute("aria-label"), 200, 400);
  const policy = classifyAction({ tag: "a", href: liveHref, target: rawTarget, origin: state.identity.pageUrl, text: liveLabel });
  if (policy.kind !== "click-safe") {
    return failure(request, "unsupported-destination-check", "The current link policy does not permit this link.");
  }
  return {
    t: "browser-content.result",
    operation: "open-link",
    result: { identity: state.identity, frameId: state.frameId, href: destination.href },
  };
}

function scroll(document: Document, request: Extract<BrowserContentRequest, { operation: "scroll" }>, frameId: number): BrowserContentResponse {
  const state = currentState(document, request.identity, frameId);
  if (!state) return failure(request, "stale-capture", "That page content capture is no longer current.");
  if ("contentId" in request) {
    const entry = state.blocks.get(request.contentId);
    if (!entry || entry.kind !== request.kind || !entry.element.isConnected || excluded(entry.element) || !isVisible(entry.element)) {
      return failure(request, "not-found", "That visible content target is no longer available.");
    }
    try {
      const beforeTop = entry.element.getBoundingClientRect().top;
      entry.element.scrollIntoView({ behavior: "auto", block: "center" });
      return {
        t: "browser-content.result",
        operation: "scroll",
        result: { identity: state.identity, moved: entry.element.getBoundingClientRect().top !== beforeTop },
      };
    } catch {
      return failure(request, "exception", "The selected content target could not be scrolled into view.");
    }
  }
  const view = document.defaultView;
  if (!view) return failure(request, "exception", "The current page cannot be scrolled.");
  const before = view.scrollY;
  try { view.scrollBy({ top: request.direction === "down" ? request.pixels : -request.pixels, behavior: "auto" }); }
  catch { return failure(request, "exception", "The current page could not be scrolled."); }
  return {
    t: "browser-content.result",
    operation: "scroll",
    result: { identity: state.identity, moved: view.scrollY !== before },
  };
}

function find(document: Document, request: Extract<BrowserContentRequest, { operation: "find" }>, frameId: number): BrowserContentResponse {
  const state = currentState(document, request.identity, frameId);
  if (!state) return failure(request, "stale-capture", "That page content capture is no longer current.");
  const query = boundedText(request.query, 500, 1000);
  let matchCount = 0;
  for (const entry of state.blocks.values()) {
    if (!entry.element.isConnected || excluded(entry.element) || !isVisible(entry.element)) continue;
    const textResult = visibleText(entry.element, MAX_BLOCK_CODE_POINTS, () => document.defaultView?.performance.now() ?? performance.now(),
      (document.defaultView?.performance.now() ?? performance.now()) + DEFAULT_TIME_BUDGET_MS);
    if (textResult.timedOut) return failure(request, "timeout", "Page text took too long to search.");
    if (textResult.text.includes(query)) matchCount += 1;
  }
  return {
    t: "browser-content.result",
    operation: "find",
    result: { identity: state.identity, found: matchCount > 0, matchCount: Math.min(1000, matchCount), truncated: matchCount > 1000 },
  };
}

/** Execute only bounded read-only DOM operations in the extension isolated world. */
export function handleBrowserContentRequest(
  document: Document,
  request: BrowserContentRequest,
  frameId: number,
): BrowserContentResponse {
  if (frameId !== 0) return failure(request, "unsupported-frame", "Browser content operations are supported only in the top-level frame.");
  switch (request.operation) {
    case "capture":
    case "list-links": {
      const capture = captureVisibleContent(document, request.identity);
      if (capture.status === "timeout") return failure(request, "timeout", "Page content capture exceeded its time limit.");
      if (capture.status === "capture-failed") return failure(request, "exception", "Page content capture failed.");
      if (request.operation === "capture") return { t: "browser-content.result", operation: "capture", result: capture };
      if (capture.status === "restricted") {
        return { t: "browser-content.result", operation: "list-links", result: { ...request.identity, status: "restricted", links: [], truncated: false } };
      }
      return { t: "browser-content.result", operation: "list-links", result: listLinks(captureByDocument.get(document)!) };
    }
    case "read-content": return readBlock(document, request, frameId);
    case "open-link": return openLink(document, request, frameId);
    case "scroll": return scroll(document, request, frameId);
    case "find": return find(document, request, frameId);
  }
}
