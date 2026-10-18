import {
  BrowserContentItem,
  BrowserPageIdentity,
  newId,
  type BrowserContentBlock,
  type BrowserContentItem as BrowserContentItemValue,
  type BrowserPageIdentity as BrowserPageIdentityValue,
} from "@blip/protocol";
import { projectExplicitPageContentRequest } from "../brain/agy/content-projection";
import { containsSensitivePageText } from "../brain/agy/privacy";

export const MAX_PAGE_TASK_ID_LENGTH = 64;
export const MAX_PAGE_TASK_TARGET_ID_LENGTH = 200;
export const MAX_PAGE_TASK_EXCERPT_CODE_POINTS = 400;
export const MAX_PAGE_TASK_DRAFT_CODE_POINTS = 4_000;
export const MAX_PAGE_TASK_BINDING_HASH_LENGTH = 64;

const PAGE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const PAGE_TASK_TARGET_ID = /^[^\u0000-\u001f\u007f]{1,200}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export type PageTaskKind = "read-item" | "summarize-item" | "question-item" | "draft" | "revise";

/** A value-free reference to a resolved, observed field value. Raw recipient/target values are not retained. */
export type PageTaskValueBinding = {
  fieldId: string;
  valueHash: string;
};

/** The only page content and draft state retained while one task is active in a Session. */
export type ActivePageTask = {
  taskId: string;
  identity: BrowserPageIdentityValue;
  itemId: string;
  frameId: number;
  sourceExcerpt: string;
  taskKind: PageTaskKind;
  draftTargetId: string | null;
  recipientBinding: PageTaskValueBinding | null;
  actionTargetBinding: PageTaskValueBinding | null;
  /** Actual DOM-observed text, never an AGY proposal. Present only during an active task. */
  lastObservedDraftValue: string | null;
  /** GrantStore reference for a task-bound one-use action grant. */
  associatedGrantId: string | null;
};

export type NewPageTask = Omit<ActivePageTask, "taskId"> & { taskId?: string };

export type PageTaskCapture = {
  identity?: BrowserPageIdentityValue;
  items?: readonly BrowserContentItemValue[];
};

function sameIdentity(left: BrowserPageIdentityValue, right: BrowserPageIdentityValue): boolean {
  return left.captureId === right.captureId && left.captureRevision === right.captureRevision &&
    left.tabId === right.tabId && left.pageUrl === right.pageUrl;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function safePageTaskText(text: string, identity: BrowserPageIdentityValue, id: string, frameId: number): string | null {
  if (codePointLength(text) > MAX_PAGE_TASK_EXCERPT_CODE_POINTS || containsSensitivePageText(text)) return null;
  const block: BrowserContentBlock = { contentId: id, kind: "paragraph", text, identity, frameId };
  const projection = projectExplicitPageContentRequest({ type: "summary", identity }, [block], identity);
  const projected = projection?.blocks[0]?.text;
  return projected === text ? projected : null;
}

/** Filter one current visible item with the same privacy and instruction screen used for explicit summaries. */
export function filterPageTaskItem(
  value: unknown,
  expectedIdentity?: BrowserPageIdentityValue,
): { item: BrowserContentItemValue; excerpt: string } | null {
  const parsed = BrowserContentItem.safeParse(value);
  if (!parsed.success || parsed.data.frameId !== 0) return null;
  const item = parsed.data;
  if (expectedIdentity !== undefined && !sameIdentity(item.identity, expectedIdentity)) return null;
  const excerpt = safePageTaskText(item.text, item.identity, item.itemId, item.frameId);
  return excerpt === null ? null : { item, excerpt };
}

function validBinding(value: PageTaskValueBinding | null): boolean {
  return value === null || (
    typeof value === "object" && value !== null &&
    typeof value.fieldId === "string" && PAGE_TASK_TARGET_ID.test(value.fieldId) &&
    typeof value.valueHash === "string" && value.valueHash.length === MAX_PAGE_TASK_BINDING_HASH_LENGTH &&
    SHA256.test(value.valueHash)
  );
}

/** Return a bounded, cloned task value; invalid or unsafe values fail closed. */
export function createPageTask(input: NewPageTask): ActivePageTask | null {
  const identity = BrowserPageIdentity.safeParse(input.identity);
  if (!identity.success || typeof input.taskId !== "undefined" &&
      (typeof input.taskId !== "string" || input.taskId.length > MAX_PAGE_TASK_ID_LENGTH || !PAGE_TASK_ID.test(input.taskId))) return null;
  if (typeof input.itemId !== "string" || !PAGE_TASK_ID.test(input.itemId) || !Number.isInteger(input.frameId) || input.frameId !== 0) return null;
  if (!(new Set<PageTaskKind>(["read-item", "summarize-item", "question-item", "draft", "revise"])).has(input.taskKind)) return null;
  if (typeof input.sourceExcerpt !== "string" ||
      safePageTaskText(input.sourceExcerpt, identity.data, input.itemId, input.frameId) !== input.sourceExcerpt) return null;
  if (input.draftTargetId !== null && (typeof input.draftTargetId !== "string" || !PAGE_TASK_TARGET_ID.test(input.draftTargetId))) return null;
  if (!validBinding(input.recipientBinding) || !validBinding(input.actionTargetBinding)) return null;
  if (input.lastObservedDraftValue !== null && (
      typeof input.lastObservedDraftValue !== "string" ||
      codePointLength(input.lastObservedDraftValue) > MAX_PAGE_TASK_DRAFT_CODE_POINTS ||
      containsSensitivePageText(input.lastObservedDraftValue)
  )) return null;
  if (input.associatedGrantId !== null && (typeof input.associatedGrantId !== "string" || !PAGE_TASK_ID.test(input.associatedGrantId))) return null;

  return {
    taskId: input.taskId ?? newId(),
    identity: { ...identity.data },
    itemId: input.itemId,
    frameId: input.frameId,
    sourceExcerpt: input.sourceExcerpt,
    taskKind: input.taskKind,
    draftTargetId: input.draftTargetId,
    recipientBinding: input.recipientBinding === null ? null : { ...input.recipientBinding },
    actionTargetBinding: input.actionTargetBinding === null ? null : { ...input.actionTargetBinding },
    lastObservedDraftValue: input.lastObservedDraftValue,
    associatedGrantId: input.associatedGrantId,
  };
}

/** A task must still point at one current top-frame item from the Session's exact capture and tab. */
export function pageTaskMatchesCapture(
  task: ActivePageTask,
  capture: PageTaskCapture | null,
  tabId: number | null,
): boolean {
  const valid = createPageTask(task);
  if (valid === null || capture?.identity === undefined || tabId === null ||
      tabId !== valid.identity.tabId || !sameIdentity(capture.identity, valid.identity)) return false;
  const items = capture.items ?? [];
  const matches = items.filter((item) => item.itemId === valid.itemId);
  if (matches.length !== 1) return false;
  const filtered = filterPageTaskItem(matches[0], valid.identity);
  return filtered !== null && filtered.item.frameId === valid.frameId && filtered.excerpt === valid.sourceExcerpt;
}
