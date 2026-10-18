import { z } from "zod";

// Browser commands are requests to deterministic server/extension code. Text fields carry
// user-derived selectors, queries, or destinations; page text and model output are never targets.
const BrowserId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const TabId = z.number().int().min(0).max(2_147_483_647);
const CaptureRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

function codePoints(value: string): number {
  return Array.from(value).length;
}

function boundedText(maxCodePoints: number) {
  // A Unicode code point occupies at most two UTF-16 code units. The regular Zod limit prevents
  // an oversized input from making the code-point refinement scan unbounded data.
  return z.string().max(maxCodePoints * 2).refine((value) => codePoints(value) <= maxCodePoints, {
    message: `must be at most ${maxCodePoints} Unicode code points`,
  });
}

function isCanonicalUrl(value: string, protocols: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && url.username.length === 0 && url.password.length === 0 && url.href === value;
  } catch {
    return false;
  }
}

/** HTTP(S) destinations are canonical and cannot carry URL credentials. */
export const BrowserDestinationUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => isCanonicalUrl(value, ["http:", "https:"]), {
    message: "must be a canonical HTTP(S) URL without credentials",
  });

/**
 * Page identity also represents restricted browser pages such as about:blank and chrome:// URLs.
 * Those URLs can be reported as restricted content, but are never valid navigation destinations.
 */
export const BrowserPageUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => isCanonicalUrl(value, ["http:", "https:", "about:", "chrome:", "chrome-extension:"]), {
    message: "must be a canonical supported page URL without credentials",
  });

const HostHint = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => {
    if (value !== value.toLowerCase() || /[\s/@?#]/.test(value)) return false;
    try {
      const url = new URL(`https://${value}/`);
      return url.host === value && url.username.length === 0 && url.password.length === 0;
    } catch {
      return false;
    }
  }, { message: "must be a canonical host with an optional port and no path" });

const NonEmptyQuery = boundedText(500).refine((value) => value.trim().length > 0, {
  message: "must not be empty",
});

export const BrowserPageIdentity = z.object({
  captureId: BrowserId,
  captureRevision: CaptureRevision,
  tabId: TabId,
  pageUrl: BrowserPageUrl,
});
export type BrowserPageIdentity = z.infer<typeof BrowserPageIdentity>;

export const BrowserContentBlock = z.object({
  contentId: BrowserId,
  kind: z.enum(["heading", "paragraph"]),
  text: boundedText(400).min(1),
  identity: BrowserPageIdentity,
  frameId: z.number().int().min(0).max(100_000),
});
export type BrowserContentBlock = z.infer<typeof BrowserContentBlock>;

/** A generic visible semantic item, with recency evidence only when its visible time is explicit. */
export const BrowserContentItem = z.object({
  itemId: BrowserId,
  text: boundedText(400).min(1),
  /** Strict ISO-8601 evidence from a visible semantic time element; null means unknown. */
  visibleDate: z.iso.datetime({ offset: true }).nullable(),
  identity: BrowserPageIdentity,
  frameId: z.number().int().min(0).max(100_000),
});
export type BrowserContentItem = z.infer<typeof BrowserContentItem>;

const BrowserContentBlocks = z.array(BrowserContentBlock).max(20).superRefine((blocks, ctx) => {
  const total = blocks.reduce((sum, block) => sum + codePoints(block.text), 0);
  if (total > 4000) {
    ctx.addIssue({ code: "custom", message: "content must be at most 4,000 Unicode code points total" });
  }
});

const BrowserContentItems = z.array(BrowserContentItem).max(20).superRefine((items, ctx) => {
  const total = items.reduce((sum, item) => sum + codePoints(item.text), 0);
  if (total > 4000) {
    ctx.addIssue({ code: "custom", message: "items must be at most 4,000 Unicode code points total" });
  }
  if (new Set(items.map((item) => item.itemId)).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "item IDs must be unique within a capture" });
  }
});

