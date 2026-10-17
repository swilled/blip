// The fake extension over a real hub on port 0. Acts are sent with hub.request, exactly as the
// Executor will in Phase 3. The stand-in must fail closed: it never executes a gated click (T-01-27).
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ActOp, type ActResult, type ActionKind } from "@blip/protocol";
import { startServer, type RunningServer } from "../../../apps/server/src/server";
import { startFakeExtension, type FakeExtension } from "../src/fake-extension";

let server: RunningServer | undefined;
let ext: FakeExtension | undefined;

afterEach(async () => {
  ext?.close();
  ext = undefined;
  await server?.close();
  server = undefined;
});

async function setup(options: { fixture?: "booking" | "broken"; pingMs?: number; disabledIds?: string[] } = {}) {
  server = await startServer({ port: 0, dev: true });
  ext = startFakeExtension({ url: server.url, ...options });
  await ext.connected;
  return { server, ext };
}

async function act(
  action: ActOp,
  expectedKind: ActionKind,
  over: { snapshotVersion?: number; gate?: { grantId: string; kind: ActionKind } } = {},
): Promise<ActResult> {
  const reply = await server!.hub.request(
    "extension",
    "act.request",
    {
      actId: newId(),
      tabId: 1,
      snapshotVersion: over.snapshotVersion ?? ext!.version(),
      action,
      expectedKind,
      ...(over.gate ? { gate: over.gate } : {}),
    },
    { expect: "act.result", timeoutMs: 2000 },
  );
  return reply.payload;
}

async function snapshot() {
  const reply = await server!.hub.request("extension", "snapshot.request", { reason: "refresh" }, { expect: "snapshot.result", timeoutMs: 2000 });
  if (!reply.payload.ok) throw new Error("snapshot failed");
  return reply.payload.snapshot;
}

describe("snapshots", () => {
  it("serves the fixture, and a later snapshot reflects filled values", async () => {
    await setup();
    expect(ext!.fixtureName()).toBe("booking");
    const before = await snapshot();
    expect(before.elements).toHaveLength(12);
    const r = await act({ op: "fill", targetId: "e1", value: "Ada Lovelace" }, "fill");
    expect(r.ok).toBe(true);
    const after = await snapshot();
    const e1 = after.elements.find((e) => e.id === "e1")!;
    expect(e1).toMatchObject({ value: "Ada Lovelace", hasValue: true });
  });

  it("setFixture swaps the fixture, bumps the version, resets values and emits page.changed", async () => {
    await setup();
    await act({ op: "fill", targetId: "e1", value: "Ada" }, "fill");
    const v1 = ext!.version();
    ext!.setFixture("broken");
    expect(ext!.fixtureName()).toBe("broken");
    expect(ext!.version()).toBeGreaterThan(v1);
    const snap = await snapshot();
    expect(snap.elements).toHaveLength(8);
    expect(snap.elements.find((e) => e.id === "e1")!.value).not.toBe("Ada");
    await new Promise((r) => setTimeout(r, 50));
    const changed = ext!.sent().filter((m) => m.type === "page.changed");
    expect(changed.at(-1)).toMatchObject({ payload: { reason: "navigation" } });
  });

  it("elements() returns a copy", async () => {
    await setup();
    const copy = ext!.elements();
    copy[0]!.value = "tampered";
    expect(ext!.elements()[0]!.value).not.toBe("tampered");
  });
});

describe("fill, select and check apply to the in-memory copy and read back", () => {
  it("fill", async () => {
    await setup();
    const r = await act({ op: "fill", targetId: "e2", value: "ada@example.com" }, "fill");
    expect(r).toMatchObject({ ok: true, observedValue: "ada@example.com" });
    expect(ext!.elements().find((e) => e.id === "e2")).toMatchObject({ value: "ada@example.com", hasValue: true });
  });

  it("select", async () => {
    await setup();
    const r = await act({ op: "select", targetId: "e5", optionValue: "deluxe" }, "select");
    expect(r).toMatchObject({ ok: true, observedValue: "deluxe" });
    const e5 = ext!.elements().find((e) => e.id === "e5")!;
    expect(e5.options!.find((o) => o.selected)!.value).toBe("deluxe");
    expect(e5.hasValue).toBe(true);
  });

  it("select on a radio group", async () => {
    await setup();
    const r = await act({ op: "select", targetId: "e6", optionValue: "twin" }, "select");
    expect(r).toMatchObject({ ok: true, observedValue: "twin" });
  });

  it("check", async () => {
    await setup();
    const r = await act({ op: "check", targetId: "e7", checked: true }, "check");
    expect(r).toMatchObject({ ok: true, observedValue: "true" });
    expect(ext!.elements().find((e) => e.id === "e7")!.checked).toBe(true);
  });

  it("select with an unknown option fails without mutating", async () => {
    await setup();
    const r = await act({ op: "select", targetId: "e5", optionValue: "penthouse" }, "select");
    expect(r.ok).toBe(false);
    expect(ext!.elements().find((e) => e.id === "e5")!.hasValue).toBe(false);
  });
});

