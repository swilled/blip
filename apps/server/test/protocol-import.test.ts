import { describe, expect, it } from "vitest";
import { buildFrame, canSend, parseFrame } from "@blip/protocol";

// Proves the workspace link: the server project consumes @blip/protocol as TypeScript source,
// by package name, through the exports map (D-19: no build step).
describe("@blip/protocol consumed from another workspace", () => {
  it("round-trips a hello frame through JSON and parseFrame", () => {
    const frame = buildFrame("hello", { role: "extension", clientVersion: "0.0.0", protocolVersion: 1 });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message.type).toBe("hello");
      expect(r.message.id).toBe(frame.id);
    }
  });

  it("reads role permissions from the single registry", () => {
    expect(canSend("voice", "utterance")).toBe(true);
    expect(canSend("extension", "utterance")).toBe(false);
  });
});
