import type { FormModel, Snapshot } from "@blip/protocol";

export type ResultFieldError = { label: string; message: string };
export type ResultErrors = { fieldErrors: ResultFieldError[]; pageErrors: string[] };
export type ResultInterpretation = {
  status: "confirmed" | "errors" | "unverified";
  confirmationNumber: string | null;
  fieldErrors: ResultFieldError[];
  pageErrors: string[];
};

export function formatResultErrors(errors: ResultErrors): string | null {
  const sections: string[] = [];
  if (errors.fieldErrors.length > 0) {
    sections.push(`Field errors in page order: ${errors.fieldErrors.map(({ label, message }, index) => `${index + 1}. ${label}: ${message}`).join(" ")}`);
  }
  if (errors.pageErrors.length > 0) sections.push(`Page errors: ${errors.pageErrors.join(" ")}`);
  return sections.length === 0 ? null : sections.join(" ");
}

export function formatResultSpeech(result: ResultInterpretation): string {
  const errors = formatResultErrors(result);
  if (result.status === "confirmed") {
    const number = result.confirmationNumber === null ? "" : ` Confirmation number ${result.confirmationNumber}.`;
    return `The page confirms the action.${number}${errors === null ? "" : ` ${errors}`}`;
  }
  if (result.status === "errors" && errors !== null) return `The page reports errors. ${errors}`;
  return "I couldn't verify the page outcome.";
}

const CONFIRMED = /\b(?:confirmed|confirmation\s+(?:number|no\.?|#)|successfully\s+(?:submitted|booked|processed|sent|paid)|submission\s+(?:complete|completed)|booking\s+(?:complete|completed)|payment\s+(?:complete|completed|successful))\b/i;
const NEGATED_CONFIRMATION = /\b(?:not|never|failed\s+to|unable\s+to|could\s+not|cannot|can't)\s+(?:(?:be|been)\s+)?(?:successfully\s+)?(?:confirmed|confirm|completed|complete|submitted|processed|booked|paid|sent)\b/i;
const CONFIRMATION_NUMBER = /\bconfirmation\s+(?:number|no\.?|#)\s*(?::|#|is)?\s*([A-Z0-9][A-Z0-9-]{1,31})\b/i;
const EXPLICIT_ERROR = /\b(?:errors?|invalid|failed|failure|unable\s+to|cannot|could\s+not|rejected|required|fix\s+\d+\s+errors?)\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_NUMBER = /(?<!\d)(?:\d[ -]?){9,19}(?!\d)/g;
const SENSITIVE_NUMBER = /\b(?:cvc|cvv|security code|otp|one[- ]time code|ssn|social security(?: number)?)\s*(?::|=|is)?\s*\d{3,16}\b/gi;
const SENSITIVE_SECRET = /\b(?:password|passcode)\s*(?::|=|is)\s*[^\s.,;]{3,64}/gi;
const MAX_CONFIRMATION_CHARS = 32;

type Evidence = { text: string; source: "heading" | "alert" };

function boundedEvidence(snapshot: Snapshot): Evidence[] {
  const headings = snapshot.headings.map((heading) => ({ text: heading.text.slice(0, 200), source: "heading" as const }));
  const alerts = snapshot.alerts.map((alert) => ({ text: alert.slice(0, 300), source: "alert" as const }));
  return [...headings, ...alerts];
}

function isConfirmationEvidence(text: string): boolean {
  return CONFIRMED.test(text) && !NEGATED_CONFIRMATION.test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactKnownValues(text: string, model: FormModel): string {
  let result = text;
  const values = model.fields
    .map((field) => field.value?.trim() ?? "")
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const value of values) {
    result = result.replace(new RegExp(escapeRegExp(value), "giu"), "[redacted]");
  }
  return result;
}

function safeText(value: string, model: FormModel, maxLength: number): string {
  let text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  text = redactKnownValues(text, model);
  text = text
    .replace(EMAIL, "[redacted]")
    .replace(LONG_NUMBER, "[redacted]")
    .replace(SENSITIVE_NUMBER, "[redacted]")
    .replace(SENSITIVE_SECRET, "[redacted]");
  return text;
}

function confirmationNumber(evidence: Evidence[], model: FormModel): string | null {
  for (const item of evidence) {
    if (!isConfirmationEvidence(item.text)) continue;
    const match = CONFIRMATION_NUMBER.exec(item.text);
    CONFIRMATION_NUMBER.lastIndex = 0;
    const candidate = match?.[1]?.slice(0, MAX_CONFIRMATION_CHARS);
    if (candidate === undefined || (candidate.match(/\d/g)?.length ?? 0) >= 9) continue;

    const isFieldValue = model.fields.some((field) => field.value !== null && field.value.trim().toLowerCase() === candidate.toLowerCase());
    if (!isFieldValue) return candidate;
  }
  return null;
}

function fieldErrors(model: FormModel): ResultFieldError[] {
  return [...model.fields]
    .sort((a, b) => a.order - b.order)
    .flatMap((field) => {
      const raw = field.error;
      if (raw === null || raw.trim() === "") return [];
      const label = safeText(field.label.trim() || "unlabeled field", model, 120);
      const message = safeText(raw, model, 300);
      return message === "" ? [] : [{ label, message }];
    });
}

function pageErrors(model: FormModel, evidence: Evidence[]): string[] {
  const confirmationMessages = new Set(
    evidence.filter((item) => isConfirmationEvidence(item.text)).map((item) => item.text.trim().toLocaleLowerCase()),
  );

  return model.pageErrors.flatMap((raw) => {
    // Baseline models keep all role=status/alert strings as pageErrors. Do not repeat a clean
    // confirmation as if it were an error, but retain the message when it also reports an error.
    const key = raw.trim().toLocaleLowerCase();
    if (confirmationMessages.has(key) && !EXPLICIT_ERROR.test(raw)) return [];
    const message = safeText(raw, model, 300);
    return message === "" ? [] : [message];
  });
}

/** Errors from the current FormModel, with success-only status messages omitted. */
export function interpretCurrentErrors(model: FormModel): ResultErrors {
  const alerts = model.pageErrors.map((text) => ({ text, source: "alert" as const }));
  return { fieldErrors: fieldErrors(model), pageErrors: pageErrors(model, alerts) };
}

/**
 * Classify a fresh result snapshot using only bounded headings/alerts and the corresponding model's
 * explicit field/page errors. Title, URL, dispatch status and absence of errors never prove success.
 */
export function interpretResult(snapshot: Snapshot, model: FormModel): ResultInterpretation {
  if (
    model.snapshotVersion !== snapshot.version ||
    model.structuralHash !== snapshot.structuralHash ||
    model.url !== snapshot.url
  ) {
    return { status: "unverified", confirmationNumber: null, fieldErrors: [], pageErrors: [] };
  }

  const evidence = boundedEvidence(snapshot);
  const confirmed = evidence.some((item) => isConfirmationEvidence(item.text));
  const errors = { fieldErrors: fieldErrors(model), pageErrors: pageErrors(model, evidence) };

  return {
    status: confirmed
      ? "confirmed"
      : errors.fieldErrors.length > 0 || errors.pageErrors.length > 0
        ? "errors"
        : "unverified",
    confirmationNumber: confirmed ? confirmationNumber(evidence, model) : null,
    ...errors,
  };
}
