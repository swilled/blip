import { ActionKind, isGatedKind } from "@blip/protocol";
import { describe, expect, it } from "vitest";
import { isUngatedActionKind } from "@blip/policy/classify";

describe("extension action-kind parity", () => {
  it("matches the frozen policy for every protocol kind and fail-closed unknown strings", () => {
    for (const kind of [...ActionKind.options, "", "SUBMIT", "__proto__", "unknown"]) {
      expect(isUngatedActionKind(kind)).toBe(!isGatedKind(kind));
    }
  });
});
