import { describe, expect, it } from "vitest";
import {
  MAX_UTTERANCE_CHARS,
  MESSAGES,
  Message,
  buildFrame,
  buildRawFrame,
  canReceive,
  canSend,
  parseFrame,
  type MessageType,
} from "../src/index";

const SENTINEL = "SENTINEL-hunter2-do-not-echo";

describe("parseFrame failure codes", () => {
  it("returns bad-json for non-JSON text", () => {
    const r = parseFrame("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad-json");
  });

  it("returns bad-json for invalid UTF-8 bytes", () => {
    const r = parseFrame(new Uint8Array([0xff, 0xfe, 0xfd]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad-json");
  });

  it("returns bad-envelope and carries the id when present", () => {
    const r = parseFrame(JSON.stringify({ v: 2, id: "abc", type: "hello", ts: 1, payload: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("bad-envelope");
      expect(r.id).toBe("abc");
    }
  });

  it("returns bad-envelope for a JSON value that is not an object", () => {
    const r = parseFrame("42");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad-envelope");
  });

  it("returns unknown-type for a well-formed envelope with an unregistered type", () => {
    const r = parseFrame(JSON.stringify(buildRawFrame("nope", {})));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unknown-type");
      expect(r.type).toBe("nope");
      expect(r.id).toBeTruthy();
    }
  });

  it("does not treat Object.prototype names as registered types", () => {
    const r = parseFrame(JSON.stringify(buildRawFrame("constructor", {})));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unknown-type");
  });

  it("returns invalid-payload with issues and the original id", () => {
    const r = parseFrame(JSON.stringify(buildRawFrame("utterance", { utteranceId: "u1", text: "", source: "voice" }, { id: "f1" })));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("invalid-payload");
      expect(r.id).toBe("f1");
      expect(r.type).toBe("utterance");
      expect(r.issues?.some((i) => i.path === "payload.text")).toBe(true);
    }
  });

  it("never throws, whatever the input", () => {
    for (const raw of ["", "null", "[]", "\"x\"", "{}", "{\"v\":1}", "\u0000"]) {
      expect(() => parseFrame(raw)).not.toThrow();
    }
  });

  it("reports the byte length of the frame", () => {
    const text = JSON.stringify(buildRawFrame("nope", { s: "é" }));
    const r = parseFrame(text);
    expect(r.bytes).toBe(new TextEncoder().encode(text).length);
  });
});

describe("parseFrame never echoes the offending value", () => {
  it("does not leak an over-long utterance text in the failure", () => {
    const text = SENTINEL + "x".repeat(MAX_UTTERANCE_CHARS);
    const r = parseFrame(JSON.stringify(buildRawFrame("utterance", { utteranceId: "u1", text, source: "voice" })));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("does not leak a bad enum value", () => {
    const r = parseFrame(JSON.stringify(buildRawFrame("utterance", { utteranceId: "u1", text: "hi", source: SENTINEL })));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });
});

describe("additive evolution (D-17)", () => {
  it("tolerates and strips unknown extra keys in a payload", () => {
    const frame = buildRawFrame("utterance", { utteranceId: "u1", text: "hello", source: "typed", futureField: 123 });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "utterance") {
      expect(r.message.payload).not.toHaveProperty("futureField");
      expect(r.message.payload.text).toBe("hello");
    }
  });
});

describe("canSend / canReceive matrix", () => {
  it("allows hello from extension and voice, never from the server", () => {
    expect(canSend("extension", "hello")).toBe(true);
    expect(canSend("voice", "hello")).toBe(true);
    expect(canSend("server", "hello")).toBe(false);
  });

  it("allows utterance only from voice (D-04)", () => {
    expect(canSend("voice", "utterance")).toBe(true);
    expect(canSend("extension", "utterance")).toBe(false);
    expect(canSend("server", "utterance")).toBe(false);
  });

  it("allows welcome, error and speak only from the server", () => {
    for (const t of ["welcome", "error", "speak"] as const) {
      expect(canSend("server", t)).toBe(true);
      expect(canSend("extension", t)).toBe(false);
      expect(canSend("voice", t)).toBe(false);
    }
  });

  it("delivers speak to voice only and utterance to the server only", () => {
    expect(canReceive("voice", "speak")).toBe(true);
    expect(canReceive("extension", "speak")).toBe(false);
    expect(canReceive("server", "utterance")).toBe(true);
    expect(canReceive("voice", "utterance")).toBe(false);
  });
});

describe("registry and Message union parity", () => {
  it("has exactly the registry keys as the union's literal type set", () => {
    const unionTypes = Message.options.map((o) => o.shape.type.value as string).sort();
    expect(unionTypes).toEqual(Object.keys(MESSAGES).sort());
  });

  it("builds and re-parses a valid frame for every registered sample", () => {
    const samples: { [T in MessageType]?: unknown } = {
      hello: { role: "voice", clientVersion: "0.0.0", protocolVersion: 1 },
      welcome: { sessionId: "s1", serverVersion: "0.0.0", brain: "fake" },
      error: { code: "bad-json", message: "x", fatal: false },
      utterance: { utteranceId: "u1", text: "what's here", source: "typed" },
      speak: { speakId: "k1", text: "hi", category: "answer", interrupt: false },
    };
    for (const type of Object.keys(MESSAGES) as MessageType[]) {
      const payload = samples[type];
      expect(payload, `sample for ${type}`).toBeDefined();
      const frame = buildFrame(type, payload as never);
      const r = parseFrame(JSON.stringify(frame));
      expect(r.ok, type).toBe(true);
    }
  });

  it("buildFrame throws on an invalid payload, buildRawFrame does not", () => {
    expect(() => buildFrame("utterance", { utteranceId: "u", text: "", source: "voice" })).toThrow();
    expect(() => buildRawFrame("utterance", { text: "" })).not.toThrow();
  });
});
