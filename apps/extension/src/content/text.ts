/** Normalize page text and enforce both Unicode code-point and JavaScript UTF-16 bounds. */
export function boundedText(
  value: string | null | undefined,
  maxCodePoints = 200,
  maxUtf16Units = maxCodePoints,
): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/gu, " ")
    .trim();
  const pointLimit = Math.max(0, Math.trunc(maxCodePoints));
  const unitLimit = Math.max(0, Math.trunc(maxUtf16Units));
  let output = "";
  let points = 0;

  for (const codePoint of normalized) {
    if (points >= pointLimit || output.length + codePoint.length > unitLimit) break;
    output += codePoint;
    points += 1;
  }
  return output.trimEnd();
}
