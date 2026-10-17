import { describe, expect, it } from "vitest";
import { buildFrame, buildRawFrame, canSend, parseFrame } from "../src/index";
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
