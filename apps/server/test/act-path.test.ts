import { describe, expect, it, vi } from "vitest";
import { newId, type Field, type Snapshot } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { executeUngated } from "../src/act/ungated";
import { buildBaselineFormModel } from "../src/baseline";
import { fieldValueReply } from "../src/reply";
import type { Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";
import { startServer } from "../src/server";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, type Frame, type TestClient } from "./helpers";

type ActRig = { server: Awaited<ReturnType<typeof startServer>>; extension: ReturnType<typeof startFakeExtension>; voice: TestClient };

async function rig(fakeRequestActionId?: string): Promise<ActRig> {
  const server = await startServer({
    port: 0,
    dev: true,
    fakeDelayMs: 5,
    ...(fakeRequestActionId !== undefined ? { fakeRequestActionId } : {}),
  });
  const extension = startFakeExtension({ url: server.url });
  await extension.connected;
  const voice = await bindClient(server.port, "voice", { origin: undefined });
  return { server, extension, voice };
}

async function turn(voice: TestClient, text: string): Promise<Frame[]> {
  const frames: Frame[] = [];
  voice.send("utterance", { utteranceId: newId(), text, source: "typed" });
  let sawTranscript = false;
  for (;;) {
    const frame = await voice.nextMessage(4000);
    frames.push(frame);
    if (frame.type === "transcript") sawTranscript = true;
    if (frame.type === "state" && frame.payload.busy === false && sawTranscript) return frames;
  }
}

