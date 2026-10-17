import { buildFrame, type ActRequest, type Message, type Snapshot as SnapshotData, type RawElement } from "@blip/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchActRequest, type ActDispatchDependencies, type ActFrameAdapter } from "../src/background/acts.js";

const CARD_NUMBER = "4111111111111111";
const SUBMIT_GUARD_SENTINEL = "blip-submit-method-guard-v1";
let executeScript: ReturnType<typeof vi.fn>;

function field(id: string, frameId: number, overrides: Partial<RawElement> = {}): RawElement {
  return {
    id,
    frameId,
    category: "field",
    tag: "input",
    inputType: "text",
    role: "textbox",
    labelCandidates: [{ text: "Name", source: "label", confidence: 1 }],
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
    kind: "fill",
    ...overrides,
  };
}

function snapshot(version: number, elements: RawElement[] = [field("f7e1", 7)]): SnapshotData {
  return {
    snapshotId: `snapshot-${version}`,
    version,
    tabId: 41,
    url: "https://forms.example/contact",
    origin: "https://forms.example",
    title: "Contact form",
    headings: [],
    alerts: [],
    elements,
    truncated: false,
    structuralHash: `hash-${version}`,
    capturedAt: version,
  };
}

function request(snapshotVersion = 1, overrides: Partial<ActRequest> = {}) {
  return buildFrame("act.request", {
    actId: "act-1",
    tabId: 41,
    snapshotVersion,
    action: { op: "fill", targetId: "f7e1", value: "Ada" },
    expectedKind: "fill",
    ...overrides,
  }, { id: "request-1" });
}

function setup(captures: SnapshotData[], actResponse: unknown) {
  const sendAct = vi.fn(async (_frameId: number, _request: ActRequest, _snapshotVersion: number): Promise<unknown> => actResponse);
  const adapter: ActFrameAdapter = {
    listFrames: vi.fn(async () => []),
    readFrame: vi.fn(async () => undefined),
    isFrameVisible: vi.fn(async () => true),
    sendAct,
  };
  const capture = vi.fn(async () => {
    const next = captures.shift();
    if (!next) throw new Error("unexpected capture");
    return next;
  });
  const dependencies: ActDispatchDependencies = {
    findTargetTab: vi.fn(async () => ({ id: 41, url: "https://forms.example/contact" })),
    createFrameAdapter: vi.fn(() => adapter),
    captureTabSnapshot: capture as ActDispatchDependencies["captureTabSnapshot"],
  };
  const sent: string[] = [];
  const socket = { readyState: 1, send: vi.fn((line: string) => sent.push(line)) };
  return { adapter, capture, dependencies, sendAct, sent, socket };
}

async function dispatchAndRead(sent: string[], socket: { readyState: number; send: (line: string) => void }, deps: ActDispatchDependencies, message = request()) {
  await dispatchActRequest(message as Extract<Message, { type: "act.request" }>, socket as never, deps);
  return JSON.parse(sent.at(-1) ?? "{}") as { type: string; replyTo?: string; payload: Record<string, unknown> };
}

