import { describe, expect, it } from "vitest";
import { createSnapshotVersionTracker } from "../src/background/versions.js";

describe("snapshot versions", () => {
  it("starts at one and advances only when the structural signature changes", () => {
    const versions = createSnapshotVersionTracker();

    expect(versions.next(3, "first")).toBe(1);
    expect(versions.next(3, "first")).toBe(1);
    expect(versions.next(3, "second")).toBe(2);
    expect(versions.next(3, "second")).toBe(2);
    expect(versions.next(3, "first")).toBe(3);
  });

  it("tracks tabs independently and can forget a closed tab", () => {
    const versions = createSnapshotVersionTracker();

    expect(versions.next(3, "same")).toBe(1);
    expect(versions.next(9, "same")).toBe(1);
    expect(versions.next(3, "same")).toBe(1);
    versions.forget(3);
    expect(versions.next(3, "same")).toBe(1);
    expect(versions.next(9, "same")).toBe(1);
  });
});
