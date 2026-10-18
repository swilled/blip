import { describe, expect, it } from "vitest";
import type { Message } from "@blip/protocol";
import type { Hub } from "../hub/hub";
import { Session } from "../session/session";
import type { Refresher } from "../session/refresh";
import { handleBrowserSpeakDone, handleUtterance } from "../turn";
import { BROWSER_AUTHORIZATION_GUARD_MS, BROWSER_AUTHORIZATION_TTL_MS, createBrowserAuthorizationStore } from "./authorization";

const identity = {
  captureId: "capture-1",
  captureRevision: 3,
  tabId: 7,
  pageUrl: "https://example.com/",
};
const target = { op: "navigate" as const, url: "https://target.example/" };
const phrase = "open target.example";

function started(now = 1_000) {
  const store = createBrowserAuthorizationStore();
  const authorization = store.begin({ target, sourcePageIdentity: identity, readbackSpeakId: "speak-1", phrase, now });
  if (authorization === null) throw new Error("expected authorization to begin");
  return { store, authorization };
}

function completeAndArm(store: ReturnType<typeof createBrowserAuthorizationStore>, now = 1_000): void {
  expect(store.completeSpeech("speak-1", false, now)).toBe(true);
  expect(store.arm(now + BROWSER_AUTHORIZATION_GUARD_MS)).toBe(true);
}

describe("browser authorization", () => {
  it("binds the exact target, source page, and tracked read-back speech ID", () => {
    const { store, authorization } = started();
    expect(authorization).toMatchObject({
      operation: "navigate",
      targetBinding: JSON.stringify(["navigate", target.url]),
      sourceTabId: identity.tabId,
      sourcePageUrl: identity.pageUrl,
      sourcePageIdentity: identity,
      readbackSpeakId: "speak-1",
      issuedAt: 1_000,
      expiresAt: 1_000 + BROWSER_AUTHORIZATION_TTL_MS,
      status: "awaiting-speech",
    });
    expect(store.completeSpeech("stale-speak", false, 1_010)).toBe(false);
    expect(store.pending?.readbackSpeakId).toBe("speak-1");
  });

  it("requires the same completed read-back, exact phrase, and the one-second guard", () => {
    const { store } = started();
    expect(store.completeSpeech("speak-1", false, 1_000)).toBe(true);
    expect(store.arm(1_999)).toBe(false);
    expect(store.pending?.status).toBe("guard");
    expect(store.arm(2_000)).toBe(true);
    const redeemed = store.consume({
      phrase: "  OPEN target.example. ", source: "voice", tabId: 7,
      pageUrl: identity.pageUrl, pageIdentity: identity, now: 2_001,
    });
    expect(redeemed.ok).toBe(true);
    expect(store.pending).toBeNull();
    expect(store.consume({
      phrase, source: "voice", tabId: 7, pageUrl: identity.pageUrl, pageIdentity: identity, now: 2_002,
    })).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    { phrase: "yes", source: "voice" as const, reason: "phrase-mismatch" },
    { phrase, source: "typed" as const, reason: "typed" },
    { phrase: "open another.example", source: "voice" as const, reason: "phrase-mismatch" },
  ])("rejects $source input '$phrase' without leaving a reusable authorization", ({ phrase: input, source, reason }) => {
    const { store } = started();
    completeAndArm(store);
    const result = store.consume({
      phrase: input, source, tabId: 7, pageUrl: identity.pageUrl, pageIdentity: identity, now: 2_001,
    });
    expect(result).toEqual({ ok: false, reason });
    expect(store.pending).toBeNull();
  });

  it.each([
    { tabId: 8, pageUrl: identity.pageUrl, pageIdentity: identity, reason: "tab-changed" },
    { tabId: 7, pageUrl: "https://other.example/", pageIdentity: identity, reason: "page-changed" },
    { tabId: 7, pageUrl: identity.pageUrl, pageIdentity: { ...identity, captureRevision: 4 }, reason: "page-changed" },
  ])("rejects stale source state ($reason)", ({ tabId, pageUrl, pageIdentity, reason }) => {
    const { store } = started();
    completeAndArm(store);
    expect(store.consume({ phrase, source: "voice", tabId, pageUrl, pageIdentity, now: 2_001 })).toEqual({
      ok: false, reason,
    });
  });

  it("expires after 30 seconds, consumes once, and treats duplicate completion as inert", () => {
    const { store } = started();
    expect(store.completeSpeech("speak-1", false, 1_000)).toBe(true);
    expect(store.completeSpeech("speak-1", false, 1_100)).toBe(false);
    expect(store.arm(2_000)).toBe(true);
    expect(store.consume({
      phrase, source: "voice", tabId: 7, pageUrl: identity.pageUrl, pageIdentity: identity,
      now: 1_000 + BROWSER_AUTHORIZATION_TTL_MS,
    })).toEqual({ ok: false, reason: "expired" });
    expect(store.pending).toBeNull();
  });

  it.each(["stop", "cancel", "repeat", "page change", "disconnect"])("clears pending state on %s", () => {
    const { store } = started();
    expect(store.invalidate()?.authorizationId).toBeDefined();
    expect(store.pending).toBeNull();
    expect(store.consume({
      phrase, source: "voice", tabId: 7, pageUrl: identity.pageUrl, pageIdentity: identity, now: 2_001,
    })).toEqual({ ok: false, reason: "missing" });
  });
});

const flowPhrase = "open link Account settings at target.example";

