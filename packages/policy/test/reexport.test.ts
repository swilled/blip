import { describe, expect, it } from "vitest";
import * as protocol from "@blip/protocol";
import * as policy from "../src/index";

describe("@blip/policy re-exports (D-11: one ActionKind enum)", () => {
  it("exports the very same ActionKind object", () => {
    expect(policy.ActionKind).toBe(protocol.ActionKind);
  });
  it("exports the same GATED_KINDS and isGatedKind", () => {
    expect(policy.GATED_KINDS).toBe(protocol.GATED_KINDS);
    expect(policy.isGatedKind).toBe(protocol.isGatedKind);
  });
});
