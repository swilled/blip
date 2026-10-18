import { describe, expect, it } from "vitest";
import { audioLevel, microphoneConstraints, microphoneLevelHint } from "./microphone";
describe("microphone diagnosis", () => {
  it("pins the selected input and allows a comparison with browser audio filtering disabled", () => {
    expect(microphoneConstraints("headset", false)).toMatchObject({ audio: { deviceId: { exact: "headset" }, autoGainControl: false, echoCancellation: false, noiseSuppression: false } });
    expect(microphoneConstraints("", true)).toMatchObject({ audio: { autoGainControl: false, echoCancellation: true, noiseSuppression: true } });
    expect((microphoneConstraints("", true).audio as MediaTrackConstraints).deviceId).toBeUndefined();
  });
  it("distinguishes silence, clipping and usable signal without inventing speech confidence", () => {
    expect(audioLevel(new Float32Array(10))).toEqual({ rms: 0, peak: 0, clipped: 0 });
    const quiet = audioLevel(new Float32Array(128).fill(0.001));
    expect(microphoneLevelHint(quiet.rms, quiet.peak)).toContain("Very quiet");
    const clipped = audioLevel(new Float32Array([-1, 0, 1]));
    expect(clipped.clipped).toBe(2); expect(microphoneLevelHint(clipped.rms, clipped.peak)).toContain("too loud");
    expect(microphoneLevelHint(0.05, 0.2)).toContain("picking up sound");
  });
});
