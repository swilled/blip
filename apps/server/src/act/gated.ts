import { isGatedKind, newId, type ActResult, type Intent, type SpeakDonePayload } from "@blip/protocol";
import { matchesConfirmationPhrase, phraseForKind } from "@blip/policy/confirmation";
import type { Hub } from "../hub/hub";
import { log } from "../log";
import type { Refresher } from "../session/refresh";
import type { PendingGatedAction, Session } from "../session/session";
import { formatResultSpeech, interpretResult } from "../results/interpret";

const MAX_READBACK_CHARS = 20_000;
const ACT_TIMEOUT_MS = 5_000;
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

export type GatedContext = {
  hub: Hub;
  session: Session;
  refresher: Refresher;
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
};

export type GatedIntent = Extract<Intent, { type: "request_action" | "click_safe" }>;
export type GatedCommand = GatedIntent | { type: "confirmation"; text: string };

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
  ctx.session.lastSpoken = text;
  return ctx.hub.send("voice", "speak", { speakId, text, category, interrupt: category === "confirm-prompt" })
    ? speakId
    : null;
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

function finishPending(
  ctx: GatedContext,
  pending: PendingGatedAction,
  reason: string,
  options: { outcome?: "allowed" | "refused"; wireReason?: WireClearReason; reply?: string } = {},
): void {
  if (ctx.session.pendingGatedAction === pending) ctx.session.clearPendingGatedAction();
  else if (pending.grantId !== undefined) ctx.session.grants.clear(pending.grantId);
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

function safeBinding(session: Session, targetId: string, kind: NonNullable<Session["model"]>["actions"][number]["kind"]) {
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
  };
}

/** The sole server path from a gated request or voice-role confirmation to dispatch. */
export async function executeGatedAction(ctx: GatedContext, command: GatedCommand): Promise<void> {
  if (command.type === "confirmation") return acceptConfirmation(ctx, command.text);

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

  const grant = ctx.session.grants.arm(pending.binding);
  if (grant === null) {
    finishPending(ctx, pending, "grant-unavailable", { wireReason: "cancelled", reply: MSG_READ_FAILED });
    return;
  }
  pending.grantId = grant.grantId;
  pending.expiresAt = grant.expiresAt;
  ctx.session.dialogue = "awaiting-confirm";
  if (!ctx.hub.send("voice", "confirm.armed", {
    grantId: grant.grantId,
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
  const pending = session.pendingGatedAction;
  if (pending === null || pending.speakId !== payload.speakId || pending.speechCompletedAt !== null) return false;
  if (payload.interrupted) {
    finishPending(ctx, pending, "speech-interrupted", { wireReason: "cancelled" });
    return true;
  }

  let now: number;
  try {
    now = (ctx.clock ?? Date.now)();
  } catch {
    now = Number.NaN;
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

async function acceptConfirmation(ctx: GatedContext, text: string): Promise<void> {
  const pending = ctx.session.pendingGatedAction;
  if (pending === null) return;
  if (pending.dispatching) return;

  let now: number;
  try {
    now = (ctx.clock ?? Date.now)();
  } catch {
    now = Number.NaN;
  }
  if (!matchesConfirmationPhrase(pending.kind, text)) {
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
  if (!ctx.session.grants.consume(grantId, safeBinding(ctx.session, pending.targetId, target.kind))) {
    return finishPending(ctx, pending, "value-changed", { wireReason: "value-changed", reply: MSG_VALUE_CHANGED });
  }

  // Consume is synchronous and precedes the only extension dispatch. A duplicate voice frame sees
  // dispatching=true and cannot pass through this point while the request is outstanding.
  pending.dispatching = true;
  const request = {
    actId: newId(),
    tabId: ctx.session.tabId,
    snapshotVersion: model.snapshotVersion,
    action: { op: "click" as const, targetId: pending.targetId },
    expectedKind: pending.kind,
    gate: { grantId, kind: pending.kind },
  };
  let result: { payload: ActResult };
  try {
    result = await ctx.hub.request("extension", "act.request", request, {
      expect: "act.result",
      timeoutMs: ACT_TIMEOUT_MS,
    });
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
  finishPending(ctx, pending, "dispatched", { outcome: "allowed", wireReason: "executed" });
  const resultSnapshot = await ctx.refresher.request("post-act");
  if (!resultSnapshot.ok || resultSnapshot.snapshot === undefined || ctx.session.model === null || ctx.session.stale) {
    speak(ctx, MSG_RESULT_UNVERIFIED, "answer");
    return;
  }
  speak(ctx, formatResultSpeech(interpretResult(resultSnapshot.snapshot, ctx.session.model)), "answer");
}
