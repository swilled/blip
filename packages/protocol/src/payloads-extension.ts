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

// act.request and act.result use ActRequest and ActResult from act.ts directly (D-15).

/** Debounced by the extension (500 ms); the server decides whether to re-snapshot. */
export const PageChangedPayload = z.object({
  tabId: z.number().int(),
  url: z.string(),
  reason: z.enum(["navigation", "mutation", "tab-activated"]),
  structuralHash: z.string().optional(),
});
export type PageChangedPayload = z.infer<typeof PageChangedPayload>;

/** In-page live region text for NVDA mode. */
export const AnnouncePayload = z.object({
  text: z.string().max(500),
  politeness: z.enum(["polite", "assertive"]),
});
export type AnnouncePayload = z.infer<typeof AnnouncePayload>;

/** Visual aid for the sighted audience; null clears the highlight. */
export const HighlightPayload = z.object({
  targetId: z.string().nullable(),
});
export type HighlightPayload = z.infer<typeof HighlightPayload>;

/**
 * Global-hotkey relay from chrome.commands (toggle only; there is no keyup). Separate from the
 * voice-only `ptt` type so no type has two payload schemas (M0 sign-off item 1, research Pitfall 1).
 */
export const PttHotkeyPayload = z.object({
  source: z.literal("global-hotkey"),
});
export type PttHotkeyPayload = z.infer<typeof PttHotkeyPayload>;

/** Keepalive (D-06): the extension pings every 20 s, the server answers pong. */
export const PingPayload = z.object({});
export type PingPayload = z.infer<typeof PingPayload>;
export const PongPayload = z.object({});
export type PongPayload = z.infer<typeof PongPayload>;
