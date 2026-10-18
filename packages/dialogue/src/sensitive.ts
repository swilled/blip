import type { DialogueContext } from "./effects";

const SENSITIVE_TERMS = /\b(password|passcode|credit card|card number|cvc|cvv|security code|one time code|otp|social security|ssn)\b/i;

function foldSensitiveMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Identifies long utterances that the reducer refuses because they may contain
 * sensitive field data. The runner uses the same predicate to redact the
 * transcript even when the refusal path has no focus effect.
 */
export function isOverlongSensitiveUtterance(
  text: string,
  form: DialogueContext["form"],
  currentFieldId: string | null,
): boolean {
  if (text.length <= 200) return false;

  const currentField = form?.fields.find((field) => field.id === currentFieldId);
  const folded = foldSensitiveMatch(text);
  const mentionsSensitiveField = form?.fields.some((field) => field.sensitive !== "none"
    && field.label.trim() !== ""
    && folded.includes(foldSensitiveMatch(field.label)));

  return (currentField?.sensitive !== undefined && currentField.sensitive !== "none")
    || mentionsSensitiveField === true
    || SENSITIVE_TERMS.test(text);
}
