import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, Snapshot } from "@blip/protocol";
import type { Hub } from "../hub/hub";
import { Session } from "../session/session";
import type { Refresher } from "../session/refresh";

const gateMock = vi.hoisted(() => ({ arm: vi.fn(), order: [] as string[] }));
vi.mock("../act/voice-gate-adapter", () => ({
  createVoiceGateAdapter: () => ({ arm: gateMock.arm }),
}));

import { handleUtterance } from "../turn";

const query = "Exact Query & punctuation!";

function makeSnapshot(version: number, value: string | null): Snapshot {
  return {
    snapshotId: `snapshot-${version}`,
    version,
    tabId: 3,
    url: "https://search.example/",
    origin: "https://search.example",
    title: "Search",
    headings: [],
    alerts: [],
    elements: [
      {
        id: "search-field",
        frameId: 0,
        category: "field",
        tag: "input",
        inputType: "search",
        role: "searchbox",
        labelCandidates: [{ text: "Search", source: "aria", confidence: 1 }],
        required: false,
        requiredSource: "none",
        invalid: false,
        errorText: null,
        value,
        hasValue: value !== null,
        sensitive: "none",
        disabled: false,
        visible: true,
        order: 0,
      },
      {
        id: "submit-search",
        frameId: 0,
        category: "action",
        tag: "button",
        inputType: "submit",
        role: "button",
        labelCandidates: [{ text: "Search", source: "aria", confidence: 1 }],
        required: false,
        requiredSource: "none",
        invalid: false,
        errorText: null,
        value: null,
        hasValue: false,
        sensitive: "none",
        disabled: false,
        visible: true,
        order: 1,
        text: "Search",
        buttonType: "submit",
        inForm: true,
        kind: "submit",
        kindReasons: ["button type=submit inside form"],
      },
    ],
    truncated: false,
    structuralHash: "search-form",
    capturedAt: version,
  };
}

function setup(options: { observedValue?: string; searchTimeout?: boolean; resultsNeverLoad?: boolean } = {}) {
  gateMock.arm.mockReset().mockImplementation(async ({ actionId }: { actionId: string }) => {
    gateMock.order.push(`arm:${actionId}`);
  });
  gateMock.order.length = 0;
  const session = new Session("fake");
  session.extensionConnected = true;
  session.tabId = 3;
  let snapshotVersion = 0;
  let currentValue: string | null = null;
  const refresher: Refresher = {
    async request(reason) {
      gateMock.order.push(`snapshot:${reason}`);
      const snapshot = makeSnapshot(++snapshotVersion, currentValue);
      session.applySnapshot(snapshot);
      return { ok: true, applied: true, snapshot };
    },
  };
  const calls: Array<{ type: string; payload: unknown }> = [];
  let searched = false;
  const hub = {
    send: () => true,
    pushState: () => true,
    setOutputMode: () => {},
    close: () => {},
    async request(_role: string, type: string, payload: any) {
      calls.push({ type, payload });
      gateMock.order.push(`request:${type}`);
      if (type === "browser.request") {
        const operation = payload.operation;
        const identity = { captureId: "site-search-capture", captureRevision: 1, tabId: 3, pageUrl: "https://search.example/" };
        if (operation.op === "capture") return { payload: {
          ok: true, requestId: payload.requestId, operation: "capture",
          result: { ...identity, status: "supported", blocks: searched ? [{ contentId: "results", kind: "paragraph", text: "The search results.", identity, frameId: 0 }] : [], items: [], truncated: false },
        } };
        if (operation.op === "site-search" && options.searchTimeout) throw new Error("request timeout: browser.request got no reply within 8000 ms");
        if (operation.op === "site-search") searched = !options.resultsNeverLoad;
        if (operation.op === "site-search") return { payload: options.observedValue === "different query"
          ? { ok: false, requestId: payload.requestId, operation: "site-search", error: { code: "ambiguous", message: "More than one visible search field matches." } }
          : { ok: true, requestId: payload.requestId, operation: "site-search", result: { ...identity, status: "submitted" } } };
        throw new Error(`unexpected browser operation ${operation.op}`);
      }
      if (type !== "act.request") throw new Error(`unexpected request ${type}`);
      return {
        type: "act.result",
        payload: {
          actId: payload.actId,
          ok: true,
          observedValue: options.observedValue ?? payload.action.value,
        },
      };
    },
  } as unknown as Hub;
  const message = {
    v: 1,
    id: "utterance-1",
    type: "utterance",
    ts: 1,
    payload: { utteranceId: "utterance-1", text: `site-search ${query}`, source: "typed" },
  } as Message;
  return { session, refresher, hub, message, calls };
}

describe("typed site search", () => {
  beforeEach(() => {
    gateMock.arm.mockClear();
    gateMock.order.length = 0;
  });

  it("explains how to recover when the running extension does not answer page search", async () => {
    const ctx = setup({ searchTimeout: true });
    await handleUtterance({ ...ctx, freshnessMs: 2_000, brain: { parseIntent: async () => ({ type: "unknown" }) } });
    expect(ctx.session.lastSpoken).toContain("reload its extension at edge://extensions");
    expect(ctx.session.pendingGatedAction).toBeNull();
    expect(ctx.calls.filter(call => call.type === "browser.request")).toHaveLength(2);
  });

  it("submits an exact page search without entering the generic action-review gate", async () => {
    const ctx = setup();
    await handleUtterance({
      ...ctx,
      freshnessMs: 2_000,
      brain: { parseIntent: async () => ({ type: "unknown" }) },
    });

    const operations = ctx.calls.filter((call) => call.type === "browser.request").map((call) => (call.payload as any).operation);
    expect(operations).toMatchObject([{ op: "capture" }, { op: "site-search", query }, { op: "capture" }]);
    expect(gateMock.arm).not.toHaveBeenCalled();
    expect(ctx.calls.some((call) => call.type === "act.request")).toBe(false);
    expect(ctx.session.pendingGatedAction).toBeNull();
  });

  it("does not announce success or submit twice when a search only fills the field", async () => {
    vi.useFakeTimers();
    try {
      const ctx = setup({ resultsNeverLoad: true });
      const completion = handleUtterance({ ...ctx, freshnessMs: 2_000, brain: { parseIntent: async () => ({ type: "unknown" }) } });
      await vi.runAllTimersAsync();
      await completion;
      expect(ctx.session.lastSpoken).toContain("couldn't verify that results loaded");
      expect(ctx.calls.filter(call => call.type === "browser.request" && (call.payload as any).operation.op === "site-search")).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("refuses an ambiguous visible page search without entering a confirmation flow", async () => {
    const ctx = setup({ observedValue: "different query" });
    await handleUtterance({
      ...ctx,
      freshnessMs: 2_000,
      brain: { parseIntent: async () => ({ type: "unknown" }) },
    });
    expect(gateMock.arm).not.toHaveBeenCalled();
    expect(ctx.calls.filter((call) => call.type === "browser.request")).toHaveLength(2);
    expect(ctx.session.pendingGatedAction).toBeNull();
  });
});
