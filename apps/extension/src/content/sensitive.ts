import { labelCandidatesOf } from "./labels.js";

export type Sensitivity = "none" | "password" | "card-number" | "card-cvc" | "otp" | "ssn";

export interface SafeValue {
  sensitive: Sensitivity;
  value: string | null;
  hasValue: boolean;
}

function normalizedHint(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function semanticSensitivity(element: Element): Sensitivity {
  if (element.localName === "input" && (element as HTMLInputElement).type.toLowerCase() === "password") {
    return "password";
  }

  const autocomplete = (element.getAttribute("autocomplete") ?? "").toLowerCase().split(/\s+/);
  if (autocomplete.includes("current-password") || autocomplete.includes("new-password")) return "password";
  if (autocomplete.includes("cc-number")) return "card-number";
  if (autocomplete.includes("cc-csc")) return "card-cvc";
  if (autocomplete.includes("one-time-code")) return "otp";

  const hints = [
    element.getAttribute("name") ?? "",
    element.getAttribute("id") ?? "",
    ...labelCandidatesOf(element).map((candidate) => candidate.text),
  ].map(normalizedHint);

  for (const hint of hints) {
    if (/(^| )(password|passcode|pwd)( |$)/.test(hint)) return "password";
    if (/(^| )(cvv|cvc|csc)( |$)/.test(hint) || /(^| )(security code|card verification code)( |$)/.test(hint)) {
      return "card-cvc";
    }
    if (/(^| )(ssn|social security)( |$)/.test(hint)) return "ssn";
    if (/(^| )(otp|one time code|verification code)( |$)/.test(hint)) return "otp";
    if (/(^| )(credit card|debit card|card) (number|no)( |$)/.test(hint) || /(^| )ccn( |$)/.test(hint)) {
      return "card-number";
    }
  }
  return "none";
}

/** Luhn check for a 13-19 digit value that may contain spaces or hyphens. */
export function luhnValid(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || !/^[\d -]+$/.test(normalized)) return false;
  const digits = normalized.replace(/[ -]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Recognize the conventional US SSN shape without treating arbitrary nine-digit IDs as SSNs. */
export function isSsn(value: string): boolean {
  const match = /^(\d{3})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return false;
  const [, area, group] = match;
  return area !== "000" && area !== "666" && !area.startsWith("9") && group !== "00" && match[3] !== "0000";
}

function isHiddenInput(element: Element): boolean {
  return element.localName === "input" && element.getAttribute("type")?.trim().toLowerCase() === "hidden";
}

function textInputForShapeCheck(element: Element): boolean {
  if (element.localName !== "input") return false;
  const rawType = element.getAttribute("type");
  return rawType === null || rawType.trim().toLowerCase() === "text";
}

function currentValue(element: Element): string {
  try {
    const control = element as Element & { value?: unknown };
    return typeof control.value === "string" ? control.value : "";
  } catch {
    return "";
  }
}

/** Classify metadata and keep sensitive values out of the returned object. */
export function safeValueOf(element: Element): SafeValue {
  let sensitive = semanticSensitivity(element);
  // Hidden controls are never read, including when their page-defined value getter is hostile.
  if (isHiddenInput(element)) return { sensitive, value: null, hasValue: false };

  const value = currentValue(element);
  if (sensitive === "none" && textInputForShapeCheck(element)) {
    if (isSsn(value)) sensitive = "ssn";
    else if (luhnValid(value)) sensitive = "card-number";
  }
  return {
    sensitive,
    value: sensitive === "none" ? value : null,
    hasValue: value.length > 0,
  };
}

/** Metadata sensitivity, including card-number/SSN value-shape detection on plain text inputs. */
export function sensitivityOf(element: Element): Sensitivity {
  return safeValueOf(element).sensitive;
}

/** Read a value only when the live control is visible to the protocol's non-sensitive path. */
export function readValue(element: Element, knownSensitivity?: Sensitivity): string | null {
  if (isHiddenInput(element) || (knownSensitivity && knownSensitivity !== "none")) return null;
  return safeValueOf(element).value;
}
