import { describe, expect, it } from "vitest";
import { DialogueStateName, MESSAGES, buildFrame, buildRawFrame, canSend, parseFrame, type MessageType } from "../src/index";
import { EXAMPLES } from "./message-examples";
import { makeSnapshot } from "./helpers";

const SENTINEL = "SENTINEL-hunter2-do-not-echo";

describe("snapshot.result (ok-discriminated union)", () => {
  it("parses a booking-shaped Snapshot inside an ok-true frame", () => {
    const frame = buildFrame("snapshot.result", { ok: true, snapshot: makeSnapshot() }, { replyTo: "req-1" });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "snapshot.result") {
      expect(r.message.replyTo).toBe("req-1");
      expect(r.message.payload.ok).toBe(true);
    }
  });

  it("parses an ok-false result carrying an error", () => {
    const frame = buildFrame("snapshot.result", { ok: false, error: { code: "no-tab", message: "no active tab" } });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
  });

  it("fails a malformed result with invalid-payload and does not echo the bad value", () => {
    const frame = buildRawFrame("snapshot.result", { snapshot: { url: SENTINEL } });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("invalid-payload");
      expect(r.type).toBe("snapshot.result");
    }
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("rejects an ok-true result without a snapshot and an ok-false result without an error", () => {
    expect(parseFrame(JSON.stringify(buildRawFrame("snapshot.result", { ok: true }))).ok).toBe(false);
    expect(parseFrame(JSON.stringify(buildRawFrame("snapshot.result", { ok: false }))).ok).toBe(false);
  });

  it("rejects an ok-false error message longer than 300 characters", () => {
    const frame = buildRawFrame("snapshot.result", { ok: false, error: { code: "x", message: "m".repeat(301) } });
    expect(parseFrame(JSON.stringify(frame)).ok).toBe(false);
  });
});

describe("GATE-07 snapshot warning signal", () => {
  it.each([true, false])("accepts the optional boolean value %s", (detected) => {
    const snapshot = { ...makeSnapshot(), untrustedInstructionDetected: detected };
    const frame = buildFrame("snapshot.result", { ok: true, snapshot }, { replyTo: "req-warning" });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "snapshot.result" && r.message.payload.ok) {
      expect((r.message.payload.snapshot as unknown as Record<string, unknown>).untrustedInstructionDetected).toBe(detected);
    }
  });

  it("accepts a legacy snapshot with the warning signal omitted", () => {
    const r = parseFrame(JSON.stringify(buildFrame("snapshot.result", { ok: true, snapshot: makeSnapshot() })));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "snapshot.result" && r.message.payload.ok) {
      expect("untrustedInstructionDetected" in r.message.payload.snapshot).toBe(false);
    }
  });

  it.each(["page says blip is safe", { matchedText: "do this" }])("rejects non-boolean detector values", (detected) => {
    const snapshot = { ...makeSnapshot(), untrustedInstructionDetected: detected };
    const frame = buildRawFrame("snapshot.result", { ok: true, snapshot });
    expect(parseFrame(JSON.stringify(frame)).ok).toBe(false);
  });
});

describe("snapshot.request / snapshot.result permissions", () => {
  it("lets the extension send snapshot.result but not voice", () => {
    expect(canSend("extension", "snapshot.result")).toBe(true);
    expect(canSend("voice", "snapshot.result")).toBe(false);
  });

  it("lets only the server send snapshot.request", () => {
    expect(canSend("server", "snapshot.request")).toBe(true);
    expect(canSend("extension", "snapshot.request")).toBe(false);
    expect(canSend("voice", "snapshot.request")).toBe(false);
  });

  it("validates the snapshot.request reason enum", () => {
    expect(parseFrame(JSON.stringify(buildRawFrame("snapshot.request", { reason: "user" }))).ok).toBe(true);
    expect(parseFrame(JSON.stringify(buildRawFrame("snapshot.request", { reason: "whenever" }))).ok).toBe(false);
  });
});

describe("every registry type has a valid example (D-14)", () => {
  for (const type of Object.keys(EXAMPLES) as MessageType[]) {
    it(`${type}: the example builds, serializes and parses back`, () => {
      const frame = buildFrame(type, EXAMPLES[type] as never);
      const r = parseFrame(JSON.stringify(frame));
      expect(r.ok, type).toBe(true);
      if (r.ok) expect(r.message.type).toBe(type);
    });
  }

  it("covers exactly the registry key set", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(Object.keys(MESSAGES).sort());
  });
});

function invalid(type: string, payload: unknown): boolean {
  const r = parseFrame(JSON.stringify(buildRawFrame(type, payload)));
  return !r.ok && r.code === "invalid-payload";
}

