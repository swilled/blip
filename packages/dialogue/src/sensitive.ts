import type { DialogueContext } from "./effects";

const SENSITIVE_TERMS = /\b(password|passcode|credit card|card number|cvc|cvv|security code|one time code|otp|social security|ssn)\b/i;

export type LongUtterancePrivacy = "safe" | "sensitive" | "unknown";

function foldSensitiveMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Identifies long utterances that the reducer refuses because they may contain
 * sensitive field data. The runner uses the same predicate to redact the
 * transcript even when the refusal path has no focus effect.
 */
export function classifyLongUtterancePrivacy(
  text: string,
  form: DialogueContext["form"],
  currentFieldId: string | null,
): LongUtterancePrivacy {
  if (text.length <= 200) return "safe";
  if (form === null) return "unknown";

  const currentField = form?.fields.find((field) => field.id === currentFieldId);
  if (currentFieldId !== null && currentField === undefined) return "unknown";

  const folded = foldSensitiveMatch(text);
  const mentionsSensitiveField = form?.fields.some((field) => field.sensitive !== "none"
    && field.label.trim() !== ""
    && folded.includes(foldSensitiveMatch(field.label)));

  if ((currentField?.sensitive !== undefined && currentField.sensitive !== "none")
    || mentionsSensitiveField === true
    || SENSITIVE_TERMS.test(folded)) {
    return "sensitive";
  }
  return "safe";
}
