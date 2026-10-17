export {};

import type { BackgroundToContentMessage, ContentResponse, ContentToBackgroundMessage } from "../shared/messages.js";
import { captureFrameSnapshot } from "./snapshot.js";
export { captureFrameSnapshot } from "./snapshot.js";
export { resolveElementId, walkDocument } from "./walk.js";

type BlipContentGlobal = typeof globalThis & { __blipContentShellInstalled?: boolean };

const isolatedWorld = globalThis as BlipContentGlobal;
if (isolatedWorld.__blipContentShellInstalled !== true) {
  isolatedWorld.__blipContentShellInstalled = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || typeof message !== "object" || message === null) return;
    if ("type" in message && message.type === "blip.ping") {
      sendResponse({ ok: true });
      return;
    }

    if (!("t" in message) || message.t !== "snapshot" || !("topOrigin" in message) || typeof message.topOrigin !== "string") return;
    const request = message as Extract<BackgroundToContentMessage, { t: "snapshot" }>;
    const response: ContentResponse = {
      t: "snapshot.result",
      snapshot: captureFrameSnapshot({ topOrigin: request.topOrigin }),
    };
    sendResponse(response);
  });

  const ready: ContentToBackgroundMessage = { t: "ready" };
  if (typeof chrome.runtime.sendMessage === "function") {
    void chrome.runtime.sendMessage(ready).catch(() => undefined);
  }
}
