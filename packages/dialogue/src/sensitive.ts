import type { DialogueContext } from "./effects";
import { resolveField } from "./fields";

const SENSITIVE_TERMS = /\b(password|passcode|credit card|card number|cvc|cvv|security code|one time code|otp|social security|ssn)\b/i;
const SENSITIVE_VALUE = /\b(?:password|passcode|credit card|card number|cvc|cvv|security code|one time code|otp|social security|ssn)\s+(?:(?:is|are|equals?|number|code)\s+)?\S+/i;
const SAFE_CONTROLS = new Set([
  "cancel", "never mind", "nevermind", "stop", "be quiet", "quiet", "stop talking",
  "repeat", "repeat that", "say that again", "done", "continue", "next", "more", "undo",
  "read back", "read it back", "read everything back", "submit", "submit it", "submit the form", "submit survey",
  "where am i", "where am i on this page", "where am i in the form", "whats here", "what is here",
  "what is on this page", "whats on this page", "whats on the page", "what is on the page",
  "what is this page", "whats on this form", "what is on this form", "whats required",
  "what is required", "which fields are required", "what fields are required", "whats missing",
  "what is missing", "what do i still need", "what do i need to fill", "read the form", "read form",
  "read the fields", "fill from my profile",
]);

export type UtterancePrivacy = "safe" | "sensitive" | "unknown";

function foldSensitiveMatch(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Identifies utterances that the reducer refuses because they may contain
 * sensitive field data. The runner uses the same predicate to redact the
 * transcript even when the refusal path has no focus effect.
 */
export function classifyUtterancePrivacy(
  text: string,
  form: DialogueContext["form"],
  currentFieldId: string | null,
  allowSensitiveFieldCommand = true,
): UtterancePrivacy {
  const folded = foldSensitiveMatch(text);
  const commandPrefix = text.match(/^(?:change|fill|set|enter|type|spell)\s+(?:(?:the|my)\s+)?/i);
  const commandTarget = form !== null && text.length <= 200 && commandPrefix
    ? resolveField(form, text.slice(commandPrefix[0].length))
    : null;
  const directTarget = form !== null && text.length <= 200 ? resolveField(form, text) : null;
  const resolvedSensitiveFieldCommand = [commandTarget, directTarget].some((target) => target?.kind === "match"
    && target.field.sensitive !== "none");
  if (resolvedSensitiveFieldCommand) return allowSensitiveFieldCommand ? "safe" : "sensitive";

  // Catch short disclosures like "the password is 123456" before intent routing.
  if (SENSITIVE_VALUE.test(folded)) return "sensitive";
  if (SAFE_CONTROLS.has(folded)) return "safe";
  if (form === null) return "unknown";

  const currentField = form?.fields.find((field) => field.id === currentFieldId);
  if (currentFieldId !== null && currentField === undefined) return "unknown";

  // Dictation while a sensitive control is focused is treated as private even
  // when the utterance does not name that control or include a common keyword.
  if (currentField?.sensitive !== undefined && currentField.sensitive !== "none") return "sensitive";

  if (text.length <= 200) return "safe";

  const mentionsSensitiveField = form?.fields.some((field) => field.sensitive !== "none"
    && field.label.trim() !== ""
    && folded.includes(foldSensitiveMatch(field.label)));

  if (mentionsSensitiveField === true
    || SENSITIVE_TERMS.test(folded)) {
    return "sensitive";
  }
  return "safe";
}
