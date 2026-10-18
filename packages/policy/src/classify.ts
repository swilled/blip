import type { ActionKind } from "@blip/protocol";

/** Live facts used for deterministic, fail-closed action classification. */
export type ActionFacts = {
  tag?: string;
  role?: string;
  text?: string;
  href?: string;
  /** The raw target attribute, retained locally for classification. */
  target?: string;
  /** The current page origin, used to validate links. */
  origin?: string;
  buttonType?: string;
  inputType?: string;
  inForm?: boolean;
};

export type ActionClassification = {
  kind: ActionKind;
  reasons: string[];
};

export type BrowserLinkNavigationSafety = "same-origin-safe-get" | "confirmation-required" | "unsupported";

/** Live facts for a native or custom field discovered in the page. */
export type FieldFacts = {
  tag?: string;
  inputType?: string;
  fieldType?: string;
  role?: string;
};

export type FieldClassification = {
  kind: "fill" | "select" | "check";
  unsupported: boolean;
  reasons: string[];
};

const UNGATED_KINDS: ReadonlySet<string> = new Set(["fill", "select", "check", "click-safe"]);

/** Exposes local membership for parity checks while keeping the set private. */
export function isUngatedActionKind(kind: string): boolean {
  return UNGATED_KINDS.has(kind);
}

const PAY_PATTERN = /\b(?:pay|buy|purchase|order|checkout|donate)\b/;
const DELETE_PATTERN = /\b(?:delete|remove)\b|\bcancel[\s_-]+account\b/;
const SEND_PATTERN = /\b(?:send|post|publish|share)\b/;
const NEVER_SAFE_PATTERN = /\b(?:next|continue|save|confirm|finish)\b/;
const SAFE_TEXT_PATTERN = /^(?:close(?:\s+(?:dialog|window|modal|panel))?|dismiss|add another(?:\s+.+)?)$/;
const BROWSER_LINK_ACTION_PATTERN = /\b(?:pay|buy|purchase|order|checkout|donate|delete|remove|cancel|unsubscribe|logout|log[\s_-]*out|sign[\s_-]*out|send|reply|post|publish|share|submit|save|confirm|finish|next|continue|approve|accept|decline|reject|join|leave|subscribe|follow|unfollow|like|update|create|add|invite|register|download|withdraw)\b/;
const TEXT_LIMIT = 500;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function result(kind: ActionKind, reason: string): ActionClassification {
  return { kind, reasons: [reason] };
}

function classifyGatedText(haystack: string): ActionClassification | undefined {
  if (PAY_PATTERN.test(haystack)) return result("pay", "text or link destination matches a payment term");
  if (DELETE_PATTERN.test(haystack)) return result("delete", "text or link destination matches a deletion term");
  if (SEND_PATTERN.test(haystack)) return result("send", "text or link destination matches a send or publish term");
  return undefined;
}

/**
 * Classify a user-selected browser link separately from form clicks. Ordinary same-origin
 * HTTP(S) anchors can use the browser's GET navigation path; cross-origin and action-like
 * destinations still require an exact spoken confirmation. This never changes button or
 * form-action classification.
 */
export function classifyBrowserLink(facts: ActionFacts & { download?: boolean }): BrowserLinkNavigationSafety {
  const tag = normalize(facts.tag ?? "");
  const text = normalize(facts.text ?? "");
  const href = facts.href ?? "";
  const target = normalize(facts.target ?? "");
  const rawHaystack = [text, href, target].filter(Boolean).join(" ");
  if (tag !== "a" || facts.download === true ||
      target !== "" && target !== "_self" || !href || !facts.origin || rawHaystack.length > TEXT_LIMIT) {
    return "unsupported";
  }
  const linkOrigin = sameOriginLink(href, facts.origin);
  if (linkOrigin === "malformed") return "unsupported";
  if (linkOrigin === "same") {
    try {
      const page = new URL(facts.origin);
      const destination = new URL(href, page);
      if (destination.pathname === page.pathname && destination.search === page.search) {
        // Same-document fragment navigation can run page handlers without issuing a GET.
        return "confirmation-required";
      }
    } catch {
      return "unsupported";
    }
  }

  const haystack = normalize(rawHaystack).slice(0, TEXT_LIMIT);
  if (classifyGatedText(haystack) !== undefined || NEVER_SAFE_PATTERN.test(haystack) || BROWSER_LINK_ACTION_PATTERN.test(haystack)) {
    return "confirmation-required";
  }
  return linkOrigin === "same" ? "same-origin-safe-get" : "confirmation-required";
}

