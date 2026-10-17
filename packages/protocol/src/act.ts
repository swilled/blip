import { z } from "zod";
import { ActionKind } from "./action-kind";

export const ActOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("fill"), targetId: z.string(), value: z.string() }),
  z.object({ op: z.literal("select"), targetId: z.string(), optionValue: z.string() }),
  z.object({ op: z.literal("check"), targetId: z.string(), checked: z.boolean() }),
  z.object({ op: z.literal("focus"), targetId: z.string() }), // used for password/card: the user types
  z.object({ op: z.literal("click"), targetId: z.string() }),
  z.object({ op: z.literal("scroll-into-view"), targetId: z.string() }),
]);
export type ActOp = z.infer<typeof ActOp>;

export const ActRequest = z.object({
  actId: z.string(),
  tabId: z.number().int(),
  snapshotVersion: z.number().int(), // the extension rejects if its version differs AND the target changed
  action: ActOp,
  expectedKind: ActionKind, // server's classification
  gate: z
    .object({
      // present ONLY for gated kinds
      grantId: z.string(),
      kind: ActionKind,
    })
    .optional(),
});
export type ActRequest = z.infer<typeof ActRequest>;

export const ActResult = z.object({
  actId: z.string(),
  ok: z.boolean(),
  error: z
    .enum([
      "target-not-found", "stale-snapshot", "kind-mismatch", // live re-classification disagreed
      "gate-required", "sensitive-field", "disabled", "exception",
    ])
    .optional(),
  detail: z.string().max(300).optional(),
  observedValue: z.string().nullable().optional(), // DOM value read back after fill/select (verify-after-write)
  liveKind: ActionKind.optional(),
  newSnapshotVersion: z.number().int().optional(),
});
export type ActResult = z.infer<typeof ActResult>;
