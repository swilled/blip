import { z } from "zod";
import { Snapshot } from "./snapshot";

// Extension-side payload schemas (plan 01-02). Default z.object everywhere: unknown keys are
// stripped, never rejected (D-17). No .default() in wire schemas (research Pitfall 9).

export const SnapshotRequestPayload = z.object({
  tabId: z.number().int().optional(),
  reason: z.enum(["page-load", "user", "post-act", "refresh"]),
});
export type SnapshotRequestPayload = z.infer<typeof SnapshotRequestPayload>;

/**
 * M0 sign-off item 5: an `ok`-discriminated union (research Pitfall 3), so a failed snapshot is a
 * typed reply rather than a timeout. The `error.code` is an open string (documented list in PROTOCOL.md).
 */
export const SnapshotResultPayload = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), snapshot: Snapshot }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1).max(64), message: z.string().max(300) }),
  }),
]);
export type SnapshotResultPayload = z.infer<typeof SnapshotResultPayload>;
