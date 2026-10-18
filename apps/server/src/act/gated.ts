import { createHash } from "node:crypto";
import { isGatedKind, newId, type ActResult, type Intent, type SpeakDonePayload } from "@blip/protocol";
import { formDigest, requiredEmpty } from "@blip/dialogue";
import { matchesConfirmationPhrase, matchesExactConfirmationPhrase, phraseForKind } from "@blip/policy/confirmation";
import type { Hub } from "../hub/hub";
import { createGatePort, type GatePort } from "./gate-port";
import { log } from "../log";
import type { Refresher } from "../session/refresh";
import type { PendingGatedAction, Session } from "../session/session";
import { formatResultSpeech, interpretResult } from "../results/interpret";
import { containsSensitivePageText } from "../brain/agy/privacy";
import { containsPageActionInstruction } from "../brain/agy/content-projection";
import { MAX_PAGE_TASK_DRAFT_CODE_POINTS, pageTaskMatchesCapture } from "../browser/task-state";
import { grantBindingsMatch, type GrantBinding, type PageTaskSendBinding } from "./grants";

const MAX_READBACK_CHARS = 20_000;
const COOLDOWN_MS = 1_000;
const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
const MSG_READ_FAILED = "I couldn't safely read the current form, so nothing was submitted.";
const MSG_NOT_GATED = "That action is not a gated page action, so nothing was submitted.";
const MSG_ACTION_MISSING = "I couldn't find that action on the current page, so nothing was submitted.";
const MSG_READBACK_TOO_LARGE = "This form is too long to read back safely, so nothing was submitted.";
const MSG_CONFIRMATION_REQUIRED = "That confirmation was not accepted. The action was not carried out; please ask me to read the form back again.";
const MSG_PAGE_CHANGED = "The page changed after the read-back. Nothing was submitted; please ask me to read the form back again.";
const MSG_VALUE_CHANGED = "A field changed after the read-back. Nothing was submitted; please ask me to read the form back again.";
const MSG_EXTENSION_REFUSED = "The page refused the action. It was not carried out; please ask me to read the form back again.";
const MSG_DISPATCH_UNKNOWN = "I couldn't verify what the page did. I won't retry; please check the page before trying again.";
const MSG_RESULT_UNVERIFIED = "I couldn't verify the page outcome.";
const MSG_GRANT_EXPIRED = "The confirmation expired. Nothing was carried out; please ask me to read the form back again.";
const MSG_DRAFT_TASK_UNAVAILABLE = "I couldn't verify one current draft, recipient, and visible send action, so nothing was sent. Please review the page and try again.";

function isAffirmativeEmailReply(text: string): boolean {
  const normalized = text.toLocaleLowerCase().replace(/[\p{P}]+/gu, " ").replace(/\s+/gu, " ").trim();
  return ["yes", "yeah", "yep", "sure", "okay", "ok", "go ahead", "send it", "yes please", "yes send it"].includes(normalized);
}

function isNegativeEmailReply(text: string): boolean {
  const normalized = text.toLocaleLowerCase().replace(/[\p{P}]+/gu, " ").replace(/\s+/gu, " ").trim();
  return ["no", "nope", "no thanks", "no thank you", "keep it as a draft", "leave it as a draft"].includes(normalized);
}

export type GatedContext = {
  hub: Hub;
  /** Production supplies the explicit dispatch boundary; tests may derive it from their Hub. */
  gatePort?: GatePort;
  session: Session;
  refresher: Refresher;
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
};

export type GatedIntent = Extract<Intent, { type: "request_action" | "click_safe" }>;
export type GatedCommand = GatedIntent | {
  /** Internal voice adapter command. The Executor still owns read-back and grant creation. */
  type: "voice-arm";
  actionId: string;
  expectedKind?: NonNullable<Session["model"]>["actions"][number]["kind"];
} | {
  /** Core-only binding request for the active page draft; never exposed as a model Intent. */
  type: "draft-send";
} | {
  type: "confirmation";
  text: string;
  /** Source is supplied by direct utterances and new confirm.redeem clients. */
  source?: "voice" | "typed";
  /** Present for the reducer protocol; legacy typed/recognized utterances use the server session. */
  grantId?: string;
  speakId?: string;
  utteranceId?: string;
};

