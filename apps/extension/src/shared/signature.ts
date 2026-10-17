import type { RawElement, Snapshot } from "@blip/protocol";
import { hashString } from "./hash.js";

type StructuralElement = Pick<RawElement, "tag" | "inputType" | "name" | "role" | "labelCandidates">;
type ChangeElement = Pick<
  RawElement,
  | "tag"
  | "inputType"
  | "name"
  | "role"
  | "labelCandidates"
  | "visible"
  | "disabled"
  | "required"
  | "invalid"
  | "errorText"
  | "options"
>;
type SnapshotChangeData = Pick<Snapshot, "elements" | "headings" | "alerts">;

/** Contract structural hash: identity and accessible label metadata only, never field values. */
export function computeStructuralHash(elements: readonly StructuralElement[]): string {
  const identity = elements.map((element) => [
    element.tag,
    element.inputType ?? "",
    element.name ?? "",
    element.role,
    element.labelCandidates[0]?.text ?? "",
  ]);
  return hashString(JSON.stringify(identity));
}

/** Internal page-change signature; tracks useful metadata while excluding current control state. */
export function changeSignature(snapshot: SnapshotChangeData): string {
  const fields = snapshot.elements.map((element: ChangeElement) => [
    element.tag,
    element.inputType ?? "",
    element.name ?? "",
    element.role,
    element.labelCandidates[0]?.text ?? "",
    element.visible,
    element.disabled,
    element.required,
    element.invalid,
    element.errorText,
    // Option membership/labels are structural; selected is the current value and is omitted.
    element.options?.map((option) => [option.value, option.label]) ?? null,
  ]);
  const headings = snapshot.headings.map((heading) => [heading.level, heading.text]);
  return hashString(JSON.stringify([fields, headings, snapshot.alerts]));
}
