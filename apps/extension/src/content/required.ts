import { labelCandidatesOf, type LabelCandidate } from "./labels.js";

export type RequiredSource = "attr" | "aria" | "asterisk" | "none";

export interface RequiredState {
  required: boolean;
  requiredSource: RequiredSource;
}

/** Determine required state using native, ARIA, then visible label-marker precedence. */
export function requiredStateOf(
  element: Element,
  labelCandidates: readonly LabelCandidate[] = labelCandidatesOf(element),
): RequiredState {
  if (element.hasAttribute("required")) return { required: true, requiredSource: "attr" };
  if (element.getAttribute("aria-required")?.trim().toLowerCase() === "true") {
    return { required: true, requiredSource: "aria" };
  }
  // Microsoft Forms puts the accessible required state on an empty note beside the
  // question title, not on the input or its textContent-based label candidate.
  // Scope this marker to the nearest question so a neighboring required question
  // cannot make an optional field required.
  const question = element.closest('[data-automation-id="questionItem"]');
  const requiredMarker = question?.querySelector('[data-automation-id="requiredStar"]');
  if (requiredMarker?.closest('[data-automation-id="questionItem"]') === question) {
    return { required: true, requiredSource: "aria" };
  }
  if (labelCandidates.some((candidate) => candidate.text.includes("*"))) {
    return { required: true, requiredSource: "asterisk" };
  }
  return { required: false, requiredSource: "none" };
}
