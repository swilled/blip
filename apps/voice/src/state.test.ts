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
  it("hold start from idle -> listening, no speech cancel", () => {
    const { s } = make();
    s.socketOpened();
    expect(s.holdStart()).toEqual({ cancelSpeech: false, started: true });
    expect(s.get()).toBe("listening");
  });
  it("hold start while speaking -> listening and requests cancelSpeech", () => {
    const { s } = make();
    s.socketOpened();
    s.messageSent();
    s.replyReceived();
    expect(s.holdStart()).toEqual({ cancelSpeech: true, started: true });
    expect(s.get()).toBe("listening");
  });
  it("hold start while already listening is ignored", () => {
    const { s, seen } = make();
    s.socketOpened();
    s.holdStart();
    expect(s.holdStart()).toEqual({ cancelSpeech: false, started: false });
    expect(seen).toEqual(["idle", "listening"]);
  });
  it("hold start while offline is ignored", () => {
    const { s } = make();
    expect(s.holdStart().started).toBe(false);
    expect(s.get()).toBe("offline");
  });
  it("final transcript -> thinking; no transcript -> idle", () => {
    const a = make();
    a.s.socketOpened();
    a.s.holdStart();
    a.s.transcriptDelivered();
    expect(a.s.get()).toBe("thinking");
    const b = make();
    b.s.socketOpened();
    b.s.holdStart();
    b.s.noTranscript();
    expect(b.s.get()).toBe("idle");
  });
  it("does not emit duplicate changes", () => {
    const { s, seen } = make();
    s.socketOpened();
    s.socketOpened();
    expect(seen).toEqual(["idle"]);
  });
});
