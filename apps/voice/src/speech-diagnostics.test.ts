import { describe, expect, it } from "vitest";
import { checkMicrophone, createSpeechDiagnostics, observeRecognition } from "./speech-diagnostics";
describe("value-free speech diagnostics", () => {
  it("is opt-in, bounded, copies output, and drops arbitrary input content", () => {
    const d = createSpeechDiagnostics(() => 20);
    d.record({ event: "start" });
    expect(d.snapshot()).toEqual([]);
    d.enable(true);
    for (let i = 0; i < 110; i++) d.record({ event: "result", results: i, transcript: "PRIVATE-SENTINEL" } as never);
    expect(d.snapshot()).toHaveLength(100);
    expect(JSON.stringify(d.snapshot())).not.toContain("PRIVATE-SENTINEL");
    d.record({ event: "error", code: "PRIVATE-SENTINEL" });
    expect(d.snapshot().at(-1)?.code).toBe("other");
    d.enable(false);
    expect(d.snapshot()).toEqual([]);
  });
  it("observes native events alongside other listeners and removes its handlers", () => {
    const target = new EventTarget();
    const events: unknown[] = [];
    let native = 0;
    target.addEventListener("start", () => native++);
    const remove = observeRecognition(target, 2, e => events.push(e));
    target.dispatchEvent(new Event("start"));
    expect(events).toEqual([{ event: "start", generation: 2 }]);
    remove();
    target.dispatchEvent(new Event("start"));
    expect(events).toHaveLength(1);
    expect(native).toBe(2);
  });
  it("releases microphone tracks including a late permission result after cancellation", async () => {
    let stopped = 0;
    const controller = new AbortController();
    controller.abort();
    const reply = await checkMicrophone(async () => ({ getTracks: () => [{ stop: () => stopped++ }] }), controller.signal);
    expect(stopped).toBe(1);
    expect(reply).toContain("cancelled");
    expect(await checkMicrophone(async () => { throw new DOMException("blocked", "NotAllowedError"); })).toContain("blocked");
  });
});
