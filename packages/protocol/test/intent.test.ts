import { describe, expect, expectTypeOf, it } from "vitest";
import { Intent } from "../src/index";

const EXPECTED = [
  "describe",
  "read_form",
  "whats_required",
  "what_went_wrong",
  "read_back",
  "fill_profile",
  "go_to_field",
  "set_fields",
  "spell",
  "undo",
  "stop",
  "request_action",
  "click_safe",
  "answer",
  "clarify",
  "unknown",
];

describe("Intent union (D-15, GATE-05 foundation)", () => {
  const types = Intent.options.map((o) => o.shape.type.value as string);

  it("has exactly the 16 drafted types", () => {
    expect(types).toHaveLength(16);
    expect([...types].sort()).toEqual([...EXPECTED].sort());
  });

  it("has no confirm, approve or submit_now variant (runtime)", () => {
    expect(types.filter((t) => /confirm|approve|submit_now/.test(t))).toEqual([]);
  });

  it("has no confirm-like variant (type level)", () => {
    expectTypeOf<Extract<Intent, { type: "confirm" | "approve" | "submit_now" }>>().toEqualTypeOf<never>();
  });

  it("rejects a forged confirm intent", () => {
    for (const t of ["confirm", "approve", "submit_now"]) {
      expect(Intent.safeParse({ type: t }).success).toBe(false);
    }
  });

  it("parses set_fields and caps it at 20 fills", () => {
    const fill = { fieldId: "e1", value: "Ada" };
    expect(Intent.safeParse({ type: "set_fields", fills: [fill] }).success).toBe(true);
    expect(Intent.safeParse({ type: "set_fields", fills: Array.from({ length: 21 }, () => fill) }).success).toBe(false);
  });

  it("request_action carries only an actionId", () => {
    expect(Intent.safeParse({ type: "request_action", actionId: "e2" }).success).toBe(true);
    expect(Intent.safeParse({ type: "request_action" }).success).toBe(false);
  });
});