function sameOriginLink(href: string, origin: string): "same" | "cross" | "malformed" {
  try {
    const page = new URL(origin);
    if (page.protocol !== "http:" && page.protocol !== "https:") return "malformed";
    const destination = new URL(href, page);
    if (destination.protocol !== "http:" && destination.protocol !== "https:") return "malformed";
    return destination.origin === page.origin ? "same" : "cross";
  } catch {
    return "malformed";
  }
}

/**
 * Classify a clickable element from current DOM facts. Unknown shapes always
 * return a gated kind so callers never have to infer safety from a label.
 */
export function classifyAction(facts: ActionFacts): ActionClassification {
  const tag = normalize(facts.tag ?? "");
  const text = normalize(facts.text ?? "");
  const href = facts.href ?? "";
  const target = normalize(facts.target ?? "");
  const rawHaystack = [text, href, target].filter(Boolean).join(" ");
  const haystack = normalize(rawHaystack).slice(0, TEXT_LIMIT);

  const gated = classifyGatedText(haystack);
  if (gated) return gated;

  // Inputs with submit semantics are gated even when their label looks harmless.
  if (tag === "input" && /^(?:submit|image)$/i.test(facts.inputType ?? "")) {
    return result("submit", `input type=${normalize(facts.inputType ?? "")} is submit-capable`);
  }

  if (tag === "a") {
    if (!href || !facts.origin || rawHaystack.length > TEXT_LIMIT) {
      return result("submit", "link is missing a valid href, origin, or bounded classification text");
    }
    const linkOrigin = sameOriginLink(href, facts.origin);
    if (linkOrigin === "cross") return result("navigate-cross-domain", "link destination is cross-origin");
    if (linkOrigin === "malformed") return result("submit", "link destination is malformed or uses an unsupported scheme");
    if (NEVER_SAFE_PATTERN.test(text)) return result("submit", "link text is a navigation or commit action");
    if (SAFE_TEXT_PATTERN.test(text)) return result("click-safe", "same-origin link text is on the click-safe allowlist");
    return result("submit", "same-origin link text is not on the click-safe allowlist");
  }

  if (tag === "button" || tag === "input" && /^(?:button|reset)$/i.test(facts.inputType ?? "")) {
    const type = tag === "button" ? normalize(facts.buttonType ?? "") : normalize(facts.inputType ?? "");
    if (type !== "button") return result("submit", "button does not have an explicit non-submit button type");
    if (rawHaystack.length > TEXT_LIMIT) return result("submit", "button classification text exceeds the safety limit");
    if (NEVER_SAFE_PATTERN.test(text)) return result("submit", "button text is a navigation or commit action");
    if (SAFE_TEXT_PATTERN.test(text)) return result("click-safe", "explicit type=button text is on the click-safe allowlist");
    return result("submit", "button text is not on the click-safe allowlist");
  }

  return result("submit", "unknown or unsupported action shape is gated by default");
}

/** Map the frozen server-side field type vocabulary to its write operation. */
export function fieldKindForFieldType(fieldType: string): "fill" | "select" | "check" {
  if (fieldType === "select" || fieldType === "radio-group") return "select";
  if (fieldType === "checkbox") return "check";
  return "fill";
}

/** Classify native form controls; unsupported custom widgets remain explicit. */
export function classifyField(facts: FieldFacts): FieldClassification {
  const tag = normalize(facts.tag ?? "");
  const inputType = normalize(facts.inputType ?? "text");

  if (facts.fieldType) {
    const kind = fieldKindForFieldType(facts.fieldType);
    const supported = ["text", "email", "tel", "url", "number", "date", "time", "password", "textarea", "select", "radio-group", "checkbox"].includes(facts.fieldType);
    return {
      kind,
      unsupported: !supported,
      reasons: [supported ? `field type ${facts.fieldType} maps to ${kind}` : `field type ${facts.fieldType} uses a fill refusal path`],
    };
  }

  if (tag === "select") return { kind: "select", unsupported: false, reasons: ["native select maps to select"] };
  if (tag === "textarea") return { kind: "fill", unsupported: false, reasons: ["native textarea maps to fill"] };
  if (tag === "input") {
    if (inputType === "checkbox") return { kind: "check", unsupported: false, reasons: ["native checkbox maps to check"] };
    if (inputType === "radio") return { kind: "select", unsupported: false, reasons: ["native radio group maps to select"] };
    if (["text", "email", "tel", "url", "search", "number", "date", "datetime-local", "time", "month", "week"].includes(inputType)) {
      return { kind: "fill", unsupported: false, reasons: [`native input type=${inputType} maps to fill`] };
    }
  }

  return { kind: "fill", unsupported: true, reasons: ["unsupported field widget uses the fill refusal path"] };
}