function audit(outcome: "allowed" | "refused", reason: string, kind?: string, targetId?: string): void {
  // The logger deliberately accepts only bounded protocol metadata; no URL, label, value, phrase, or
  // transcript is included in the local audit line.
  log(outcome === "allowed" ? "info" : "warn", {
    msg: `gated action ${outcome}`,
    ...(targetId !== undefined ? { id: targetId } : {}),
    ...(kind !== undefined ? { type: kind } : {}),
    code: reason,
  });
}

function speak(ctx: GatedContext, text: string, category: "answer" | "error" | "confirm-prompt", speakId = newId()): string | null {
  if (!ctx.hub.send("voice", "speak", { speakId, text, category, interrupt: category === "confirm-prompt" })) return null;
  ctx.session.trackSpeech(speakId, category);
  ctx.session.lastSpoken = text;
  return speakId;
}

function spokenText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}

function buildReadback(model: NonNullable<Session["model"]>, targetLabel: string, kind: string, phrase: string): string {
  const page = spokenText(model.title) || "Untitled page";
  const form = model.step === undefined ? "" : ` ${spokenText(model.step)}.`;
  const action = spokenText(targetLabel) || phrase;
  const fields = model.fields
    .map((field, inputOrder) => ({ field, inputOrder }))
    .sort((left, right) => left.field.order - right.field.order || left.inputOrder - right.inputOrder)
    .map(({ field }, index) => {
      const label = spokenText(field.label) || `Unlabeled field ${index + 1}`;
      if (field.sensitive !== "none") {
        return `${index + 1}. ${label} is present and ${field.hasValue ? "has a value" : "has no value"}.`;
      }

      const value = field.type === "checkbox"
        ? field.hasValue ? "checked" : "unchecked"
        : !field.hasValue ? "empty"
          : field.value === null ? "current value unavailable" : spokenText(field.value) || "empty";
      const requiredEmpty = field.required && !field.hasValue ? " Required field is empty." : "";
      return `${index + 1}. ${label}: ${value}.${requiredEmpty}`;
    });
  const fieldReadback = fields.length === 0 ? "There are no form fields." : fields.join(" ");
  return `Page: ${page}.${form} Requested action: ${kind}, ${action}. Current form read-back: ${fieldReadback} To continue, say: ${phrase}.`;
}

type WireClearReason = "executed" | "cancelled" | "expired" | "page-changed" | "value-changed";
export type GatedClearReason = Exclude<WireClearReason, "executed">;

function finishPending(
  ctx: GatedContext,
  pending: PendingGatedAction,
  reason: string,
  options: { outcome?: "allowed" | "refused"; wireReason?: WireClearReason; reply?: string } = {},
): void {
  if (ctx.session.pendingGatedAction === pending) ctx.session.clearPendingGatedAction();
  else if (pending.grantId !== undefined) ctx.session.grants.clear(pending.grantId);
  const pageTaskId = pending.binding.pageTask?.taskId;
  if (pageTaskId !== undefined && ctx.session.activePageTask?.taskId === pageTaskId) ctx.session.clearPageTask();
  if (pending.grantId !== undefined && options.wireReason !== undefined) {
    ctx.hub.send("voice", "confirm.cleared", { grantId: pending.grantId, reason: options.wireReason });
  }
  ctx.session.dialogue = ctx.session.model !== null && ctx.session.extensionConnected ? "ready" : "no-page";
  audit(options.outcome ?? "refused", reason, pending.kind, pending.targetId);
  if (options.reply !== undefined) speak(ctx, options.reply, "error");
  ctx.hub.pushState();
}

/** Clear pending confirmation when the tab or extension changes outside the Executor. */
export function invalidateGatedAction(
  ctx: GatedContext,
  reason: "cancelled" | "page-changed",
  code: string = reason,
): void {
  const pending = ctx.session.pendingGatedAction;
  if (pending === null) return;
  finishPending(ctx, pending, code, { wireReason: reason });
}

/** Clear only the exact grant currently owned by the voice reducer. */
export function clearVoiceGatedAction(
  ctx: GatedContext,
  grantId: string,
  reason: GatedClearReason,
): boolean {
  const pending = ctx.session.pendingGatedAction;
  if (pending === null || pending.grantId !== grantId) return false;
  finishPending(ctx, pending, reason, { wireReason: reason });
  return true;
}

