import { describe, expect, it } from "vitest";
import {
  BrowserContentResult,
  BrowserLinkListResult,
  BrowserOperation,
  BrowserRequestPayload,
  BrowserResultPayload,
  type BrowserOperation as BrowserOperationType,
} from "../src/index";

const identity = {
  captureId: "capture-1",
  captureRevision: 1,
  tabId: 7,
  pageUrl: "https://example.test/article/",
};

const validOperations: BrowserOperationType[] = [
  { op: "location" },
  { op: "capture" },
  { op: "navigate", url: "https://example.test/", authorizationId: "auth-1" },
  { op: "history", direction: "back" },
  { op: "reload" },
  { op: "search", route: "browser-default", query: "recent articles", authorizationId: "auth-2" },
  { op: "tabs", action: "list" },
  { op: "tabs", action: "switch", targetTabId: 8 },
  { op: "tabs", action: "open-blank" },
  { op: "list-links" },
  { op: "read-content", kind: "heading", target: "Latest stories", identity },
  { op: "open-link", linkId: "link-1", identity, authorizationId: "auth-3" },
  { op: "scroll", direction: "down", pixels: 500 },
  { op: "find", query: "newsletter" },
];

const validSuccessResults = [
  { ok: true, requestId: "request-1", operation: "location", result: { tabId: 7, pageUrl: identity.pageUrl, title: "Article", status: "supported" } },
  { ok: true, requestId: "request-1", operation: "capture", result: { ...identity, status: "supported", blocks: [{ kind: "heading", text: "Latest stories" }], truncated: false } },
  { ok: true, requestId: "request-1", operation: "navigate", result: { tabId: 7, status: "dispatched" } },
  { ok: true, requestId: "request-1", operation: "history", result: { tabId: 7, status: "completed" } },
  { ok: true, requestId: "request-1", operation: "reload", result: { tabId: 7, status: "dispatched" } },
  { ok: true, requestId: "request-1", operation: "search", result: { tabId: 7, status: "dispatched" } },
  { ok: true, requestId: "request-1", operation: "tabs", result: { activeTabId: 7, tabs: [{ tabId: 7, title: "Article", hostHint: "example.test" }], truncated: false } },
  { ok: true, requestId: "request-1", operation: "list-links", result: { ...identity, status: "supported", links: [{ linkId: "link-1", label: "More", hostHint: "example.test" }], truncated: false } },
  { ok: true, requestId: "request-1", operation: "read-content", result: { ...identity, status: "supported", blocks: [{ kind: "paragraph", text: "A bounded excerpt." }], truncated: false } },
  { ok: true, requestId: "request-1", operation: "open-link", result: { tabId: 7, status: "dispatched" } },
  { ok: true, requestId: "request-1", operation: "scroll", result: { identity, moved: true } },
  { ok: true, requestId: "request-1", operation: "find", result: { identity, found: true, matchCount: 1, truncated: false } },
];

describe("BrowserOperation", () => {
  it.each(validOperations)("accepts the $op operation", (operation) => {
    expect(BrowserOperation.safeParse(operation).success).toBe(true);
  });

  it("contains exactly the 12 closed operation discriminants", () => {
    expect(BrowserOperation.options.map((option) => option.shape.op.value)).toEqual([
      "location", "capture", "navigate", "history", "reload", "search", "tabs",
      "list-links", "read-content", "open-link", "scroll", "find",
    ]);
    expect(BrowserOperation.safeParse({ op: "script", script: "location.href='https://evil.test'" }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "confirm" }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "approve" }).success).toBe(false);
  });

  it("requires one-use authorization for navigations, search, and link opening", () => {
    expect(BrowserOperation.safeParse({ op: "navigate", url: "https://example.test/" }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "search", route: "site", query: "hours" }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "open-link", linkId: "link-1", identity }).success).toBe(false);
  });

  it("rejects unsafe or noncanonical destinations", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://user:password@example.test/",
      "https://example.test", // canonical URLs include the trailing slash
      " https://example.test/",
    ]) {
      expect(BrowserOperation.safeParse({ op: "navigate", url, authorizationId: "auth-1" }).success).toBe(false);
    }
  });

  it("rejects malformed identifiers and page identity mismatches", () => {
    expect(BrowserRequestPayload.safeParse({ requestId: "", operation: { op: "capture" } }).success).toBe(false);
    expect(BrowserRequestPayload.safeParse({ requestId: "_bad", operation: { op: "capture" } }).success).toBe(false);
    expect(BrowserRequestPayload.safeParse({ requestId: "r".repeat(65), operation: { op: "capture" } }).success).toBe(false);
    expect(BrowserRequestPayload.safeParse({
      requestId: "request-1",
      tabId: 8,
      operation: { op: "read-content", kind: "heading", target: "Title", identity },
    }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "scroll", direction: "down", pixels: 0 }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "tabs", action: "switch" }).success).toBe(false);
    expect(BrowserOperation.safeParse({ op: "tabs", action: "open-blank", targetTabId: 8 }).success).toBe(false);
  });
});

