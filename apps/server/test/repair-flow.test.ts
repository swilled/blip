import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import type { ClaudeRole } from "../src/brain/claude/session";
import type { RepairProvider } from "../src/brain/claude/repair-coordinator";
import { startServer, type RunningServer } from "../src/server";
import { bindClient, type Frame, type TestClient } from "./helpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function nextFrame(
  client: TestClient,
  type: string,
  predicate: (frame: Frame) => boolean = () => true,
): Promise<Frame> {
  const deadline = Date.now() + 4000;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`timed out waiting for ${type}`);
    const frame = await client.nextMessage(left);
    if (frame.type === type && predicate(frame)) return frame;
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition did not become true before timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function answerWithSnapshot(
  voice: TestClient,
  extension: TestClient,
  snapshot = loadSnapshot("broken"),
): Promise<Frame> {
  voice.send("utterance", { utteranceId: newId(), text: "describe", source: "typed" });
  const request = await nextFrame(extension, "snapshot.request");
  extension.send("snapshot.result", { ok: true, snapshot }, { replyTo: request.id });
  return nextFrame(voice, "speak", (frame) => frame.payload.category === "answer");
}

describe("background repair flow", () => {
  const servers: RunningServer[] = [];
  const clients: TestClient[] = [];
  const cacheDirs: string[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    for (const server of servers.splice(0)) await server.close();
    for (const directory of cacheDirs.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  async function makeFlow(provider: RepairProvider, repairTimeoutMs = 1000) {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "blip-repair-flow-"));
    cacheDirs.push(cacheDirectory);
    const server = await startServer({
      port: 0,
      dev: true,
      brain: "fake",
      fakeDelayMs: 0,
      repairProvider: provider,
      repairCacheDirectory: cacheDirectory,
      repairTimeoutMs,
    });
    servers.push(server);
    const extension = await bindClient(server.port, "extension", { origin: undefined });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    clients.push(extension, voice);
    return { server, extension, voice };
  }

  it("sends the baseline answer before repair starts, keeps the turn queue free, and merges success", async () => {
    const call = deferred<unknown>();
    let server: RunningServer | undefined;
    let spokenAtCall: string | null = null;
    let busyAtCall = true;
    const started = deferred<string>();
    const provider: RepairProvider = {
      repairFormModel: vi.fn((prompt) => {
        spokenAtCall = server?.session.lastSpoken ?? null;
        busyAtCall = server?.session.busy ?? true;
        started.resolve(prompt);
        return call.promise;
      }),
      abortRole: vi.fn(async (_role: ClaudeRole) => {}),
      recreateRole: vi.fn(async (_role: ClaudeRole) => {}),
    };
    const flow = await makeFlow(provider);
    server = flow.server;

    const sourceSnapshot = loadSnapshot("broken");
    const snapshotWithSentinel = {
      ...sourceSnapshot,
      elements: sourceSnapshot.elements.map((element, index) => index === 0
        ? { ...element, value: "repair-secret-sentinel-55", hasValue: true }
        : element),
    };
    const first = await answerWithSnapshot(flow.voice, flow.extension, snapshotWithSentinel);
    const prompt = await started.promise;
    expect(first.payload.text.length).toBeGreaterThan(0);
    expect(spokenAtCall).toBe(first.payload.text);
    expect(busyAtCall).toBe(false);
    expect(prompt).not.toContain("repair-secret-sentinel-55");
    expect(flow.server.session.model?.repairStatus).toBe("pending");

    flow.voice.send("utterance", { utteranceId: newId(), text: "describe", source: "typed" });
    const second = await nextFrame(flow.voice, "speak", (frame) => frame.payload.category === "answer");
    expect(second.payload.category).toBe("answer");
    expect(provider.repairFormModel).toHaveBeenCalledTimes(1);

    call.resolve({
      title: "Repaired survey",
      fields: [{ id: "e3", label: "Email", group: "Contact", confidence: 0.94 }],
    });
    await waitFor(() => flow.server.session.model?.repairStatus === "repaired");
    expect(flow.server.session.model).toMatchObject({
      title: "Repaired survey",
      fields: expect.arrayContaining([expect.objectContaining({ id: "e3", label: "Email", labelSource: "model", confidence: 0.94 })]),
      groups: [{ name: "Contact", fieldIds: ["e3"] }],
    });
  });

  it("discards a delayed patch when route, structure, and field IDs change", async () => {
    const oldCall = deferred<unknown>();
    const newCall = deferred<unknown>();
    const calls = [oldCall, newCall];
    const provider: RepairProvider = {
      repairFormModel: vi.fn(() => calls.shift()!.promise),
      abortRole: vi.fn(async (_role: ClaudeRole) => {}),
      recreateRole: vi.fn(async (_role: ClaudeRole) => {}),
    };
    const { server, extension, voice } = await makeFlow(provider);
    await answerWithSnapshot(voice, extension);
    await waitFor(() => provider.repairFormModel.mock.calls.length === 1);

    const changed = {
      ...loadSnapshot("broken"),
      url: "http://127.0.0.1:7777/fixtures/forms/other.html?session=secret#step",
      origin: "http://127.0.0.1:7777",
      version: 2,
      capturedAt: 2,
      structuralHash: "changed-structure",
      elements: loadSnapshot("broken").elements.filter((element) => element.id !== "e3"),
    };
    extension.send("page.changed", {
      tabId: changed.tabId,
      url: changed.url,
      reason: "mutation",
      structuralHash: changed.structuralHash,
    });
    const refresh = await nextFrame(extension, "snapshot.request");
    extension.send("snapshot.result", { ok: true, snapshot: changed }, { replyTo: refresh.id });
    await waitFor(() => provider.repairFormModel.mock.calls.length === 2);

    oldCall.resolve({ title: "Stale title", fields: [{ id: "e3", label: "Stale label" }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.session.model).toMatchObject({ url: changed.url, structuralHash: changed.structuralHash, repairStatus: "pending" });
    expect(server.session.model?.fields.some((field) => field.id === "e3")).toBe(false);
    expect(server.session.model?.title).not.toBe("Stale title");

    newCall.resolve({ title: "Current title", fields: [{ id: "e2", label: "Current label" }] });
    await waitFor(() => server.session.model?.repairStatus === "repaired");
    expect(server.session.model?.title).toBe("Current title");
  });

  it("times out only the repair role and does not block a subsequent user turn", async () => {
    const pending = deferred<unknown>();
    const provider: RepairProvider = {
      repairFormModel: vi.fn(() => pending.promise),
      abortRole: vi.fn(async (_role: ClaudeRole) => {}),
      recreateRole: vi.fn(async (_role: ClaudeRole) => {}),
    };
    const { server, extension, voice } = await makeFlow(provider, 25);
    const baselineReply = await answerWithSnapshot(voice, extension);
    expect(baselineReply.payload.category).toBe("answer");
    await waitFor(() => server.session.model?.repairStatus === "failed");
    expect(provider.abortRole).toHaveBeenCalledWith("repair");
    expect(provider.recreateRole).toHaveBeenCalledWith("repair");
    expect(provider.abortRole).not.toHaveBeenCalledWith("intent");
    expect(provider.recreateRole).not.toHaveBeenCalledWith("intent");

    voice.send("utterance", { utteranceId: newId(), text: "describe", source: "typed" });
    const nextReply = await nextFrame(voice, "speak", (frame) => frame.payload.category === "answer");
    expect(nextReply.payload.category).toBe("answer");
  });
});
