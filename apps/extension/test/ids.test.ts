import { describe, expect, it } from "vitest";
import { parseElementId, qualifyElementId } from "../src/background/ids.js";

describe("frame-qualified element ids", () => {
  it("keeps local identity stable while making frame ids globally unique", () => {
    expect(qualifyElementId(0, "e1")).toBe("f0e1");
    expect(qualifyElementId(7, "e1")).toBe("f7e1");
    expect(qualifyElementId(7, "e1")).toBe(qualifyElementId(7, "e1"));
  });

  it("resolves only canonical frame-qualified ids", () => {
    expect(parseElementId("f12e34")).toEqual({ frameId: 12, localId: "e34" });
    expect(parseElementId("f0e1")).toEqual({ frameId: 0, localId: "e1" });
    for (const invalid of ["e1", "f-1e1", "f01e1", "f1e0", "f1e01", "f1x1", "f1e1junk"]) {
      expect(parseElementId(invalid)).toBeNull();
    }
  });
});
