import { createHash } from "node:crypto";
import type { BrowserContentBlock, Field, FormModel } from "@blip/protocol";
import type { UngatedContext } from "../act/ungated";
import { executeObservedTextFieldWrite } from "../act/ungated";
import {
  containsPageActionInstruction,
  projectExplicitPageContentRequest,
  type PageContentProjection,
} from "../brain/agy/content-projection";
import { containsSensitivePageText } from "../brain/agy/privacy";
import { MAX_PAGE_TASK_DRAFT_CODE_POINTS, pageTaskMatchesCapture, type ActivePageTask, type PageTaskValueBinding } from "./task-state";

const MAX_SELECTOR_CODE_POINTS = 120;
const MAX_INSTRUCTION_CODE_POINTS = 500;
const MAX_PROPOSED_DRAFT_CODE_POINTS = 1_000;

export type DraftProseProvider = {
  draftPageText(projection: PageContentProjection): Promise<string>;
};

export type PageDraftContext = UngatedContext & { provider: DraftProseProvider };

export type ComposeDraftRequest = {
  taskId: string;
  /** User-spoken words used only by core to resolve the supported text field. */
  targetWords: string;
  /** User-spoken recipient/target words matched against the current accepted FormModel value. */
  recipientWords: string;
  /** Explicit user request for the prose itself; target selectors are supplied separately. */
  instruction: string;
};

export type ReviseDraftRequest = { taskId: string; instruction: string };

export type PageDraftResult =
  | { type: "draft-readback" | "revision-readback"; taskId: string; fieldLabel: string; text: string }
  | { type: "clarify"; message: string }
  | { type: "unavailable" };

type PageTaskSourceBinding = Pick<ActivePageTask, "taskId" | "identity" | "itemId" | "frameId" | "sourceExcerpt">;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizedTokens(value: string): string[] {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
}

function containsTokenSequence(text: string, query: string): boolean {
  const haystack = normalizedTokens(text);
  const needle = normalizedTokens(query);
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => token === haystack[index + offset])) return true;
  }
  return false;
}

function validSelector(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && codePointLength(value) <= MAX_SELECTOR_CODE_POINTS &&
    !containsSensitivePageText(value) && !containsPageActionInstruction(value);
}

function validInstruction(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && codePointLength(value) <= MAX_INSTRUCTION_CODE_POINTS &&
    !containsSensitivePageText(value) && !containsPageActionInstruction(value);
}

function supportedDraftField(field: Field): boolean {
  return !field.disabled && field.sensitive === "none" && (field.type === "text" || field.type === "textarea");
}

function safeRecipientField(field: Field): boolean {
  return !field.disabled && field.sensitive === "none" && field.type !== "password" &&
    field.type !== "file" && field.type !== "unknown" && field.value !== null && field.value.trim() !== "" &&
    !containsSensitivePageText(field.value) && !containsPageActionInstruction(field.value);
}

function resolveDraftField(model: FormModel, targetWords: string): Field[] {
  return model.fields.filter((field) => supportedDraftField(field) &&
    [field.label, field.group ?? "", field.hint ?? ""].some((text) => containsTokenSequence(text, targetWords)));
}

function bindingFor(field: Field): PageTaskValueBinding | null {
  if (!safeRecipientField(field)) return null;
  return {
    fieldId: field.id,
    valueHash: createHash("sha256").update(field.value!, "utf8").digest("hex"),
  };
}

function resolveRecipientBinding(model: FormModel, recipientWords: string, excludedFieldId: string): PageTaskValueBinding[] {
  return model.fields
    .filter((field) => field.id !== excludedFieldId && safeRecipientField(field) && containsTokenSequence(field.value!, recipientWords))
    .map(bindingFor)
    .filter((binding): binding is PageTaskValueBinding => binding !== null);
}

function fieldForBinding(model: FormModel, binding: PageTaskValueBinding): Field | null {
  const field = model.fields.find((candidate) => candidate.id === binding.fieldId);
  const current = field === undefined ? null : bindingFor(field);
  return current !== null && current.fieldId === binding.fieldId && current.valueHash === binding.valueHash ? field! : null;
}

