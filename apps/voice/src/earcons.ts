// Short, human-authored Kenney interface sounds. Assets are CC0; see the
// adjacent LICENSE.txt and README.md in public/sounds/kenney.
import type { PayloadOf } from "@blip/protocol";

export type EarconName = PayloadOf<"earcon">["name"];

const SOUND_FILES: Record<EarconName, string> = {
  listening: "open_001.wav",
  thinking: "question_002.wav",
  done: "confirmation_001.wav",
  blocked: "back_002.wav",
  error: "error_002.wav",
};
const SOUND_NAMES = Object.keys(SOUND_FILES) as EarconName[];
const GAIN = 0.08;

export interface Earcons {
  /** Create/resume the AudioContext and preload CC0 audio after the start gate. */
  init(): void;
  play(name: EarconName): void;
}

export interface EarconOptions {
  createContext?: () => AudioContext;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
  baseUrl?: string;
}

export function createEarcons(options: EarconOptions = {}): Earcons {
  let ctx: AudioContext | null = null;
  const loaded = new Map<EarconName, Promise<AudioBuffer | null>>();
  const fetchAudio = options.fetchAudio ?? (async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`earcon fetch failed: ${response.status}`);
    return response.arrayBuffer();
  });

  function load(name: EarconName): Promise<AudioBuffer | null> {
    if (!ctx) return Promise.resolve(null);
    const cached = loaded.get(name);
    if (cached) return cached;
    const context = ctx;
    const url = new URL(`sounds/kenney/${SOUND_FILES[name]}`, options.baseUrl ?? document.baseURI).href;
    const pending = fetchAudio(url)
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => {
        loaded.delete(name); // A later play can retry if the local asset was unavailable.
        return null;
      });
    loaded.set(name, pending);
    return pending;
  }

  return {
    init() {
      ctx ??= (options.createContext ?? (() => new AudioContext()))();
      void ctx.resume();
      for (const name of SOUND_NAMES) void load(name);
    },
    play(name) {
      const context = ctx;
      if (!context) return;
      void load(name).then(buffer => {
        if (!buffer || context !== ctx) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime(GAIN, context.currentTime);
        gain.gain.linearRampToValueAtTime(0, context.currentTime + buffer.duration);
        source.connect(gain);
        gain.connect(context.destination);
        source.start(context.currentTime);
      });
    },
  };
}
