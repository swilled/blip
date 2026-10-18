export interface MicrophoneInputSettings {
  channels?: number;
  sampleRate?: number;
  echoCancellation?: boolean | string;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export function microphoneConstraints(deviceId: string, echoCancellation: boolean, autoGainControl = false, noiseSuppression = echoCancellation): MediaStreamConstraints {
  return { audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: { ideal: 1 }, echoCancellation, noiseSuppression, autoGainControl } };
}
export function audioLevel(data: Float32Array): { rms: number; peak: number; clipped: number } {
  let energy = 0, peak = 0, clipped = 0;
  for (const sample of data) { const value = Number.isFinite(sample) ? Math.abs(sample) : 0; energy += value * value; peak = Math.max(peak, value); if (value >= 0.99) clipped++; }
  return { rms: data.length ? Math.sqrt(energy / data.length) : 0, peak, clipped };
}
export function microphoneLevelHint(rms: number, peak: number): string {
  if (peak >= 0.99) return "Microphone is too loud. Move it farther away or lower its input volume.";
  if (rms < 0.003) return "Very quiet. Speak closer or choose a different microphone.";
  return "Microphone is picking up sound.";
}