function safeBinding(
  session: Session,
  targetId: string,
  kind: NonNullable<Session["model"]>["actions"][number]["kind"],
  pageTask?: PageTaskSendBinding,
): GrantBinding {
  const model = session.model!;
  return {
    targetId,
    kind,
    model: {
      url: model.url,
      snapshotVersion: model.snapshotVersion,
      fields: model.fields.map((field) => ({
        ...field,
        // The baseline already enforces this, but keep the no-sensitive-value invariant at the
        // Executor boundary too, even if a future model builder regresses.
        value: field.sensitive === "none" ? field.value : null,
      })),
    },
    ...(pageTask === undefined ? {} : { pageTask }),
  };
}

function draftTaskSendBinding(session: Session, speakId: string, expectedGrantId: string | null = null): {
  target: NonNullable<Session["model"]>["actions"][number];
  binding: GrantBinding;
  draft: string;
  recipientLabel: string;
  recipientValue: string;
} | null {
  const model = session.model;
  const task = session.activePageTask;
  const capture = session.browserCapture;
  if (
    model === null || task === null || session.tabId === null || session.stale ||
    (task.taskKind !== "draft" && task.taskKind !== "revise") || task.associatedGrantId !== expectedGrantId ||
    task.draftTargetId === null || task.lastObservedDraftValue === null || task.recipientBinding === null ||
    task.identity.tabId !== session.tabId || task.identity.pageUrl !== model.url ||
    !pageTaskMatchesCapture(task, capture, session.tabId)
  ) return null;

  const recipientBinding = task.recipientBinding;
  const draftFields = model.fields.filter((field) => field.id === task.draftTargetId);
  const recipientFields = model.fields.filter((field) => field.id === recipientBinding.fieldId);
  const draftField = draftFields.length === 1 ? draftFields[0]! : null;
  const recipientField = recipientFields.length === 1 ? recipientFields[0]! : null;
  const draft = task.lastObservedDraftValue;
  if (
    draftField === null || draftField.disabled || draftField.sensitive !== "none" ||
    (draftField.type !== "text" && draftField.type !== "textarea") || draftField.value !== draft ||
    !draftField.hasValue || Array.from(draft).length > MAX_PAGE_TASK_DRAFT_CODE_POINTS ||
    containsSensitivePageText(draft) || containsPageActionInstruction(draft) || draft.trim() === "" ||
    recipientField === null || recipientField.disabled || recipientField.sensitive !== "none" ||
    recipientField.type === "password" || recipientField.type === "file" || recipientField.type === "unknown" ||
    recipientField.id === draftField.id || !recipientField.hasValue || recipientField.value === null ||
    recipientField.value.trim() === "" || containsSensitivePageText(recipientField.value) ||
    containsPageActionInstruction(recipientField.value) ||
    createHash("sha256").update(recipientField.value, "utf8").digest("hex") !== recipientBinding.valueHash
  ) return null;

  const sendActions = model.actions.filter((action) => action.kind === "send");
  if (sendActions.length !== 1) return null;
  const target = sendActions[0]!;
  const pageTask: PageTaskSendBinding = {
    taskId: task.taskId,
    draftHash: createHash("sha256").update(draft, "utf8").digest("hex"),
    recipientFieldId: recipientField.id,
    recipientValueHash: recipientBinding.valueHash,
    sourceItemId: task.itemId,
    sourceIdentity: { ...task.identity },
    tabId: session.tabId,
    operation: "send",
    targetId: target.id,
    targetKind: "send",
    speakId,
  };
  return {
    target,
    binding: safeBinding(session, target.id, "send", pageTask),
    draft,
    recipientLabel: spokenText(recipientField.label) || "recipient",
    recipientValue: spokenText(recipientField.value),
  };
}

export type DialogueReadbackArmRequest = {
  actionId: string;
  kind: string;
  title: string;
  digest: string;
  speakId: string;
};

export type DialogueReadbackArmResult =
  | { ok: true; grantId: string; speakId: string; phrase: string; expiresAt: number }
  | { ok: false; reason: string };