function activeTask(session: PageDraftContext["session"], taskId: string): ActivePageTask | null {
  const task = session.activePageTask;
  if (task === null || task.taskId !== taskId || !session.extensionConnected ||
      !pageTaskMatchesCapture(task, session.browserCapture, session.tabId)) return null;
  return task;
}

function bindTaskSource(task: ActivePageTask): PageTaskSourceBinding {
  return {
    taskId: task.taskId,
    identity: { ...task.identity },
    itemId: task.itemId,
    frameId: task.frameId,
    sourceExcerpt: task.sourceExcerpt,
  };
}

function matchesTaskSource(task: ActivePageTask, expected: PageTaskSourceBinding): boolean {
  return task.taskId === expected.taskId && task.identity.captureId === expected.identity.captureId &&
    task.identity.captureRevision === expected.identity.captureRevision && task.identity.tabId === expected.identity.tabId &&
    task.identity.pageUrl === expected.identity.pageUrl && task.itemId === expected.itemId &&
    task.frameId === expected.frameId && task.sourceExcerpt === expected.sourceExcerpt;
}

function currentModelForTask(context: PageDraftContext, taskId: string): FormModel | null {
  const task = activeTask(context.session, taskId);
  const model = context.session.model;
  return task === null || model === null || context.session.stale || context.session.tabId !== task.identity.tabId ||
    model.url !== task.identity.pageUrl ? null : model;
}

async function refreshForTask(context: PageDraftContext, taskId: string): Promise<FormModel | null> {
  if (!context.session.extensionConnected) return null;
  try {
    const result = await context.refresher.request("refresh");
    return result.ok ? currentModelForTask(context, taskId) : null;
  } catch {
    return null;
  }
}

function requestProjection(
  task: ActivePageTask,
  type: "draft" | "revision",
  instruction: string,
  observedDraft?: string,
): PageContentProjection | null {
  const source: BrowserContentBlock = {
    contentId: task.itemId,
    kind: "paragraph",
    text: task.sourceExcerpt,
    identity: task.identity,
    frameId: task.frameId,
  };
  return type === "draft"
    ? projectExplicitPageContentRequest({ type, identity: task.identity, instruction }, [source], task.identity)
    : observedDraft === undefined
      ? null
      : projectExplicitPageContentRequest({ type, identity: task.identity, instruction, observedDraft }, [source], task.identity);
}

function safeProposal(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && codePointLength(value) <= MAX_PROPOSED_DRAFT_CODE_POINTS &&
    !containsSensitivePageText(value) && !containsPageActionInstruction(value);
}

function clearTaskIfSame(context: PageDraftContext, taskId: string): void {
  if (context.session.activePageTask?.taskId === taskId) context.session.clearPageTask();
}

function sameRecipient(model: FormModel, binding: PageTaskValueBinding): boolean {
  return fieldForBinding(model, binding) !== null;
}

function setObservedDraft(
  context: PageDraftContext,
  expectedSource: PageTaskSourceBinding,
  field: Field,
  binding: PageTaskValueBinding,
  taskKind: "draft" | "revise",
  expectedPreviousDraftValue: string | null,
  observedValue: string,
): PageDraftResult {
  if (!safeProposal(observedValue) || codePointLength(observedValue) > MAX_PAGE_TASK_DRAFT_CODE_POINTS) {
    clearTaskIfSame(context, expectedSource.taskId);
    return { type: "clarify", message: "The current field value could not be safely read back. Please review the page and start again." };
  }
  const current = activeTask(context.session, expectedSource.taskId);
  const model = currentModelForTask(context, expectedSource.taskId);
  const observedField = model?.fields.find((candidate) => candidate.id === field.id);
  if (current === null || model === null || observedField === undefined || observedField.value !== observedValue ||
      !matchesTaskSource(current, expectedSource) ||
      (taskKind === "draft" ? current.taskKind !== "draft" : current.taskKind !== "draft" && current.taskKind !== "revise") ||
      current.draftTargetId !== field.id || current.recipientBinding?.fieldId !== binding.fieldId ||
      current.recipientBinding.valueHash !== binding.valueHash || current.lastObservedDraftValue !== expectedPreviousDraftValue ||
      !sameRecipient(model, binding)) {
    clearTaskIfSame(context, expectedSource.taskId);
    return { type: "clarify", message: "The page or recipient changed while I was updating the draft. Please start again." };
  }
  const updated: ActivePageTask = {
    ...current,
    taskKind,
    draftTargetId: field.id,
    recipientBinding: binding,
    actionTargetBinding: null,
    lastObservedDraftValue: observedValue,
    associatedGrantId: null,
  };
  if (!context.session.setActivePageTask(updated)) {
    return { type: "clarify", message: "The page changed before I could retain the observed draft. Please start again." };
  }
  return { type: taskKind === "draft" ? "draft-readback" : "revision-readback", taskId: expectedSource.taskId, fieldLabel: field.label, text: observedValue };
}

