import { newId, type ActOp, type Field, type Intent } from "@blip/protocol";
import { fieldKindForFieldType } from "@blip/policy/classify";
import type { Hub } from "../hub/hub";
import { fieldValueReply } from "../reply";
import type { Refresher } from "../session/refresh";
import type { Session } from "../session/session";

const ACT_TIMEOUT_MS = 5000;
const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
const MSG_READ_FAILED = "I couldn't read the page.";
const MSG_ACT_FAILED = "I couldn't update that field. Please try again.";
const MSG_PRIVATE_FIELD = "That is a private field. You can type it now.";

export type UngatedContext = { hub: Hub; session: Session; refresher: Refresher; freshnessMs: number };
export type UngatedReply = { text: string; category: "answer" | "error" };

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
): Promise<{ ok: true; observedValue: string | null } | { ok: false; privateField?: boolean }> {
  const { hub, session } = ctx;
  const model = session.model;
  const tabId = session.tabId;
  if (model === null || tabId === null || !session.extensionConnected) return { ok: false };

  let result: { payload: { ok: boolean; error?: string; observedValue?: string | null } } | undefined;
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
    return { ok: false };
  }

  // Refresh before constructing any reply, including the sensitive-field handoff.
  if (write) await refresh(ctx);
  if (result.payload.error === "sensitive-field") return { ok: false, privateField: true };
  if (!result.payload.ok) return { ok: false };
  return { ok: true, observedValue: result.payload.observedValue ?? null };
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
  const field = model.fields.find((candidate) => candidate.id === fill.fieldId);
  if (field === undefined || field.disabled) return failure();

  if (field.sensitive !== "none") {
    const result = await sendAct(ctx, field, { op: "focus", targetId: field.id }, false);
    if (!result.ok) return failure();
    return { text: MSG_PRIVATE_FIELD, category: "answer" };
  }

  const operation = expectedValueFor(field, fill.value);
  if (operation === null) return failure("I couldn't match that value to this field.");
  const result = await sendAct(ctx, field, operation.action, true);
  if (!result.ok) return failure(result.privateField ? MSG_PRIVATE_FIELD : MSG_ACT_FAILED);
  const reply = fieldValueReply(field, result.observedValue, operation.expectedValue);
  return reply === null ? failure() : { text: reply, category: "answer" };
}