/**
 * Arm the core grant for a completed, server-tracked dialogue read-back. The reducer supplies
 * correlation hints; core refreshes and compares them to its current model before minting a grant.
 */
export async function armDialogueReadback(
  ctx: GatedContext,
  request: DialogueReadbackArmRequest,
): Promise<DialogueReadbackArmResult> {
  const { session } = ctx;
  const refuse = (reason: string): DialogueReadbackArmResult => {
    audit("refused", reason, request.kind, request.actionId);
    return { ok: false, reason };
  };
  invalidateGatedAction(ctx, "cancelled", "superseded-by-new-action");

  if (!session.extensionConnected) return refuse("extension-disconnected");
  const refreshed = await ctx.refresher.request("refresh");
  if (!refreshed.ok || session.model === null || session.stale || session.tabId === null) {
    return refuse("read-failed");
  }

  const model = session.model;
  const target = model.actions.find((candidate) => candidate.id === request.actionId);
  if (target === undefined || !isGatedKind(target.kind) || target.kind !== request.kind || phraseForKind(target.kind) === undefined) {
    return refuse("not-gated");
  }
  if (model.title !== request.title || formDigest(model) !== request.digest || requiredEmpty(model).length > 0) {
    return refuse("value-changed");
  }

  const speech = session.speechCompletion(request.speakId);
  if (speech === null || speech.category !== "readback" || speech.interrupted) {
    return refuse("untracked-readback");
  }

  let now: number;
  try {
    now = (ctx.clock ?? Date.now)();
  } catch {
    now = Number.NaN;
  }
  if (!Number.isFinite(now) || speech.completedAt > now || now - speech.completedAt > 30_000) {
    return refuse("readback-expired");
  }

  const phrase = phraseForKind(target.kind)!;
  const binding = safeBinding(session, target.id, target.kind);
  const grant = session.grants.arm(binding);
  if (grant === null) return refuse("grant-unavailable");

  session.pendingGatedAction = {
    targetId: target.id,
    kind: target.kind,
    actionLabel: spokenText(target.label).slice(0, 120),
    phrase,
    tabId: session.tabId,
    url: model.url,
    snapshotVersion: model.snapshotVersion,
    speakId: request.speakId,
    speechCompletedAt: speech.completedAt,
    readyAt: speech.completedAt + COOLDOWN_MS,
    binding,
    grantId: grant.grantId,
    expiresAt: grant.expiresAt,
  };
  return {
    ok: true,
    grantId: grant.grantId,
    speakId: request.speakId,
    phrase,
    expiresAt: grant.expiresAt,
  };
}

async function beginDraftSend(ctx: GatedContext): Promise<void> {
  const { session } = ctx;
  invalidateGatedAction(ctx, "cancelled", "superseded-by-draft-send");
  if (!session.extensionConnected) {
    audit("refused", "extension-disconnected", "send");
    speak(ctx, MSG_NO_EXTENSION, "error");
    return;
  }
  if (session.outputMode !== "agent-voice") {
    audit("refused", "voice-completion-unavailable", "send");
    speak(ctx, MSG_DRAFT_TASK_UNAVAILABLE, "error");
    return;
  }

  const refreshed = await ctx.refresher.request("refresh");
  if (!refreshed.ok || session.model === null || session.stale || session.tabId === null) {
    audit("refused", refreshed.ok ? "stale-snapshot" : refreshed.kind, "send");
    speak(ctx, MSG_READ_FAILED, "error");
    return;
  }

  const phrase = phraseForKind("email-message-send");
  const speakId = newId();
  const resolved = phrase === undefined ? null : draftTaskSendBinding(session, speakId);
  if (resolved === null || phrase === undefined) {
    audit("refused", "draft-task-binding-unavailable", "send");
    speak(ctx, MSG_DRAFT_TASK_UNAVAILABLE, "error");
    return;
  }

  const actionLabel = spokenText(resolved.target.label).slice(0, 120) || "Send message";
  const text = `Recipient: ${resolved.recipientLabel}, ${resolved.recipientValue}. Current message draft: ${resolved.draft} Requested action: ${actionLabel}. Would you like me to send it? Say yes to send, or no to keep it as a draft.`;
  if (text.length > MAX_READBACK_CHARS) {
    audit("refused", "readback-too-large", "send", resolved.target.id);
    speak(ctx, MSG_READBACK_TOO_LARGE, "error");
    return;
  }

  const pending: PendingGatedAction = {
    targetId: resolved.target.id,
    kind: "send",
    actionLabel,
    phrase,
    tabId: session.tabId,
    url: session.model.url,
    snapshotVersion: session.model.snapshotVersion,
    speakId,
    speechCompletedAt: null,
    readyAt: null,
    binding: resolved.binding,
  };
  session.pendingGatedAction = pending;
  session.dialogue = "reading-back";
  if (speak(ctx, text, "confirm-prompt", speakId) === null) {
    session.clearPendingGatedAction();
    audit("refused", "voice-disconnected", "send", resolved.target.id);
    return;
  }
  ctx.hub.pushState();
}

