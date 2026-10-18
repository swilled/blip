import type { RawElement } from "@blip/protocol";
import { hashString } from "../shared/hash.js";

export type FingerprintInput = Pick<
  RawElement,
  "tag" | "inputType" | "name" | "role" | "labelCandidates" | "visible" | "disabled"
>;

/** Fingerprint continuity metadata; intentionally excludes all current control values. */
export function fingerprintOf(element: FingerprintInput): string {
  return hashString(JSON.stringify([
    element.tag.toLowerCase(),
    element.inputType?.toLowerCase() ?? "",
    element.name ?? "",
    element.role,
    element.labelCandidates[0]?.text ?? "",
    element.visible,
    element.disabled,
  ]));
}
