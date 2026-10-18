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

function setup(options: { observedValue?: string } = {}) {
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
  const hub = {
    send: () => true,
    pushState: () => true,
    setOutputMode: () => {},
    close: () => {},
    async request(_role: string, type: string, payload: any) {
      calls.push({ type, payload });
      gateMock.order.push(`request:${type}`);
      if (type !== "act.request") throw new Error(`unexpected request ${type}`);
      if (payload.action.op === "fill") currentValue = payload.action.value;
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

  it("fills an input[type=search], verifies the exact current value, then arms the unique submit gate", async () => {
    const ctx = setup();
    await handleUtterance({
      ...ctx,
      freshnessMs: 2_000,
      brain: { parseIntent: async () => ({ type: "unknown" }) },
    });

    const act = ctx.calls.find((call) => call.type === "act.request")?.payload as { action: { value?: string } } | undefined;
    expect(act?.action.value).toBe(query);
    expect(gateMock.arm).toHaveBeenCalledTimes(1);
    expect(gateMock.arm).toHaveBeenCalledWith({ actionId: "submit-search" });
    expect(gateMock.order.indexOf("request:act.request")).toBeLessThan(gateMock.order.indexOf("snapshot:refresh"));
    expect(gateMock.order.indexOf("snapshot:refresh")).toBeLessThan(gateMock.order.indexOf("arm:submit-search"));
    expect(ctx.calls.some((call) => call.type === "browser.request")).toBe(false);
  });

  it("does not arm submit when the extension read-back differs from the exact query", async () => {
    const ctx = setup({ observedValue: "different query" });
    await handleUtterance({
      ...ctx,
      freshnessMs: 2_000,
      brain: { parseIntent: async () => ({ type: "unknown" }) },
    });
    expect(gateMock.arm).not.toHaveBeenCalled();
    expect(ctx.calls.some((call) => call.type === "browser.request")).toBe(false);
  });
});
