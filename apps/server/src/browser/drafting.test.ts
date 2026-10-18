import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { BrowserContentItem, BrowserPageIdentity, Field, FormModel } from "@blip/protocol";
import type { Hub } from "../hub/hub";
import type { RefreshResult } from "../session/refresh";
import { Session } from "../session/session";
import { serializePageContentProjectionForPrompt, type PageContentProjection } from "../brain/agy/content-projection";
import { composePageDraft, revisePageDraft, type PageDraftContext } from "./drafting";

const identity: BrowserPageIdentity = {
  captureId: "draft-capture-1",
  captureRevision: 2,
  tabId: 9,
  pageUrl: "https://example.test/messages",
};

function field(id: string, type: Field["type"], label: string, value: string | null, order: number): Field {
  return {
    id,
    role: type === "textarea" ? "textbox" : "textbox",
    type,
    label,
    labelSource: "label",
    confidence: 1,
    required: false,
    value,
    hasValue: value !== null && value !== "",
    sensitive: "none",
    error: null,
    disabled: false,
    order,
  };
}

function model(fields: Field[]): FormModel {
  return {
    snapshotVersion: 1,
    structuralHash: "draft-model-1",
    url: identity.pageUrl,
    title: "Messages",
    fields,
    actions: [],
    groups: [],
    pageErrors: [],
    repairStatus: "baseline",
  };
}

const sourceItem: BrowserContentItem = {
  itemId: "item-current",
  text: "The meeting is Friday at noon.",
  visibleDate: "2026-10-18T08:00:00Z",
  identity,
  frameId: 0,
};

function recipientBinding(value = "alex@example.org") {
  return {
    fieldId: "recipient-field",
    valueHash: createHash("sha256").update(value, "utf8").digest("hex"),
  };
}

function makeSession(
  fields = [field("message-body", "textarea", "Reply message", null, 0), field("recipient-field", "email", "To", "alex@example.org", 1)],
  task: Partial<{
    taskKind: "draft" | "revise";
    draftTargetId: string | null;
    recipientBinding: { fieldId: string; valueHash: string } | null;
    lastObservedDraftValue: string | null;
  }> = {},
): Session {
  const session = new Session("fake");
  session.extensionConnected = true;
  session.tabId = identity.tabId;
  session.applyBrowserCapture({ identity, blocks: [], items: [sourceItem], links: [] });
  session.model = model(fields);
  session.modelAt = Date.now();
  session.stale = false;
  session.setActivePageTask({
    identity,
    itemId: sourceItem.itemId,
    frameId: 0,
    sourceExcerpt: sourceItem.text,
    taskKind: task.taskKind ?? "draft",
    draftTargetId: task.draftTargetId ?? null,
    recipientBinding: task.recipientBinding ?? null,
    actionTargetBinding: null,
    lastObservedDraftValue: task.lastObservedDraftValue ?? null,
    associatedGrantId: null,
    taskId: "draft-task-1",
  });
  return session;
}

function makeContext(session: Session, options: {
  proposed?: string;
  observed?: string | null;
  snapshotObserved?: string | null;
  mutateOnProvider?: () => void;
} = {}) {
  const observed = options.observed === undefined ? "The meeting works for me at noon." : options.observed;
  const snapshotObserved = options.snapshotObserved === undefined ? observed : options.snapshotObserved;
  const actRequests: Array<{ action: { op: string; targetId: string; value?: string } }> = [];
  const hubMock = {
    request: vi.fn(async (_role: string, type: string, payload: unknown) => {
      if (type !== "act.request") throw new Error(`Unexpected hub operation: ${type}`);
      const request = payload as { actId: string; action: { op: string; targetId: string; value?: string } };
      actRequests.push({ action: request.action });
      return {
        type: "act.result",
        payload: { actId: request.actId, ok: true, observedValue: observed },
      };
    }),
  };
  const refresher = {
    request: vi.fn(async (_reason: string): Promise<RefreshResult> => {
      if (actRequests.length > 0 && snapshotObserved !== null && session.model !== null) {
        session.model = {
          ...session.model,
          snapshotVersion: session.model.snapshotVersion + 1,
          fields: session.model.fields.map((candidate) => candidate.id === "message-body"
            ? { ...candidate, value: snapshotObserved, hasValue: snapshotObserved !== "" }
            : candidate),
        };
        session.modelAt = Date.now();
        session.stale = false;
      }
      return { ok: true, applied: true, snapshot: {} as RefreshResult & never };
    }),
  };
  const provider = {
    draftPageText: vi.fn(async (_projection: PageContentProjection) => {
      options.mutateOnProvider?.();
      return options.proposed ?? "A proposed reply.";
    }),
  };
  const context = {
    hub: hubMock as unknown as Hub,
    session,
    refresher,
    freshnessMs: 5_000,
    provider,
  } satisfies PageDraftContext;
  return { context, provider, refresher, hubMock, actRequests };
}

