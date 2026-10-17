import { describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { HubRequestError, type Hub } from "../src/hub/hub";
import { startServer } from "../src/server";
import { createRefresher } from "../src/session/refresh";
import { Session } from "../src/session/session";
import { startFakeExtension } from "../../../tools/fake-extension/src/fake-extension";
import { bindClient, type Frame, type TestClient } from "./helpers";

async function nextState(voice: TestClient, timeoutMs = 2000): Promise<Frame> {
  for (;;) {
    const frame = await voice.nextMessage(timeoutMs);
    if (frame.type === "state") return frame;
  }
}

async function utterance(voice: TestClient, text: string): Promise<Frame[]> {
  const frames: Frame[] = [];
  voice.send("utterance", { utteranceId: newId(), text, source: "typed" });
  let sawTranscript = false;
  for (;;) {
    const frame = await voice.nextMessage(2000);
    frames.push(frame);
    if (frame.type === "transcript") sawTranscript = true;
    if (frame.type === "state" && frame.payload.busy === false && sawTranscript) return frames;
  }
}

function snapshot(fixture: "booking" | "broken", tabId: number, version: number, capturedAt: number) {
  return { ...loadSnapshot(fixture), tabId, version, capturedAt, snapshotId: `${fixture}-${tabId}-${version}-${capturedAt}` };
}

function snapshotReply(value: ReturnType<typeof snapshot>) {
  return { type: "snapshot.result", payload: { ok: true, snapshot: value } };
}

function deferredHub() {
  const pending: Array<(value: unknown) => void> = [];
  let active = 0;
  let maxActive = 0;
  const hub = {
    request: vi.fn(() => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve) => {
        pending.push((value) => {
          active -= 1;
          resolve(value);
        });
      });
    }),
    pushState: vi.fn(),
  } as unknown as Hub;
  return { hub, pending, maxActive: () => maxActive };
}