describe("refusals, in order", () => {
  it("a fill on the sensitive card field returns sensitive-field and observedValue null", async () => {
    await setup();
    const r = await act({ op: "fill", targetId: "e9", value: "4111111111111111" }, "fill");
    expect(r).toMatchObject({ ok: false, error: "sensitive-field", observedValue: null });
    const e9 = ext!.elements().find((e) => e.id === "e9")!;
    expect(e9.value).toBeNull();
    expect(e9.hasValue).toBe(false);
    expect(JSON.stringify(r)).not.toContain("4111");
  });

  it("focus on the sensitive field is allowed (the user types) and reads back null", async () => {
    await setup();
    const r = await act({ op: "focus", targetId: "e9" }, "fill");
    expect(r.ok).toBe(true);
    expect(r.observedValue ?? null).toBeNull();
  });

  it("unknown target gives target-not-found", async () => {
    await setup();
    expect(await act({ op: "fill", targetId: "e999", value: "x" }, "fill")).toMatchObject({ ok: false, error: "target-not-found" });
  });

  it("a disabled target gives disabled", async () => {
    await setup({ disabledIds: ["e3"] });
    expect(await act({ op: "fill", targetId: "e3", value: "x" }, "fill")).toMatchObject({ ok: false, error: "disabled" });
  });

  it("a different snapshotVersion gives stale-snapshot", async () => {
    await setup();
    const r = await act({ op: "fill", targetId: "e1", value: "x" }, "fill", { snapshotVersion: ext!.version() + 5 });
    expect(r).toMatchObject({ ok: false, error: "stale-snapshot" });
    expect(ext!.elements().find((e) => e.id === "e1")!.hasValue).toBe(false);
  });

  it("a different expectedKind gives kind-mismatch with liveKind", async () => {
    await setup();
    const r = await act({ op: "fill", targetId: "e1", value: "x" }, "submit");
    expect(r).toMatchObject({ ok: false, error: "kind-mismatch", liveKind: "fill" });
    expect(ext!.elements().find((e) => e.id === "e1")!.hasValue).toBe(false);
  });
});

describe("clicks fail closed (T-01-27)", () => {
  it.each([
    ["e10", "submit"],
    ["e12", "navigate-cross-domain"],
  ] as const)("%s (%s) returns gate-required with liveKind and mutates nothing", async (id, kind) => {
    await setup();
    const before = JSON.stringify(ext!.elements());
    const r = await act({ op: "click", targetId: id }, kind);
    expect(r).toMatchObject({ ok: false, error: "gate-required", liveKind: kind });
    expect(JSON.stringify(ext!.elements())).toBe(before);
  });

  it("a gate object in the request does not open the gate (no grant logic exists)", async () => {
    await setup();
    const r = await act({ op: "click", targetId: "e10" }, "submit", { gate: { grantId: "g1", kind: "submit" } });
    expect(r).toMatchObject({ ok: false, error: "gate-required", liveKind: "submit" });
  });

  it("an action with no kind returns gate-required", async () => {
    await setup({ fixture: "broken" });
    const r = await act({ op: "click", targetId: "e7" }, "click-safe");
    expect(r).toMatchObject({ ok: false, error: "gate-required" });
    expect(r.liveKind).toBeUndefined();
  });

  it("claiming click-safe for a submit button is a kind-mismatch, not a click", async () => {
    await setup();
    const r = await act({ op: "click", targetId: "e10" }, "click-safe");
    expect(r).toMatchObject({ ok: false, error: "kind-mismatch", liveKind: "submit" });
  });

  it("a click-safe action succeeds", async () => {
    await setup();
    expect(await act({ op: "click", targetId: "e11" }, "click-safe")).toMatchObject({ ok: true });
  });
});

describe("keepalive and ids", () => {
  it("pings every pingMs and the server answers pong", async () => {
    await setup({ pingMs: 30 });
    await new Promise((r) => setTimeout(r, 200));
    expect(ext!.sent().filter((m) => m.type === "ping").length).toBeGreaterThanOrEqual(2);
    expect(ext!.received().filter((m) => m.type === "pong").length).toBeGreaterThanOrEqual(2);
  });
});
