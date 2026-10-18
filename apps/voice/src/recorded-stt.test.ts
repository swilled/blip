import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalTranscriber, createRecordedStt, encodeWav, type PcmRecording } from "./recorded-stt";

const tick = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
function setup() {
  const recording: PcmRecording = { sampleRate: 16000, stop: vi.fn(async () => [new Float32Array(16000).fill(0.1)]), cancel: vi.fn() };
  const options = { open: vi.fn(async () => recording), transcribe: vi.fn(async () => "read the form"), onFinal: vi.fn(), onError: vi.fn(), onStage: vi.fn() };
  return { recording, options, stt: createRecordedStt(options) };
}
afterEach(() => vi.useRealTimers());
describe("held recording with external recognition", () => {
  it("keeps recording through pauses and dispatches once only after release", async () => {
    vi.useFakeTimers();
    const { stt, options, recording } = setup();
    stt.press(); stt.press(); await tick();
    vi.advanceTimersByTime(5000);
    expect(options.onFinal).not.toHaveBeenCalled(); expect(options.transcribe).not.toHaveBeenCalled();
    expect(options.open).toHaveBeenCalledTimes(1); expect(options.onStage).toHaveBeenLastCalledWith("listening");
    stt.release(); stt.release(); await tick();
    expect(recording.stop).toHaveBeenCalledTimes(1); expect(options.transcribe).toHaveBeenCalledTimes(1);
    expect(options.onFinal).toHaveBeenCalledWith({ text: "read the form", alternatives: [] });
    expect(stt.isActive()).toBe(false);
  });
  it("cancels a late permission response and never transcribes its audio", async () => {
    const { options, recording } = setup();
    let resolve!: (recording: PcmRecording) => void;
    options.open = vi.fn(() => new Promise(r => { resolve = r; }));
    const stt = createRecordedStt(options); stt.press(); stt.release();
    resolve(recording); await tick();
    expect(recording.cancel).toHaveBeenCalled(); expect(options.transcribe).not.toHaveBeenCalled();
    expect(options.onFinal).not.toHaveBeenCalled(); expect(options.onError).toHaveBeenCalledTimes(1);
  });
  it("discards an old transcription after cancellation and a new hold", async () => {
    const { options } = setup();
    let resolve!: (text: string) => void;
    options.transcribe = vi.fn(() => new Promise(r => { resolve = r; }));
    const stt = createRecordedStt(options); stt.press(); await tick(); stt.release(); await tick();
    stt.cancel(); stt.press(); await tick(); resolve("submit survey"); await tick();
    expect(options.onFinal).not.toHaveBeenCalled(); expect(stt.isActive()).toBe(true); stt.cancel();
  });
  it("times out a held capture without sending a prefix", async () => {
    vi.useFakeTimers(); const { stt, options } = setup(); stt.press(); await tick();
    vi.advanceTimersByTime(10000); stt.release(); await tick();
    expect(options.onFinal).not.toHaveBeenCalled(); expect(options.transcribe).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("10-second") }));
  });
  it.each(["", "x".repeat(501)])("rejects empty and oversized transcription without dispatch", async text => {
    const { stt, options } = setup(); options.transcribe.mockResolvedValue(text);
    stt.press(); await tick(); stt.release(); await tick();
    expect(options.onFinal).not.toHaveBeenCalled(); expect(options.onError).toHaveBeenCalledTimes(1);
  });
  it("reports permission denial and recovers on the next hold", async () => {
    const { stt, options } = setup(); options.open.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    stt.press(); await tick(); expect(options.onError).toHaveBeenCalledWith(expect.objectContaining({ kind: "not-allowed" }));
    stt.press(); await tick(); stt.release(); await tick(); expect(options.onFinal).toHaveBeenCalledTimes(1);
  });
  it("encodes mono PCM and resamples complete 48 kHz input", () => {
    const bytes = encodeWav([new Float32Array(48000).fill(0.5)], 48000);
    expect(bytes.length).toBe(32044); const view = new DataView(bytes.buffer as ArrayBuffer);
    expect(view.getUint32(24, true)).toBe(16000); expect(view.getInt16(44, true)).toBe(16384);
    expect(() => encodeWav([new Float32Array(160001)], 16000)).toThrow("audio-too-long");
  });
  it("reports actual captured duration and levels separately from transcription", async () => {
    const t = setup(), onCapture = vi.fn();
    const stt = createRecordedStt({ ...t.options, onCapture });
    stt.press(); await tick(); stt.release(); await tick();
    expect(onCapture).toHaveBeenCalledWith({ durationSeconds: 1, rms: expect.closeTo(0.1), peak: expect.closeTo(0.1) });
  });
  it("uses the same-origin token and WAV endpoint without Chrome SpeechRecognition", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, token: "test-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "read the form" }) });
    const result = await createLocalTranscriber(request)(encodeWav([new Float32Array(16000)], 16000), new AbortController().signal);
    expect(result).toBe("read the form");
    expect(request.mock.calls[1][1]).toMatchObject({ method: "POST", headers: { "Content-Type": "audio/wav", "X-Blip-Stt": "test-token" } });
  });
});
