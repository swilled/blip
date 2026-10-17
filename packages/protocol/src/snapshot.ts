import { z } from "zod";
import { ActionKind } from "./action-kind";

export const LabelSource = z.enum(["aria", "label", "nearby-text", "placeholder", "inferred"]);
export type LabelSource = z.infer<typeof LabelSource>;

export const Sensitivity = z.enum(["none", "password", "card-number", "card-cvc", "otp", "ssn"]);
export type Sensitivity = z.infer<typeof Sensitivity>;

/**
 * D-09: a sensitive control never carries its value on the wire. Presence is conveyed by `hasValue`.
 * The message must not mention the rejected value (and zod issues never echo input).
 */
export const SENSITIVE_VALUE_MESSAGE = "value must be null when sensitive is not none";

export function sensitiveValueIsNull(e: { sensitive: Sensitivity; value: string | null }): boolean {
  return e.sensitive === "none" || e.value === null;
}

// Raw element from the extension (no model involved).
//
// Representation rules (frozen at M0, see PROTOCOL.md):
//  - `category` says whether the element is a fillable "field" or a clickable "action".
//    A consumer treats a missing or odd category as "action" (fail closed).
//  - A radio group is ONE RawElement: `id` is the group id, `inputType` is "radio", `options` carry
//    `selected`, and `value` is the selected option value or null.
//  - A checkbox uses `checked`, with `value` null.
//  - No `.default()` anywhere in wire schemas: input and output types must agree.
//  - Default (non-strict) objects: unknown keys are stripped so an additive field never breaks a peer (D-17).
const RawElementBase = z.object({
  id: z.string(), // "e17" == data-blip-id, stable for this page life (D-08)
  frameId: z.number().int(),
  category: z.enum(["field", "action"]),
  tag: z.string(), // input|select|textarea|button|a|div...
  inputType: z.string().optional(), // raw type attr
  role: z.string(), // computed-ish ARIA role
  labelCandidates: z.array(
    z.object({
      // ALL candidates, best first; the server picks
      text: z.string().max(200),
      source: LabelSource,
      confidence: z.number().min(0).max(1),
    }),
  ),
  describedBy: z.string().max(300).optional(), // aria-describedby text (hints/errors)
  name: z.string().optional(),
  autocomplete: z.string().optional(), // WHATWG token, drives profile fill
  required: z.boolean(),
  requiredSource: z.enum(["attr", "aria", "asterisk", "none"]),
  invalid: z.boolean(), // aria-invalid or :invalid after interaction
  errorText: z.string().max(300).nullable(), // nearest error-ish text
  value: z.string().nullable(), // null when sensitive != "none"
  hasValue: z.boolean(), // presence only; the one thing we may say about a sensitive field
  checked: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string(), selected: z.boolean() })).optional(),
  sensitive: Sensitivity,
  disabled: z.boolean(),
  visible: z.boolean(),
  group: z.string().max(120).optional(), // fieldset legend / section heading
  order: z.number().int(), // document order (D-08)
  // action-ish elements only:
  text: z.string().max(200).optional(), // button/link visible text
  buttonType: z.enum(["submit", "button", "reset"]).optional(), // EFFECTIVE type (<button> default = submit)
  inForm: z.boolean().optional(),
  href: z.string().optional(),
  kind: ActionKind.optional(), // classified by @blip/policy in the extension (hand-set in fixtures, D-11)
  kindReasons: z.array(z.string()).optional(),
});

export const RawElement = RawElementBase.refine(sensitiveValueIsNull, {
  message: SENSITIVE_VALUE_MESSAGE,
  path: ["value"],
});
export type RawElement = z.infer<typeof RawElement>;

export const Snapshot = z.object({
  snapshotId: z.string(),
  version: z.number().int(), // monotonically increasing per tab
  tabId: z.number().int(),
  url: z.string(),
  origin: z.string(),
  title: z.string().max(200),
  headings: z.array(z.object({ level: z.number().int(), text: z.string().max(200) })).max(40),
  alerts: z.array(z.string().max(300)).max(20), // role=alert/status, live regions, toasts
  stepHint: z.string().max(100).optional(), // "Step 2 of 4" if detected
  elements: z.array(RawElement).max(250),
  truncated: z.boolean(),
  structuralHash: z.string(), // hash of (tag,type,name,role,labelCandidate[0]) per element; EXCLUDES values
  capturedAt: z.number(),
});
export type Snapshot = z.infer<typeof Snapshot>;
