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
  if (labelCandidates.some((candidate) => candidate.text.includes("*"))) {
    return { required: true, requiredSource: "asterisk" };
  }
  return { required: false, requiredSource: "none" };
}
