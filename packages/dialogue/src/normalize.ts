/** Normalize command text using the reducer's established ASCII grammar. */
export function normalizeCommand(text: string): string {
  if (text.length > 200) return "";
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compatibility name for the reducer helper that this module replaces. */
export const normalize = normalizeCommand;

/** Strip untrusted control characters, fold whitespace, and cap spoken page text. */
export function cleanSpoken(text: string, max = 80): string {
  if (text.length > 200) return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, Math.max(0, max));
}

/** Compatibility name for the reducer's former 80-character title cleaner. */
export function cleanTitle(title: string): string {
  return cleanSpoken(title, 80);
}

/** Remove controls and cap values to the protocol's 300-character value limit. */
export function cleanValue(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const DIGITS: Readonly<Record<string, string>> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};
const SMALL_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Parse a conventional English cardinal number from zero through 999. */
export function wordsToNumber(tokens: string[]): number | null {
  if (tokens.length === 0 || tokens.length > 12) return null;
  const words = tokens.map((token) => token.toLowerCase());
  if (words.some((word) => !word)) return null;

  const hundredAt = words.indexOf("hundred");
  if (hundredAt >= 0) {
    if (hundredAt !== 1 || !(words[0]! in DIGITS) || words[0] === "zero") return null;
    let remainder = words.slice(2);
    if (remainder[0] === "and") remainder = remainder.slice(1);
    if (remainder.includes("and") || remainder.includes("hundred")) return null;
    const tail = parseUnderHundred(remainder);
    return tail === null ? (remainder.length === 0 ? Number(DIGITS[words[0]!]) * 100 : null) : Number(DIGITS[words[0]!]) * 100 + tail;
  }
  if (words.includes("and")) return null;
  return parseUnderHundred(words);
}

function parseUnderHundred(words: string[]): number | null {
  if (words.length === 0) return 0;
  if (words.length === 1) return SMALL_NUMBERS[words[0]!] ?? TENS[words[0]!] ?? null;
  if (words.length === 2 && words[0]! in TENS && words[1]! in DIGITS && words[1] !== "zero") {
    return TENS[words[0]!]! + Number(DIGITS[words[1]!]);
  }
  return null;
}

function digitWord(word: string, allowOh: boolean): string | null {
  if (word in DIGITS) return DIGITS[word]!;
  if (allowOh && (word === "oh" || word === "o")) return "0";
  return null;
}

function isDigitWord(word: string): boolean {
  return word in DIGITS || word === "oh" || word === "o";
}

/** Convert spoken email syntax to a validated lowercase address. */
export function normalizeEmail(text: string): string | null {
  if (text.length > 200) return null;
  const lowered = text.toLowerCase().replace(/[.,!?]+$/g, "");
  const address = lowered.includes("@")
    ? lowered.replace(/\s+/g, "")
    : spokenEmail(lowered);
  if (address === null) return null;
  // Linear validation: no nested quantifiers and no page-provided pattern.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

function spokenEmail(text: string): string | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  let atIndex = -1;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === "at") atIndex = i;
  }
  if (atIndex < 0) return null;

  const mapToken = (token: string, index: number): string => {
    if (token === "dot" || token === "period") return ".";
    if (token === "dash" || token === "hyphen") return "-";
    if (token === "underscore") return "_";
    if (token === "plus") return "+";
    const digit = DIGITS[token];
    if (digit !== undefined) return digit;
    if (token === "oh" && ((index > 0 && isDigitWord(tokens[index - 1]!)) || (index + 1 < tokens.length && isDigitWord(tokens[index + 1]!)))) return "0";
    return token;
  };

  const left = tokens.slice(0, atIndex).map(mapToken).join("");
  const right = tokens.slice(atIndex + 1).map(mapToken).join("");
  return `${left}@${right}`;
}

/** Convert dictated phone/number words while leaving already typed digits intact. */
export function normalizeNumberish(text: string, kind: "tel" | "number" | "text"): string {
  if (text.length > 200 || kind === "text" || /[0-9]/.test(text)) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  const words = trimmed.toLowerCase().split(/\s+/);

  const cardinal = wordsToNumber(words);
  if (cardinal !== null) return String(cardinal);

  const converted: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (word === "double" || word === "triple") {
      const next = words[i + 1];
      const digit = next === undefined ? null : digitWord(next, true);
      if (digit !== null) {
        converted.push(digit.repeat(word === "double" ? 2 : 3));
        i += 1;
        continue;
      }
    }
    converted.push(digitWord(word, true) ?? word);
  }
  if (kind === "tel" && converted.every((part) => /^[0-9]+$/.test(part))) return converted.join("");
  return converted.join(" ");
}

/** Convert stored values to short, TTS-friendly text. */
export function speakable(value: string, kind: "email" | "tel" | "number" | "text"): string {
  if (value.length > 200 || kind === "text") return value;
  if (kind === "email") return value.replace(/@/g, " at ").replace(/\./g, " dot ").replace(/\s+/g, " ").trim();
  return value.replace(/[0-9]{4,}/g, (digits) => [...digits].join(" ")).replace(/\s+/g, " ").trim();
}
