import { z } from "zod";

// Own file so snapshot.ts and form-model.ts import it plainly (no z.lazy, no circular import).

export const ActionKind = z.enum([
  "fill", "select", "check", // field operations (always ungated)
  "click-safe", // ungated button/link (e.g. "show password", "add another")
  "submit", "pay", "delete", "send", "navigate-cross-domain", // GATED
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const GATED_KINDS = ["submit", "pay", "delete", "send", "navigate-cross-domain"] as const;

const UNGATED_KINDS: ReadonlySet<string> = new Set(["fill", "select", "check", "click-safe"]);

/**
 * Fail closed (D-11): a kind is gated unless it is exactly one of the four ungated kinds.
 * Any unrecognized string, including the empty string, is treated as gated.
 */
export function isGatedKind(kind: string): boolean {
  return !UNGATED_KINDS.has(kind);
}
