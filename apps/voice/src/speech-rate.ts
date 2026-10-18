export type SpeechRateDirection = "faster" | "slower";

export interface SpeechRateAdjustment {
  rate: number;
  limit: "fastest" | "slowest" | null;
}

const DEFAULT_RATE = 1.0;
const MIN_RATE = 0.8;
const MAX_RATE = 1.5;
const RATE_STEP = 0.1;

export function createSpeechRate(): number {
  return DEFAULT_RATE;
}

export function adjustSpeechRate(
  rate: number,
  direction: SpeechRateDirection,
): SpeechRateAdjustment {
  const atLimit = direction === "faster" ? rate >= MAX_RATE : rate <= MIN_RATE;
  if (atLimit) {
    return { rate, limit: direction === "faster" ? "fastest" : "slowest" };
  }

  const delta = direction === "faster" ? RATE_STEP : -RATE_STEP;
  const next = Math.round((rate + delta) * 10) / 10;
  return { rate: Math.min(MAX_RATE, Math.max(MIN_RATE, next)), limit: null };
}
