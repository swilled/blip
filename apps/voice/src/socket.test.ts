import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAX_UTTERANCE_CHARS, buildFrame, parseFrame, type Message } from "@blip/protocol";
import { createSocket, type WebSocketLike } from "./socket";

class FakeWs implements WebSocketLike {
  sent: string[] = [];
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  constructor(public url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {}
  open() {
    this.onopen?.();
  }
  recv(d: unknown) {
    this.onmessage?.({ data: d });
  }
  closeWith(code: number) {
    this.onclose?.({ code });
  }
}

function setup() {
  const socks: FakeWs[] = [];
  const messages: Message[] = [];
  const events: boolean[] = [];
  const onReplaced = vi.fn();
  const s = createSocket({
    host: "127.0.0.1:7777",
    makeWebSocket: (u) => {
      const w = new FakeWs(u);
      socks.push(w);
      return w;
    },
    clientVersion: "t",
    onMessage: (m) => messages.push(m),
    onOpenClose: (c) => events.push(c),
    onReplaced,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { s, socks, messages, events, onReplaced };
}
const welcome = () => JSON.stringify(buildFrame("welcome", { sessionId: "x", serverVersion: "1", brain: "fake" }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("socket", () => {
  it("sends the existing optional rate setting without changing the output mode", () => {
    const { s, socks } = setup();
    socks[0].open(); socks[0].recv(welcome());
    s.sendSettings("agent-voice", 1.26);
    expect(JSON.parse(socks[0].sent.at(-1)!)).toMatchObject({ type: "settings", payload: { outputMode: "agent-voice", rate: 1.26 } });
  });
  it("sends hello first, valid", () => {
    const { socks } = setup();
    socks[0].open();
    const r = parseFrame(socks[0].sent[0]);
    expect(r.ok && r.message.type === "hello" && r.message.payload).toEqual({
      role: "voice",
      clientVersion: "t",
      protocolVersion: 1,
    });
  });
  it("utterance only after welcome", () => {
    const { s, socks } = setup();
    socks[0].open();
    expect(s.sendUtterance({ source: "typed", text: "hi" })).toBeNull();
    expect(socks[0].sent).toHaveLength(1);
    socks[0].recv(welcome());
    const id = s.sendUtterance({ source: "typed", text: "hi" });
    expect(id).toBeTruthy();
    const r = parseFrame(socks[0].sent[1]);
    expect(r.ok && r.message.type === "utterance" && r.message.payload.source).toBe("typed");
  });
  it("trims, drops empty, caps, passes optionals", () => {
    const { s, socks } = setup();
    socks[0].open();
    socks[0].recv(welcome());
    expect(s.sendUtterance({ source: "voice", text: "   " })).toBeNull();
    s.sendUtterance({ source: "voice", text: "  " + "a".repeat(600), sttConfidence: 0.5, alternatives: ["b"] });
    const r = parseFrame(socks[0].sent[1]);
    expect(r.ok).toBe(true);
    if (r.ok && r.message.type === "utterance") {
      expect(r.message.payload.text).toHaveLength(MAX_UTTERANCE_CHARS);
      expect(r.message.payload.sttConfidence).toBe(0.5);
      expect(r.message.payload.alternatives).toEqual(["b"]);
    }
  });
  it("ptt and speak.done frames", () => {
    const { s, socks } = setup();
    socks[0].open();
    socks[0].recv(welcome());
    s.sendPtt("start");
    s.sendSpeakDone({ speakId: "s1", interrupted: true });
    const a = parseFrame(socks[0].sent[1]);
    const b = parseFrame(socks[0].sent[2]);
    expect(a.ok && a.message.payload).toEqual({ state: "start" });
    expect(b.ok && b.message.payload).toEqual({ speakId: "s1", interrupted: true });
  });
  it("sends only the supported exclusive speech output settings", () => {
    const { s, socks } = setup();
    socks[0].open();
    socks[0].recv(welcome());
    s.sendSettings("screen-reader");

    const sent = parseFrame(socks[0].sent[1]);
    expect(sent.ok && sent.message.type === "settings" && sent.message.payload).toEqual({
      outputMode: "screen-reader",
    });
  });
  it("drops invalid inbound, delivers valid", () => {
    const { socks, messages } = setup();
    socks[0].open();
    socks[0].recv(welcome());
    socks[0].recv("not json");
    socks[0].recv(JSON.stringify({ v: 1, id: "1", type: "nope", ts: 1, payload: {} }));
    socks[0].recv(JSON.stringify({ v: 1, id: "1", type: "speak", ts: 1, payload: { speakId: 5 } }));
    expect(messages).toHaveLength(0);
    socks[0].recv(JSON.stringify(buildFrame("earcon", { name: "done" })));
    expect(messages.map((m) => m.type)).toEqual(["earcon"]);
  });
  it("reconnects after 2000 ms and re-hellos; not after 4004", () => {
    const { socks, onReplaced } = setup();
    socks[0].open();
    socks[0].recv(welcome());
    socks[0].closeWith(1006);
    vi.advanceTimersByTime(1999);
    expect(socks).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(socks).toHaveLength(2);
    socks[1].open();
    expect(parseFrame(socks[1].sent[0]).ok).toBe(true);
    socks[1].closeWith(4004);
    vi.advanceTimersByTime(10000);
    expect(socks).toHaveLength(2);
    expect(onReplaced).toHaveBeenCalled();
  });
  it("builds url from host", () => {
    const { socks } = setup();
    expect(socks[0].url).toBe("ws://127.0.0.1:7777/ws");
  });
});