export const BrowserContentResult = BrowserPageIdentity.extend({
  status: z.enum(["supported", "restricted", "empty", "timeout", "capture-failed"]),
  blocks: BrowserContentBlocks,
  /** Optional for compatibility with captures from peers that predate semantic item records. */
  items: BrowserContentItems.optional(),
  /** This marks only the bounded content excerpt; it is independent of Snapshot.truncated. */
  truncated: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.status !== "supported" &&
      (value.blocks.length !== 0 || (value.items?.length ?? 0) !== 0 || value.truncated)) {
    ctx.addIssue({ code: "custom", message: "non-supported content results cannot return blocks" });
  }
  for (const block of value.blocks) {
    if (block.identity.captureId !== value.captureId || block.identity.captureRevision !== value.captureRevision ||
        block.identity.tabId !== value.tabId || block.identity.pageUrl !== value.pageUrl) {
      ctx.addIssue({ code: "custom", message: "content blocks must match their capture identity" });
    }
  }
  for (const item of value.items ?? []) {
    if (item.identity.captureId !== value.captureId || item.identity.captureRevision !== value.captureRevision ||
        item.identity.tabId !== value.tabId || item.identity.pageUrl !== value.pageUrl) {
      ctx.addIssue({ code: "custom", message: "content items must match their capture identity" });
    }
  }
});
export type BrowserContentResult = z.infer<typeof BrowserContentResult>;

export const BrowserLinkRecord = z.object({
  linkId: BrowserId,
  label: boundedText(200).min(1).refine((value) => value.trim().length > 0, {
    message: "must not be empty",
  }),
  hostHint: HostHint.nullable(),
  /** Extension classification hint; live eligibility is recomputed before dispatch. */
  navigationSafety: z.enum(["same-origin-safe-get", "confirmation-required", "unsupported"]).optional(),
  identity: BrowserPageIdentity,
  frameId: z.number().int().min(0).max(100_000),
});
export type BrowserLinkRecord = z.infer<typeof BrowserLinkRecord>;

export const BrowserLinkListResult = BrowserPageIdentity.extend({
  status: z.enum(["supported", "restricted", "empty"]),
  links: z.array(BrowserLinkRecord).max(100),
  truncated: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.status !== "supported" && (value.links.length !== 0 || value.truncated)) {
    ctx.addIssue({ code: "custom", message: "non-supported link results cannot return links" });
  }
  for (const link of value.links) {
    if (link.identity.captureId !== value.captureId || link.identity.captureRevision !== value.captureRevision ||
        link.identity.tabId !== value.tabId || link.identity.pageUrl !== value.pageUrl) {
      ctx.addIssue({ code: "custom", message: "links must match their capture identity" });
    }
  }
});
export type BrowserLinkListResult = z.infer<typeof BrowserLinkListResult>;

export const BrowserOperation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("location") }),
  z.object({ op: z.literal("capture") }),
  z.object({ op: z.literal("navigate"), url: BrowserDestinationUrl, authorizationId: BrowserId }),
  z.object({ op: z.literal("history"), direction: z.enum(["back", "forward"]) }),
  z.object({ op: z.literal("reload") }),
  z.object({
    op: z.literal("search"),
    route: z.enum(["site", "browser-default"]),
    query: NonEmptyQuery,
    authorizationId: BrowserId,
  }),
  z.object({
    op: z.literal("site-search"),
    query: NonEmptyQuery,
    identity: BrowserPageIdentity,
    authorizationId: BrowserId,
  }),
  z.object({
    op: z.literal("tabs"),
    action: z.enum(["list", "switch", "open-blank"]),
    targetTabId: TabId.optional(),
  }).refine((value) => (value.action === "switch") === (value.targetTabId !== undefined), {
    message: "targetTabId is required only when switching tabs",
  }),
  z.object({ op: z.literal("list-links"), identity: BrowserPageIdentity.optional() }),
  z.object({
    op: z.literal("read-content"),
    kind: z.enum(["heading", "paragraph"]),
    contentId: BrowserId,
    identity: BrowserPageIdentity,
  }),
  z.object({
    op: z.literal("read-item"),
    itemId: BrowserId,
    identity: BrowserPageIdentity,
  }),
  z.object({
    op: z.literal("open-link"),
    linkId: BrowserId,
    identity: BrowserPageIdentity,
    authorizationId: BrowserId,
    /** Explicit user selection is enough for ordinary same-origin GETs; all other links need spoken approval. */
    authorizationMode: z.enum(["user-command", "spoken"]).optional(),
  }),
  z.object({
    op: z.literal("scroll"),
    direction: z.enum(["up", "down"]).optional(),
    pixels: z.number().int().min(1).max(2000).optional(),
    contentId: BrowserId.optional(),
    kind: z.enum(["heading", "paragraph"]).optional(),
    identity: BrowserPageIdentity,
  }).superRefine((value, ctx) => {
    const directionScroll = value.direction !== undefined && value.pixels !== undefined &&
      value.contentId === undefined && value.kind === undefined;
    const contentScroll = value.direction === undefined && value.pixels === undefined &&
      value.contentId !== undefined && value.kind !== undefined;
    if (!directionScroll && !contentScroll) {
      ctx.addIssue({ code: "custom", message: "scroll requires either direction and pixels or a content ID and kind" });
    }
  }),
  z.object({ op: z.literal("find"), query: NonEmptyQuery, identity: BrowserPageIdentity }),
]);
export type BrowserOperation = z.infer<typeof BrowserOperation>;