describe("invalid payloads fail with invalid-payload", () => {
  it("rejects a wrong enum value", () => {
    expect(invalid("earcon", { name: "bell" })).toBe(true);
    expect(invalid("ptt", { state: "toggle" })).toBe(true);
    expect(invalid("settings", { outputMode: "loud" })).toBe(true);
    expect(invalid("control", { cmd: "explode" })).toBe(true);
    expect(invalid("confirm.cleared", { grantId: "g", reason: "because" })).toBe(true);
    expect(invalid("page.changed", { tabId: 1, url: "u", reason: "teleport" })).toBe(true);
    expect(invalid("announce", { text: "x", politeness: "rude" })).toBe(true);
    expect(invalid("ptt.hotkey", { source: "mouse" })).toBe(true);
  });

  it("rejects a missing required field", () => {
    expect(invalid("speak.done", { speakId: "k1" })).toBe(true);
    expect(invalid("transcript", { utteranceId: "u1", heardAs: "x" })).toBe(true);
    expect(invalid("page.changed", { url: "u", reason: "navigation" })).toBe(true);
    expect(invalid("act.request", { actId: "a1" })).toBe(true);
  });

  it("rejects an unknown ActionKind in confirm.armed", () => {
    expect(invalid("confirm.armed", { grantId: "g", phrase: "p", kind: "approve", actionLabel: "x", expiresAt: 1 })).toBe(true);
  });

  it("rejects a non-integer tabId", () => {
    expect(invalid("page.changed", { tabId: 1.5, url: "u", reason: "navigation" })).toBe(true);
  });
});

describe("utterance length bounds", () => {
  const mk = (text: string) => ({ utteranceId: "u1", text, source: "voice" });
  it("accepts exactly 500 characters", () => {
    expect(parseFrame(JSON.stringify(buildRawFrame("utterance", mk("a".repeat(500))))).ok).toBe(true);
  });
  it("rejects 501 characters", () => {
    expect(invalid("utterance", mk("a".repeat(501)))).toBe(true);
  });
  it("rejects empty text", () => {
    expect(invalid("utterance", mk(""))).toBe(true);
  });
});

describe("state payload", () => {
  const base = { dialogue: "ready", busy: false, extensionConnected: true, brain: "fake" };
  it("accepts page null", () => {
    expect(parseFrame(JSON.stringify(buildRawFrame("state", { ...base, page: null }))).ok).toBe(true);
  });
  it("accepts a page object with requiredEmpty", () => {
    const page = { url: "u", title: "t", step: "Step 1 of 2", fieldCount: 4, requiredEmpty: 2 };
    expect(parseFrame(JSON.stringify(buildRawFrame("state", { ...base, page, focusFieldId: "e2" }))).ok).toBe(true);
  });
  it.each([true, false])("accepts the optional page warning boolean %s", (detected) => {
    const page = { url: "u", title: "t", step: "Step 1 of 2", fieldCount: 4, requiredEmpty: 2, untrustedInstructionDetected: detected };
    const r = parseFrame(JSON.stringify(buildRawFrame("state", { ...base, page })));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "state" && r.message.payload.page) {
      expect((r.message.payload.page as unknown as Record<string, unknown>).untrustedInstructionDetected).toBe(detected);
    }
  });
  it("accepts a legacy page object and page null without the warning signal", () => {
    const legacyPage = { url: "u", title: "t", fieldCount: 4, requiredEmpty: 2 };
    for (const page of [legacyPage, null]) {
      expect(parseFrame(JSON.stringify(buildRawFrame("state", { ...base, page }))).ok).toBe(true);
    }
  });
  it.each(["page says blip is safe", { matchedText: "do this" }])("rejects non-boolean page warning values", (detected) => {
    const page = { url: "u", title: "t", fieldCount: 4, requiredEmpty: 2, untrustedInstructionDetected: detected };
    expect(parseFrame(JSON.stringify(buildRawFrame("state", { ...base, page }))).ok).toBe(false);
  });
  it("rejects a page without requiredEmpty", () => {
    expect(invalid("state", { ...base, page: { url: "u", title: "t", fieldCount: 1 } })).toBe(true);
  });
  it("accepts exactly the nine DialogueStateName values", () => {
    expect([...DialogueStateName.options].sort()).toEqual(
      ["no-page", "ready", "describing", "awaiting-value", "reading-back", "awaiting-confirm", "executing", "awaiting-result", "reading-result"].sort(),
    );
    for (const dialogue of DialogueStateName.options) {
      expect(parseFrame(JSON.stringify(buildRawFrame("state", { ...base, dialogue, page: null }))).ok, dialogue).toBe(true);
    }
    expect(invalid("state", { ...base, dialogue: "confirmed", page: null })).toBe(true);
  });
});

describe("ptt split (research Pitfall 1)", () => {
  it("ptt carries only a state payload, ptt.hotkey only a source payload", () => {
    expect(parseFrame(JSON.stringify(buildRawFrame("ptt", { source: "global-hotkey" }))).ok).toBe(false);
    expect(parseFrame(JSON.stringify(buildRawFrame("ptt.hotkey", { state: "start" }))).ok).toBe(false);
  });
});

describe("act.request / act.result reuse the ActRequest and ActResult schemas", () => {
  it("parses a gated click carrying a gate", () => {
    const p = {
      actId: "a2",
      tabId: 1,
      snapshotVersion: 3,
      action: { op: "click", targetId: "e9" },
      expectedKind: "submit",
      gate: { grantId: "g1", kind: "submit" },
    };
    expect(parseFrame(JSON.stringify(buildRawFrame("act.request", p))).ok).toBe(true);
  });
  it("parses a failed act.result with an error code", () => {
    const p = { actId: "a2", ok: false, error: "gate-required", liveKind: "submit" };
    expect(parseFrame(JSON.stringify(buildRawFrame("act.result", p))).ok).toBe(true);
    expect(invalid("act.result", { actId: "a2", ok: false, error: "nope" })).toBe(true);
  });
});