describe("server ungated act path", () => {
  it("fills a text field, reads the DOM value back, and refreshes after the act", async () => {
    const r = await rig();
    try {
      const frames = await turn(r.voice, "fill Full name with Jane Doe");
      const answer = frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer");
      expect(answer?.payload.text).toBe("Full name is now Jane Doe.");
      expect(frames.find((frame) => frame.type === "transcript")?.payload.routedTo).toBe("grammar");

      const received = r.extension.received();
      const acts = received.filter((message) => message.type === "act.request");
      expect(acts).toHaveLength(1);
      expect(acts[0]!.payload).toMatchObject({
        action: { op: "fill", value: "Jane Doe" },
        expectedKind: "fill",
      });
      expect(received.filter((message) => message.type === "snapshot.request")).toHaveLength(2);
      expect(r.extension.elements().find((element) => element.id === acts[0]!.payload.action.targetId)?.value).toBe("Jane Doe");
      expect(frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("routes model request_action into read-back without directly dispatching", async () => {
    const r = await rig("e10");
    try {
      const frames = await turn(r.voice, "fill Full name with Jane Doe");
      expect(frames.some((frame) => frame.type === "speak" && frame.payload.category === "confirm-prompt")).toBe(true);
      expect(r.extension.received().filter((message) => message.type === "act.request")).toHaveLength(0);
      expect(frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
      expect(r.server.session.pendingGatedAction).toMatchObject({ targetId: "e10", kind: "submit" });
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("selects an option, checks a checkbox, and focuses a field with field-derived kinds", async () => {
    const r = await rig();
    try {
      const snapshot = loadSnapshot("booking");
      const select = buildBaselineFormModel(snapshot).fields.find((field) => field.type === "select")!;
      const option = select.options!.find((candidate) => candidate.value !== "")!;
      let frames = await turn(r.voice, `select ${option.label} for ${select.label}`);
      expect(frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer")?.payload.text)
        .toBe(`${select.label} is now ${option.value}.`);
      let act = r.extension.received().filter((message) => message.type === "act.request").at(-1)!;
      expect(act.payload).toMatchObject({ action: { op: "select", optionValue: option.value }, expectedKind: "select" });

      const checkbox = buildBaselineFormModel(loadSnapshot("booking")).fields.find((field) => field.type === "checkbox")!;
      frames = await turn(r.voice, `check ${checkbox.label}`);
      act = r.extension.received().filter((message) => message.type === "act.request").at(-1)!;
      expect(act.payload).toMatchObject({ action: { op: "check", checked: true }, expectedKind: "check" });
      expect(frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer")?.payload.text)
        .toBe(`${checkbox.label} is now true.`);

      frames = await turn(r.voice, "focus Full name");
      act = r.extension.received().filter((message) => message.type === "act.request").at(-1)!;
      expect(act.payload).toMatchObject({ action: { op: "focus" }, expectedKind: "fill" });
      expect(frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer")?.payload.text).toBe("Focused Full name.");
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("focuses sensitive fields without sending a value", async () => {
    const r = await rig();
    try {
      const frames = await turn(r.voice, "fill Card number with 4111111111111111");
      const act = r.extension.received().filter((message) => message.type === "act.request").at(-1)!;
      expect(act.payload).toMatchObject({ action: { op: "focus" }, expectedKind: "fill" });
      expect(JSON.stringify(act.payload)).not.toContain("4111111111111111");
      expect(frames.find((frame) => frame.type === "speak" && frame.payload.category === "answer")?.payload.text)
        .toBe("That is a private field. You can type it now.");
      expect(frames.find((frame) => frame.type === "transcript")?.payload.heardAs).not.toContain("4111111111111111");
      expect(frames.filter((frame) => frame.type === "speak").map((frame) => frame.payload.text).join(" ")).not.toContain("4111111111111111");
    } finally {
      r.voice.ws.terminate();
      r.extension.close();
      await r.server.close();
    }
  });

  it("uses fixed replies for missing, mismatched, and overlong observed values", () => {
    const model = buildBaselineFormModel(loadSnapshot("booking"));
    const field = model.fields[0]!;
    expect(fieldValueReply(field, null, "Jane Doe")).toBeNull();
    expect(fieldValueReply(field, "Janet Doe", "Jane Doe")).toBeNull();
    expect(fieldValueReply(field, "", "")).toBeNull();
    expect(fieldValueReply(field, "x".repeat(120), "x".repeat(120))).toBe(`${field.label} is now ${"x".repeat(80)}.`);
  });

  it("refreshes a post-write sensitive-field error before returning a value-free reply", async () => {
    const snapshot = loadSnapshot("booking");
    const field = buildBaselineFormModel(snapshot).fields[0]!;
    const session = new Session("fake");
    session.extensionConnected = true;
    session.applySnapshot(snapshot);
    const calls: string[] = [];
    const hub = {
      request: vi.fn(async (_role: string, type: string) => {
        calls.push(type);
        return { payload: { ok: false, error: "sensitive-field", observedValue: "PRIVATE-SENTINEL" } };
      }),
    } as unknown as Hub;
    const refresher = {
      request: vi.fn(async () => {
        calls.push("refresh");
        return { ok: true, applied: true } as const;
      }),
    };
    const reply = await executeUngated({ hub, session, refresher, freshnessMs: 2000 }, {
      type: "set_fields",
      fills: [{ fieldId: field.id, value: "public attempt" }],
    });
    expect(calls).toEqual(["act.request", "refresh"]);
    expect(reply.text).toBe("That is a private field. You can type it now.");
    expect(reply.text).not.toContain("PRIVATE-SENTINEL");
  });

  it("retries one stale snapshot after refresh, and only allowed ops reach the hub", async () => {
    const snapshot = loadSnapshot("booking");
    const field = buildBaselineFormModel(snapshot).fields[0]!;
    const session = new Session("fake");
    session.extensionConnected = true;
    session.applySnapshot(snapshot);
    const requests: Array<{ type: string; payload: any }> = [];
    let requestCount = 0;
    const hub = {
      request: vi.fn(async (_role: string, type: string, payload: any) => {
        requests.push({ type, payload });
        requestCount++;
        return requestCount === 1
          ? { payload: { ok: false, error: "stale-snapshot" } }
          : { payload: { ok: true, observedValue: "Jane Doe" } };
      }),
    } as unknown as Hub;
    let refreshedVersion = snapshot.version;
    const refresher = {
      request: vi.fn(async () => {
        refreshedVersion++;
        const next = { ...snapshot, version: refreshedVersion, capturedAt: snapshot.capturedAt + refreshedVersion } as Snapshot;
        session.applySnapshot(next);
        return { ok: true, applied: true } as const;
      }),
    };
    const reply = await executeUngated({ hub, session, refresher, freshnessMs: 2000 }, {
      type: "set_fields",
      fills: [{ fieldId: field.id, value: "Jane Doe" }],
    });
    expect(reply.text).toBe(`${field.label} is now Jane Doe.`);
    expect(requestCount).toBe(2);
    expect(requests.filter((request) => request.type === "act.request").map((request) => request.payload.snapshotVersion))
      .toEqual([snapshot.version, snapshot.version + 1]);
    const requestAction = vi.fn();
    const blockedHub = { request: requestAction } as unknown as Hub;
    const refused = await executeUngated({ hub: blockedHub, session, refresher, freshnessMs: 2000 }, { type: "click_safe", actionId: "safe" });
    expect(refused.category).toBe("error");
    expect(requestAction).not.toHaveBeenCalled();
  });
});
