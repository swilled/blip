// Speech queue with per-speakId completion reporting, an onend gate with a
// timeout, and the "One moment." timer (VOX-04). No DOM access: the synthesizer
// is injected (production passes a thin wrapper around window.speechSynthesis).

export interface SynthHandlers {
  onstart?: () => void;
  onend: () => void;
  // Called on any synth error, including "interrupted" and "canceled".
  onerror: (reason?: string) => void;
}

export interface Synth {
  /** Maximum time allowed for first audio when the synthesizer has a lazy-loading model. */
  startupTimeoutMs?: number;
  speak(text: string, handlers: SynthHandlers, rate: number): void;
  cancel(): void;
}

export interface TtsDone {
  speakId?: string;
  interrupted: boolean;
}

export interface TtsDeps {
  /** The integrated server owns tracked filler; standalone test harnesses may opt in. */
  localFiller?: boolean;
  synth: Synth;
  getRate?: () => number;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onDone: (d: TtsDone) => void;
  onFailure?: (message: string) => void;
}

export interface Tts {
  speak(text: string, opts?: { speakId?: string }): void;
  cancel(): void;
  markSent(): void;
  markReplied(): void;
  isSpeaking(): boolean;
  msSinceSpeechEnd(): number;
}

const ONE_MOMENT_MS = 1500;
const TAIL_MS = 400;
const MS_PER_WORD = 400;
const GATE_SLACK_MS = 1000;

interface Item {
  speakId?: string;
  sentences: string[];
  rate?: number;
}

function splitSentences(text: string): string[] {
  const abbreviations = new Set(["dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "vs", "e.g", "i.e", "etc", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"]);
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?]/.test(text[i]!) || (i + 1 < text.length && !/\s/.test(text[i + 1]!))) continue;
    const word = text.slice(start, i).match(/([\w.]+)$/)?.[1]?.toLowerCase() ?? "";
    if (text[i] === "." && abbreviations.has(word)) continue;
    parts.push(text.slice(start, i + 1).trim()); start = i + 1;
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function estimateMs(sentence: string, rate: number): number {
  const words = sentence.split(/\s+/).filter(Boolean).length;
  return Math.ceil((words * MS_PER_WORD) / Math.max(0.1, rate));
}

export function createTts(deps: TtsDeps): Tts {
  const { synth, now, setTimer, clearTimer, onDone } = deps;
  const getRate = deps.getRate ?? (() => 1.0);
  const queue: Item[] = [];
  let active: Item | null = null;
  let sentenceIdx = 0;
  let generation = 0; // invalidates stale synth callbacks and timers
  let gateTimer: unknown = null;
  let tailTimer: unknown = null;
  let oneMomentTimer: unknown = null;
  let lastEnd: number | null = null;

  const clearGate = (): void => {
    if (gateTimer !== null) clearTimer(gateTimer);
    gateTimer = null;
  };
  const clearTail = (): void => {
    if (tailTimer !== null) clearTimer(tailTimer);
    tailTimer = null;
  };
  const clearOneMoment = (): void => {
    if (oneMomentTimer !== null) clearTimer(oneMomentTimer);
    oneMomentTimer = null;
  };

  function finishItem(interrupted = false): void {
    const item = active;
    active = null;
    lastEnd = now();
    if (item) onDone({ speakId: item.speakId, interrupted });
    pump();
  }

  function sentenceEnded(gen: number, interrupted = false): void {
    if (gen !== generation) return;
    generation += 1; // later duplicate end/error/gate callbacks for this sentence are stale
    clearGate();
    const item = active;
    if (!item) return;
    // An error or watchdog timeout is not proof that the words finished. Stop this whole message
    // and report it interrupted so a read-back can never arm from an estimated completion time.
    if (interrupted) {
      clearTail();
      synth.cancel();
      deps.onFailure?.("Speech stopped before it finished. Try the command again.");
      finishItem(true);
      return;
    }
    sentenceIdx += 1;
    if (sentenceIdx < item.sentences.length) {
      speakSentence();
      return;
    }
    // Last sentence: the tail lets the audio fade and echo settle before we report done.
    const tailGen = generation;
    tailTimer = setTimer(() => {
      tailTimer = null;
      if (tailGen !== generation) return;
      finishItem();
    }, TAIL_MS);
  }

  function speakSentence(): void {
    const item = active;
    if (!item) return;
    const text = item.sentences[sentenceIdx];
    generation += 1;
    const gen = generation;
    const rate = item.rate ?? 1;
    gateTimer = setTimer(() => {
      gateTimer = null;
      sentenceEnded(gen, true);
    }, synth.startupTimeoutMs ?? 8000);
    let started = false;
    const handlers: SynthHandlers = {
      onstart: () => {
        if (gen !== generation || started) return;
        started = true; clearGate();
        gateTimer = setTimer(() => { gateTimer = null; sentenceEnded(gen, true); }, Math.min(120000, Math.max(5000, estimateMs(text, rate) * 2 + GATE_SLACK_MS * 2)));
      },
      onend: () => sentenceEnded(gen),
      // Chrome reports canceled/interrupted utterances as errors, not successful ends.
      onerror: () => sentenceEnded(gen, true),
    };
    try { synth.speak(text, handlers, rate); } catch { sentenceEnded(gen, true); }
  }

  function pump(): void {
    if (active) return;
    const next = queue.shift();
    if (!next) return;
    active = next;
    active.rate = getRate();
    sentenceIdx = 0;
    speakSentence();
  }

  const api: Tts = {
    speak(text, opts) {
      const sentences = splitSentences(text);
      if (sentences.length === 0) {
        // Nothing to say: still report completion so the caller never waits forever.
        onDone({ speakId: opts?.speakId, interrupted: false });
        return;
      }
      queue.push({ speakId: opts?.speakId, sentences });
      pump();
    },
    cancel() {
      clearOneMoment();
      const pending: Item[] = [];
      if (active) pending.push(active);
      pending.push(...queue);
      queue.length = 0;
      active = null;
      generation += 1;
      clearGate();
      clearTail();
      if (pending.length === 0) return;
      synth.cancel();
      lastEnd = now();
      for (const item of pending) onDone({ speakId: item.speakId, interrupted: true });
    },
    markSent() {
      clearOneMoment();
      if (deps.localFiller === false) return;
      oneMomentTimer = setTimer(() => {
        oneMomentTimer = null;
        api.speak("One moment.");
      }, ONE_MOMENT_MS);
    },
    markReplied() {
      clearOneMoment();
    },
    isSpeaking() {
      return active !== null || queue.length > 0;
    },
    msSinceSpeechEnd() {
      return lastEnd === null ? Number.POSITIVE_INFINITY : now() - lastEnd;
    },
  };
  return api;
}
