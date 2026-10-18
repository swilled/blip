// One logical utterance per physical hold; browser sessions may recover inside it.
export const MAX_ALTERNATIVES = 3;
export const MAX_TEXT_CHARS = 500;
export const MSG_DIDNT_CATCH = "I didn't catch that. Hold the keys and try again, or type it.";
export const MSG_MIC = "Microphone access is blocked. Allow it for this Blip window, then hold to talk again.";
export const MSG_MIC_MISSING = "No microphone could be opened. Check your recording device and Windows microphone access.";
export const MSG_STT_NETWORK = "The speech recognition service is unavailable. Check the internet connection, then try again or type.";
export const MSG_CLICK_WINDOW = "Click this window once, then hold the keys again.";
export const MSG_STT_UNAVAILABLE = "Speech recognition isn't available in this browser. Type your command instead.";
export type CaptureStage = "starting" | "listening" | "recovering" | "finalizing" | "idle";
export interface SttAlternative { transcript: string; confidence: number }
export interface SttResult { isFinal: boolean; length: number; [index: number]: SttAlternative }
export interface SttResultEvent { resultIndex?: number; results: { length: number; [index: number]: SttResult } }
export interface SttErrorEvent { error: string }
export interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onresult: ((e: SttResultEvent) => void) | null;
  onerror: ((e: SttErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort?(): void;
}
export interface SttFinal { text: string; confidence?: number; alternatives: string[] }
export type SttErrorKind = "no-speech" | "not-allowed" | "audio-capture" | "network" | "unfocused" | "other";
export interface SttError { kind: SttErrorKind; message: string }
export interface SttOptions {
  makeRecognition: () => RecognitionLike;
  onInterim: (text: string) => void;
  onFinal: (final: SttFinal) => void;
  onError: (error: SttError) => void;
  onStage?: (stage: CaptureStage) => void;
  canListen: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}
export interface Stt { press(): void; release(): void; cancel(reason?: string): void; isActive(): boolean }
interface Chunk { text: string; confidence: number; alternatives: string[] }
interface Capture {
  generation: number; held: boolean; rec: RecognitionLike | null; settled: boolean;
  chunks: Chunk[]; current: Chunk[]; pendingInterim: boolean; retries: number; startedAt: number;
  timers: Set<unknown>; restart?: unknown; startup?: unknown;
}
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
function mappedError(code: string): SttError {
  if (code === "not-allowed" || code === "service-not-allowed") return { kind: "not-allowed", message: MSG_MIC };
  if (code === "audio-capture") return { kind: "audio-capture", message: MSG_MIC_MISSING };
  if (code === "network") return { kind: "network", message: MSG_STT_NETWORK };
  if (code === "language-not-supported") return { kind: "other", message: "English speech recognition is unavailable in this browser. Type your command." };
  return { kind: code === "no-speech" ? "no-speech" : "other", message: MSG_DIDNT_CATCH };
}
export function createStt(opts: SttOptions): Stt {
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
  let owner: Capture | null = null;
  let generation = 0;
  const live = (c: Capture, r?: RecognitionLike) => owner === c && !c.settled && (!r || c.rec === r);
  function timer(c: Capture, fn: () => void, ms: number): unknown {
    const handle = setTimer(() => { c.timers.delete(handle); if (live(c)) fn(); }, ms);
    c.timers.add(handle);
    return handle;
  }
  function clear(c: Capture, h: unknown): void { if (h !== undefined) { clearTimer(h); c.timers.delete(h); } }
  function settle(c: Capture, error?: SttError, silent = false): void {
    if (!live(c)) return;
    owner = null; c.settled = true;
    for (const h of c.timers) clearTimer(h);
    c.timers.clear();
    const r = c.rec; c.rec = null;
    // Invalidate handlers before abort; some implementations fire synchronously.
    try { if (r?.abort) r.abort(); else r?.stop(); } catch { /* already ended */ }
    opts.onStage?.("idle");
    if (silent) return;
    if (error) { opts.onError(error); return; }
    const chunks = c.chunks.filter(x => x.text);
    const text = chunks.map(x => x.text).join(" ").trim();
    if (!text || c.pendingInterim) { opts.onError(mappedError("no-speech")); return; }
    if (text.length > MAX_TEXT_CHARS) {
      opts.onError({ kind: "other", message: "That command is too long. Nothing was sent. Please use a shorter command." }); return;
    }
    const alternatives = chunks.length === 1 ? chunks[0]!.alternatives.filter(x => x !== text).slice(0, MAX_ALTERNATIVES) : [];
    opts.onFinal({ text, confidence: clamp(chunks.reduce((n, x) => n + x.confidence, 0) / chunks.length), alternatives });
  }
  function begin(c: Capture): void {
    if (!live(c) || !c.held) return;
    let r: RecognitionLike;
    try { r = opts.makeRecognition(); }
    catch { settle(c, { kind: "other", message: MSG_STT_UNAVAILABLE }); return; }
    c.rec = r; c.current = []; c.pendingInterim = false; c.startedAt = now();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true; r.maxAlternatives = MAX_ALTERNATIVES;
    let ready = false;
    const onReady = () => {
      if (!live(c, r) || !c.held || ready) return;
      ready = true; clear(c, c.startup); opts.onStage?.("listening");
    };
    r.onstart = onReady;
    r.onaudiostart = onReady;
    r.onresult = e => {
      if (!live(c, r)) return;
      const current: Chunk[] = [];
      const caption: string[] = c.chunks.map(x => x.text);
      c.pendingInterim = false;
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result?.length) continue;
        const primary = result[0]!;
        const text = primary.transcript.trim();
        caption.push(text);
        if (!result.isFinal) { c.pendingInterim ||= !!text; continue; }
        const alternatives = new Set<string>();
        for (let j = 1; j < result.length && alternatives.size < MAX_ALTERNATIVES; j++) {
          const alternative = result[j]?.transcript.trim().slice(0, MAX_TEXT_CHARS);
          if (alternative && alternative !== text) alternatives.add(alternative);
        }
        current.push({ text, confidence: clamp(primary.confidence), alternatives: [...alternatives] });
      }
      c.current = current;
      const full = caption.filter(Boolean).join(" ");
      if (full.length > MAX_TEXT_CHARS) {
        settle(c, { kind: "other", message: "That command is too long. Nothing was sent. Please use a shorter command." }); return;
      }
      if (full) opts.onInterim(full);
    };
    r.onerror = e => {
      if (!live(c, r)) return;
      if (e.error === "no-speech") return; // onend may recover only while still held
      if (e.error === "aborted" && !c.held) return;
      settle(c, mappedError(e.error));
    };
    r.onend = () => {
      if (!live(c, r)) return;
      c.rec = null; clear(c, c.startup);
      c.chunks.push(...c.current); c.current = [];
      if (c.pendingInterim) { settle(c, mappedError("no-speech")); return; }
      if (!c.held) { settle(c); return; }
      if (c.retries >= 5) {
        settle(c, { kind: "other", message: "Speech recognition keeps stopping. Release the keys, check the microphone, and try again." }); return;
      }
      c.retries++;
      opts.onStage?.("recovering");
      c.restart = timer(c, () => begin(c), Math.max(0, 1000 - (now() - c.startedAt)));
    };
    c.startup = timer(c, () => settle(c, { kind: "other", message: "The microphone did not start. Click Check microphone, allow access, then try again." }), 8000);
    try { r.start(); } catch { settle(c, { kind: "other", message: "Speech recognition could not start. Release the keys, then try the Hold to talk button." }); }
  }
  return {
    press() {
      if (owner) return;
      if (!opts.canListen()) { opts.onError({ kind: "unfocused", message: MSG_CLICK_WINDOW }); return; }
      const c: Capture = { generation: ++generation, held: true, rec: null, settled: false, chunks: [], current: [], pendingInterim: false, retries: 0, startedAt: now(), timers: new Set() };
      owner = c;
      opts.onStage?.("starting");
      begin(c);
    },
    release() {
      const c = owner;
      if (!c || !c.held) return;
      c.held = false; clear(c, c.restart); clear(c, c.startup);
      opts.onStage?.("finalizing");
      if (!c.rec) { settle(c); return; }
      try { c.rec.stop(); } catch { settle(c, mappedError("other")); return; }
      if (live(c)) timer(c, () => settle(c, { kind: "other", message: "Speech recognition did not finish. Nothing was sent. Please try again." }), 2000);
    },
    cancel(reason) { if (owner) settle(owner, reason ? { kind: "other", message: reason } : undefined, !reason); },
    isActive: () => owner !== null,
  };
}
