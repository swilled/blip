import { boundedText } from "./text.js";

export type LabelSource = "aria" | "label" | "nearby-text" | "placeholder" | "inferred";

export interface LabelCandidate {
  text: string;
  source: LabelSource;
  confidence: number;
}

const MAX_LABEL_CANDIDATES = 8;

function rootElementById(element: Element, id: string): Element | null {
  const root = element.getRootNode();
  if (root.nodeType === 9 || root.nodeType === 11) {
    const found = (root as Document | ShadowRoot).getElementById(id);
    if (found) return found;
  }
  return element.ownerDocument.getElementById(id);
}

function textWithoutControls(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(
    "input, select, textarea, button, option, script, style, [contenteditable='true'], " +
      "[role='button'], [role='checkbox'], [role='combobox'], [role='option'], [role='radio'], [role='switch']",
  ).forEach((nested) => nested.remove());
  return boundedText(clone.textContent, 200, 200);
}

function associatedLabels(element: Element): Element[] {
  const labels: Element[] = [];
  const control = element as Element & { labels?: NodeListOf<HTMLLabelElement> | null };
  if (control.labels) labels.push(...Array.from(control.labels));

  const id = element.getAttribute("id");
  if (id) {
    for (const label of Array.from(element.ownerDocument.querySelectorAll("label[for]"))) {
      if ((label as HTMLLabelElement).htmlFor === id && !labels.includes(label)) labels.push(label);
    }
  }
  const wrapping = element.closest("label");
  if (wrapping && !labels.includes(wrapping)) labels.push(wrapping);
  return labels;
}

function nearbyTextOf(element: Element): string {
  // Only inspect the nearest sibling. Looking past another form control can assign its
  // label to this field (for example, a later unnamed field inheriting a prior label).
  const previous = element.previousElementSibling;
  if (previous) return textWithoutControls(previous);
  const next = element.nextElementSibling;
  if (next) return textWithoutControls(next);

  const parent = element.parentElement;
  if (!parent) return "";
  const directText = Array.from(parent.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? "")
    .join(" ");
  return boundedText(directText, 200, 200);
}

function humanize(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

/** Return bounded, deduplicated accessible-name candidates in source precedence order. */
export function labelCandidatesOf(element: Element): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | null | undefined, source: LabelSource, confidence: number): void => {
    const text = boundedText(value, 200, 200);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key) || candidates.length >= MAX_LABEL_CANDIDATES) return;
    seen.add(key);
    candidates.push({ text, source, confidence });
  };

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.trim().split(/\s+/)) {
      const reference = id ? rootElementById(element, id) : null;
      if (reference) add(reference.textContent, "aria", 1);
    }
  }
  add(element.getAttribute("aria-label"), "aria", 0.98);

  for (const label of associatedLabels(element)) add(textWithoutControls(label), "label", 0.95);

  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend) add(textWithoutControls(legend), "label", 0.9);

  add(element.getAttribute("title"), "label", 0.82);
  add(nearbyTextOf(element), "nearby-text", 0.72);
  add(element.getAttribute("placeholder"), "placeholder", 0.65);

  const inferred = humanize(element.getAttribute("name") ?? "") || humanize(element.getAttribute("id") ?? "");
  add(inferred, "inferred", 0.4);
  return candidates;
}
