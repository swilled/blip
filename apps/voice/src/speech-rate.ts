export type SpeechRateDirection = "faster" | "slower";

export function createSpeechRate(): number {
  return 0;
}

export function adjustSpeechRate(
  rate: number,
  _direction: SpeechRateDirection,
): { rate: number; limit: "fastest" | "slowest" | null } {
  return { rate, limit: null };
}