describe("browser content and link bounds", () => {
  it("counts Unicode code points per block and in aggregate", () => {
    const emojiBlock = "😀".repeat(400);
    const capture = { ...identity, status: "supported", blocks: [{ kind: "paragraph", text: emojiBlock }], truncated: false };
    expect(BrowserContentResult.safeParse(capture).success).toBe(true);
    expect(BrowserContentResult.safeParse({
      ...capture,
      blocks: Array.from({ length: 20 }, () => ({ kind: "paragraph", text: "x".repeat(200) })),
    }).success).toBe(true);
    expect(BrowserContentResult.safeParse({ ...capture, blocks: [{ kind: "paragraph", text: emojiBlock + "😀" }] }).success).toBe(false);
    expect(BrowserContentResult.safeParse({
      ...capture,
      blocks: Array.from({ length: 11 }, () => ({ kind: "paragraph", text: "x".repeat(400) })),
    }).success).toBe(false);
    expect(BrowserContentResult.safeParse({
      ...capture,
      blocks: Array.from({ length: 21 }, () => ({ kind: "paragraph", text: "x" })),
    }).success).toBe(false);
  });

  it("rejects unsupported page URLs and overlong labels", () => {
    expect(BrowserContentResult.safeParse({ ...identity, pageUrl: "javascript:alert(1)", status: "restricted", blocks: [], truncated: false }).success).toBe(false);
    expect(BrowserLinkListResult.safeParse({
      ...identity,
      status: "supported",
      links: [{ linkId: "link-1", label: "x".repeat(201), hostHint: "example.test" }],
      truncated: false,
    }).success).toBe(false);
  });

  it("returns only a stable link ID, bounded label, and safe host hint", () => {
    const parsed = BrowserLinkListResult.parse({
      ...identity,
      status: "supported",
      links: [{ linkId: "link-1", label: "Read more", hostHint: "example.test", href: "https://example.test/secret" }],
      truncated: false,
    });
    expect(parsed.links[0]).toEqual({ linkId: "link-1", label: "Read more", hostHint: "example.test" });
    expect(BrowserLinkListResult.safeParse({
      ...identity,
      status: "supported",
      links: [{ linkId: "link-1", label: "Read more", hostHint: "https://example.test/path" }],
      truncated: false,
    }).success).toBe(false);
  });

  it("distinguishes restricted pages from a successful empty capture", () => {
    expect(BrowserContentResult.safeParse({ ...identity, status: "supported", blocks: [], truncated: false }).success).toBe(true);
    expect(BrowserContentResult.safeParse({ ...identity, pageUrl: "chrome://settings/", status: "restricted", blocks: [], truncated: false }).success).toBe(true);
    expect(BrowserContentResult.safeParse({ ...identity, status: "restricted", blocks: [{ kind: "paragraph", text: "not allowed" }], truncated: false }).success).toBe(false);
  });
});

describe("BrowserResultPayload", () => {
  it.each(validSuccessResults)("accepts the successful $operation result branch", (result) => {
    expect(BrowserResultPayload.safeParse(result).success).toBe(true);
  });

  it("accepts a bounded error result branch and rejects mismatched result shapes", () => {
    expect(BrowserResultPayload.safeParse({
      ok: false,
      requestId: "request-1",
      operation: "capture",
      error: { code: "restricted-page", message: "This page cannot be read." },
    }).success).toBe(true);
    expect(BrowserResultPayload.safeParse({
      ok: true,
      requestId: "request-1",
      operation: "capture",
      result: { tabId: 7, status: "dispatched" },
    }).success).toBe(false);
    expect(BrowserResultPayload.safeParse({
      ok: false,
      requestId: "request-1",
      operation: "capture",
      error: { code: "anything", message: "No" },
    }).success).toBe(false);
    expect(BrowserResultPayload.safeParse({
      ok: false,
      requestId: "request-1",
      operation: "history",
      error: { code: "unsupported-destination-check", message: "The next destination cannot be verified." },
    }).success).toBe(true);
    expect(BrowserResultPayload.safeParse({
      ok: false,
      requestId: "request-1",
      operation: "unknown",
      error: { code: "invalid-request", message: "The browser request is malformed." },
    }).success).toBe(true);
  });
});