/** The sole server path from a gated request or voice-role confirmation to dispatch. */
export async function executeGatedAction(ctx: GatedContext, command: GatedCommand): Promise<void> {
  if (command.type === "confirmation") return acceptConfirmation(ctx, command);
  if (command.type === "draft-send") return beginDraftSend(ctx);

  const { session } = ctx;
  const clock = ctx.clock ?? Date.now;
  invalidateGatedAction(ctx, "cancelled", "superseded-by-new-action");

  if (!session.extensionConnected) {
    audit("refused", "extension-disconnected");
    speak(ctx, MSG_NO_EXTENSION, "error");
    return;
  }

  const refreshed = await ctx.refresher.request("refresh");
  if (!refreshed.ok || session.model === null || session.stale || session.tabId === null) {
    audit("refused", refreshed.ok ? "stale-snapshot" : refreshed.kind);
    speak(ctx, MSG_READ_FAILED, "error");
    return;
  }

  const model = session.model;
  const target = model.actions.find((candidate) => candidate.id === command.actionId);
  if (target === undefined) {
    audit("refused", "target-not-found", undefined, command.actionId);
    speak(ctx, MSG_ACTION_MISSING, "error");
    return;
  }
  if (command.type === "voice-arm" && command.expectedKind !== undefined && target.kind !== command.expectedKind) {
    audit("refused", "kind-mismatch", target.kind, target.id);
    speak(ctx, MSG_NOT_GATED, "error");
    return;
  }
  if (!isGatedKind(target.kind) || phraseForKind(target.kind) === undefined) {
    audit("refused", "kind-not-gated", target.kind, target.id);
    speak(ctx, MSG_NOT_GATED, "error");
    return;
  }

  let now: number;
  try {
    now = clock();
  } catch {
    now = Number.NaN;
  }
  if (!Number.isFinite(now)) {
    audit("refused", "clock-unavailable", target.kind, target.id);
    speak(ctx, MSG_READ_FAILED, "error");
    return;
  }

  const phrase = phraseForKind(target.kind)!;
  const text = buildReadback(model, target.label, target.kind, phrase);
  if (text.length > MAX_READBACK_CHARS) {
    audit("refused", "readback-too-large", target.kind, target.id);
    speak(ctx, MSG_READBACK_TOO_LARGE, "error");
    return;
  }

  const speakId = newId();
  const pending: PendingGatedAction = {
    targetId: target.id,
    kind: target.kind,
    actionLabel: spokenText(target.label).slice(0, 120),
    phrase,
    tabId: session.tabId,
    url: model.url,
    snapshotVersion: model.snapshotVersion,
    speakId,
    speechCompletedAt: null,
    readyAt: null,
    binding: safeBinding(session, target.id, target.kind),
  };
  session.pendingGatedAction = pending;
  session.dialogue = "reading-back";
  if (speak(ctx, text, "confirm-prompt", speakId) === null) {
    session.clearPendingGatedAction();
    audit("refused", "voice-disconnected", target.kind, target.id);
    return;
  }
  ctx.hub.pushState();
}