describe("background page refresh", () => {
  it("returns the exact snapshot only after the session accepts it", async () => {
    const session = new Session("fake");
    session.extensionConnected = true;
    const accepted = snapshot("booking", 1, 1, 10);
    const hub = {
      request: vi.fn(async () => ({ payload: { ok: true, snapshot: accepted } })),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = createRefresher({ hub, session, timeoutMs: 500 });

    const result = await refresher.request("post-act");

    expect(result).toEqual({ ok: true, applied: true, snapshot: accepted });
    if (result.ok) expect(result.snapshot).toBe(accepted);
  });

  it("does not return the snapshot when the session rejects it as stale", async () => {
    const session = new Session("fake");
    session.extensionConnected = true;
    session.applySnapshot(snapshot("booking", 1, 5, 500));
    const hub = {
      request: vi.fn(async () => ({ payload: { ok: true, snapshot: snapshot("broken", 1, 4, 900) } })),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = createRefresher({ hub, session, timeoutMs: 500 });

    const result = await refresher.request("post-act");

    expect(result).toEqual({ ok: false, kind: "stale-snapshot" });
    expect("snapshot" in result).toBe(false);
  });

  it("refreshes after page.changed and pushes state without an utterance", async () => {
    const server = await startServer({ port: 0, dev: true, snapshotTimeoutMs: 500 });
    const extension = startFakeExtension({ url: server.url });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      await extension.connected;
      extension.setFixture("broken");

      const state = await nextState(voice);
      expect(state.payload.page).toMatchObject({ title: "Customer survey" });
      expect(extension.received().filter((message) => message.type === "snapshot.request")).toHaveLength(1);
      expect(extension.sent().some((message) => message.type === "page.changed")).toBe(true);
      expect(voice.frames.some((frame) => frame.type === "transcript" || frame.type === "speak")).toBe(false);
      expect(server.session.stale).toBe(false);
      expect(server.session.tabId).toBe(1);
      expect(server.session.modelAt).not.toBeNull();
    } finally {
      voice.ws.terminate();
      extension.close();
      await server.close();
    }
  });

  it("coalesces a burst into one trailing request using the latest reason", async () => {
    const session = new Session("fake");
    session.extensionConnected = true;
    const deferred = deferredHub();
    const refresher = createRefresher({ hub: deferred.hub, session, timeoutMs: 500 });

    const first = refresher.request("page-load");
    const trailing = [
      refresher.request("refresh"),
      refresher.request("post-act"),
      refresher.request("refresh"),
      refresher.request("user"),
      refresher.request("refresh"),
    ];
    expect(deferred.hub.request).toHaveBeenCalledTimes(1);
    expect(trailing[0]).toBe(trailing[4]);

    deferred.pending[0]!(snapshotReply(snapshot("booking", 1, 1, 10)));
    await first;
    await vi.waitFor(() => expect(deferred.hub.request).toHaveBeenCalledTimes(2));
    expect(deferred.hub.request).toHaveBeenLastCalledWith(
      "extension",
      "snapshot.request",
      { reason: "refresh" },
      { expect: "snapshot.result", timeoutMs: 500 },
    );
    let trailingSettled = false;
    void Promise.all(trailing).then(() => (trailingSettled = true));
    await Promise.resolve();
    expect(trailingSettled).toBe(false);

    deferred.pending[1]!(snapshotReply(snapshot("broken", 1, 2, 20)));
    await Promise.all(trailing);
    expect(deferred.maxActive()).toBe(1);
    expect(session.model?.title).toBe("Customer survey");
  });

  it("ignores older same-tab snapshots and allows ordering to restart on tab or extension changes", () => {
    const session = new Session("fake");
    expect(session.applySnapshot(snapshot("booking", 1, 5, 500))).toBe(true);
    expect(session.applySnapshot(snapshot("broken", 1, 4, 900))).toBe(false);
    expect(session.model?.title).toBe("Hotel booking");
    expect(session.applySnapshot(snapshot("broken", 1, 5, 499))).toBe(false);
    expect(session.applySnapshot(snapshot("broken", 2, 1, 1))).toBe(true);
    expect(session.model?.title).toBe("Customer survey");

    session.extensionConnected = true;
    expect(session.applySnapshot(snapshot("booking", 2, 1, 2))).toBe(true);
    expect(session.model?.title).toBe("Hotel booking");
  });

  it("background applies preserve busy dialogue and only promote no-page to ready", () => {
    const session = new Session("fake");
    session.busy = true;
    session.dialogue = "describing";
    session.applySnapshot(snapshot("booking", 1, 1, 1), { updateDialogue: false });
    expect(session.busy).toBe(true);
    expect(session.dialogue).toBe("describing");

    const empty = new Session("fake");
    empty.applySnapshot(snapshot("booking", 1, 1, 1), { updateDialogue: false });
    expect(empty.dialogue).toBe("ready");
  });

  it("read_form and required refresh after freshness expires while describe reuses its cache", async () => {
    const server = await startServer({ port: 0, dev: true, freshnessMs: 30, snapshotTimeoutMs: 500 });
    const extension = startFakeExtension({ url: server.url });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    const count = () => extension.received().filter((message) => message.type === "snapshot.request").length;
    try {
      await extension.connected;
      await utterance(voice, "describe");
      expect(count()).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await utterance(voice, "describe");
      expect(count()).toBe(1);
      await utterance(voice, "read the form");
      expect(count()).toBe(2);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await utterance(voice, "which fields are required");
      expect(count()).toBe(3);
    } finally {
      voice.ws.terminate();
      extension.close();
      await server.close();
    }
  });

  it("maps disconnection and failed snapshots to safe stale results without speaking", async () => {
    const session = new Session("fake");
    session.extensionConnected = true;
    const hub = {
      request: vi.fn().mockRejectedValue(new HubRequestError("disconnected", "disconnected")),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = createRefresher({ hub, session, timeoutMs: 10 });

    await expect(refresher.request("refresh")).resolves.toEqual({ ok: false, kind: "no-extension" });
    expect(session.stale).toBe(true);
    expect(hub.pushState).not.toHaveBeenCalled();
  });
});
