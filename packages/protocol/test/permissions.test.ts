import { describe, expect, it } from "vitest";
import { MESSAGES, canReceive, canSend, type MessageType } from "../src/index";

// T-01-06: an INDEPENDENT hand-written table. It is deliberately not derived from MESSAGES, so a
// wrong sender list in the registry fails here instead of agreeing with itself.

type Role = "extension" | "voice" | "server";

const EXPECTED: Record<string, { senders: Role[]; receivers: Role[] }> = {
  hello: { senders: ["extension", "voice"], receivers: ["server"] },
  welcome: { senders: ["server"], receivers: ["extension", "voice"] },
  error: { senders: ["server"], receivers: ["extension", "voice"] },

  "snapshot.request": { senders: ["server"], receivers: ["extension"] },
  "snapshot.result": { senders: ["extension"], receivers: ["server"] },
  "act.request": { senders: ["server"], receivers: ["extension"] },
  "act.result": { senders: ["extension"], receivers: ["server"] },
  "page.changed": { senders: ["extension"], receivers: ["server"] },
  announce: { senders: ["server"], receivers: ["extension"] },
  highlight: { senders: ["server"], receivers: ["extension"] },
  "ptt.hotkey": { senders: ["extension"], receivers: ["server"] },
  ping: { senders: ["extension"], receivers: ["server"] },
  pong: { senders: ["server"], receivers: ["extension"] },

  utterance: { senders: ["voice"], receivers: ["server"] },
  ptt: { senders: ["voice"], receivers: ["server"] },
  "speak.done": { senders: ["voice"], receivers: ["server"] },
  settings: { senders: ["voice"], receivers: ["server"] },
  control: { senders: ["voice"], receivers: ["server"] },
  "confirm.redeem": { senders: ["voice"], receivers: ["server"] },
  speak: { senders: ["server"], receivers: ["voice"] },
  earcon: { senders: ["server"], receivers: ["voice"] },
  "confirm.armed": { senders: ["server"], receivers: ["voice"] },
  "confirm.cleared": { senders: ["server"], receivers: ["voice"] },
  state: { senders: ["server"], receivers: ["voice"] },
  transcript: { senders: ["server"], receivers: ["voice"] },
};

const ROLES: Role[] = ["extension", "voice", "server"];

describe("permission matrix (D-04)", () => {
  it("has exactly 25 registry types, the same as the hand-written table", () => {
    expect(Object.keys(MESSAGES).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(MESSAGES)).toHaveLength(25);
  });

  for (const [type, want] of Object.entries(EXPECTED)) {
    it(`${type}: canSend and canReceive match the table for every role`, () => {
      for (const role of ROLES) {
        expect(canSend(role, type as MessageType), `${role} sends ${type}`).toBe(want.senders.includes(role));
        expect(canReceive(role, type as MessageType), `${role} receives ${type}`).toBe(want.receivers.includes(role));
      }
    });
  }

  it("never lets the extension send the voice-only types (confirm-phrase path)", () => {
    for (const t of ["utterance", "ptt", "speak.done", "settings", "control", "confirm.redeem"] as const) {
      expect(canSend("extension", t)).toBe(false);
      expect(canSend("server", t)).toBe(false);
    }
  });

  it("never lets voice send an extension-only type", () => {
    for (const t of ["snapshot.result", "act.result", "page.changed", "ptt.hotkey", "ping"] as const) {
      expect(canSend("voice", t)).toBe(false);
    }
  });
});
