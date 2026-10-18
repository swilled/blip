/** Shared finite settings accepted by both controls and deterministic server dispatch. */
export const SPEECH_RATES = [0.50, 0.63, 0.79, 1.00, 1.26, 1.59, 2.00] as const;
export const isSpeechRate = (rate: number): boolean => SPEECH_RATES.some(value => value === rate);
