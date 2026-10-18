import { LOOPBACK_HOST } from "@blip/protocol";
import type { PttSidecar } from "../../../apps/server/src/voice/ptt-sidecar";

/**
 * PTT_DELIVERY B: global Right Ctrl + Space hold -> loopback sidecar -> voice window.
 * If uiohook cannot load, typed input still works. Returns a stop function.
 */
export async function startPttWire(port: number): Promise<() => Promise<void>> {
  let stopPttHook: (() => void) | undefined;
  let sidecar: PttSidecar | undefined;
  let sidecarReady = false;
  try {
    const hook = await import("../../../apps/server/src/voice/ptt-hook");
    stopPttHook = hook.stopPttHook;
    const { startPttSidecar } = await import("../../../apps/server/src/voice/ptt-sidecar");
    sidecar = startPttSidecar({ allowedOrigin: `http://${LOOPBACK_HOST}:${port}` });
    const listeningPort = await sidecar.listening;
    if (listeningPort < 0) throw new Error("PTT sidecar could not bind its loopback port");
    sidecarReady = true;
    hook.startPttHook((state) => sidecar?.broadcast(state));
    console.log("blip: global push-to-talk ready (Right Ctrl + Space)");
    return async () => {
      stopPttHook?.();
      await sidecar?.close();
    };
  } catch {
    try { stopPttHook?.(); } catch { /* startup may have partially attached the native hook */ }
    if (sidecarReady) {
      try { await sidecar?.close(); } catch { /* keep the fallback usable */ }
    }
    console.log("blip: global push-to-talk unavailable; use Hold to talk or typed input");
    return async () => {};
  }
}
