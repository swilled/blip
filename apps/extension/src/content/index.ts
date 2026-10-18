export {};

import type { BackgroundToContentMessage, ContentResponse, ContentToBackgroundMessage } from "../shared/messages.js";
import { executeAct } from "./act.js";
import { observeStructuralChanges } from "./observer.js";
import { getHighlightOverlay } from "./overlay.js";
import { captureFrameSnapshot } from "./snapshot.js";
import { handleBrowserContentRequest } from "./browser-content.js";
export { captureFrameSnapshot } from "./snapshot.js";
export { resolveElementId, walkDocument } from "./walk.js";

type BlipContentGlobal = typeof globalThis & {
  __blipContentShellInstalled?: boolean;
  __blipContentDispose?: () => void;
};

const isolatedWorld = globalThis as BlipContentGlobal;

function targetFrameId(targetId: string, fallback: number): number {
  const match = /^f(0|[1-9]\d*)e[1-9]\d*$/.exec(targetId);
  if (!match) return fallback;
  const frameId = Number(match[1]);
  return Number.isSafeInteger(frameId) ? frameId : fallback;
}

function installContentShell(): void {
  const overlay = getHighlightOverlay(document);
  const stopObserving = observeStructuralChanges(document, (change) => {
    const message: ContentToBackgroundMessage = { t: "mutated", ...change };
    if (typeof chrome.runtime.sendMessage === "function") {
      void chrome.runtime.sendMessage(message).catch(() => undefined);
    }
  });

  const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || typeof message !== "object" || message === null) return;
    if ("type" in message && message.type === "blip.ping") {
      sendResponse({ ok: true });
      return;
    }

    if (!("t" in message)) return;
    if (message.t === "browser-content" && "operation" in message && "identity" in message) {
      const request = message as Extract<BackgroundToContentMessage, { t: "browser-content" }>;
      const response = handleBrowserContentRequest(document, request, sender.frameId ?? 0);
      sendResponse(response);
      return;
    }
    if (message.t === "snapshot" && "topOrigin" in message && typeof message.topOrigin === "string") {
      const request = message as Extract<BackgroundToContentMessage, { t: "snapshot" }>;
      const response: ContentResponse = {
        t: "snapshot.result",
        snapshot: captureFrameSnapshot({ topOrigin: request.topOrigin, frameId: sender.frameId ?? 0 }),
      };
      sendResponse(response);
      return;
    }

    if (message.t === "act" && "request" in message && "snapshotVersion" in message) {
      const request = message as Extract<BackgroundToContentMessage, { t: "act" }>;
      if (!Number.isSafeInteger(request.snapshotVersion) || request.snapshotVersion < 1) {
        const response: ContentResponse = {
          t: "act.result",
          result: { actId: request.request.actId, ok: false, error: "stale-snapshot" },
        };
        sendResponse(response);
        return;
      }
      void executeAct(request.request, {
        frameId: targetFrameId(request.request.action.targetId, sender.frameId ?? 0),
      }).then((result) => {
        const response: ContentResponse = { t: "act.result", result };
        sendResponse(response);
      });
      return true;
    }
  };
  chrome.runtime.onMessage.addListener(listener);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopObserving();
    overlay.dispose();
    if (typeof chrome.runtime.onMessage.removeListener === "function") {
      chrome.runtime.onMessage.removeListener(listener);
    }
    delete isolatedWorld.__blipContentShellInstalled;
    delete isolatedWorld.__blipContentDispose;
  };
  isolatedWorld.__blipContentDispose = dispose;

  const ready: ContentToBackgroundMessage = { t: "ready" };
  if (typeof chrome.runtime.sendMessage === "function") {
    void chrome.runtime.sendMessage(ready).catch(() => undefined);
  }
}

if (isolatedWorld.__blipContentShellInstalled !== true) {
  isolatedWorld.__blipContentShellInstalled = true;
  installContentShell();
}

/** Extension-side test and lifecycle hook; not visible to page scripts. */
export function disposeContentScript(): void {
  isolatedWorld.__blipContentDispose?.();
}
