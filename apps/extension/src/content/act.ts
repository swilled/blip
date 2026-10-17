import type { ActRequest, ActResult, RawElement, ActionKind } from "@blip/protocol";
import { classifyAction, classifyField } from "@blip/policy/classify";
import { fillSelect, fillText, selectRadio, setChecked } from "./fill.js";
import { focusWithEvents } from "./focus.js";
import { fingerprintOf } from "./fingerprint.js";
import { actionFactsOf, resolveElementId, walkDocument } from "./walk.js";
import { isSsn, luhnValid, safeValueOf, type SafeValue, type Sensitivity } from "./sensitive.js";
import { isDisabled } from "./visibility.js";
import { withSubmitEventsBlocked } from "./submit-guard.js";

const snapshotFingerprints = new WeakMap<Document, Map<string, string>>();

/** Save only structural fingerprints for fields included in the last frame snapshot. */
export function rememberSnapshotFingerprints(document: Document, elements: readonly RawElement[]): void {
  const fingerprints = new Map<string, string>();
  for (const element of elements) fingerprints.set(element.id, fingerprintOf(element));
  snapshotFingerprints.set(document, fingerprints);
}

export interface ExecuteActOptions {
  document?: Document;
  frameId?: number;
}

function failure(actId: string, error: NonNullable<ActResult["error"]>, extra: Partial<ActResult> = {}): ActResult {
  return { actId, ok: false, error, ...extra };
}

function success(actId: string, extra: Partial<ActResult> = {}): ActResult {
  return { actId, ok: true, ...extra };
}

function localTargetId(targetId: string, frameId: number): string | null {
  const qualified = /^f(\d+)e(\d+)$/.exec(targetId);
  if (!qualified) return targetId;
  return Number(qualified[1]) === frameId ? `e${qualified[2]}` : null;
}

function radioMembers(element: Element, raw: RawElement): HTMLInputElement[] {
  if (raw.inputType !== "radio") return [];
  const root = element.localName === "input" ? element.parentElement : element;
  const candidates: HTMLInputElement[] = [];
  if (element.localName === "input" && (element as HTMLInputElement).type === "radio") {
    candidates.push(element as HTMLInputElement);
  }
  if (root) {
    for (const candidate of Array.from(root.querySelectorAll('input[type="radio"]'))) {
      const radio = candidate as HTMLInputElement;
      if (radio.name === (raw.name ?? "") && !candidates.includes(radio)) candidates.push(radio);
    }
  }
  return candidates;
}

function liveKind(element: Element, raw: RawElement, pageUrl: string): ActionKind {
  if (raw.category === "action") return classifyAction(actionFactsOf(element, pageUrl)).kind;
  const inputType = element.localName === "input" ? (element as HTMLInputElement).type.toLowerCase() : undefined;
  const fieldType = element.localName === "select"
    ? "select"
    : element.localName === "textarea"
      ? "textarea"
      : raw.inputType === "radio"
        ? "radio-group"
        : inputType === "checkbox"
          ? "checkbox"
          : undefined;
  return classifyField({
    tag: element.localName,
    ...(inputType ? { inputType } : {}),
    role: raw.role,
    ...(fieldType ? { fieldType } : {}),
  }).kind;
}

function fieldSensitivity(element: Element, raw: RawElement): Sensitivity {
  if (raw.inputType === "radio") {
    const members = radioMembers(element, raw);
    for (const member of members) {
      const sensitivity = safeValueForAct(member).sensitive;
      if (sensitivity !== "none") return sensitivity;
    }
    return "none";
  }
  return safeValueForAct(element).sensitive;
}

/** Apply shape checks to values read before or after a write, regardless of native field type. */
function safeValueForAct(element: Element): SafeValue {
  const safe = safeValueOf(element);
  if (safe.sensitive !== "none" || safe.value === null) return safe;
  if (luhnValid(safe.value)) return { sensitive: "card-number", value: null, hasValue: safe.hasValue };
  if (isSsn(safe.value)) return { sensitive: "ssn", value: null, hasValue: safe.hasValue };
  return safe;
}

function supportedTextInput(element: Element): element is HTMLInputElement {
  if (element.localName !== "input") return false;
  return new Set([
    "text", "email", "tel", "url", "search", "number", "date", "datetime-local", "time", "month", "week",
  ]).has((element as HTMLInputElement).type.toLowerCase());
}

function unsupportedDetail(): string {
  return "unsupported-widget";
}

