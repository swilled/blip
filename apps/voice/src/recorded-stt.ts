import { MAX_TEXT_CHARS, MSG_CAPTURE_LIMIT, MSG_DIDNT_CATCH, MSG_MIC, MSG_MIC_MISSING, type Stt, type SttError, type SttOptions } from "./stt";

export interface PcmRecording { stop(): Promise<Float32Array[]>; cancel(): void; sampleRate: number }
export interface RecordedSttOptions extends Pick<SttOptions, "onFinal" | "onError" | "onStage"> {
  open(signal: AbortSignal): Promise<PcmRecording>;
  transcribe(wav: Uint8Array, signal: AbortSignal): Promise<string>;
}

export function encodeWav(chunks: Float32Array[], inputRate: number): Uint8Array {
  const count = chunks.reduce((n, c) => n + c.length, 0);
  if (!Number.isFinite(inputRate) || inputRate < 16000 || count / inputRate > 10.05) throw new Error("audio-too-long");
  const pcm = new Float32Array(count); let offset = 0;
  for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
  const samples = Math.floor(count * 16000 / inputRate);
  if (samples < 3200) throw new Error("too-short");
  if (samples > 160000) throw new Error("audio-too-long");
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => { for (let n = 0; n < value.length; n++) bytes[at + n] = value.charCodeAt(n); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  // Average each source interval when downsampling to avoid simple sample-dropping aliasing.
  for (let n = 0; n < samples; n++) {
    const start = Math.floor(n * inputRate / 16000), end = Math.max(start + 1, Math.floor((n + 1) * inputRate / 16000));
    let value = 0; for (let p = start; p < end; p++) value += pcm[p] ?? 0;
    value = Math.max(-1, Math.min(1, value / (end - start)));
    view.setInt16(44 + n * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function createRecordedStt(options: RecordedSttOptions): Stt {
  type Capture = { abort: AbortController; recording?: PcmRecording; released: boolean; timer: ReturnType<typeof setTimeout> };
  let active: Capture | null = null;
  function settle(capture: Capture, error?: SttError, text?: string) {
    if (active !== capture) return;
    active = null; clearTimeout(capture.timer); capture.abort.abort(); capture.recording?.cancel();
    options.onStage?.("idle");
    if (error) options.onError(error);
    else if (text !== undefined) options.onFinal({ text, alternatives: [] }); // Whisper CLI supplies no calibrated confidence; never invent one.
  }
  async function release(capture: Capture) {
    if (!capture.recording) { settle(capture, { kind: "other", message: "The microphone had not started. Wait for the listening cue before speaking." }); return; }
    options.onStage?.("finalizing");
    try {
      const chunks = await capture.recording.stop();
      if (active !== capture) return;
      const wav = encodeWav(chunks, capture.recording.sampleRate);
      const text = (await options.transcribe(wav, capture.abort.signal)).trim();
      if (active !== capture) return;
      if (!text) { settle(capture, { kind: "no-speech", message: MSG_DIDNT_CATCH }); return; }
      if (text.length > MAX_TEXT_CHARS) throw new Error("transcript-too-long");
      settle(capture, undefined, text);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      settle(capture, { kind: "other", message: code === "too-short" ? MSG_DIDNT_CATCH
        : code === "recognizer-unavailable" ? "Local speech recognition is not ready. Restart Blip after installing its local recognizer."
        : code === "audio-too-long" ? MSG_CAPTURE_LIMIT
        : "Local speech recognition could not finish. Nothing was sent. Release the keys and try again." });
    }
  }
  return {
    press() {
      if (active) return;
      const capture: Capture = { abort: new AbortController(), released: false, timer: setTimeout(() => settle(capture, { kind: "other", message: MSG_CAPTURE_LIMIT }), 10000) };
      active = capture; options.onStage?.("starting");
      void options.open(capture.abort.signal).then(recording => {
        if (active !== capture) { recording.cancel(); return; }
        capture.recording = recording; options.onStage?.("listening");
      }).catch(error => {
        const name = error instanceof Error ? error.name : "";
        settle(capture, { kind: name === "NotAllowedError" ? "not-allowed" : "audio-capture", message: name === "NotAllowedError" ? MSG_MIC : MSG_MIC_MISSING });
      });
    },
    release() { const capture = active; if (!capture || capture.released) return; capture.released = true; clearTimeout(capture.timer); void release(capture); },
    cancel(reason) { if (active) settle(active, reason ? { kind: "other", message: reason } : undefined); },
    isActive: () => active !== null,
  };
}

/** Raw microphone capture only: no SpeechRecognition, silence endpointing or cloud service. */
export async function openPcmMicrophone(signal: AbortSignal): Promise<PcmRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  let context: AudioContext;
  try { context = new AudioContext({ sampleRate: 16000 }); }
  catch (error) { for (const track of stream.getTracks()) track.stop(); throw error; }
  const chunks: Float32Array[] = [];
  let source: MediaStreamAudioSourceNode | undefined, worklet: AudioWorkletNode | undefined;
  let closed = false, stopping = false, samples = 0;
  let ready!: () => void, flush!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const flushed = new Promise<void>(resolve => { flush = resolve; });
  const cleanup = () => {
    if (closed) return; closed = true;
    source?.disconnect(); worklet?.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void context.close().catch(() => {}); signal.removeEventListener("abort", cleanup);
  };
  signal.addEventListener("abort", cleanup, { once: true });
  for (const track of stream.getTracks()) track.addEventListener("ended", cleanup, { once: true });
  if (signal.aborted) { cleanup(); throw new DOMException("Cancelled", "AbortError"); }
  const url = URL.createObjectURL(new Blob([`class BlipPcm extends AudioWorkletProcessor {
    constructor() { super(); this.done = false; this.port.onmessage = () => { this.done = true; this.port.postMessage(null); }; }
    process(inputs) { if (this.done) return false; const data = inputs[0]?.[0]; if (data) { const copy = data.slice(); this.port.postMessage(copy, [copy.buffer]); } return true; }
  } registerProcessor('blip-pcm', BlipPcm);`], { type: "text/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
    if (closed) throw new DOMException("Cancelled", "AbortError");
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, "blip-pcm");
    worklet.port.onmessage = event => {
      if (closed) return;
      if (event.data === null) { flush(); return; }
      if (!(event.data instanceof Float32Array)) return;
      samples += event.data.length;
      if (samples <= context.sampleRate * 10) chunks.push(event.data);
      else { cleanup(); flush(); }
      ready();
    };
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(worklet); worklet.connect(mute); mute.connect(context.destination);
    await context.resume();
    let timeout: ReturnType<typeof setTimeout>;
    try { await Promise.race([started, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("microphone-start-timeout")), 8000); })]); }
    finally { clearTimeout(timeout!); }
    return {
      sampleRate: context.sampleRate,
      async stop() {
        if (closed || stopping || context.state !== "running") { cleanup(); throw new Error("recording-cancelled"); }
        stopping = true; worklet!.port.postMessage("flush");
        let deadline: ReturnType<typeof setTimeout>;
        try { await Promise.race([flushed, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("recording-flush-timeout")), 1000); })]); }
        finally { clearTimeout(deadline!); cleanup(); }
        if (signal.aborted || samples > context.sampleRate * 10) throw new Error("recording-cancelled");
        return chunks;
      },
      cancel: cleanup,
    };
  } catch (error) { cleanup(); throw error; }
  finally { URL.revokeObjectURL(url); }
}

export function createLocalTranscriber(request: typeof fetch = fetch) {
  return async (wav: Uint8Array, signal: AbortSignal): Promise<string> => {
    const status = await request("/_blip/stt", { signal, cache: "no-store" });
    const config = await status.json() as { ready?: boolean; token?: string };
    if (!status.ok || !config.ready || !config.token) throw new Error("recognizer-unavailable");
    const deadline = AbortSignal.timeout(25000);
    const response = await request("/_blip/stt", { method: "POST", headers: { "Content-Type": "audio/wav", "X-Blip-Stt": config.token }, body: new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" }), signal: AbortSignal.any([signal, deadline]) });
    if (!response.ok) throw new Error("recognition-failed");
    const result = await response.json() as { text?: unknown };
    if (typeof result.text !== "string") throw new Error("recognition-failed");
    return result.text;
  };
}
