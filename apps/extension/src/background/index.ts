import { connect } from "./socket.js";

// Register all wake-up paths synchronously before opening the first socket.
chrome.runtime.onStartup.addListener(() => connect());
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("blip-reconnect", { periodInMinutes: 0.5 });
  connect();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "blip-reconnect") connect();
});
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  sendResponse({ ok: false, error: { code: "not-ready", message: "extension dispatch is not implemented yet" } });
});

// A service worker can be evaluated independently of the install/start events.
void chrome.alarms.create("blip-reconnect", { periodInMinutes: 0.5 });
connect();
