import { describe, expect, it } from "vitest";
import { Intent } from "@blip/protocol";
import { createFakeBrain } from "../src/brain/fake-brain";

describe("createFakeBrain", () => {
  it("waits the configured delay through the injected sleep and returns a fixed clarify intent", async () => {
    const slept: number[] = [];
    const brain = createFakeBrain({ delayMs: 1500, sleep: async (ms) => void slept.push(ms) });
    const first = await brain.parseIntent("book me a flight to mars");
    const second = await brain.parseIntent("something else entirely");
    expect(slept).toEqual([1500, 1500]);
    expect(first.type).toBe("clarify");
    expect(second).toEqual(first);
    expect(Intent.safeParse(first).success).toBe(true);
  });

  it("never returns request_action unless requestActionId is set", async () => {
    const brain = createFakeBrain({ delayMs: 0, sleep: async () => {} });
    for (const text of ["submit", "click book room", "pay", "e10", "request_action e10"]) {
      expect((await brain.parseIntent(text)).type).not.toBe("request_action");
    }
  });

  it("returns request_action only when the test option is set", async () => {
    const brain = createFakeBrain({ delayMs: 0, sleep: async () => {}, requestActionId: "e10" });
    expect(await brain.parseIntent("anything")).toEqual({ type: "request_action", actionId: "e10" });
  });

  it("triggers the configured request_action only for the exact test phrase", async () => {
    const brain = createFakeBrain({
      delayMs: 0,
      sleep: async () => {},
      requestActionId: "f0e1",
      requestActionPhrase: "please submit the booking",
    });
    expect(await brain.parseIntent("please submit the booking")).toEqual({ type: "request_action", actionId: "f0e1" });
    expect(await brain.parseIntent("fill Guest name with [value omitted]")).toEqual({
      type: "clarify",
      question: "I'm in offline mode. I understand: what's here, what's required, read the form, stop and repeat.",
    });
    expect(await brain.parseIntent("Please submit the booking")).toMatchObject({ type: "clarify" });
  });

  it("uses a real sleep when none is injected", async () => {
    const brain = createFakeBrain({ delayMs: 20 });
    const t0 = performance.now();
    await brain.parseIntent("hello");
    expect(performance.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
