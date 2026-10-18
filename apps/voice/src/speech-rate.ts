export type SpeechRateDirection = "faster" | "slower";

export function parseSpeechRateCommand(text: string): SpeechRateDirection | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return normalized === "faster" || normalized === "slower" ? normalized : null;
}

export interface SpeechRateAdjustment {
  rate: number;
  limit: "fastest" | "slowest" | null;
}

const DEFAULT_RATE = 1.0;
const MIN_RATE = 0.5;
const MAX_RATE = 2.0;
const RATE_STEP = 0.2;

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
