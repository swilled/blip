type RectLike = Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;
type CheckVisibilityElement = Element & {
  checkVisibility?: (options?: {
    opacityProperty?: boolean;
    visibilityProperty?: boolean;
    contentVisibilityAuto?: boolean;
  }) => boolean;
};

function composedAncestors(element: Element): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = element;
  while (current) {
    ancestors.push(current);
    if (current.parentElement) {
      current = current.parentElement;
    } else {
      const root = current.getRootNode();
      current = root.nodeType === 11 && "host" in root ? (root as ShadowRoot).host : null;
    }
  }
  return ancestors;
}

function styleOf(element: Element): CSSStyleDeclaration | null {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  } catch {
    return null;
  }
}

/** True for controls that are rendered in the document, including rendered below the fold. */
export function isVisible(element: Element): boolean {
  for (const ancestor of composedAncestors(element)) {
    if (
      ancestor.hasAttribute("hidden") ||
      ancestor.hasAttribute("inert") ||
      ancestor.getAttribute("aria-hidden")?.trim().toLowerCase() === "true"
    ) {
      return false;
    }
    const style = styleOf(ancestor);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse" ||
      style?.contentVisibility === "hidden" ||
      style?.opacity === "0"
    ) {
      return false;
    }
  }

  const checkVisibility = (element as CheckVisibilityElement).checkVisibility;
  if (typeof checkVisibility === "function") {
    try {
      if (!checkVisibility.call(element, {
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      })) return false;
    } catch {
      // Older engines may implement checkVisibility without accepting its options object.
      try {
        if (!checkVisibility.call(element)) return false;
      } catch {
        // The ancestor style and geometry checks below remain available.
      }
    }
  }

  let rect: RectLike;
  try {
    rect = element.getBoundingClientRect();
  } catch {
    return false;
  }
  if (rect.width <= 0 || rect.height <= 0) return false;

  const view = element.ownerDocument.defaultView;
  const scrollX = view?.scrollX ?? 0;
  const scrollY = view?.scrollY ?? 0;
  // Hide common left/top:-9999px honeypots while keeping below-fold controls visible.
  if (rect.right + scrollX < 0 || rect.bottom + scrollY < 0) return false;
  return true;
}

function isDisabledByFieldset(element: Element, fieldset: HTMLFieldSetElement): boolean {
  const firstLegend = Array.from(fieldset.children).find((child) => child.localName === "legend");
  return !(firstLegend?.contains(element) ?? false);
}

/** Shared snapshot/live-act predicate, including readonly text inputs and textareas. */
export function isDisabled(element: Element): boolean {
  if (element.hasAttribute("disabled")) return true;
  if (
    (element.localName === "input" || element.localName === "textarea") &&
    element.hasAttribute("readonly")
  ) {
    return true;
  }

  for (const ancestor of composedAncestors(element)) {
    if (ancestor.getAttribute("aria-disabled")?.trim().toLowerCase() === "true") return true;
    if (
      ancestor.localName === "fieldset" &&
      (ancestor as HTMLFieldSetElement).disabled &&
      isDisabledByFieldset(element, ancestor as HTMLFieldSetElement)
    ) {
      return true;
    }
  }
  return false;
}
