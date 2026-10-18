import type { MessageType, PayloadOf } from "../src/index";
import { makeSnapshot } from "./helpers";

/**
 * One valid payload per registry type. Typed over every MessageType, so adding a type to the
 * registry without an example is a compile error. Later plans and the voice developer reuse it.
 */
export const EXAMPLES: { [T in MessageType]: PayloadOf<T> } = {
  // handshake and shared
  hello: { role: "voice", clientVersion: "0.0.0", protocolVersion: 1 },
  welcome: { sessionId: "s1", serverVersion: "0.0.0", brain: "fake" },
  error: { code: "invalid-payload", message: "payload does not match", fatal: false },

  // extension <-> server
  "snapshot.request": { tabId: 1, reason: "page-load" },
  "snapshot.result": { ok: true, snapshot: makeSnapshot() },
  "act.request": {
    actId: "a1",
    tabId: 1,
    snapshotVersion: 1,
    action: { op: "fill", targetId: "e1", value: "Ada" },
    expectedKind: "fill",
  },
  "act.result": { actId: "a1", ok: true, observedValue: "Ada", newSnapshotVersion: 2 },
  "browser.request": { requestId: "br1", tabId: 1, operation: { op: "capture" } },
  "browser.result": {
    ok: true,
    requestId: "br1",
    operation: "capture",
    result: {
      captureId: "capture-1",
      captureRevision: 1,
      tabId: 1,
      pageUrl: "http://127.0.0.1:7777/",
      status: "supported",
      blocks: [],
      truncated: false,
    },
  },
  "page.changed": { tabId: 1, url: "http://127.0.0.1:7777/fixtures/forms/booking.html", reason: "navigation", structuralHash: "h1" },
  announce: { text: "Name filled", politeness: "polite" },
  highlight: { targetId: "e1" },
  "ptt.hotkey": { source: "global-hotkey" },
  ping: {},
  pong: {},

  // voice <-> server
  utterance: { utteranceId: "u1", text: "what is on this page", source: "typed" },
  ptt: { state: "start" },
  "speak.done": { speakId: "k1", interrupted: false },
  settings: { outputMode: "agent-voice", rate: 1.2, verbosity: "short" },
  control: { cmd: "stop" },
  speak: { speakId: "k1", text: "Hello", category: "answer", interrupt: false },
  earcon: { name: "listening" },
  "confirm.redeem": { grantId: "g1", speakId: "k1", utteranceId: "u2", phrase: "submit survey", source: "voice" },
  "confirm.armed": { grantId: "g1", speakId: "k1", phrase: "submit survey", kind: "submit", actionLabel: "Book now", expiresAt: 1_000_000 },
  "confirm.cleared": { grantId: "g1", reason: "executed" },
  state: {
    dialogue: "ready",
    page: { url: "http://127.0.0.1:7777/fixtures/forms/booking.html", title: "Booking", fieldCount: 6, requiredEmpty: 3 },
    busy: false,
    extensionConnected: true,
    brain: "fake",
  },
  transcript: { utteranceId: "u1", heardAs: "what is on this page", routedTo: "grammar" },
};
