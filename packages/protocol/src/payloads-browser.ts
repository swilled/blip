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
      return url.hostname === value && url.port.length === 0 && url.username.length === 0 && url.password.length === 0;
    } catch {
      return false;
    }
  }, { message: "must be a host name without a port or path" });

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
  kind: z.enum(["heading", "paragraph"]),
  text: boundedText(400).min(1),
});
export type BrowserContentBlock = z.infer<typeof BrowserContentBlock>;

const BrowserContentBlocks = z.array(BrowserContentBlock).max(20).superRefine((blocks, ctx) => {
  const total = blocks.reduce((sum, block) => sum + codePoints(block.text), 0);
  if (total > 4000) {
    ctx.addIssue({ code: "custom", message: "content must be at most 4,000 Unicode code points total" });
  }
});

export const BrowserContentResult = BrowserPageIdentity.extend({
  status: z.enum(["supported", "restricted"]),
  blocks: BrowserContentBlocks,
  /** This marks only the bounded content excerpt; it is independent of Snapshot.truncated. */
  truncated: z.boolean(),
}).refine((value) => value.status === "supported" || (value.blocks.length === 0 && !value.truncated), {
  message: "restricted pages cannot return content blocks",
});
export type BrowserContentResult = z.infer<typeof BrowserContentResult>;

export const BrowserLinkRecord = z.object({
  linkId: BrowserId,
  label: boundedText(200).min(1).refine((value) => value.trim().length > 0, {
    message: "must not be empty",
  }),
  hostHint: HostHint.nullable(),
});
export type BrowserLinkRecord = z.infer<typeof BrowserLinkRecord>;

export const BrowserLinkListResult = BrowserPageIdentity.extend({
  status: z.enum(["supported", "restricted"]),
  links: z.array(BrowserLinkRecord).max(100),
  truncated: z.boolean(),
}).refine((value) => value.status === "supported" || (value.links.length === 0 && !value.truncated), {
  message: "restricted pages cannot return links",
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
    op: z.literal("tabs"),
    action: z.enum(["list", "switch", "open-blank"]),
    targetTabId: TabId.optional(),
  }).refine((value) => (value.action === "switch") === (value.targetTabId !== undefined), {
    message: "targetTabId is required only when switching tabs",
  }),
  z.object({ op: z.literal("list-links") }),
  z.object({
    op: z.literal("read-content"),
    kind: z.enum(["heading", "paragraph"]),
    target: NonEmptyQuery,
    identity: BrowserPageIdentity,
  }),
  z.object({
    op: z.literal("open-link"),
    linkId: BrowserId,
    identity: BrowserPageIdentity,
    authorizationId: BrowserId,
  }),
  z.object({
    op: z.literal("scroll"),
    direction: z.enum(["up", "down"]),
    pixels: z.number().int().min(1).max(2000),
  }),
  z.object({ op: z.literal("find"), query: NonEmptyQuery }),
]);
export type BrowserOperation = z.infer<typeof BrowserOperation>;

export const BrowserRequestPayload = z.object({
  requestId: BrowserId,
  /** Omitted only when the deterministic caller is asking the extension to create/select a tab. */
  tabId: TabId.optional(),
  operation: BrowserOperation,
}).superRefine((request, ctx) => {
  const operation = request.operation;
  if ((operation.op === "read-content" || operation.op === "open-link") &&
      request.tabId !== undefined && request.tabId !== operation.identity.tabId) {
    ctx.addIssue({ code: "custom", path: ["tabId"], message: "must match the captured page identity" });
  }
});
export type BrowserRequestPayload = z.infer<typeof BrowserRequestPayload>;

export const BrowserOperationName = z.enum([
  "location", "capture", "navigate", "history", "reload", "search", "tabs",
  "list-links", "read-content", "open-link", "scroll", "find",
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

const BrowserError = z.object({
  code: z.enum([
    "unsupported-page", "restricted-page", "stale-page", "stale-capture", "not-found",
    "ambiguous", "unauthorized", "invalid-target", "timeout", "unavailable", "exception",
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
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("tabs"), result: BrowserTabsResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("list-links"), result: BrowserLinkListResult }),
  z.object({ ok: z.literal(true), requestId: BrowserId, operation: z.literal("read-content"), result: BrowserContentResult }),
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
