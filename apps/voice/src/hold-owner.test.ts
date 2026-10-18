import { describe, it, expect } from "vitest";
import { createHoldOwner } from "./hold-owner";
describe("single hold ownership", () => {
  it.each(["manual", "global"] as const)("does not let another route steal %s ownership", first => {
    const seen: string[] = [];
    const h = createHoldOwner(s => seen.push(s));
    const second = first === "manual" ? "global" : "manual";
    h.update(first, true); h.update(second, true); h.update(second, false);
    expect(h.get()).toBe(first);
    h.update(first, false); expect(seen).toEqual(["start", "end"]);
  });
  it("cancels once and forwards a loss reason", () => {
    const seen: unknown[] = [];
    const h = createHoldOwner((...e) => seen.push(e));
    h.update("global", true); h.cancel("lost"); h.cancel("lost");
    expect(seen).toEqual([["start"], ["end", "lost"]]);
  });
});