describe("service-worker act routing", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    executeScript = vi.fn(async () => [{ result: SUBMIT_GUARD_SENTINEL }]);
    vi.stubGlobal("chrome", { scripting: { executeScript } });
  });

  it("routes frame-qualified ids to their owning frame and returns the refreshed version", async () => {
    const setupState = setup(
      [snapshot(1), snapshot(2)],
      { t: "act.result", result: { actId: "act-1", ok: true, observedValue: "Ada" } },
    );

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies);

    expect(setupState.sendAct).toHaveBeenCalledWith(7, expect.objectContaining({
      action: expect.objectContaining({ targetId: "f7e1" }),
    }), 1);
    expect(setupState.capture).toHaveBeenCalledTimes(2);
    expect(reply).toMatchObject({ type: "act.result", replyTo: "request-1", payload: {
      actId: "act-1", ok: true, observedValue: "Ada", newSnapshotVersion: 2,
    } });
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 41, frameIds: [7] },
      world: "MAIN",
      func: expect.any(Function),
    }));
  });

  it.each([
    ["missing gate", {}],
    ["empty grant id", { gate: { grantId: "", kind: "submit" as const } }],
    ["mismatched grant kind", { gate: { grantId: "grant-1", kind: "pay" as const } }],
  ])("refuses a gated click with %s before dispatch", async (_name, gate) => {
    const submitButton = field("f7e1", 7, {
      category: "button", tag: "button", inputType: null, role: "button", kind: "submit",
    });
    const setupState = setup([snapshot(1, [submitButton])], { t: "act.result", result: { actId: "act-1", ok: true } });
    const message = request(1, {
      action: { op: "click", targetId: "f7e1" },
      expectedKind: "submit",
      ...gate,
    });

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies, message);

    expect(setupState.sendAct).not.toHaveBeenCalled();
    expect(setupState.capture).toHaveBeenCalledTimes(1);
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: false, error: "gate-required" });
  });

  it("refuses a gate attached to an ungated click", async () => {
    const setupState = setup([snapshot(1)], { t: "act.result", result: { actId: "act-1", ok: true } });
    const message = request(1, {
      action: { op: "click", targetId: "f7e1" },
      gate: { grantId: "grant-1", kind: "fill" },
    });

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies, message);

    expect(setupState.sendAct).not.toHaveBeenCalled();
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: false, error: "gate-required" });
  });

  it.each([
    ["missing result", async () => []],
    ["ambiguous results", async () => [
      { result: SUBMIT_GUARD_SENTINEL }, { result: SUBMIT_GUARD_SENTINEL },
    ]],
    ["wrong sentinel", async () => [{ result: "unverified" }]],
    ["thrown verification", async () => { throw new Error("verification failed"); }],
  ])("refuses an act when the target-frame method guard has %s", async (_name, result) => {
    executeScript.mockImplementationOnce(result);
    const setupState = setup([snapshot(1)], { t: "act.result", result: { actId: "act-1", ok: true } });

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies);

    expect(setupState.sendAct).not.toHaveBeenCalled();
    expect(setupState.capture).toHaveBeenCalledTimes(1);
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: false, error: "exception" });
  });

  it("routes a gated click only after its frame guard is verified", async () => {
    const submitButton = field("f7e1", 7, {
      category: "button", tag: "button", inputType: null, role: "button", kind: "submit",
    });
    const setupState = setup(
      [snapshot(1, [submitButton]), snapshot(2, [submitButton])],
      { t: "act.result", result: { actId: "act-1", ok: true } },
    );
    const message = request(1, {
      action: { op: "click", targetId: "f7e1" },
      expectedKind: "submit",
      gate: { grantId: "grant-1", kind: "submit" },
    });

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies, message);

    expect(setupState.sendAct).toHaveBeenCalledWith(7, expect.objectContaining({
      expectedKind: "submit", gate: { grantId: "grant-1", kind: "submit" },
    }), 1);
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: true, newSnapshotVersion: 2 });
  });

  it("rejects a stale version before acting and reports the freshly captured version", async () => {
    const setupState = setup([snapshot(2)], { t: "act.result", result: { actId: "act-1", ok: true } });

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies);

    expect(setupState.sendAct).not.toHaveBeenCalled();
    expect(setupState.capture).toHaveBeenCalledTimes(1);
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: false, error: "stale-snapshot", newSnapshotVersion: 2 });
  });

  it("refreshes after a frame reports stale and returns the latest version", async () => {
    const setupState = setup(
      [snapshot(1), snapshot(3)],
      { t: "act.result", result: { actId: "act-1", ok: false, error: "stale-snapshot" } },
    );

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies);

    expect(setupState.sendAct).toHaveBeenCalledTimes(1);
    expect(setupState.capture).toHaveBeenCalledTimes(2);
    expect(reply.payload).toMatchObject({ actId: "act-1", ok: false, error: "stale-snapshot", newSnapshotVersion: 3 });
  });

  it("redacts a post-write card-shaped result and refreshes to a sanitized snapshot", async () => {
    const sanitizedCard = field("f7e1", 7, { value: null, hasValue: true, sensitive: "card-number" });
    const setupState = setup(
      [snapshot(1), snapshot(2, [sanitizedCard])],
      { t: "act.result", result: { actId: "act-1", ok: true, observedValue: CARD_NUMBER } },
    );

    const reply = await dispatchAndRead(setupState.sent, setupState.socket, setupState.dependencies);
    const serialized = JSON.stringify(reply);

    expect(setupState.capture).toHaveBeenCalledTimes(2);
    expect(reply.payload).toEqual({
      actId: "act-1", ok: false, error: "sensitive-field", observedValue: null, newSnapshotVersion: 2,
    });
    expect(serialized).not.toContain(CARD_NUMBER);
  });

  it("does not send an unclassified card-shaped value from a freshly merged snapshot", async () => {
    const unsafe = field("e1", 0, { value: CARD_NUMBER, hasValue: true });
    const captureState = setup([snapshot(1), snapshot(2)], {
      t: "act.result", result: { actId: "act-1", ok: false, error: "sensitive-field", observedValue: null },
    });
    const { mergeFrameSnapshots } = await import("../src/background/frames.js");

    const merged = mergeFrameSnapshots({
      tabId: 41,
      tabUrl: "https://forms.example/contact",
      snapshotId: "privacy-check",
      capturedAt: 3,
      frames: [{
        frameId: 0,
        visible: true,
        snapshot: {
          title: "Contact form", url: "https://forms.example/contact", origin: "https://forms.example",
          headings: [], alerts: [], elements: [unsafe], truncated: false, structuralHash: "unsafe", capturedAt: 3,
        },
      }],
    });

    expect(merged.elements[0]).toMatchObject({ value: null, hasValue: true, sensitive: "card-number" });
    expect(JSON.stringify(merged)).not.toContain(CARD_NUMBER);
    const reply = await dispatchAndRead(captureState.sent, captureState.socket, captureState.dependencies);
    expect(reply.payload.error).toBe("sensitive-field");
  });
});
