import { buildFrame, parseFrame } from "@blip/protocol";
import { ensureConnected } from "./socket.js";
import { injectExistingTabs } from "./inject.js";
import { registerTargetTabTracking } from "./tabs.js";

function ensureReconnectAlarm(): void {
  void chrome.alarms.create("blip-reconnect", { periodInMinutes: 0.5 });
}

registerTargetTabTracking();

// Register all wake-up paths synchronously before opening the first socket.
chrome.runtime.onStartup.addListener(() => {
  ensureReconnectAlarm();
  ensureConnected();
});
chrome.runtime.onInstalled.addListener(() => {
  ensureReconnectAlarm();
  ensureConnected();
  void injectExistingTabs();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "blip-reconnect") ensureConnected();
});
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  if (_sender.id !== chrome.runtime.id || typeof _message !== "object" || _message === null) return;
  const parsed = parseFrame(JSON.stringify(_message));
  if (!parsed.ok) return;

  const message = parsed.message;
  if (message.type === "snapshot.request") {
    sendResponse(
      buildFrame(
        "snapshot.result",
        { ok: false, error: { code: "not-ready", message: "snapshot dispatch is not ready" } },
        { replyTo: message.id },
      ),
    );
    return;
  }

  if (message.type === "act.request") {
    sendResponse(
      buildFrame(
        "act.result",
        {
          actId: message.payload.actId,
          ok: false,
          error: "exception",
          detail: "not-implemented: action dispatch is not ready",
        },
        { replyTo: message.id },
      ),
    );
  }
});

// A service worker can be evaluated independently of the install/start events.
ensureReconnectAlarm();
ensureConnected();