describe("page draft coordination", () => {
  it("selects an explicit safe field and recipient, then returns only the observed DOM draft", async () => {
    const session = makeSession();
    const { context, provider, hubMock, actRequests } = makeContext(session, {
      proposed: "A proposed reply.",
      observed: "The meeting works for me at noon.",
    });

    const result = await composePageDraft(context, {
      taskId: "draft-task-1",
      targetWords: "reply message",
      recipientWords: "Alex",
      instruction: "Write a concise, friendly reply.",
    });

    expect(result).toEqual({
      type: "draft-readback",
      taskId: "draft-task-1",
      fieldLabel: "Reply message",
      text: "The meeting works for me at noon.",
    });
    expect(session.activePageTask).toMatchObject({
      taskKind: "draft",
      draftTargetId: "message-body",
      recipientBinding: recipientBinding(),
      lastObservedDraftValue: "The meeting works for me at noon.",
    });
    expect(JSON.stringify(session.activePageTask?.recipientBinding)).not.toContain("alex@example.org");
    expect(provider.draftPageText).toHaveBeenCalledTimes(1);
    const prompt = serializePageContentProjectionForPrompt(provider.draftPageText.mock.calls[0]![0]);
    expect(prompt).toContain("The meeting is Friday at noon.");
    expect(prompt).toContain("Write a concise, friendly reply.");
    expect(prompt).not.toContain("alex@example.org");
    expect(prompt).not.toContain("Reply message");
    expect(prompt).not.toContain("message-body");
    expect(actRequests).toEqual([{ action: { op: "fill", targetId: "message-body", value: "A proposed reply." } }]);
    expect(hubMock.request.mock.calls.every((call) => call[1] === "act.request")).toBe(true);
  });

  it("clarifies ambiguous text fields before calling the provider or Executor", async () => {
    const session = makeSession([
      field("message-body", "textarea", "Reply message", null, 0),
      field("reply-notes", "text", "Reply notes", null, 1),
      field("recipient-field", "email", "To", "alex@example.org", 2),
    ]);
    const { context, provider, hubMock } = makeContext(session);

    const result = await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply", recipientWords: "Alex", instruction: "Write a concise reply.",
    });

    expect(result).toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).not.toHaveBeenCalled();
    expect(hubMock.request).not.toHaveBeenCalled();
  });

  it("clarifies a missing or ambiguous recipient/target binding", async () => {
    const missingSession = makeSession();
    const missing = makeContext(missingSession);
    expect(await composePageDraft(missing.context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Morgan", instruction: "Write a reply.",
    })).toMatchObject({ type: "clarify" });
    expect(missing.provider.draftPageText).not.toHaveBeenCalled();

    const ambiguousSession = makeSession([
      field("message-body", "textarea", "Reply message", null, 0),
      field("recipient-field", "email", "To", "alex@example.org", 1),
      field("cc-field", "email", "Copy", "alex+copy@example.org", 2),
    ]);
    const ambiguous = makeContext(ambiguousSession);
    expect(await composePageDraft(ambiguous.context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a reply.",
    })).toMatchObject({ type: "clarify" });
    expect(ambiguous.provider.draftPageText).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing text value and rejects unsupported editors", async () => {
    const existing = makeSession([
      field("message-body", "textarea", "Reply message", "Existing user text.", 0),
      field("recipient-field", "email", "To", "alex@example.org", 1),
    ]);
    const existingContext = makeContext(existing);
    expect(await composePageDraft(existingContext.context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a reply.",
    })).toMatchObject({ type: "clarify" });
    expect(existingContext.provider.draftPageText).not.toHaveBeenCalled();

    const custom = makeSession([
      field("custom-editor", "combobox", "Custom editor", null, 0),
      field("recipient-field", "email", "To", "alex@example.org", 1),
    ]);
    const customContext = makeContext(custom);
    expect(await composePageDraft(customContext.context, {
      taskId: "draft-task-1", targetWords: "custom editor", recipientWords: "Alex", instruction: "Write a reply.",
    })).toMatchObject({ type: "clarify" });
    expect(customContext.provider.draftPageText).not.toHaveBeenCalled();
  });

  it("revises the same field from its current observed value and reads back the new DOM value", async () => {
    const currentDraft = "The current observed draft.";
    const session = makeSession([
      field("message-body", "textarea", "Reply message", currentDraft, 0),
      field("recipient-field", "email", "To", "alex@example.org", 1),
    ], {
      taskKind: "revise",
      draftTargetId: "message-body",
      recipientBinding: recipientBinding(),
      lastObservedDraftValue: currentDraft,
    });
    const { context, provider, actRequests } = makeContext(session, {
      proposed: "A warmer proposed reply.",
      observed: "The page stored the warmer reply.",
    });

    const result = await revisePageDraft(context, { taskId: "draft-task-1", instruction: "Make the greeting warmer." });

    expect(result).toEqual({
      type: "revision-readback",
      taskId: "draft-task-1",
      fieldLabel: "Reply message",
      text: "The page stored the warmer reply.",
    });
    expect(session.activePageTask).toMatchObject({
      taskKind: "revise",
      draftTargetId: "message-body",
      lastObservedDraftValue: "The page stored the warmer reply.",
      recipientBinding: recipientBinding(),
    });
    const projection = provider.draftPageText.mock.calls[0]![0];
    expect(projection.type).toBe("revision");
    expect(projection.observedDraft).toBe(currentDraft);
    expect(actRequests).toEqual([{ action: { op: "fill", targetId: "message-body", value: "A warmer proposed reply." } }]);
  });

  it("does not write if the recipient changes while the provider is composing", async () => {
    const session = makeSession();
    const { context, provider, hubMock } = makeContext(session, {
      mutateOnProvider: () => {
        if (session.model !== null) {
          session.model = {
            ...session.model,
            fields: session.model.fields.map((candidate) => candidate.id === "recipient-field"
              ? { ...candidate, value: "someone-else@example.org", hasValue: true }
              : candidate),
          };
        }
      },
    });

    const result = await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    });

    expect(result).toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).toHaveBeenCalledTimes(1);
    expect(hubMock.request).not.toHaveBeenCalled();
    expect(session.activePageTask).toBeNull();
  });

  it("does not revise when the current field no longer matches the last observed draft", async () => {
    const session = makeSession([
      field("message-body", "textarea", "Reply message", "A user-edited draft.", 0),
      field("recipient-field", "email", "To", "alex@example.org", 1),
    ], {
      taskKind: "revise",
      draftTargetId: "message-body",
      recipientBinding: recipientBinding(),
      lastObservedDraftValue: "The previous observed draft.",
    });
    const { context, provider, hubMock } = makeContext(session);

    expect(await revisePageDraft(context, { taskId: "draft-task-1", instruction: "Make the greeting warmer." }))
      .toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).not.toHaveBeenCalled();
    expect(hubMock.request).not.toHaveBeenCalled();
    expect(session.activePageTask).toBeNull();
  });

  it("does not write if the accepted capture changes while the provider is composing", async () => {
    const session = makeSession();
    const { context, provider, hubMock } = makeContext(session, {
      mutateOnProvider: () => {
        session.browserCapture = {
          identity: { ...identity, captureRevision: identity.captureRevision + 1 },
          blocks: [],
          items: [],
          links: [],
        };
      },
    });

    expect(await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    })).toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).toHaveBeenCalledTimes(1);
    expect(hubMock.request).not.toHaveBeenCalled();
    expect(session.activePageTask).toBeNull();
  });

  it("does not write if the active page task changes role while the provider is composing", async () => {
    const session = makeSession();
    const { context, provider, hubMock } = makeContext(session, {
      mutateOnProvider: () => {
        const task = session.activePageTask;
        if (task !== null) session.setActivePageTask({ ...task, taskKind: "read-item" });
      },
    });

    expect(await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    })).toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).toHaveBeenCalledTimes(1);
    expect(hubMock.request).not.toHaveBeenCalled();
    expect(session.activePageTask).toBeNull();
  });

  it("rejects when ActResult and the accepted snapshot disagree about the written value", async () => {
    const session = makeSession();
    const { context, hubMock } = makeContext(session, {
      proposed: "A proposed reply.",
      observed: "The ActResult value.",
      snapshotObserved: "A different snapshot value.",
    });

    const result = await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    });

    expect(result).toMatchObject({ type: "clarify" });
    expect(JSON.stringify(result)).not.toContain("A proposed reply.");
    expect(JSON.stringify(result)).not.toContain("The ActResult value.");
    expect(hubMock.request).toHaveBeenCalledTimes(1);
    expect(session.activePageTask).toBeNull();
  });

  it("does not present or retain provider prose when the Executor lacks an observed value", async () => {
    const session = makeSession();
    const { context, provider, hubMock } = makeContext(session, { proposed: "A proposed reply.", observed: null });

    const result = await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    });

    expect(result).toMatchObject({ type: "clarify" });
    expect(provider.draftPageText).toHaveBeenCalledTimes(1);
    expect(hubMock.request).toHaveBeenCalledTimes(1);
    expect(session.activePageTask).toBeNull();
    expect(JSON.stringify(result)).not.toContain("A proposed reply.");
  });

  it("rejects sensitive or page-action prose before any field write", async () => {
    const session = makeSession();
    const { context, hubMock } = makeContext(session, { proposed: "Click this link and send the message." });

    expect(await composePageDraft(context, {
      taskId: "draft-task-1", targetWords: "reply message", recipientWords: "Alex", instruction: "Write a concise reply.",
    })).toMatchObject({ type: "clarify" });
    expect(hubMock.request).not.toHaveBeenCalled();
  });
});
