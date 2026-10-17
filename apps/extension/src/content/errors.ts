import { boundedText } from "./text.js";
import { isVisible } from "./visibility.js";

export interface ErrorState {
  invalid: boolean;
  describedBy?: string;
  errorText: string | null;
}

const ERROR_SELECTOR = '[role="alert"], [aria-live="assertive"], .error, .errors, .invalid-feedback, [data-error-for]';

function referencedElements(element: Element, attribute: string): Element[] {
  const ids = element.getAttribute(attribute)?.trim().split(/\s+/).filter(Boolean) ?? [];
  const root = element.getRootNode();
  return ids.flatMap((id) => {
    const found = (root.nodeType === 9 || root.nodeType === 11
      ? (root as Document | ShadowRoot).getElementById(id)
      : null) ?? element.ownerDocument.getElementById(id);
    return found ? [found] : [];
  });
}

function visibleText(element: Element): string {
  if (!isVisible(element)) return "";
  return boundedText(element.textContent, 300, 300);
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function nearbyErrorElements(element: Element): Element[] {
  const parent = element.parentElement;
  if (!parent) return [];
  const candidates = Array.from(parent.children).filter((child) => child !== element && safeMatches(child, ERROR_SELECTOR));
  if (safeMatches(parent, ERROR_SELECTOR)) candidates.unshift(parent);
  return candidates;
}

/** Read visible validation hints/errors without copying hidden or page-wide text into the snapshot. */
export function errorStateOf(element: Element): ErrorState {
  const describedElements = referencedElements(element, "aria-describedby");
  const describedByText = describedElements.map(visibleText).filter(Boolean).join(" ");
  const explicitErrors = [
    ...referencedElements(element, "aria-errormessage"),
    ...describedElements.filter((candidate) => safeMatches(candidate, ERROR_SELECTOR)),
    ...nearbyErrorElements(element),
  ];
  const errorText = explicitErrors.map(visibleText).find(Boolean) ?? "";

  let nativeInvalid = false;
  try {
    nativeInvalid = safeMatches(element, ":invalid");
  } catch {
    // Some host elements do not support constraint validation.
  }
  const ariaInvalid = ["true", "grammar", "spelling"].includes(
    element.getAttribute("aria-invalid")?.trim().toLowerCase() ?? "",
  );
  const boundedDescription = boundedText(describedByText, 300, 300);
  const boundedError = boundedText(errorText, 300, 300);

  return {
    invalid: ariaInvalid || nativeInvalid || boundedError.length > 0,
    ...(boundedDescription ? { describedBy: boundedDescription } : {}),
    errorText: boundedError || null,
  };
}