function validateBoundPage(
  context: PageDraftContext,
  expectedSource: PageTaskSourceBinding,
  flow: "draft" | "revision",
  targetId: string,
  binding: PageTaskValueBinding,
  expectedDraftValue: string | null,
): boolean {
  const task = activeTask(context.session, expectedSource.taskId);
  if (task === null || !matchesTaskSource(task, expectedSource) ||
      (flow === "draft" ? task.taskKind !== "draft" : task.taskKind !== "draft" && task.taskKind !== "revise") ||
      task.draftTargetId !== targetId || task.recipientBinding?.fieldId !== binding.fieldId ||
      task.recipientBinding.valueHash !== binding.valueHash) return false;
  if (task.lastObservedDraftValue !== expectedDraftValue) return false;
  const model = currentModelForTask(context, expectedSource.taskId);
  if (model === null || !sameRecipient(model, binding)) return false;
  const target = model.fields.find((field) => field.id === targetId);
  return target !== undefined && supportedDraftField(target) &&
    (expectedDraftValue === null ? target.value === null || target.value === "" : target.value === expectedDraftValue);
}

/** Compose only after core resolves both a visible text field and an explicit current recipient/target. */
export async function composePageDraft(context: PageDraftContext, request: ComposeDraftRequest): Promise<PageDraftResult> {
  if (!validSelector(request.targetWords) || !validSelector(request.recipientWords) || !validInstruction(request.instruction)) {
    return { type: "clarify", message: "Name the draft field, the visible recipient or target, and a short request for the proposed text." };
  }
  const initialTask = activeTask(context.session, request.taskId);
  if (initialTask === null || initialTask.taskKind !== "draft" || initialTask.draftTargetId !== null ||
      initialTask.lastObservedDraftValue !== null) {
    return { type: "clarify", message: "There is no current undrafted page task. Select a visible item and start a draft first." };
  }
  const model = await refreshForTask(context, request.taskId);
  const task = activeTask(context.session, request.taskId);
  if (model === null || task === null) return { type: "clarify", message: "The current page changed. Refresh the page item and start again." };

  const fields = resolveDraftField(model, request.targetWords);
  if (fields.length !== 1) return { type: "clarify", message: fields.length === 0
    ? "I couldn't find one supported text field matching those words. Please name a visible text field."
    : "More than one supported text field matches. Please name one field more specifically." };
  const field = fields[0]!;
  if (field.value !== null && field.value !== "") {
    return { type: "clarify", message: "That field already has text. Ask me to revise the current draft instead of replacing it." };
  }
  const recipientBindings = resolveRecipientBinding(model, request.recipientWords, field.id);
  if (recipientBindings.length !== 1) return { type: "clarify", message: recipientBindings.length === 0
    ? "I couldn't match that recipient or target to one current visible field value. Please clarify it."
    : "More than one current field value matches that recipient or target. Please clarify it." };
  const binding = recipientBindings[0]!;
  const boundTask: ActivePageTask = {
    ...task,
    taskKind: "draft",
    draftTargetId: field.id,
    recipientBinding: binding,
    actionTargetBinding: null,
    lastObservedDraftValue: null,
    associatedGrantId: null,
  };
  if (!context.session.setActivePageTask(boundTask)) return { type: "clarify", message: "The page changed while I was selecting the draft field. Please start again." };
  const currentTask = activeTask(context.session, request.taskId);
  const projection = currentTask === null ? null : requestProjection(currentTask, "draft", request.instruction);
  if (currentTask === null || projection === null) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "I couldn't safely prepare the selected source for drafting." };
  }
  const sourceBinding = bindTaskSource(currentTask);

  let proposal: string;
  try {
    proposal = await context.provider.draftPageText(projection);
  } catch {
    return { type: "unavailable" };
  }
  if (!safeProposal(proposal)) return { type: "clarify", message: "I couldn't safely validate the proposed draft." };

  const beforeWrite = await refreshForTask(context, request.taskId);
  const current = activeTask(context.session, request.taskId);
  if (beforeWrite === null || current === null || current.draftTargetId !== field.id ||
      current.recipientBinding?.fieldId !== binding.fieldId || current.recipientBinding.valueHash !== binding.valueHash ||
      !validateBoundPage(context, sourceBinding, "draft", field.id, binding, null)) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "The page, recipient, or draft field changed while I was composing. Please start again." };
  }

  const write = await executeObservedTextFieldWrite(
    context,
    field.id,
    proposal,
    () => validateBoundPage(context, sourceBinding, "draft", field.id, binding, null) &&
      context.session.activePageTask?.taskId === request.taskId,
  );
  if (!write.ok) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "I couldn't verify the draft in the current page field. Please review the page and try again." };
  }
  return setObservedDraft(context, sourceBinding, field, binding, "draft", null, write.observedValue);
}

