import { newId, type ActOp, type ActResult, type Field, type Intent } from "@blip/protocol";
import { fieldKindForFieldType } from "@blip/policy/classify";
import type { Hub } from "../hub/hub";
import { fieldValueReply } from "../reply";
import type { Refresher } from "../session/refresh";
import type { Session } from "../session/session";
import { containsSensitivePageText } from "../brain/agy/privacy";

const ACT_TIMEOUT_MS = 5000;
const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
const MSG_READ_FAILED = "I couldn't read the page.";
const MSG_ACT_FAILED = "I couldn't update that field. Please try again.";
const MSG_PRIVATE_FIELD = "That is a private field. You can type it now.";

export type UngatedContext = { hub: Hub; session: Session; refresher: Refresher; freshnessMs: number };
export type UngatedReply = { text: string; category: "answer" | "error" };
export type ObservedTextWriteResult =
  | { ok: true; observedValue: string }
  | { ok: false; reason: "no-extension" | "stale-page" | "unsupported-target" | "write-failed" | "missing-observation" };

function failure(text = MSG_ACT_FAILED): UngatedReply {
  return { text, category: "error" };
}

function expectedValueFor(field: Field, value: string): { action: ActOp; expectedValue: string } | null {
  if (field.type === "checkbox") {
    const normalized = value.trim().toLocaleLowerCase();
    if (["true", "yes", "checked", "on"].includes(normalized)) {
      return { action: { op: "check", targetId: field.id, checked: true }, expectedValue: "true" };
    }
    if (["false", "no", "unchecked", "off"].includes(normalized)) {
      return { action: { op: "check", targetId: field.id, checked: false }, expectedValue: "false" };
    }
    return null;
  }

  if (field.type === "select" || field.type === "radio-group") {
    const options = field.options ?? [];
    const normalized = value.trim().toLocaleLowerCase();
    const exact = options.filter((option) =>
      option.value.toLocaleLowerCase() === normalized || option.label.trim().toLocaleLowerCase() === normalized,
    );
    const matches = exact.length > 0
      ? exact
      : options.filter((option) => option.label.trim().toLocaleLowerCase().includes(normalized));
    if (matches.length !== 1) return null;
    return {
      action: { op: "select", targetId: field.id, optionValue: matches[0]!.value },
      expectedValue: matches[0]!.value,
    };
  }

  if (["text", "email", "tel", "url", "number", "date", "time", "textarea"].includes(field.type)) {
    return { action: { op: "fill", targetId: field.id, value }, expectedValue: value };
  }
  return null;
}

async function refresh(ctx: UngatedContext): Promise<boolean> {
  const result = await ctx.refresher.request("refresh");
  return result.ok && ctx.session.model !== null && !ctx.session.stale;
}

async function ensureModel(ctx: UngatedContext): Promise<UngatedReply | null> {
  const { session } = ctx;
  if (!session.extensionConnected) return failure(MSG_NO_EXTENSION);
  const fresh = session.model !== null && !session.stale && session.modelAgeMs !== null && session.modelAgeMs <= ctx.freshnessMs;
  if (fresh) return null;
  const result = await ctx.refresher.request("user");
  if (!result.ok) return failure(result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED);
  if (session.model === null || session.stale) return failure(MSG_READ_FAILED);
  return null;
}

async function sendAct(
  ctx: UngatedContext,
  field: Field,
  action: ActOp,
  write: boolean,
): Promise<{ ok: true; observedValue: string | null } | { ok: false; error?: ActResult["error"]; privateField?: boolean }> {
  const { hub, session } = ctx;
  const model = session.model;
  const tabId = session.tabId;
  if (model === null || tabId === null || !session.extensionConnected) return { ok: false };

  let result: { payload: ActResult } | undefined;
  try {
    result = await hub.request(
      "extension",
      "act.request",
      {
        actId: newId(),
        tabId,
        snapshotVersion: model.snapshotVersion,
        action,
        expectedKind: fieldKindForFieldType(field.type),
      },
      { expect: "act.result", timeoutMs: ACT_TIMEOUT_MS },
    );
  } catch {
    if (write) await refresh(ctx);
    return { ok: false, error: "exception" };
  }

  // Refresh before constructing any reply, including the sensitive-field handoff.
  if (write) await refresh(ctx);
  if (result.payload.error === "sensitive-field") return { ok: false, error: "sensitive-field", privateField: true };
  if (!result.payload.ok) return { ok: false, error: result.payload.error ?? "exception" };
  return { ok: true, observedValue: result.payload.observedValue ?? null };
}

