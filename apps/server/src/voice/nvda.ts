// NVDA Controller Client bridge (Spike C1). Calls speakText / cancelSpeech via koffi.
// speakText's return value only confirms dispatch; this API exposes no per-utterance completion
// callback, so the hub must keep screen-reader output unavailable until a safe signal exists.
// DLL path: env NVDA_DLL_PATH, default tools/nvda-client/nvdaControllerClient64.dll (LGPL, not committed).
import koffi from "koffi";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface NvdaApi {
  speak: (text: string) => number;
  cancel: () => number;
}

let api: NvdaApi | null = null;
let lastError = "";

export function nvdaDllPath(): string {
  return process.env.NVDA_DLL_PATH ?? resolve(process.cwd(), "tools/nvda-client/nvdaControllerClient64.dll");
}

function load(): NvdaApi | null {
  if (api) return api;
  const path = nvdaDllPath();
  if (!existsSync(path)) {
    lastError = `NVDA client DLL missing at ${path}; set NVDA_DLL_PATH`;
    return null;
  }
  try {
    const lib = koffi.load(path);
    api = {
      speak: lib.func("int __stdcall nvdaController_speakText(str16 text)"),
      cancel: lib.func("int __stdcall nvdaController_cancelSpeech()"),
    };
    return api;
  } catch (e) {
    lastError = `NVDA client DLL failed to load: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

export function nvdaLastError(): string {
  return lastError;
}

/** Returns the DLL dispatch result (0 = accepted), or -1 if unavailable; never use it as completion. */
export function nvdaSpeak(text: string): number {
  const a = load();
  if (!a) return -1;
  try {
    return a.speak(text);
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return -1;
  }
}

export function nvdaCancel(): number {
  const a = load();
  if (!a) return -1;
  try {
    return a.cancel();
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return -1;
  }
}
