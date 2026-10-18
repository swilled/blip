import { describe, expect, it, vi } from "vitest";
import type { BrowserContentItem, BrowserPageIdentity, Snapshot } from "@blip/protocol";
import { Session } from "../session/session";
import { createPageTask, filterPageTaskItem, type NewPageTask } from "./task-state";

const identity: BrowserPageIdentity = {
  captureId: "capture-1",
  captureRevision: 1,
  tabId: 7,
  pageUrl: "https://example.test/inbox",
};

function item(itemId = "item-1", override: Partial<BrowserContentItem> = {}): BrowserContentItem {
  return {
    itemId,
    text: "A visible note about the park opening.",
    visibleDate: "2026-10-18T08:00:00Z",
    identity,
    frameId: 0,
    ...override,
  };
}

function taskInput(value = item(), override: Partial<NewPageTask> = {}): NewPageTask {
  const taskIdentity = value.identity;
  const filtered = filterPageTaskItem(value, taskIdentity)!;
  return {
    identity: taskIdentity,
    itemId: filtered.item.itemId,
    frameId: filtered.item.frameId,
    sourceExcerpt: filtered.excerpt,
    taskKind: "read-item",
    draftTargetId: null,
    recipientBinding: null,
    actionTargetBinding: null,
    lastObservedDraftValue: null,
    associatedGrantId: null,
    ...override,
  };
}

function readySession(items: BrowserContentItem[] = [item(), item("item-2", { text: "A second visible note." })]): Session {
  const session = new Session("fake");
  session.extensionConnected = true;
  session.tabId = identity.tabId;
  session.applyBrowserCapture({ identity, blocks: [], items, links: [] });
  return session;
}

function snapshot(tabId: number, url: string): Snapshot {
  return {
    snapshotId: `snapshot-${tabId}`,
    version: 1,
    tabId,
    url,
    origin: new URL(url).origin,
    title: "Current page",
    headings: [],
    alerts: [],
    elements: [],
    truncated: false,
    structuralHash: `snapshot-${tabId}`,
    capturedAt: 1,
  };
}

describe("bounded page task state", () => {
  it("retains only one current task and scrubs the replaced source and draft", () => {
    const session = readySession();
    const first = taskInput(item(), { lastObservedDraftValue: "Observed first draft." });
    const second = taskInput(item("item-2", { text: "A second visible note." }));

    expect(session.setActivePageTask(first)).toBe(true);
    const previous = session.activePageTask!;
    expect(session.setActivePageTask(second)).toBe(true);

    expect(previous.sourceExcerpt).toBe("");
    expect(previous.lastObservedDraftValue).toBeNull();
    expect(session.activePageTask).toMatchObject({ itemId: "item-2", sourceExcerpt: "A second visible note." });
  });

  it("rejects stale identities, non-current items, and unsafe or over-bound state", () => {
    const session = readySession();
    const current = taskInput(item());
    expect(session.setActivePageTask(current)).toBe(true);
    const active = session.activePageTask;

    expect(session.setActivePageTask(taskInput(item("stale", {
      identity: { ...identity, captureRevision: 2 },
    })))).toBe(false);
    expect(session.activePageTask).toBe(active);
    expect(createPageTask(taskInput(item(), { sourceExcerpt: "x".repeat(401) }))).toBeNull();
    expect(createPageTask(taskInput(item(), { lastObservedDraftValue: "x".repeat(4_001) }))).toBeNull();
    expect(createPageTask(taskInput(item(), { taskId: "has spaces" }))).toBeNull();
    expect(createPageTask(taskInput(item(), { taskId: 42 as unknown as string }))).toBeNull();
    expect(createPageTask(taskInput(item(), {
      sourceExcerpt: "The password: do-not-store-this",
    }))).toBeNull();
  });

  it("clears retained task text on voice and extension disconnect or replacement", () => {
    const voiceSession = readySession();
    expect(voiceSession.setActivePageTask(taskInput())).toBe(true);
    const voiceTask = voiceSession.activePageTask!;
    voiceSession.voiceConnected = true;
    voiceSession.voiceConnected = false;
    expect(voiceSession.activePageTask).toBeNull();
    expect(voiceTask.sourceExcerpt).toBe("");

    const replacedVoiceSession = readySession();
    replacedVoiceSession.voiceConnected = true;
    expect(replacedVoiceSession.setActivePageTask(taskInput())).toBe(true);
    replacedVoiceSession.voiceConnected = true;
    expect(replacedVoiceSession.activePageTask).toBeNull();

    const extensionSession = readySession();
    expect(extensionSession.setActivePageTask(taskInput())).toBe(true);
    extensionSession.extensionConnected = false;
    expect(extensionSession.activePageTask).toBeNull();

    const replacedExtensionSession = readySession();
    expect(replacedExtensionSession.setActivePageTask(taskInput())).toBe(true);
    replacedExtensionSession.extensionConnected = true;
    expect(replacedExtensionSession.activePageTask).toBeNull();
  });

  it("clears task state when capture identity changes or is discarded", () => {
    const session = readySession();
    expect(session.setActivePageTask(taskInput())).toBe(true);
    const task = session.activePageTask!;
    const changed = { ...identity, captureRevision: 2 };
    session.applyBrowserCapture({ identity: changed, blocks: [], items: [], links: [] });
    expect(session.activePageTask).toBeNull();
    expect(task.sourceExcerpt).toBe("");

    session.applyBrowserCapture({ identity: changed, blocks: [], items: [item("fresh", { identity: changed })], links: [] });
    expect(session.setActivePageTask(taskInput(item("fresh", { identity: changed }), { identity: changed }))).toBe(true);
    session.browserCapture = null;
    expect(session.activePageTask).toBeNull();
  });

  it("clears task state when an accepted snapshot changes tab or page identity", () => {
    const session = readySession();
    expect(session.setActivePageTask(taskInput())).toBe(true);
    session.applySnapshot(snapshot(identity.tabId + 1, identity.pageUrl));
    expect(session.activePageTask).toBeNull();

    const sameTabSession = readySession();
    expect(sameTabSession.setActivePageTask(taskInput())).toBe(true);
    sameTabSession.applySnapshot(snapshot(identity.tabId, "https://example.test/other"));
    expect(sameTabSession.activePageTask).toBeNull();
  });

  it("revokes the task's associated one-use grant when cleared", () => {
    const session = readySession();
    expect(session.setActivePageTask(taskInput())).toBe(true);
    const model = {
      url: identity.pageUrl,
      snapshotVersion: 1,
      fields: [],
    };
    const binding = { targetId: "submit-button", kind: "submit" as const, model };
    const grant = session.grants.arm(binding)!;
    expect(session.associatePageTaskGrant(grant.grantId)).toBe(true);
    const clear = vi.spyOn(session.grants, "clear");

    session.clearPageTask();

    expect(clear).toHaveBeenCalledWith(grant.grantId);
    expect(session.grants.consume(grant.grantId, binding)).toBe(false);
  });

  it("does not retain any model proposal field", () => {
    const task = createPageTask(taskInput())!;
    expect(Object.keys(task)).not.toContain("modelProposal");
    expect(Object.keys(task)).not.toContain("proposedDraft");
  });
});