/** Live read result for one item, still bound to the exact capture that supplied its ID. */
export const BrowserReadItemResult = BrowserContentItem;
export type BrowserReadItemResult = z.infer<typeof BrowserReadItemResult>;

export const BrowserRequestPayload = z.object({
  requestId: BrowserId,
  /** Omitted only when the deterministic caller is asking the extension to create/select a tab. */
  tabId: TabId.optional(),
  operation: BrowserOperation,
}).superRefine((request, ctx) => {
  const operation = request.operation;
  const identity = "identity" in operation ? operation.identity : undefined;
  if (identity !== undefined && request.tabId !== undefined && request.tabId !== identity.tabId) {
    ctx.addIssue({ code: "custom", path: ["tabId"], message: "must match the captured page identity" });
  }
});
export type BrowserRequestPayload = z.infer<typeof BrowserRequestPayload>;

export const BrowserOperationName = z.enum([
  "location", "capture", "navigate", "history", "reload", "search", "site-search", "tabs",
  "list-links", "read-content", "read-item", "open-link", "scroll", "find", "unknown",
]);

const BrowserCommandResult = z.object({
  tabId: TabId.optional(),
  status: z.enum(["dispatched", "completed"]),
});

const BrowserLocationResult = z.object({
  tabId: TabId,
  pageUrl: BrowserPageUrl,
  title: boundedText(200),
  status: z.enum(["supported", "restricted"]),
});

const BrowserTabSummary = z.object({
  tabId: TabId,
  title: boundedText(200),
  hostHint: HostHint.nullable(),
});

const BrowserTabsResult = z.object({
  activeTabId: TabId.nullable(),
  tabs: z.array(BrowserTabSummary).max(50),
  truncated: z.boolean(),
});

const BrowserScrollResult = z.object({
  identity: BrowserPageIdentity,
  moved: z.boolean(),
});

const BrowserFindResult = z.object({
  identity: BrowserPageIdentity,
  found: z.boolean(),
  matchCount: z.number().int().min(0).max(1000),
  truncated: z.boolean(),
});

const BrowserSiteSearchResult = BrowserPageIdentity.extend({ status: z.literal("submitted") });

const BrowserError = z.object({
  code: z.enum([
    "unsupported-page", "restricted-page", "stale-page", "stale-capture", "not-found",
    "ambiguous", "unauthorized", "invalid-target", "unsupported-destination-check", "invalid-request",
    "unsupported-frame", "timeout", "unavailable", "exception",
  ]),
  message: boundedText(300),
});

const BrowserSuccess = z.discriminatedUnion("operation", [
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("location"), result: BrowserLocationResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("capture"), result: BrowserContentResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("navigate"), result: BrowserCommandResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("history"), result: BrowserCommandResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("reload"), result: BrowserCommandResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("search"), result: BrowserCommandResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("site-search"), result: BrowserSiteSearchResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("tabs"), result: BrowserTabsResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("list-links"), result: BrowserLinkListResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("read-content"), result: BrowserContentResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("read-item"), result: BrowserReadItemResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("open-link"), result: BrowserCommandResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("scroll"), result: BrowserScrollResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("find"), result: BrowserFindResult }),
]);

const BrowserFailure = z.object({
  ok: z.literal(false),
  requestId: BrowserId,
  operation: BrowserOperationName,
  error: BrowserError,
});

export const BrowserResultPayload = z.union([BrowserSuccess, BrowserFailure]);
export type BrowserResultPayload = z.infer<typeof BrowserResultPayload>;
