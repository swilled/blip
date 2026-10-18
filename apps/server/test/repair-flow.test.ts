import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import type { AgyRole } from "../src/brain/agy/session";
import type { RepairProvider } from "../src/brain/agy/repair-coordinator";
import { RepairCache, repairCacheIdentity } from "../src/brain/agy/repair-cache";
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

  async function makeFlow(provider: RepairProvider, repairTimeoutMs = 1000, cacheDirectory?: string) {
    const selectedCacheDirectory = cacheDirectory ?? await mkdtemp(join(tmpdir(), "blip-repair-flow-"));
    if (cacheDirectory === undefined) cacheDirs.push(selectedCacheDirectory);
    const server = await startServer({
      port: 0,
      dev: true,
      brain: "fake",
      fakeDelayMs: 0,
      repairProvider: provider,
      repairCacheDirectory: selectedCacheDirectory,
      repairTimeoutMs,
    });
    servers.push(server);
    const extension = await bindClient(server.port, "extension", { origin: undefined });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    clients.push(extension, voice);
    return { server, extension, voice, cacheDirectory: selectedCacheDirectory };
  }

  it("sends the baseline answer before repair starts, keeps the turn queue free, and merges success", async () => {
    const call = deferred<unknown>();
    let server: RunningServer | undefined;
    let spokenAtCall: string | null = null;
    let busyAtCall = true;
    const started = deferred<string>();
    const provider = {
      repairFormModel: vi.fn((prompt) => {
        spokenAtCall = server?.session.lastSpoken ?? null;
        busyAtCall = server?.session.busy ?? true;
        started.resolve(prompt);
        return call.promise;
      }),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
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
    const provider = {
      repairFormModel: vi.fn(() => calls.shift()!.promise),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
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

  it("rejects a repair when a newer extension snapshot replaces the captured snapshot", async () => {
    const oldCall = deferred<unknown>();
    const newCall = deferred<unknown>();
    const calls = [oldCall, newCall];
    const provider = {
      repairFormModel: vi.fn(() => calls.shift()!.promise),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
    };
    const { server, extension, voice } = await makeFlow(provider);
    const captured = loadSnapshot("broken");
    await answerWithSnapshot(voice, extension, captured);
    await waitFor(() => provider.repairFormModel.mock.calls.length === 1);

    const replacement = { ...captured, capturedAt: captured.capturedAt + 1 };
    extension.send("page.changed", {
      tabId: replacement.tabId,
      url: replacement.url,
      reason: "mutation",
      structuralHash: replacement.structuralHash,
    });
    const refresh = await nextFrame(extension, "snapshot.request");
    extension.send("snapshot.result", { ok: true, snapshot: replacement }, { replyTo: refresh.id });
    await waitFor(() => provider.repairFormModel.mock.calls.length === 2);

    oldCall.resolve({ title: "Replaced snapshot title", fields: [{ id: "e3", label: "Stale label" }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.session.model?.repairStatus).toBe("pending");
    expect(server.session.model?.title).not.toBe("Replaced snapshot title");
    expect(server.session.model?.fields.find((field) => field.id === "e3")?.label).not.toBe("Stale label");

    newCall.resolve({ title: "Current snapshot title", fields: [{ id: "e3", label: "Current label" }] });
    await waitFor(() => server.session.model?.repairStatus === "repaired");
    expect(server.session.model?.title).toBe("Current snapshot title");
  });

  it("times out only the repair role and does not block a subsequent user turn", async () => {
    const pending = deferred<unknown>();
    const provider = {
      repairFormModel: vi.fn(() => pending.promise),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
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

  it("reuses only matching value-free patches and treats stale IDs or corrupt entries as misses", async () => {
    const firstProvider = {
      repairFormModel: vi.fn(async () => ({
        title: "Cached survey title",
        fields: [{ id: "e3", label: "Email address", group: "Contact", confidence: 0.95 }],
      })),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
    };
    const first = await makeFlow(firstProvider);
    const base = loadSnapshot("broken");
    const firstSnapshot = {
      ...base,
      url: `${new URL(base.url).origin}${new URL(base.url).pathname}?session=secret-one#section-one`,
      elements: base.elements.map((element, index) => index === 0
        ? { ...element, value: "disk-secret-value-113", hasValue: true }
        : element),
    };
    await answerWithSnapshot(first.voice, first.extension, firstSnapshot);
    await waitFor(() => first.server.session.model?.repairStatus === "repaired");
    expect(firstProvider.repairFormModel).toHaveBeenCalledTimes(1);

    const cacheFiles = (await readdir(first.cacheDirectory)).filter((name) => name.endsWith(".json"));
    expect(cacheFiles).toHaveLength(1);
    const cacheText = await readFile(join(first.cacheDirectory, cacheFiles[0]!), "utf8");
    expect(cacheText).not.toContain("disk-secret-value-113");
    expect(cacheText).not.toContain("describe");
    expect(cacheText).toContain("Email address");

    const shouldNotRun = {
      repairFormModel: vi.fn(async () => { throw new Error("cache hit must precede provider call"); }),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
    };
    const returning = await makeFlow(shouldNotRun, 1000, first.cacheDirectory);
    const returningSnapshot = {
      ...base,
      url: `${new URL(base.url).origin}${new URL(base.url).pathname}?session=secret-two#section-two`,
      elements: base.elements.map((element, index) => index === 0
        ? { ...element, value: "second-disk-secret-value-991", hasValue: true }
        : element),
    };
    await answerWithSnapshot(returning.voice, returning.extension, returningSnapshot);
    expect(shouldNotRun.repairFormModel).not.toHaveBeenCalled();
    expect(returning.server.session.model).toMatchObject({ title: "Cached survey title", repairStatus: "repaired" });
    expect(returning.server.session.model?.fields).toContainEqual(expect.objectContaining({
      id: "e3", label: "Email address", labelSource: "model", group: "Contact",
    }));

    const staleCall = deferred<unknown>();
    const staleProvider = {
      repairFormModel: vi.fn(() => staleCall.promise),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
    };
    const staleIds = await makeFlow(staleProvider, 1000, first.cacheDirectory);
    const changedIdsSnapshot = {
      ...base,
      url: `${new URL(base.url).origin}${new URL(base.url).pathname}?session=secret-three#section-three`,
      elements: base.elements.filter((element) => element.id !== "e3"),
    };
    await answerWithSnapshot(staleIds.voice, staleIds.extension, changedIdsSnapshot);
    await waitFor(() => staleProvider.repairFormModel.mock.calls.length === 1);
    staleCall.resolve({ fields: [{ id: "e2", label: "Current field" }] });
    await waitFor(() => staleIds.server.session.model?.repairStatus === "repaired");

    const identity = repairCacheIdentity(firstSnapshot.url, base.structuralHash);
    expect(identity).not.toBeNull();
    await writeFile(join(first.cacheDirectory, `${identity}.json`), "{broken-json", "utf8");
    const corruptProvider = {
      repairFormModel: vi.fn(async () => ({ fields: [{ id: "e3", label: "Fresh label" }] })),
      abortRole: vi.fn(async (_role: AgyRole) => {}),
      recreateRole: vi.fn(async (_role: AgyRole) => {}),
    };
    const corrupt = await makeFlow(corruptProvider, 1000, first.cacheDirectory);
    await answerWithSnapshot(corrupt.voice, corrupt.extension, base);
    await waitFor(() => corrupt.server.session.model?.repairStatus === "repaired");
    expect(corruptProvider.repairFormModel).toHaveBeenCalledTimes(1);
  });

  it("writes cache entries atomically and evicts oldest entries at count and byte bounds", async () => {
    let now = 1;
    const sampleDirectory = await mkdtemp(join(tmpdir(), "blip-repair-cache-sample-"));
    cacheDirs.push(sampleDirectory);
    const sampleCache = new RepairCache({ directory: sampleDirectory, now: () => now });
    const patch = { title: "A", fields: [] };
    const firstUrl = "https://example.test/a?token=one#top";
    expect(sampleCache.save(firstUrl, "hash-a", patch)).toBe(true);
    const identity = repairCacheIdentity(firstUrl, "hash-a")!;
    const entryBytes = (await stat(join(sampleDirectory, `${identity}.json`))).size;
    expect((await readdir(sampleDirectory)).some((name) => name.endsWith(".tmp"))).toBe(false);
    expect(sampleCache.load("https://example.test/a?token=two#next", "hash-a")).toEqual(patch);

    now = 1;
    const countDirectory = await mkdtemp(join(tmpdir(), "blip-repair-cache-count-"));
    cacheDirs.push(countDirectory);
    const countCache = new RepairCache({ directory: countDirectory, maxEntries: 2, now: () => now++ });
    for (const [path, hash] of [["/one", "one"], ["/two", "two"], ["/three", "three"]]) {
      expect(countCache.save(`https://example.test${path}`, hash, patch)).toBe(true);
    }
    expect((await readdir(countDirectory)).filter((name) => name.endsWith(".json"))).toHaveLength(2);
    expect(countCache.load("https://example.test/one", "one")).toBeNull();
    expect(countCache.load("https://example.test/two", "two")).toEqual(patch);
    expect(countCache.load("https://example.test/three", "three")).toEqual(patch);

    let byteNow = 1;
    const byteDirectory = await mkdtemp(join(tmpdir(), "blip-repair-cache-bytes-"));
    cacheDirs.push(byteDirectory);
    const byteCache = new RepairCache({ directory: byteDirectory, maxBytes: entryBytes * 2, now: () => byteNow++ });
    for (const [path, hash] of [["/one", "one"], ["/two", "two"], ["/three", "three"]]) {
      expect(byteCache.save(`https://example.test${path}`, hash, patch)).toBe(true);
    }
    const byteEntries = (await readdir(byteDirectory)).filter((name) => name.endsWith(".json"));
    expect(byteEntries).toHaveLength(2);
    const totalBytes = await Promise.all(byteEntries.map(async (name) => (await stat(join(byteDirectory, name))).size));
    expect(totalBytes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(entryBytes * 2);
    expect(byteCache.load("https://example.test/one", "one")).toBeNull();
  });
});
