import { describe, expect, it, vi } from "vitest";
import { createEarcons } from "./earcons";

async function flushPromises() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
}

describe("earcons", () => {
  it("loads the bundled CC0 samples and plays the selected cue at a quiet level", async () => {
    const source = { buffer: null, connect: vi.fn(), start: vi.fn() } as unknown as AudioBufferSourceNode;
    const gain = {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    } as unknown as GainNode;
    const buffer = { duration: 0.15 } as AudioBuffer;
    const context = {
      currentTime: 2,
      destination: {} as AudioNode,
      resume: vi.fn(async () => {}),
      decodeAudioData: vi.fn(async () => buffer),
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => gain),
    } as unknown as AudioContext;
    const urls: string[] = [];
    const earcons = createEarcons({
      createContext: () => context,
      baseUrl: "http://127.0.0.1:7777/voice/",
      fetchAudio: async url => { urls.push(url); return new ArrayBuffer(8); },
    });

    earcons.init();
    await flushPromises();
    earcons.play("listening");
    await flushPromises();

    expect(urls).toEqual(expect.arrayContaining([
      "http://127.0.0.1:7777/voice/sounds/kenney/open_001.wav",
      "http://127.0.0.1:7777/voice/sounds/kenney/question_002.wav",
      "http://127.0.0.1:7777/voice/sounds/kenney/confirmation_001.wav",
      "http://127.0.0.1:7777/voice/sounds/kenney/back_002.wav",
      "http://127.0.0.1:7777/voice/sounds/kenney/error_002.wav",
    ]));
    expect(context.decodeAudioData).toHaveBeenCalledTimes(5);
    expect(source.buffer).toBe(buffer);
    expect(source.start).toHaveBeenCalledWith(2);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.08, 2);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.15);
  });

  it("does not attempt audio playback before the start gate initializes audio", () => {
    const createContext = vi.fn();
    const earcons = createEarcons({ createContext });
    earcons.play("listening");
    expect(createContext).not.toHaveBeenCalled();
  });
});
