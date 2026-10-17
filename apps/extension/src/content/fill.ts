import { blurWithEvents, focusWithEvents } from "./focus.js";

const MAXLENGTH_TYPES = new Set(["text", "search", "url", "tel", "email", "password"]);

export type WriteOutcome = { ok: true; detail?: string } | { ok: false; detail: string };

function setterFor(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): ((value: string) => void) | null {
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  const prototype = element.localName === "input"
    ? view.HTMLInputElement.prototype
    : element.localName === "textarea"
      ? view.HTMLTextAreaElement.prototype
      : view.HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  return setter ? (value) => setter.call(element, value) : null;
}

function clampMaxLength(element: HTMLInputElement | HTMLTextAreaElement, requested: string): {
  value: string;
  max: number;
  truncated: boolean;
} {
  const applies = element.localName === "textarea" || MAXLENGTH_TYPES.has((element as HTMLInputElement).type.toLowerCase());
  const max = element.maxLength;
  if (!applies || max < 0 || requested.length <= max) return { value: requested, max, truncated: false };

  let value = requested.slice(0, max);
  const last = value.charCodeAt(value.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) value = value.slice(0, -1);
  return { value, max, truncated: true };
}

function scrollIntoView(element: Element): void {
  try {
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  } catch {
    // Some older browsers expose scrollIntoView but reject its options argument.
    try { element.scrollIntoView?.(); } catch { /* best effort */ }
  }
}

/** Set a text-like control with native setters and framework-observed input/change events. */
export async function fillText(
  element: HTMLInputElement | HTMLTextAreaElement,
  requested: string,
): Promise<WriteOutcome> {
  const setter = setterFor(element);
  if (!setter) return { ok: false, detail: "value setter unavailable" };

  scrollIntoView(element);
  focusWithEvents(element);
  const bounded = clampMaxLength(element, requested);
  setter(bounded.value);
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: bounded.value,
  }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  blurWithEvents(element);
  await settle(element.ownerDocument.defaultView);
  return {
    ok: true,
    ...(bounded.truncated ? { detail: `truncated to ${bounded.max} characters` } : {}),
  };
}

/** Set a native select by option value, with a label fallback for spoken choices. */
export async function fillSelect(element: HTMLSelectElement, requested: string): Promise<WriteOutcome> {
  const options = Array.from(element.options);
  const option = options.find((candidate) => candidate.value === requested)
    ?? options.find((candidate) => candidate.label.trim().toLocaleLowerCase() === requested.trim().toLocaleLowerCase());
  if (!option) return { ok: false, detail: "no such option" };

  const setter = setterFor(element);
  if (!setter) return { ok: false, detail: "value setter unavailable" };
  scrollIntoView(element);
  focusWithEvents(element);
  if (element.value !== option.value) {
    setter(option.value);
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  blurWithEvents(element);
  await settle(element.ownerDocument.defaultView);
  return { ok: true };
}

/** Let the browser generate the native events React and Vue observe for checkables. */
export async function setChecked(element: HTMLInputElement, checked: boolean): Promise<WriteOutcome> {
  if (element.type === "radio" && !checked) return { ok: false, detail: "radio cannot be unchecked" };
  scrollIntoView(element);
  if (element.checked !== checked) element.click();
  await settle(element.ownerDocument.defaultView);
  return { ok: true };
}

/** Select a member of a radio group, accepting its value or visible label. */
export async function selectRadio(
  members: readonly HTMLInputElement[],
  requested: string,
): Promise<WriteOutcome> {
  const normalized = requested.trim().toLocaleLowerCase();
  const target = members.find((member) => member.value === requested)
    ?? members.find((member) => member.labels && Array.from(member.labels)
      .some((label) => label.textContent?.trim().toLocaleLowerCase() === normalized));
  if (!target) return { ok: false, detail: "no such option" };
  if (!target.checked) {
    scrollIntoView(target);
    target.click();
  }
  await settle(target.ownerDocument.defaultView);
  return { ok: true };
}

export function settle(view: Window | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, 120);
    const raf = view?.requestAnimationFrame?.bind(view);
    if (raf) {
      raf(() => raf(() => {
        clearTimeout(timer);
        finish();
      }));
    }
  });
}