async function executeResolved(
  request: ActRequest,
  document: Document,
  frameId: number,
): Promise<ActResult> {
  const { actId, action } = request;
  const targetId = localTargetId(action.targetId, frameId);
  if (targetId === null) return failure(actId, "target-not-found");

  const element = resolveElementId(targetId, document);
  if (!element) return failure(actId, "target-not-found");
  if (isDisabled(element)) return failure(actId, "disabled");

  const preflight = walkDocument(document, { frameId });
  const raw = preflight.find((candidate) => candidate.id === targetId);
  if (!raw) return failure(actId, "target-not-found");
  if (raw.disabled) return failure(actId, "disabled");

  const writes = action.op === "fill" || action.op === "select" || action.op === "check";
  if (writes && fieldSensitivity(element, raw) !== "none") {
    return failure(actId, "sensitive-field", { observedValue: null });
  }

  const baseline = snapshotFingerprints.get(document)?.get(targetId);
  if (baseline === undefined || baseline !== fingerprintOf(raw)) {
    return failure(actId, "stale-snapshot");
  }

  const kind = liveKind(element, raw, document.location.href);
  const liveExtra: Partial<ActResult> = { liveKind: kind };
  if (kind !== request.expectedKind) return failure(actId, "kind-mismatch", liveExtra);

  try {
    switch (action.op) {
      case "fill": {
        if (raw.category !== "field") return failure(actId, "kind-mismatch", liveExtra);
        if (supportedTextInput(element)) {
          const outcome = await fillText(element, action.value);
          if (!outcome.ok) return failure(actId, "exception", { ...liveExtra, detail: outcome.detail });
          const post = safeValueForAct(element);
          if (post.sensitive !== "none") return failure(actId, "sensitive-field", { observedValue: null });
          return success(actId, { ...liveExtra, observedValue: post.value, ...(outcome.detail ? { detail: outcome.detail } : {}) });
        }
        if (element.localName === "textarea") {
          const outcome = await fillText(element as HTMLTextAreaElement, action.value);
          if (!outcome.ok) return failure(actId, "exception", { ...liveExtra, detail: outcome.detail });
          const post = safeValueForAct(element);
          if (post.sensitive !== "none") return failure(actId, "sensitive-field", { observedValue: null });
          return success(actId, { ...liveExtra, observedValue: post.value, ...(outcome.detail ? { detail: outcome.detail } : {}) });
        }
        return failure(actId, "exception", { ...liveExtra, detail: unsupportedDetail() });
      }
      case "select": {
        if (raw.category !== "field") return failure(actId, "kind-mismatch", liveExtra);
        let outcome;
        let valueElement: Element;
        if (element.localName === "select") {
          outcome = await fillSelect(element as HTMLSelectElement, action.optionValue);
          valueElement = element;
        } else if (raw.inputType === "radio") {
          const members = radioMembers(element, raw);
          outcome = await selectRadio(members, action.optionValue);
          valueElement = members.find((member) => member.checked) ?? members[0] ?? element;
        } else {
          return failure(actId, "exception", { ...liveExtra, detail: unsupportedDetail() });
        }
        if (!outcome.ok) return failure(actId, "exception", { ...liveExtra, detail: outcome.detail });
        const post = safeValueForAct(valueElement);
        if (post.sensitive !== "none") return failure(actId, "sensitive-field", { observedValue: null });
        return success(actId, { ...liveExtra, observedValue: post.value });
      }
      case "check": {
        if (raw.category !== "field" || element.localName !== "input" || (element as HTMLInputElement).type !== "checkbox") {
          return failure(actId, "exception", { ...liveExtra, detail: unsupportedDetail() });
        }
        const outcome = await setChecked(element as HTMLInputElement, action.checked);
        if (!outcome.ok) return failure(actId, "exception", { ...liveExtra, detail: outcome.detail });
        const post = safeValueForAct(element);
        if (post.sensitive !== "none") return failure(actId, "sensitive-field", { observedValue: null });
        return success(actId, { ...liveExtra, observedValue: String((element as HTMLInputElement).checked) });
      }
      case "focus": {
        if (element instanceof (document.defaultView?.HTMLElement ?? HTMLElement)) {
          try { (element as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch { /* best effort */ }
          focusWithEvents(element as HTMLElement);
        }
        return success(actId, { ...liveExtra, observedValue: null });
      }
      case "scroll-into-view": {
        try { element.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch { /* best effort */ }
        return success(actId, liveExtra);
      }
      case "click": {
        if (raw.category !== "action") return failure(actId, "kind-mismatch", liveExtra);
        if (kind !== "click-safe") return failure(actId, "gate-required", liveExtra);
        const clickable = element as Element & { click?: () => void };
        if (typeof clickable.click !== "function") return failure(actId, "exception", { ...liveExtra, detail: "not clickable" });
        clickable.click();
        return success(actId, liveExtra);
      }
    }
  } catch {
    // Page-controlled event handlers and getters can throw; never forward their exception text.
    return failure(actId, "exception", { ...liveExtra, detail: "act failed" });
  }
}

/** Run every page action behind the same scoped submit-event barrier. */
export function executeAct(request: ActRequest, options: ExecuteActOptions = {}): Promise<ActResult> {
  const document = options.document ?? globalThis.document;
  const frameId = options.frameId ?? 0;
  return withSubmitEventsBlocked(document, () => executeResolved(request, document, frameId)).catch(() =>
    failure(request.actId, "exception", { detail: "act failed" }),
  );
}
