// Short WebAudio tones for the five earcon names. Each is under 300 ms and well
// below speech volume. The AudioContext is created only after the start gate.
import type { PayloadOf } from "@blip/protocol";

export type EarconName = PayloadOf<"earcon">["name"];

interface Tone {
  freq: number;
  ms: number;
  type: OscillatorType;
  /** optional second note */
  freq2?: number;
}

const TONES: Record<EarconName, Tone> = {
  listening: { freq: 880, ms: 120, type: "sine" },
  thinking: { freq: 520, ms: 90, type: "sine" },
  done: { freq: 660, ms: 140, type: "sine", freq2: 880 },
  blocked: { freq: 330, ms: 220, type: "square" },
  error: { freq: 220, ms: 260, type: "sawtooth" },
};

const GAIN = 0.08;

export interface Earcons {
  /** Create/resume the AudioContext. Call from the gate activation. */
  init(): void;
  play(name: EarconName): void;
}

export function createEarcons(): Earcons {
  let ctx: AudioContext | null = null;
  return {
    init() {
      ctx ??= new AudioContext();
      void ctx.resume();
    },
    play(name) {
      if (!ctx) return;
      const tone = TONES[name];
      const t0 = ctx.currentTime;
      const dur = tone.ms / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, t0);
      if (tone.freq2) osc.frequency.setValueAtTime(tone.freq2, t0 + dur / 2);
      gain.gain.setValueAtTime(GAIN, t0);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    },
  };
}
