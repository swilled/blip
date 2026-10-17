import { LOOPBACK_HOST } from "@blip/protocol";

/**
 * PTT_DELIVERY B: global Right Ctrl + Space hold -> loopback sidecar -> voice window.
 * If uiohook cannot load, typed input still works. Returns a stop function.
 */
export async function startPttWire(port: number): Promise<() => Promise<void>> {
  try {
    const { startPttHook, stopPttHook } = await import("../../../apps/server/src/voice/ptt-hook");
    const { startPttSidecar } = await import("../../../apps/server/src/voice/ptt-sidecar");
    const sidecar = startPttSidecar({ allowedOrigin: `http://${LOOPBACK_HOST}:${port}` });
    startPttHook((state) => sidecar.broadcast(state));
    return async () => {
      stopPttHook();
      await sidecar.close();
    };
  } catch {
    console.log("blip: push-to-talk hook unavailable, typed input only");
    return async () => {};
  }
}
