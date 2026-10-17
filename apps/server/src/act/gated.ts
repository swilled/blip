import { isGatedKind, newId, type Intent, type SpeakDonePayload } from "@blip/protocol";
import { phraseForKind } from "@blip/policy/confirmation";
import type { Hub } from "../hub/hub";
import { log } from "../log";
import type { Refresher } from "../session/refresh";
import type { PendingGatedAction, Session } from "../session/session";

const MAX_READBACK_CHARS = 20_000;
const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
const MSG_READ_FAILED = "I couldn't safely read the current form, so nothing was submitted.";
const MSG_NOT_GATED = "That action is not a gated page action, so nothing was submitted.";
const MSG_ACTION_MISSING = "I couldn't find that action on the current page, so nothing was submitted.";
const MSG_READBACK_TOO_LARGE = "This form is too long to read back safely, so nothing was submitted.";

export type GatedContext = {
  hub: Hub;
  session: Session;
  refresher: Refresher;
  clock?: () => number;
};

export type GatedIntent = Extract<Intent, { type: "request_action" | "click_safe" }>;

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

function speak(ctx: GatedContext, text: string, category: "error" | "confirm-prompt", speakId = newId()): string | null {
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

      const value = field.value === null ? "current value unavailable" : spokenText(field.value) || "empty";
      const requiredEmpty = field.required && !field.hasValue ? " Required field is empty." : "";
      return `${index + 1}. ${label}: ${value}.${requiredEmpty}`;
    });
  const fieldReadback = fields.length === 0 ? "There are no form fields." : fields.join(" ");
  return `Page: ${page}.${form} Requested action: ${kind}, ${action}. Current form read-back: ${fieldReadback} To continue, say: ${phrase}.`;
}

function clear(ctx: GatedContext, reason: string, outcome: "allowed" | "refused" = "refused"): void {
  const pending = ctx.session.clearPendingGatedAction();
  if (pending === null) return;
  if (pending.grantId !== undefined) {
    ctx.hub.send("voice", "confirm.cleared", { grantId: pending.grantId, reason: "cancelled" });
  }
  audit(outcome, reason, pending.kind, pending.targetId);
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

/** The sole server path from a model-requested gated action to a read-back prompt. */
export async function executeGatedAction(ctx: GatedContext, intent: GatedIntent): Promise<void> {
  const { session } = ctx;
  const clock = ctx.clock ?? Date.now;
  session.clearPendingGatedAction();

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
  const target = model.actions.find((candidate) => candidate.id === intent.actionId);
  if (target === undefined) {
    audit("refused", "target-not-found", undefined, intent.actionId);
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
    clear(ctx, "voice-disconnected");
    return;
  }
  ctx.hub.pushState();
}

/** Track only the final read-back speakId; an interruption cancels the pending confirmation. */
export function handleGatedSpeakDone(
  session: Session,
  payload: SpeakDonePayload,
  clock: () => number = Date.now,
): boolean {
  const pending = session.pendingGatedAction;
  if (pending === null || pending.speakId !== payload.speakId) return false;
  if (payload.interrupted) {
    session.clearPendingGatedAction();
    session.dialogue = session.model !== null && session.extensionConnected ? "ready" : "no-page";
    return true;
  }

  let now: number;
  try {
    now = clock();
  } catch {
    now = Number.NaN;
  }
  if (!Number.isFinite(now)) {
    session.clearPendingGatedAction();
    return true;
  }
  pending.speechCompletedAt = now;
  pending.readyAt = now + 1_000;
  session.dialogue = "awaiting-confirm";
  return true;
}
