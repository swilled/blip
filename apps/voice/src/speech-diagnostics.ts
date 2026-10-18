export type SpeechEventName = "capture-request" | "start" | "audiostart" | "soundstart" | "speechstart" | "result" | "error" | "end" | "release" | "synth-start" | "synth-end" | "synth-error";
export interface DiagnosticEvent {
  event: SpeechEventName;
  generation?: number;
  results?: number;
  code?: string;
  focused?: boolean;
  visible?: boolean;
  rate?: number;
  voice?: string;
}
const errorCodes = new Set(["no-speech", "aborted", "audio-capture", "network", "not-allowed", "service-not-allowed", "language-not-supported", "interrupted", "canceled", "synthesis-failed", "audio-busy"]);
export function createSpeechDiagnostics(now = () => performance.now()) {
  let enabled = false;
  let origin = now();
  const rows: Array<DiagnosticEvent & { at: number }> = [];
  return {
    enable(value: boolean) { enabled = value; if (!value) { rows.length = 0; origin = now(); } },
    record(input: DiagnosticEvent) {
      if (!enabled) return;
      const row: DiagnosticEvent & { at: number } = { event: input.event, at: Math.round(now() - origin) };
      if (Number.isFinite(input.generation)) row.generation = input.generation;
      if (Number.isFinite(input.results)) row.results = input.results;
      if (input.code) row.code = errorCodes.has(input.code) ? input.code : "other";
      if (typeof input.focused === "boolean") row.focused = input.focused;
      if (typeof input.visible === "boolean") row.visible = input.visible;
      if (Number.isFinite(input.rate)) row.rate = input.rate;
      if (input.voice) row.voice = input.voice.slice(0, 100);
      rows.push(row);
      if (rows.length > 100) rows.shift();
    },
    snapshot: () => rows.map(row => ({ ...row })),
  };
}

export function observeRecognition(target: EventTarget, generation: number, record: (event: DiagnosticEvent) => void): () => void {
  const listeners: Array<[string, EventListener]> = [];
  for (const name of ["start", "audiostart", "soundstart", "speechstart", "result", "error", "end"] as const) {
    const listener: EventListener = event => {
      const native = event as Event & { results?: { length: number }; error?: string };
      record({ event: name, generation, ...(name === "result" ? { results: native.results?.length ?? 0 } : {}), ...(name === "error" ? { code: native.error ?? "other" } : {}) });
    };
    target.addEventListener(name, listener);
    listeners.push([name, listener]);
  }
  return () => { for (const [name, listener] of listeners) target.removeEventListener(name, listener); };
}

export async function checkMicrophone(get: () => Promise<{ getTracks(): Array<{ stop(): void }> }>, signal?: AbortSignal): Promise<string> {
  try {
    const stream = await get();
    try { return signal?.aborted ? "Microphone check cancelled." : "Microphone access works. Hold to talk and speak after the listening cue."; }
    finally { for (const track of stream.getTracks()) track.stop(); }
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError") return "Microphone access is blocked. Allow the microphone for this Blip window in Chrome's site settings.";
    if (name === "NotFoundError") return "No microphone was found. Connect a microphone and choose it in Chrome's microphone settings.";
    return "The microphone could not open. Check Windows microphone access and whether another app is using the device.";
  }
}
