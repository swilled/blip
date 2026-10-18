import type { Synth, SynthHandlers } from "./tts";
import type { DiagnosticEvent } from "./speech-diagnostics";
type NativeSynthesis = Pick<SpeechSynthesis, "getVoices" | "speak" | "cancel" | "paused" | "resume" | "addEventListener" | "removeEventListener">;
export function createNativeSynth(deps: {
  synthesis: NativeSynthesis;
  makeUtterance(text: string): SpeechSynthesisUtterance;
  record?: (event: DiagnosticEvent) => void;
  warn?: (message: string) => void;
}): Synth & { dispose(): void; setVoice(uri: string | null): void; getVoices(): SpeechSynthesisVoice[] } {
  const ss = deps.synthesis;
  let generation = 0;
  let current: { generation: number; utterance: SpeechSynthesisUtterance; handlers: SynthHandlers; timer: ReturnType<typeof setTimeout> | null; started: boolean } | null = null;
  let chosen: SpeechSynthesisVoice | null = null;
  let preferred: string | null = null;
  function choose(): SpeechSynthesisVoice | null {
    const voices = ss.getVoices();
    const requested = voices.find(v => v.localService && v.voiceURI === preferred && /^en(?:-|$)/i.test(v.lang));
    if (requested) { chosen = requested; return chosen; }
    if (chosen && voices.some(v => v.voiceURI === chosen!.voiceURI)) return chosen;
    const english = voices.filter(v => /^en(?:-|$)/i.test(v.lang)).sort((a, b) => a.name.localeCompare(b.name));
    chosen = english.find(v => v.localService && /^Microsoft/i.test(v.name)) ?? english.find(v => v.localService) ?? english.find(v => v.default) ?? english[0] ?? null;
    return chosen;
  }
  function launch(): void {
    const item = current;
    if (!item || item.started) return;
    if (item.timer) clearTimeout(item.timer);
    item.started = true;
    item.utterance.voice = choose();
    if (!item.utterance.voice) deps.warn?.("Voice list is unavailable. Trying the browser's default voice.");
    // Do not invoke native speak in the cancellation/end callback's stack.
    item.timer = setTimeout(() => {
      if (current !== item) return;
      item.timer = null;
      try { if (ss.paused) ss.resume(); ss.speak(item.utterance); }
      catch { item.utterance.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent); }
    }, 0);
  }
  const voicesChanged = () => { if (choose()) launch(); };
  ss.addEventListener("voiceschanged", voicesChanged);
  return {
    getVoices: () => ss.getVoices().filter(v => v.localService && /^en(?:-|$)/i.test(v.lang)),
    setVoice(uri) { preferred = uri; chosen = null; },
    speak(text, handlers, rate) {
      if (current) { handlers.onerror("audio-busy"); return; }
      const u = deps.makeUtterance(text);
      u.rate = rate; u.lang = "en-US";
      const item = { generation: ++generation, utterance: u, handlers, timer: null as ReturnType<typeof setTimeout> | null, started: false };
      current = item;
      const valid = () => current === item && item.generation === generation;
      u.onstart = () => {
        if (!valid()) return;
        deps.record?.({ event: "synth-start", generation, rate, voice: u.voice?.name ?? "Browser default" });
        handlers.onstart?.();
      };
      const finish = (error?: string) => {
        if (!valid()) return;
        current = null;
        if (item.timer) clearTimeout(item.timer);
        deps.record?.({ event: error ? "synth-error" : "synth-end", generation, rate, ...(error ? { code: error } : {}) });
        if (error) handlers.onerror(error); else handlers.onend();
      };
      u.onend = () => finish();
      u.onerror = event => finish(event.error);
      if (choose()) launch();
      else item.timer = setTimeout(launch, 2000);
    },
    cancel() {
      const old = current; current = null; generation++;
      if (old?.timer) clearTimeout(old.timer);
      ss.cancel();
    },
    dispose() {
      const old = current; current = null; generation++;
      if (old?.timer) clearTimeout(old.timer);
      ss.removeEventListener("voiceschanged", voicesChanged);
      ss.cancel();
    },
  };
}
