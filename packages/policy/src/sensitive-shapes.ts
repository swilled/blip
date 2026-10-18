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

export type SensitiveValueShape = "card-number" | "ssn";

/**
 * Recognize a broad card-number shape, including a mistyped checksum, so a one-digit dictation
 * error cannot send a nearly-valid card number to a model. Luhn remains available for the
 * extension's existing post-write classification behavior.
 */
function isCardNumberShape(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || !/^[\d -]+$/.test(normalized)) return false;
  const digits = normalized.replace(/[ -]/g, "");
  return digits.length >= 13 && digits.length <= 19;
}

/** Classify only value shapes safe to recognize without field/DOM metadata. */
export function classifySensitiveShape(value: string): SensitiveValueShape | null {
  if (isSsn(value)) return "ssn";
  if (isCardNumberShape(value)) return "card-number";
  return null;
}
