/** Focus a control and synthesize the events Chromium omits for an unfocused page. */
export function focusWithEvents(element: HTMLElement): void {
  if (element.ownerDocument.activeElement === element) return;

  const seen = new Set<string>();
  const observe = (event: Event) => seen.add(event.type);
  element.addEventListener("focus", observe, true);
  element.addEventListener("focusin", observe, true);
  try {
    element.focus({ preventScroll: true });
  } finally {
    element.removeEventListener("focus", observe, true);
    element.removeEventListener("focusin", observe, true);
  }

  if (!seen.has("focus")) element.dispatchEvent(new FocusEvent("focus", { composed: true }));
  if (!seen.has("focusin")) {
    element.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
  }
}

/** Blur a control and synthesize the events Chromium omits for an unfocused page. */
export function blurWithEvents(element: HTMLElement): void {
  if (element.ownerDocument.activeElement !== element) return;

  const seen = new Set<string>();
  const observe = (event: Event) => seen.add(event.type);
  element.addEventListener("blur", observe, true);
  element.addEventListener("focusout", observe, true);
  try {
    element.blur();
  } finally {
    element.removeEventListener("blur", observe, true);
    element.removeEventListener("focusout", observe, true);
  }

  if (!seen.has("blur")) element.dispatchEvent(new FocusEvent("blur", { composed: true }));
  if (!seen.has("focusout")) {
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
  }
}
