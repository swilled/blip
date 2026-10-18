import { describe, expect, it, vi } from "vitest";
import { createKokoroSynth, KOKORO_DEFAULT_VOICE, type KokoroModel } from "./kokoro-synth";
import type { SynthHandlers } from "./tts";

function makeHarness(model: Promise<KokoroModel> | KokoroModel, onStatus = vi.fn()) {
  const generated: Array<{ text: string; voice: string; speed: number }> = [];
  const source = {
    buffer: null as AudioBuffer | null,
    onended: null as ((event: Event) => void) | null,
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  };
  const native = {
    speak: vi.fn(), cancel: vi.fn(), setVoice: vi.fn(), dispose: vi.fn(),
  };
  const context = {
    state: "running",
    destination: {},
    createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => source),
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const actualModel = model instanceof Promise ? model : Promise.resolve(model);
  const synth = createKokoroSynth({
    native: native as never,
    loadModel: async () => actualModel,
    createAudioContext: () => context as never,
    onStatus,
  });
  const ttsHandlers: SynthHandlers = { onstart: vi.fn(), onend: vi.fn(), onerror: vi.fn() };
  return { synth, generated, source, native, context, ttsHandlers, onStatus };
}

function modelWithSpy(generate = vi.fn(async (_text: string, _options: { voice: string; speed: number }) => ({ audio: new Float32Array([0, 0.1]), sampling_rate: 24_000 }))) {
  const model: KokoroModel = {
    async generate(text, options) {
      generate(text, options);
      return { audio: new Float32Array([0, 0.1]), sampling_rate: 24_000 };
    },
  };
  return { model, generate };
}

describe("Kokoro browser speech synthesis", () => {
  it("uses the natural default voice and applies the selected speech rate", async () => {
    const { model, generate } = modelWithSpy();
    const h = makeHarness(model);
    h.synth.speak("Hello there.", h.ttsHandlers, 1.2);
    await vi.waitFor(() => expect(h.source.start).toHaveBeenCalledOnce());

    expect(generate).toHaveBeenCalledWith("Hello there.", { voice: KOKORO_DEFAULT_VOICE, speed: 1.2 });
    expect(h.ttsHandlers.onstart).toHaveBeenCalledOnce();
    h.source.onended?.(new Event("ended"));
    expect(h.ttsHandlers.onend).toHaveBeenCalledOnce();
    h.synth.dispose();
  });

  it("falls back to the local browser voice if Kokoro cannot load", async () => {
    const status = vi.fn();
    const h = makeHarness(Promise.reject(new Error("offline")), status);
    const handlers: SynthHandlers = { onstart: vi.fn(), onend: vi.fn(), onerror: vi.fn() };
    h.synth.speak("Hello.", handlers, 0.85);
    await vi.waitFor(() => expect(h.native.speak).toHaveBeenCalledOnce());

    expect(h.native.speak.mock.calls[0]![0]).toBe("Hello.");
    expect(h.native.speak.mock.calls[0]![2]).toBe(0.85);
    expect(status).toHaveBeenCalledWith("Kokoro could not load. Using the browser's voice instead.");
  });

  it("does not start playback when canceled while the model is generating", async () => {
    let resolveModel!: (model: KokoroModel) => void;
    const modelPending = new Promise<KokoroModel>(resolve => { resolveModel = resolve; });
    const h = makeHarness(modelPending);
    h.synth.speak("Canceled.", h.ttsHandlers, 1);
    h.synth.cancel();
    const { model } = modelWithSpy();
    resolveModel(model);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.context.createBufferSource).not.toHaveBeenCalled();
    expect(h.ttsHandlers.onstart).not.toHaveBeenCalled();
  });

  it("routes an explicit native voice selection through the browser fallback", () => {
    const { model } = modelWithSpy();
    const h = makeHarness(model);
    h.synth.setVoice("native:windows-voice");
    h.synth.speak("Hello.", h.ttsHandlers, 1);
    expect(h.native.setVoice).toHaveBeenCalledWith("windows-voice");
    expect(h.native.speak).toHaveBeenCalledOnce();
  });
});
