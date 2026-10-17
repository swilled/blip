import type { Field, FormModel } from "@blip/protocol";
import { classifySensitiveShape, type SensitiveValueShape } from "@blip/policy/sensitive-shapes";
import { matchFieldPhrase, safePhraseForBrain } from "../phrases";

const PRIVATE_FIELD_SPEECH = "That field is private. You can type it now.";
const CLARIFY_SECRET_FIELD_SPEECH = "Please restate the field label without its value.";

export type PrivacyHandoff =
  | { kind: "focus-and-type"; fieldId: string; fieldLabel: string; spokenText: string }
  | { kind: "clarify"; spokenText: string };

/** The only provider-bound strings produced by the privacy gate are safe or explicitly redacted. */
export type BrainInputDecision =
  | { kind: "safe"; providerText: string }
  | { kind: "redacted-command"; providerText: string }
  | { kind: "withhold-and-handoff"; handoff: PrivacyHandoff };

const PASSWORD_VALUE_PATTERNS = [
  /\bmy\s+password\s+is\s+(.+)$/iu,
  /\bpassword\s*[:=]\s*(.+)$/iu,
] as const;

function passwordValueIsPresent(text: string): boolean {
  return PASSWORD_VALUE_PATTERNS.some((pattern) => {
    const match = pattern.exec(text);
    return match !== null && match[1]!.trim().length > 0;
  });
}

function shapeInUtterance(text: string): SensitiveValueShape | "password" | null {
  if (passwordValueIsPresent(text)) return "password";

  const explicitSsn = /\b\d{3}-\d{2}-\d{4}\b/gu;
  for (const match of text.matchAll(explicitSsn)) {
    const shape = classifySensitiveShape(match[0]);
    if (shape === "ssn") return shape;
  }

  // A mistaken checksum should still be withheld. Restrict candidates to digit/space/hyphen runs,
  // then let the shared classifier enforce the 13-19 digit boundary.
  const cardCandidates = /\d[\d -]{11,}\d/gu;
  for (const match of text.matchAll(cardCandidates)) {
    const shape = classifySensitiveShape(match[0]);
    if (shape === "card-number") return shape;
  }
  return null;
}

/** Detect value-shaped secrets without needing a page model, for value-free transcript routing. */
export function containsSensitiveUtterance(text: string): boolean {
  return shapeInUtterance(text) !== null;
}

function labelMatches(model: FormModel, requestedLabel: string): Field[] {
  const requested = requestedLabel.trim().toLocaleLowerCase();
  if (requested === "") return [];
  const exact = model.fields.filter((field) => field.label.trim().toLocaleLowerCase() === requested);
  if (exact.length > 0) return exact;
  return model.fields.filter((field) => {
    const label = field.label.trim().toLocaleLowerCase();
    return label !== "" && (label.startsWith(requested) || label.includes(requested) || requested.includes(label));
  });
}

function isPrivateField(field: Field): boolean {
  return field.type === "password" || field.sensitive !== "none";
}

function isTargetForShape(field: Field, shape: SensitiveValueShape | "password"): boolean {
  if (shape === "password") {
    return field.type === "password" || field.sensitive === "password" || /\b(password|passcode|pwd)\b/iu.test(field.label);
  }
  if (shape === "card-number") {
    return field.sensitive === "card-number" ||
      /\b(?:credit|debit)\s+card(?:\s+(?:number|no))?\b|\bcard\s+(?:number|no)\b|\bccn\b/iu.test(field.label);
  }
  return field.sensitive === "ssn" || /\b(?:ssn|social\s+security)\b/iu.test(field.label);
}

function uniqueField(fields: Field[]): Field | null {
  return fields.length === 1 ? fields[0]! : null;
}

function handoffForSecret(
  model: FormModel,
  shape: SensitiveValueShape | "password",
  requestedLabel?: string,
): BrainInputDecision {
  const field = requestedLabel === undefined
    ? uniqueField(model.fields.filter((candidate) => isTargetForShape(candidate, shape)))
    : uniqueField(labelMatches(model, requestedLabel));
  if (field !== null && field.label.trim() !== "") {
    return {
      kind: "withhold-and-handoff",
      handoff: {
        kind: "focus-and-type",
        fieldId: field.id,
        fieldLabel: field.label,
        spokenText: PRIVATE_FIELD_SPEECH,
      },
    };
  }
  return {
    kind: "withhold-and-handoff",
    handoff: { kind: "clarify", spokenText: CLARIFY_SECRET_FIELD_SPEECH },
  };
}

/**
 * Decide what may cross the provider boundary. Field values are always replaced with the existing
 * safe phrase; obvious secrets and payment/SSN shapes are withheld and routed to local handoff only.
 */
export function decideUtteranceForBrain(text: string, model: FormModel): BrainInputDecision {
  const phrase = matchFieldPhrase(text);
  if (phrase !== null) {
    if (phrase.type === "fill" || phrase.type === "select") {
      const valueShape = classifySensitiveShape(phrase.value);
      const passwordShape = passwordValueIsPresent(phrase.value);
      const field = uniqueField(labelMatches(model, phrase.label));
      if (passwordShape || valueShape !== null || (field !== null && isPrivateField(field))) {
        return handoffForSecret(
          model,
          passwordShape ? "password" : valueShape ?? "password",
          phrase.label,
        );
      }
    }
    return { kind: "redacted-command", providerText: safePhraseForBrain(phrase) };
  }

  const shape = shapeInUtterance(text);
  if (shape !== null) return handoffForSecret(model, shape);
  return { kind: "safe", providerText: text };
}