/**
 * Fill one deterministic supported text field and return only the value both ActResult and the
 * accepted post-write snapshot observed. This stays on the existing act.request boundary and has
 * no click/send path.
 */
export async function executeObservedTextFieldWrite(
  ctx: UngatedContext,
  targetId: string,
  value: string,
  validateCurrent: () => boolean = () => true,
): Promise<ObservedTextWriteResult> {
  const { session } = ctx;
  if (!session.extensionConnected) return { ok: false, reason: "no-extension" };
  const refreshed = await ctx.refresher.request("refresh");
  if (!refreshed.ok || session.model === null || session.stale || !validateCurrent()) {
    return { ok: false, reason: "stale-page" };
  }
  const model = session.model;
  const tabId = session.tabId;
  const field = model.fields.find((candidate) => candidate.id === targetId);
  if (tabId === null || field === undefined || field.disabled || field.sensitive !== "none" ||
      (field.type !== "text" && field.type !== "textarea") || value.trim() === "" ||
      Array.from(value).length > 1_000 || containsSensitivePageText(value)) {
    return { ok: false, reason: "unsupported-target" };
  }

  const write = await sendAct(ctx, field, { op: "fill", targetId, value }, true);
  if (!write.ok || write.observedValue === null) {
    return { ok: false, reason: write.ok ? "missing-observation" : "write-failed" };
  }
  if (session.stale || session.model === null || session.tabId !== tabId ||
      session.model.url !== model.url) return { ok: false, reason: "stale-page" };
  const observedField = session.model.fields.find((candidate) => candidate.id === targetId);
  if (observedField === undefined || observedField.disabled || observedField.sensitive !== "none" ||
      observedField.type !== "text" && observedField.type !== "textarea" ||
      observedField.value !== write.observedValue || Array.from(write.observedValue).length > 4_000 ||
      containsSensitivePageText(write.observedValue)) {
    return { ok: false, reason: "missing-observation" };
  }
  return { ok: true, observedValue: write.observedValue };
}

/** The Phase 2 action boundary: only field fills and focus requests can reach the extension. */
export async function executeUngated(ctx: UngatedContext, intent: Intent): Promise<UngatedReply> {
  const ready = await ensureModel(ctx);
  if (ready !== null) return ready;
  const { session } = ctx;
  const model = session.model!;

  if (intent.type === "go_to_field") {
    const field = model.fields.find((candidate) => candidate.id === intent.fieldId);
    if (field === undefined || field.disabled) return failure();
    const result = await sendAct(ctx, field, { op: "focus", targetId: field.id }, false);
    if (!result.ok) return failure();
    return { text: `Focused ${field.label}.`, category: "answer" };
  }

  if (intent.type !== "set_fields" || intent.fills.length !== 1) return failure();
  const fill = intent.fills[0]!;
  let field = model.fields.find((candidate) => candidate.id === fill.fieldId);
  if (field === undefined || field.disabled) return failure();

  if (field.sensitive !== "none") {
    const result = await sendAct(ctx, field, { op: "focus", targetId: field.id }, false);
    if (!result.ok) return failure();
    return { text: MSG_PRIVATE_FIELD, category: "answer" };
  }

  let operation = expectedValueFor(field, fill.value);
  if (operation === null) return failure("I couldn't match that value to this field.");
  let result = await sendAct(ctx, field, operation.action, true);
  if (!result.ok && result.error === "stale-snapshot") {
    // sendAct refreshed after the first request. Resolve the field and its kind again, then retry once.
    const refreshed = session.model?.fields.find((candidate) => candidate.id === fill.fieldId);
    if (refreshed === undefined || refreshed.disabled) return failure();
    if (refreshed.sensitive !== "none") {
      const focus = await sendAct(ctx, refreshed, { op: "focus", targetId: refreshed.id }, false);
      return focus.ok ? { text: MSG_PRIVATE_FIELD, category: "answer" } : failure();
    }
    const retry = expectedValueFor(refreshed, fill.value);
    if (retry === null) return failure("I couldn't match that value to this field.");
    field = refreshed;
    operation = retry;
    result = await sendAct(ctx, field, operation.action, true);
  }
  if (!result.ok) return failure(result.privateField ? MSG_PRIVATE_FIELD : MSG_ACT_FAILED);
  const reply = fieldValueReply(field, result.observedValue, operation.expectedValue);
  return reply === null ? failure() : { text: reply, category: "answer" };
}
