import type { ContentSnapshot } from "../shared/messages.js";
import { computeStructuralHash } from "../shared/signature.js";
import { rememberSnapshotFingerprints } from "./act.js";
import { boundedText } from "./text.js";
import { isVisible } from "./visibility.js";
import { elementsInComposedDocument, walkDocument, type WalkOptions } from "./walk.js";

const MAX_ELEMENTS = 250;
const MAX_HEADINGS = 40;
const MAX_ALERTS = 20;

export interface CaptureFrameSnapshotOptions extends WalkOptions {
  document?: Document;
  topOrigin?: string;
}

function safeUrl(document: Document): string {
  try {
    const url = new URL(document.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname}`;
  } catch {
    // An unavailable or non-web URL has no useful page location to publish.
  }
  return "about:blank";
}

function safeOrigin(value: string | undefined, document: Document): string {
  try {
    const candidate = value ? new URL(value) : new URL(document.location.href);
    return candidate.origin === "null" ? "" : candidate.origin;
  } catch {
    return "";
  }
}

function pageHeadings(elements: readonly Element[]): ContentSnapshot["headings"] {
  const headings: NonNullable<ContentSnapshot["headings"]> = [];
  for (const element of elements) {
    const match = /^h([1-6])$/.exec(element.localName);
    if (!match || !isVisible(element)) continue;
    const text = boundedText(element.textContent, 200, 200);
    if (text) headings.push({ level: Number(match[1]), text });
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

function pageAlerts(elements: readonly Element[]): string[] {
  const alerts: string[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    const role = element.getAttribute("role")?.trim().toLowerCase();
    const live = element.getAttribute("aria-live")?.trim().toLowerCase();
    if (!(["alert", "status"].includes(role ?? "") || ["assertive", "polite"].includes(live ?? "")) || !isVisible(element)) {
      continue;
    }
    const text = boundedText(element.textContent, 300, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    alerts.push(text);
    if (alerts.length >= MAX_ALERTS) break;
  }
  return alerts;
}

function pageStepHint(elements: readonly Element[]): string | undefined {
  for (const element of elements) {
    const text = boundedText(element.textContent, 100, 100);
    const match = /\bstep\s+\d+\s+of\s+\d+\b/i.exec(text);
    if (match) return match[0];
  }
  return undefined;
}

/** Build the bounded, schema-shaped snapshot portion contributed by one frame. */
export function captureFrameSnapshot(options: CaptureFrameSnapshotOptions = {}): ContentSnapshot {
  const ownerDocument = options.document ?? document;
  const frameId = options.frameId ?? 0;
  const now = options.now ?? (() => performance.now());
  const captureStartedAt = now();
  const timeBudgetMs = options.timeBudgetMs ?? 100;
  const walkOptions: WalkOptions = {
    frameId,
    timeBudgetMs,
    now,
  };
  const discovered = walkDocument(ownerDocument, walkOptions);
  const fields = discovered.filter((element) => element.category === "field");
  const actions = discovered.filter((element) => element.category === "action");
  // Reserve the cap for fields first, then actions, while preserving document order in each group.
  const selected = [...fields, ...actions].slice(0, MAX_ELEMENTS);
  const metadataOptions: WalkOptions = {
    ...walkOptions,
    timeBudgetMs: Math.max(0, timeBudgetMs - (now() - captureStartedAt)),
  };
  const elements = elementsInComposedDocument(ownerDocument, metadataOptions);
  const headings = pageHeadings(elements);
  const alerts = pageAlerts(elements);
  const stepHint = pageStepHint(elements);
  const result: ContentSnapshot = {
    title: boundedText(ownerDocument.title, 200, 200),
    url: safeUrl(ownerDocument),
    origin: safeOrigin(options.topOrigin, ownerDocument),
    headings,
    alerts,
    elements: selected,
    // This flag describes only a cut to the frozen 250-element wire list.
    truncated: discovered.length > MAX_ELEMENTS,
    structuralHash: computeStructuralHash(selected),
    capturedAt: Date.now(),
  };
  if (stepHint) result.stepHint = stepHint;
  rememberSnapshotFingerprints(ownerDocument, selected);
  return result;
}
