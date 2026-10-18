import { LOOPBACK_HOST } from "@blip/protocol";
import type { PttSidecar } from "../../../apps/server/src/voice/ptt-sidecar";

type WindowDock = import("../../../apps/server/src/voice/window-dock").WindowDock;

/** Design D docking moves real windows through user32, so it exists only on Windows. */
async function loadWindowDock(): Promise<WindowDock | null> {
  if (process.platform !== "win32") return null;
  try {
    return (await import("../../../apps/server/src/voice/window-dock")).createWindowDock();
  } catch {
    return null;
  }
}

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
    const windowDock = await loadWindowDock();
    sidecar = startPttSidecar({
      allowedOrigin: `http://${LOOPBACK_HOST}:${port}`,
      windowHello: () => (windowDock ? { docked: windowDock.edge } : { dockAvailable: false }),
      onWindowRequest: (request) => {
        if (!windowDock) return;
        const report = (edge: "left" | "right" | "top" | null) => { if (edge) sidecar?.broadcastWindow({ docked: edge }); };
        const failed = () => sidecar?.broadcastWindow({ dockAvailable: false });
        if ("dock" in request) void windowDock.dock(request.dock).then((ok) => (ok ? report(request.dock) : failed()), failed);
        else if (request.drag === "start") void windowDock.dragStart((zone) => sidecar?.broadcastWindow({ zone })).catch(failed);
        else void (request.drag === "end" ? windowDock.dragEnd() : windowDock.dragCancel()).then(report, failed);
      },
    });
    const listeningPort = await sidecar.listening;
    if (listeningPort < 0) throw new Error("PTT sidecar could not bind its loopback port");
    sidecarReady = true;
    hook.startPttHook((state, reason) => sidecar?.broadcast(state, reason));
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
