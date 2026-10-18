import { SPEECH_RATES } from "@blip/dialogue";
export { SPEECH_RATES } from "@blip/dialogue";
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

export function createSpeechRate(): number {
  return DEFAULT_RATE;
}

export function adjustSpeechRate(
  rate: number,
  direction: SpeechRateDirection,
): SpeechRateAdjustment {
  const index = SPEECH_RATES.reduce((best, value, i) => Math.abs(value - rate) < Math.abs(SPEECH_RATES[best]! - rate) ? i : best, 0);
  const atLimit = direction === "faster" ? index === SPEECH_RATES.length - 1 : index === 0;
  if (atLimit) {
    return { rate, limit: direction === "faster" ? "fastest" : "slowest" };
  }

  return { rate: SPEECH_RATES[index + (direction === "faster" ? 1 : -1)]!, limit: null };
}

/** Rapid adjustments change the display immediately but acknowledge only the latest selection. */
export function createRateCommandController(deps: {
  changed(rate: number, acknowledgement: string): void;
  acknowledge(message: string): void;
}) {
  let rate = createSpeechRate();
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    get: () => rate,
    adjust(direction: SpeechRateDirection) {
      const next = adjustSpeechRate(rate, direction);
      rate = next.rate;
      const message = next.limit === "fastest" ? "Already at the fastest rate." : next.limit === "slowest" ? "Already at the slowest rate."
        : direction === "faster" ? "Speaking faster." : "Speaking slower.";
      deps.changed(rate, message);
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { pending = null; deps.acknowledge(message); }, 200);
    },
    cancel() { if (pending) clearTimeout(pending); pending = null; },
  };
}