function armAfterCooldown(ctx: GatedContext, pending: PendingGatedAction): void {
  if (ctx.session.pendingGatedAction !== pending) return;
  const clock = ctx.clock ?? Date.now;
  let now: number;
  try {
    now = clock();
  } catch {
    now = Number.NaN;
  }
  if (!Number.isFinite(now)) {
    finishPending(ctx, pending, "clock-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    return;
  }
  const model = ctx.session.model;
  if (!ctx.session.extensionConnected || model === null || ctx.session.stale) {
    finishPending(ctx, pending, "extension-disconnected", { wireReason: "cancelled", reply: MSG_NO_EXTENSION });
    return;
  }
  if (
    ctx.session.tabId !== pending.tabId ||
    model.url !== pending.url ||
    model.snapshotVersion !== pending.snapshotVersion ||
    !model.actions.some((action) => action.id === pending.targetId && action.kind === pending.kind)
  ) {
    finishPending(ctx, pending, "page-changed", { wireReason: "page-changed", reply: MSG_PAGE_CHANGED });
    return;
  }
  if (pending.readyAt === null || now < pending.readyAt) {
    const delay = pending.readyAt === null ? COOLDOWN_MS : Math.max(1, pending.readyAt - now);
    const schedule = ctx.schedule ?? ((callback: () => void, wait: number) => setTimeout(callback, wait));
    schedule(() => armAfterCooldown(ctx, pending), delay);
    return;
  }

  let liveBinding = pending.binding;
  const pageTask = pending.binding.pageTask;
  if (pageTask !== undefined) {
    const current = draftTaskSendBinding(ctx.session, pageTask.speakId);
    if (
      current === null || current.target.id !== pending.targetId ||
      !grantBindingsMatch(pending.binding, current.binding)
    ) {
      finishPending(ctx, pending, "value-changed", { wireReason: "value-changed", reply: MSG_VALUE_CHANGED });
      return;
    }
    liveBinding = current.binding;
  }

  const grant = ctx.session.grants.arm(liveBinding);
  if (grant === null) {
    finishPending(ctx, pending, "grant-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    return;
  }
  pending.grantId = grant.grantId;
  pending.expiresAt = grant.expiresAt;
  if (pageTask !== undefined && !ctx.session.associatePageTaskGrant(grant.grantId)) {
    ctx.session.grants.clear(grant.grantId);
    finishPending(ctx, pending, "page-task-grant-association-failed", { wireReason: "page-changed", reply: MSG_PAGE_CHANGED });
    return;
  }
  ctx.session.dialogue = "awaiting-confirm";
  if (!ctx.hub.send("voice", "confirm.armed", {
    grantId: grant.grantId,
    speakId: pending.speakId,
    phrase: pending.phrase,
    kind: pending.kind,
    actionLabel: pending.actionLabel,
    expiresAt: grant.expiresAt,
  })) {
    finishPending(ctx, pending, "voice-disconnected", { wireReason: "cancelled" });
    return;
  }
  scheduleGrantExpiry(ctx, pending, grant.expiresAt);
  ctx.hub.pushState();
}

function scheduleGrantExpiry(ctx: GatedContext, pending: PendingGatedAction, expiresAt: number): void {
  const clock = ctx.clock ?? Date.now;
  const schedule = ctx.schedule ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  let now: number;
  try {
    now = clock();
  } catch {
    now = Number.NaN;
  }
  if (!Number.isFinite(now)) {
    finishPending(ctx, pending, "clock-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    return;
  }
  schedule(() => {
    if (ctx.session.pendingGatedAction !== pending || pending.expiresAt !== expiresAt) return;
    let expiredAt: number;
    try {
      expiredAt = clock();
    } catch {
      expiredAt = Number.NaN;
    }
    if (!Number.isFinite(expiredAt)) {
      finishPending(ctx, pending, "clock-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    } else if (expiredAt >= expiresAt) {
      finishPending(ctx, pending, "grant-expired", { wireReason: "expired", reply: MSG_GRANT_EXPIRED });
    } else {
      scheduleGrantExpiry(ctx, pending, expiresAt);
    }
  }, Math.max(1, expiresAt - now));
}

/** Track only the final read-back speakId; an interruption cancels the pending confirmation. */
export function handleGatedSpeakDone(
  ctx: GatedContext,
  payload: SpeakDonePayload,
): boolean {
  const { session } = ctx;
  let now: number;
  try {
    now = (ctx.clock ?? Date.now)();
  } catch {
    now = Number.NaN;
  }
  if (!session.completeSpeech(payload.speakId, payload.interrupted, Number.isFinite(now) ? now : Date.now())) return false;
  const pending = session.pendingGatedAction;
  if (pending === null || pending.speakId !== payload.speakId || pending.speechCompletedAt !== null) return false;
  if (payload.interrupted) {
    finishPending(ctx, pending, "speech-interrupted", { wireReason: "cancelled" });
    return true;
  }

  if (!Number.isFinite(now)) {
    finishPending(ctx, pending, "clock-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    return true;
  }
  pending.speechCompletedAt = now;
  pending.readyAt = now + COOLDOWN_MS;
  session.dialogue = "awaiting-confirm";
  const schedule = ctx.schedule ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  schedule(() => armAfterCooldown(ctx, pending), COOLDOWN_MS);
  ctx.hub.pushState();
  return true;
}

function refusalFor(error: ActResult["error"]): string {
  switch (error) {
    case "stale-snapshot": return MSG_PAGE_CHANGED;
    case "kind-mismatch": return MSG_PAGE_CHANGED;
    case "target-not-found": return MSG_PAGE_CHANGED;
    case "gate-required": return MSG_EXTENSION_REFUSED;
    case "disabled": return MSG_EXTENSION_REFUSED;
    case "exception": return MSG_EXTENSION_REFUSED;
    default: return MSG_EXTENSION_REFUSED;
  }
}

async function acceptConfirmation(ctx: GatedContext, command: Extract<GatedCommand, { type: "confirmation" }>): Promise<void> {
  const pending = ctx.session.pendingGatedAction;
  if (pending === null) return;
  if (pending.dispatching) return;

  const taskBoundSend = pending.binding.pageTask !== undefined;
  if (taskBoundSend && (command.source !== "voice" ||
    command.grantId !== pending.grantId || command.speakId !== pending.speakId ||
    typeof command.utteranceId !== "string" || command.utteranceId.length === 0 ||
    pending.speechCompletedAt === null
  )) {
    return finishPending(ctx, pending, "voice-redeem-binding-mismatch", {
      wireReason: "cancelled",
      reply: MSG_CONFIRMATION_REQUIRED,
    });
  }

  if (taskBoundSend && command.source === "voice" && isNegativeEmailReply(command.text)) {
    return finishPending(ctx, pending, "user-declined-send", {
      wireReason: "cancelled",
      reply: "Okay, I left it as a draft.",
    });
  }

  if (
    (command.grantId !== undefined || command.speakId !== undefined || command.utteranceId !== undefined) &&
    (command.grantId !== pending.grantId || command.speakId !== pending.speakId ||
      typeof command.utteranceId !== "string" || command.utteranceId.length === 0 || pending.speechCompletedAt === null)
  ) {
    return finishPending(ctx, pending, "voice-redeem-binding-mismatch", {
      wireReason: "cancelled",
      reply: MSG_CONFIRMATION_REQUIRED,
    });
  }

  let now: number;
  try {
    now = (ctx.clock ?? Date.now)();
  } catch {
    now = Number.NaN;
  }
  const phraseMatches = taskBoundSend
    ? (matchesExactConfirmationPhrase(pending.phrase, command.text) ||
      (command.source === "voice" && isAffirmativeEmailReply(command.text)))
    : matchesConfirmationPhrase(pending.kind, command.text);
  if (!phraseMatches) {
    return finishPending(ctx, pending, "phrase-mismatch", { wireReason: "cancelled", reply: MSG_CONFIRMATION_REQUIRED });
  }
  if (!Number.isFinite(now) || pending.readyAt === null || now < pending.readyAt || pending.grantId === undefined) {
    return finishPending(ctx, pending, "confirmation-too-early", { wireReason: "cancelled", reply: MSG_CONFIRMATION_REQUIRED });
  }
  if (pending.expiresAt === undefined || now >= pending.expiresAt) {
    return finishPending(ctx, pending, "grant-expired", { wireReason: "expired", reply: MSG_CONFIRMATION_REQUIRED });
  }
  if (!ctx.session.extensionConnected) {
    return finishPending(ctx, pending, "extension-disconnected", { wireReason: "cancelled", reply: MSG_NO_EXTENSION });
  }

  const refreshed = await ctx.refresher.request("refresh");
  // Multiple voice frames can pass the initial check while this refresh is in flight.
  // Only the first continuation may claim the grant and dispatch.
  if (pending.dispatching) return;
  if (!refreshed.ok || ctx.session.pendingGatedAction !== pending || ctx.session.model === null || ctx.session.stale || ctx.session.tabId === null) {
    return finishPending(ctx, pending, refreshed.ok ? "page-changed" : refreshed.kind, {
      wireReason: "page-changed",
      reply: !refreshed.ok && refreshed.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_PAGE_CHANGED,
    });
  }

  const model = ctx.session.model;
  const target = model.actions.find((candidate) => candidate.id === pending.targetId);
  if (
    ctx.session.tabId !== pending.tabId ||
    model.url !== pending.url ||
    model.snapshotVersion !== pending.snapshotVersion ||
    target === undefined ||
    target.kind !== pending.kind ||
    !isGatedKind(target.kind)
  ) {
    return finishPending(ctx, pending, target !== undefined && target.kind !== pending.kind ? "kind-mismatch" : "page-changed", {
      wireReason: "page-changed",
      reply: MSG_PAGE_CHANGED,
    });
  }

  const grantId = pending.grantId;
  let liveBinding = safeBinding(ctx.session, pending.targetId, target.kind);
  const expectedPageTask = pending.binding.pageTask;
  if (expectedPageTask !== undefined) {
    const current = draftTaskSendBinding(ctx.session, expectedPageTask.speakId, pending.grantId ?? null);
    if (current === null || current.target.id !== pending.targetId) {
      return finishPending(ctx, pending, "page-task-binding-unavailable", { wireReason: "value-changed", reply: MSG_VALUE_CHANGED });
    }
    if (!grantBindingsMatch(pending.binding, current.binding)) {
      return finishPending(ctx, pending, "page-task-binding-changed", { wireReason: "value-changed", reply: MSG_VALUE_CHANGED });
    }
    if (current.target.kind !== target.kind) {
      return finishPending(ctx, pending, "value-changed", { wireReason: "value-changed", reply: MSG_VALUE_CHANGED });
    }
    liveBinding = current.binding;
  }
  const authorization = ctx.session.grants.consumeForDispatch(
    grantId,
    liveBinding,
    ctx.session.tabId,
  );
  if (authorization === null) {
    return finishPending(ctx, pending, taskBoundSend ? "page-task-grant-mismatch" : "value-changed", {
      wireReason: "value-changed",
      reply: MSG_VALUE_CHANGED,
    });
  }

  // Consume is synchronous and precedes the only extension dispatch. A duplicate voice frame sees
  // dispatching=true and cannot pass through this point while the request is outstanding.
  pending.dispatching = true;
  let result: { payload: ActResult };
  try {
    result = await (ctx.gatePort ?? createGatePort(ctx.hub, ctx.session.grants)).dispatchClick(authorization);
  } catch {
    return finishPending(ctx, pending, "dispatch-unverified", { wireReason: "cancelled", reply: MSG_DISPATCH_UNKNOWN });
  }

  if (!result.payload.ok) {
    return finishPending(ctx, pending, `extension-${result.payload.error ?? "refused"}`, {
      wireReason: "cancelled",
      reply: refusalFor(result.payload.error),
    });
  }
  if (result.payload.liveKind !== undefined && result.payload.liveKind !== pending.kind) {
    return finishPending(ctx, pending, "result-kind-mismatch", { wireReason: "executed", reply: MSG_DISPATCH_UNKNOWN });
  }
  const requireFreshPageConfirmation = taskBoundSend;
  const expectedResultTabId = pending.tabId;
  finishPending(ctx, pending, "dispatched", { outcome: "allowed", wireReason: "executed" });
  const resultSnapshot = await ctx.refresher.request("post-act");
  if (
    !resultSnapshot.ok || resultSnapshot.snapshot === undefined || ctx.session.model === null || ctx.session.stale ||
    (requireFreshPageConfirmation && (
      resultSnapshot.snapshot.tabId !== expectedResultTabId || ctx.session.tabId !== expectedResultTabId
    ))
  ) {
    speak(ctx, MSG_RESULT_UNVERIFIED, "answer");
    return;
  }
  speak(ctx, formatResultSpeech(interpretResult(resultSnapshot.snapshot, ctx.session.model)), "answer");
}