function authFlow() {
  const session = new Session("fake");
  session.extensionConnected = true;
  session.tabId = identity.tabId;
  session.browserCapture = { identity, blocks: [], links: [] };
  session.trackSpeech("speak-1", "confirm-prompt");
  const authorization = session.browserAuthorizations.begin({
    target: { op: "open-link", linkId: "link-risky", identity },
    sourcePageIdentity: identity,
    readbackSpeakId: "speak-1",
    phrase: flowPhrase,
    now: 1_000,
  });
  if (authorization === null) throw new Error("expected authorization to begin");
  let now = 1_000;
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const requests: unknown[] = [];
  const hub = {
    send: () => true,
    pushState: () => true,
    setOutputMode: () => {},
    close: () => {},
    async request(_role: string, type: string, payload: any) {
      requests.push({ type, payload });
      return { payload: { ok: true, requestId: payload.requestId, operation: payload.operation.op, result: { tabId: 7, status: "dispatched" } } };
    },
  } as unknown as Hub;
  const refresher: Refresher = { request: async () => ({ ok: false, kind: "read-failed" }) };
  const browserContext = {
    hub, session, clock: () => now,
    schedule: (callback: () => void, delay: number) => timers.push({ callback, delay }),
  };
  return {
    session,
    requests,
    timers,
    browserContext,
    setNow(value: number) { now = value; },
    async utter(text: string, source: "voice" | "typed" = "voice") {
      const message = {
        v: 1, id: `u-${text}`, type: "utterance", ts: now,
        payload: { utteranceId: `u-${text}`, text, source },
      } as Message;
      await handleUtterance({
        message, hub, session, refresher, freshnessMs: 2_000,
        brain: { parseIntent: async () => ({ type: "unknown" }) },
        clock: () => now,
        schedule: browserContext.schedule,
      });
    },
  };
}

function dispatchedBrowserActions(requests: unknown[]): unknown[] {
  return requests.filter((entry) => {
    const operation = (entry as { payload?: { operation?: { op?: string } } }).payload?.operation;
    return operation !== undefined && ["navigate", "search", "open-link"].includes(operation.op ?? "");
  });
}

describe("browser authorization turn wiring", () => {
  it("uses the tracked speak ID, waits for the guard, and dispatches at most once", async () => {
    const flow = authFlow();
    expect(handleBrowserSpeakDone(flow.browserContext, { speakId: "stale-speak", interrupted: false })).toBe(false);
    expect(handleBrowserSpeakDone(flow.browserContext, { speakId: "speak-1", interrupted: false })).toBe(true);
    expect(flow.timers).toHaveLength(1);
    expect(flow.timers[0]?.delay).toBe(BROWSER_AUTHORIZATION_GUARD_MS);
    // A duplicate completion cannot start another guard timer or authorize anything by itself.
    expect(handleBrowserSpeakDone(flow.browserContext, { speakId: "speak-1", interrupted: false })).toBe(true);
    expect(flow.timers).toHaveLength(1);
    flow.setNow(2_000);
    flow.timers[0]!.callback();
    expect(flow.session.pendingBrowserAuthorization?.status).toBe("armed");
    await flow.utter(flowPhrase);
    expect(flow.requests).toHaveLength(1);
    expect(flow.session.pendingBrowserAuthorization).toBeNull();
  });

  it.each([
    { text: "yes", source: "voice" as const },
    { text: flowPhrase, source: "typed" as const },
    { text: "open other.example", source: "voice" as const },
  ])("refuses $source authorization '$text' before extension dispatch", async ({ text, source }) => {
    const flow = authFlow();
    handleBrowserSpeakDone(flow.browserContext, { speakId: "speak-1", interrupted: false });
    flow.setNow(2_000);
    flow.timers[0]!.callback();
    await flow.utter(text, source);
    expect(flow.requests).toHaveLength(0);
    expect(flow.session.pendingBrowserAuthorization).toBeNull();
  });

  it("invalidates on spoken cancellation, interruption, stale page, and timeout", async () => {
    for (const text of ["cancel", "stop", "repeat"]) {
      const cancelled = authFlow();
      await cancelled.utter(text);
      expect(cancelled.requests).toHaveLength(0);
      expect(cancelled.session.pendingBrowserAuthorization).toBeNull();
    }

    const interrupted = authFlow();
    handleBrowserSpeakDone(interrupted.browserContext, { speakId: "speak-1", interrupted: true });
    expect(interrupted.session.pendingBrowserAuthorization).toBeNull();
    await interrupted.utter(flowPhrase);
    expect(dispatchedBrowserActions(interrupted.requests)).toHaveLength(0);

    const stale = authFlow();
    handleBrowserSpeakDone(stale.browserContext, { speakId: "speak-1", interrupted: false });
    stale.setNow(2_000);
    stale.timers[0]!.callback();
    stale.session.applyBrowserCapture({ identity: { ...identity, captureRevision: 4 }, blocks: [], links: [] });
    await stale.utter(flowPhrase);
    expect(dispatchedBrowserActions(stale.requests)).toHaveLength(0);

    const expired = authFlow();
    handleBrowserSpeakDone(expired.browserContext, { speakId: "speak-1", interrupted: false });
    expired.setNow(2_000);
    expired.timers[0]!.callback();
    expired.setNow(1_000 + BROWSER_AUTHORIZATION_TTL_MS);
    await expired.utter(flowPhrase);
    expect(dispatchedBrowserActions(expired.requests)).toHaveLength(0);
    expect(expired.session.pendingBrowserAuthorization).toBeNull();
  });
});
