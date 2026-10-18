// One webkitSpeechRecognition start() per push-to-talk press (VOX-02).
// Keep continuous recognition active until the user releases the hold; never auto-restart.
// The recognition factory is injected so tests need no browser.

export const MAX_ALTERNATIVES = 3;
export const MAX_TEXT_CHARS = 500;

export const MSG_DIDNT_CATCH = "I didn't catch that. Hold the keys and try again, or type it.";
export const MSG_MIC =
  "I can't hear the microphone. Allow microphone access for this window, or type your command below.";
export const MSG_CLICK_WINDOW = "Click this window once, then hold the keys again.";
export const MSG_STT_UNAVAILABLE = "Speech recognition isn't available in this browser. Type your command instead.";

export interface SttAlternative {
  transcript: string;
  confidence: number;
}
export interface SttResult {
  isFinal: boolean;
  length: number;
  [index: number]: SttAlternative;
}
export interface SttResultEvent {
  resultIndex?: number;
  results: { length: number; [index: number]: SttResult };
}
export interface SttErrorEvent {
  error: string;
}

/** The subset of SpeechRecognition that Blip uses. */
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SttResultEvent) => void) | null;
  onerror: ((e: SttErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface SttFinal {
  text: string;
  /** 0..1, matches the protocol's sttConfidence. */
  confidence: number;
  /** Other hypotheses, at most 3, never containing text. Matches the protocol's alternatives. */
  alternatives: string[];
}

export type SttErrorKind = "no-speech" | "not-allowed" | "network" | "unfocused" | "other";
export interface SttError {
  kind: SttErrorKind;
  message: string;
}

export interface SttOptions {
  makeRecognition: () => RecognitionLike;
  onInterim: (text: string) => void;
  onFinal: (final: SttFinal) => void;
  onError: (error: SttError) => void;
  /** False when recognition must not start (for example the window has no focus and STT needs it). */
  canListen: () => boolean;
}

export interface Stt {
  press(): void;
  release(): void;
  isActive(): boolean;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function errorFor(code: string): SttError {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return { kind: "not-allowed", message: MSG_MIC };
  }
  if (code === "network") return { kind: "network", message: MSG_DIDNT_CATCH };
  if (code === "no-speech") return { kind: "no-speech", message: MSG_DIDNT_CATCH };
  return { kind: "other", message: MSG_DIDNT_CATCH };
}

export function createStt(opts: SttOptions): Stt {
  let rec: RecognitionLike | null = null;
  let active = false;
  let settled = false; // a final result or an error was already reported for this press

  function finish(): void {
    active = false;
    rec = null;
  }

  function report(error: SttError): void {
    if (settled) return;
    settled = true;
    opts.onError(error);
  }

  function buildFinal(e: SttResultEvent): SttFinal | null {
    const finals: SttResult[] = [];
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r && r.isFinal && r.length > 0) finals.push(r);
    }
    if (finals.length === 0) return null;
    const text = finals
      .map((r) => r[0]!.transcript.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_TEXT_CHARS);
    if (!text) return null;
    const confidence = clamp01(finals.reduce((sum, r) => sum + (r[0]!.confidence ?? 0), 0) / finals.length);
    const alternatives: string[] = [];
    const first = finals[0]!;
    for (let i = 1; i < first.length && alternatives.length < MAX_ALTERNATIVES; i++) {
      const alt = (first[i]?.transcript ?? "").trim().slice(0, MAX_TEXT_CHARS);
      if (alt && alt !== text && !alternatives.includes(alt)) alternatives.push(alt);
    }
    return { text, confidence, alternatives };
  }

  return {
    press() {
      if (active) return;
      if (!opts.canListen()) {
        opts.onError({ kind: "unfocused", message: MSG_CLICK_WINDOW });
        return;
      }
      settled = false;
      let r: RecognitionLike;
      try {
        r = opts.makeRecognition();
      } catch {
        report({ kind: "other", message: MSG_STT_UNAVAILABLE });
        return;
      }
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = MAX_ALTERNATIVES;
      let latestResult: SttResultEvent | null = null;
      r.onresult = (e) => {
        if (rec !== r) return;
        // The browser may finalize speech in multiple chunks. Keep the latest
        // complete result list and wait until `end` before sending the command.
        latestResult = e;
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res && res.length > 0) interim += res[0]!.transcript;
        }
        if (interim.trim()) opts.onInterim(interim.trim());
      };
      r.onerror = (e) => {
        if (rec !== r) return;
        // "aborted" follows our own stop() and is not a user-facing failure.
        if (e.error === "aborted") return;
        report(errorFor(e.error));
      };
      r.onend = () => {
        if (rec !== r) return;
        const final = latestResult ? buildFinal(latestResult) : null;
        finish();
        if (final && !settled) {
          settled = true;
          opts.onFinal(final);
          return;
        }
        report(errorFor("no-speech"));
      };
      rec = r;
      active = true;
      try {
        r.start();
      } catch {
        finish();
        report(errorFor("other"));
      }
    },
    release() {
      if (!active || !rec) return;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    },
    isActive: () => active,
  };
}
