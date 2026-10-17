import type { LabelSource } from "@blip/protocol";

/**
 * Page text is untrusted (T-01-13). This strips C0/C1 control characters, collapses whitespace,
 * trims, and truncates by code points (never splitting a surrogate pair) so a long or hostile label
 * cannot make the FormModel schema-invalid.
 *
 * Note on lengths: the schema caps use `.max()`, which counts UTF-16 code units, so a code-point
 * truncation to `max` satisfies the cap only when no astral characters are present. To be safe for
 * both, we also clamp by code units without splitting a pair.
 */
export function cleanText(input: string | undefined | null, max: number): string {
  if (!input) return "";
  // Whitespace-like controls (tab, LF, VT, FF, CR) become spaces first so words do not fuse;
  // the remaining controls are dropped. Unicode separators are handled by the \s collapse below.
  const spaced = input.replace(/[\x09-\x0d]/g, " ");
  const stripped = spaced.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  const collapsed = stripped.replace(/\s+/g, " ").trim();

  let out = "";
  let codePoints = 0;
  for (const ch of collapsed) {
    if (codePoints >= max) break;
    // ch is one code point (1 or 2 UTF-16 units); keep the UTF-16 length within `max` too.
    if (out.length + ch.length > max) break;
    out += ch;
    codePoints += 1;
  }
  return out.trim();
}

export interface LabelCandidate {
  text: string;
  source: LabelSource;
  confidence: number;
}

export interface PickedLabel {
  label: string;
  labelSource: LabelSource;
  confidence: number;
}

// Tie-break order from D-12: aria, label, nearby-text, placeholder, inferred.
const SOURCE_RANK: Record<LabelSource, number> = {
  aria: 0,
  label: 1,
  "nearby-text": 2,
  placeholder: 3,
  inferred: 4,
};

/**
 * Highest confidence wins; ties break by source rank, then by original index (first wins).
 * Blank candidates are not candidates. No candidates: empty label, `inferred`, confidence 0, so
 * speech hedges instead of presenting a guess as confident (D-12).
 */
export function pickLabel(candidates: readonly LabelCandidate[]): PickedLabel {
  let best: LabelCandidate | undefined;
  for (const c of candidates) {
    if (c.text.trim() === "") continue;
    if (best === undefined) {
      best = c;
      continue;
    }
    // Iteration is in index order, so an equal candidate never replaces the earlier one.
    const better =
      c.confidence > best.confidence ||
      (c.confidence === best.confidence && SOURCE_RANK[c.source] < SOURCE_RANK[best.source]);
    if (better) best = c;
  }
  if (best === undefined) return { label: "", labelSource: "inferred", confidence: 0 };
  return { label: best.text, labelSource: best.source, confidence: best.confidence };
}
