import { describe, it, expect } from "vitest";
import { createVoiceState, type VoiceStatus } from "./state";

function make() {
  const seen: VoiceStatus[] = [];
  const s = createVoiceState((v) => seen.push(v));
  return { s, seen };
}

describe("voice state", () => {
  it("socket open -> idle", () => {
    const { s, seen } = make();
    s.socketOpened();
    expect(s.get()).toBe("idle");
    expect(seen).toEqual(["idle"]);
  });
  it("message sent -> thinking", () => {
    const { s } = make();
    s.socketOpened();
    s.messageSent();
    expect(s.get()).toBe("thinking");
  });
  it("reply -> speaking", () => {
    const { s } = make();
    s.socketOpened();
    s.messageSent();
    s.replyReceived();
    expect(s.get()).toBe("speaking");
  });
  it("all speech done -> idle", () => {
    const { s } = make();
    s.socketOpened();
    s.messageSent();
    s.replyReceived();
    s.speechDone();
    expect(s.get()).toBe("idle");
  });
  it("socket close -> offline, and events while offline do not leave offline", () => {
    const { s } = make();
    s.socketOpened();
    s.socketClosed();
    expect(s.get()).toBe("offline");
    s.messageSent();
    expect(s.get()).toBe("offline");
  });
  it("does not emit duplicate changes", () => {
    const { s, seen } = make();
    s.socketOpened();
    s.socketOpened();
    expect(seen).toEqual(["idle"]);
  });
});