/** Revise from the actual current field value and write back only to the same bound text field. */
export async function revisePageDraft(context: PageDraftContext, request: ReviseDraftRequest): Promise<PageDraftResult> {
  if (!validInstruction(request.instruction)) {
    return { type: "clarify", message: "Say a short edit instruction without private values or page actions." };
  }
  const initialTask = activeTask(context.session, request.taskId);
  if (initialTask === null || (initialTask.taskKind !== "draft" && initialTask.taskKind !== "revise") ||
      initialTask.draftTargetId === null || initialTask.lastObservedDraftValue === null || initialTask.recipientBinding === null) {
    return { type: "clarify", message: "There isn't a current observed draft to revise." };
  }
  const model = await refreshForTask(context, request.taskId);
  const task = activeTask(context.session, request.taskId);
  if (model === null || task === null || task.draftTargetId === null || task.recipientBinding === null ||
      task.lastObservedDraftValue === null) return { type: "clarify", message: "The page changed. Please start the draft task again." };

  const field = model.fields.find((candidate) => candidate.id === task.draftTargetId);
  const binding = task.recipientBinding;
  const observedDraft = task.lastObservedDraftValue;
  const sourceBinding = bindTaskSource(task);
  if (field === undefined || !supportedDraftField(field) || field.value !== observedDraft || !sameRecipient(model, binding)) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "The current draft or recipient changed. Read the current page and start again." };
  }
  const projection = requestProjection(task, "revision", request.instruction, observedDraft);
  if (projection === null) return { type: "clarify", message: "I couldn't safely prepare the current draft for revision." };

  let proposal: string;
  try {
    proposal = await context.provider.draftPageText(projection);
  } catch {
    return { type: "unavailable" };
  }
  if (!safeProposal(proposal)) return { type: "clarify", message: "I couldn't safely validate the revised draft." };

  const beforeWrite = await refreshForTask(context, request.taskId);
  const current = activeTask(context.session, request.taskId);
  if (beforeWrite === null || current === null || current.draftTargetId !== field.id ||
      current.lastObservedDraftValue !== observedDraft || current.recipientBinding?.fieldId !== binding.fieldId ||
      current.recipientBinding.valueHash !== binding.valueHash ||
      !validateBoundPage(context, sourceBinding, "revision", field.id, binding, observedDraft)) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "The page, recipient, or draft changed while I was composing the revision." };
  }

  const write = await executeObservedTextFieldWrite(
    context,
    field.id,
    proposal,
    () => validateBoundPage(context, sourceBinding, "revision", field.id, binding, observedDraft) &&
      context.session.activePageTask?.taskId === request.taskId,
  );
  if (!write.ok) {
    clearTaskIfSame(context, request.taskId);
    return { type: "clarify", message: "I couldn't verify the revised draft in the current page field." };
  }
  return setObservedDraft(context, sourceBinding, field, binding, "revise", observedDraft, write.observedValue);
}
