import { ensureConnected } from "./socket.js";
import { injectExistingTabs } from "./inject.js";

function ensureReconnectAlarm(): void {
  void chrome.alarms.create("blip-reconnect", { periodInMinutes: 0.5 });
}

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
  sendResponse({ ok: false, error: { code: "not-ready", message: "extension dispatch is not implemented yet" } });
});

// A service worker can be evaluated independently of the install/start events.
ensureReconnectAlarm();
ensureConnected();
