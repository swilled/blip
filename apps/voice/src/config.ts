// Constants copied from 01-SPIKE-DECISIONS.md and M0-SIGNOFF.md.
// Change them there first; this file only mirrors the decisions.

export type BargeInMode = "voice" | "ptt-only";

/** Spike F result (01-SPIKE-DECISIONS.md): echo is real, so ptt-only. */
export const BARGE_IN_MODE: BargeInMode = "ptt-only";

/** Spike F: an echo filter is required before any voice barge-in. */
export const ECHO_FILTER_REQUIRED = true;

/** Spike A: STT_UNFOCUSED = PASS (medium confidence). */
export const STT_ENABLED_WHEN_UNFOCUSED = true;

/** Window after speech end in which an utterance counts as heard during speech. */
export const GUARD_MS = 1000;

/**
 * Core's server-side GATE-08 confirm guard is still pending (core Phase 3).
 * Flip to true in one line after core merges it (HO-6).
 */
export const GATE_08_PRESENT = false;

/** M0-SIGNOFF.md: B (loopback sidecar on 7778); no answer from Pranav on A (ptt.hold). */
export const PTT_DELIVERY: "A" | "B" = "B";

/** True only once optional heardDuringSpeech is merged into the protocol (request R2). */
export const SEND_HEARD_DURING_SPEECH = false;

/**
 * The barge-in mode the rest of the window must read. Voice barge-in opens the mic during
 * Blip's speech, so it is forced off until GATE_08_PRESENT is true, whatever BARGE_IN_MODE says.
 */
export function effectiveBargeInMode(
  gatePresent: boolean = GATE_08_PRESENT,
  mode: BargeInMode = BARGE_IN_MODE,
): BargeInMode {
  return gatePresent ? mode : "ptt-only";
}
