// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFrame, parseFrame } from "@blip/protocol";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void { this.sent.push(data); }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
  disconnect(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code: 1000 }));
  }
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

describe("socket welcome hook", () => {
  it("emits only after a correlated welcome and repeats safely after reconnect", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.resetModules();
    const socket = await import("../src/background/socket.js");
    const welcomed = vi.fn();
    socket.onSocketWelcome(welcomed);

    socket.ensureConnected();
    const first = FakeWebSocket.instances[0]!;
    expect(socket.sendPageChanged({ tabId: 1, url: "https://forms.test/", reason: "navigation" })).toBe(false);
    first.open();
    const hello = parseFrame(first.sent[0]!);
    expect(hello.ok).toBe(true);
    if (!hello.ok) throw new Error("extension hello frame was malformed");

    first.receive(buildFrame("welcome", {
      sessionId: "session-1", serverVersion: "0.1.0", brain: "fake",
    }, { replyTo: "not-the-hello" }));
    expect(welcomed).not.toHaveBeenCalled();

    const welcome = buildFrame("welcome", {
      sessionId: "session-1", serverVersion: "0.1.0", brain: "fake",
    }, { replyTo: hello.message.id });
    first.receive(welcome);
    first.receive(welcome);
    expect(welcomed).toHaveBeenCalledOnce();
    expect(socket.sendPageChanged({ tabId: 1, url: "https://forms.test/", reason: "navigation" })).toBe(true);
    expect(parseFrame(first.sent.at(-1)!).ok).toBe(true);

    first.disconnect();
    vi.advanceTimersByTime(500);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    const secondHello = parseFrame(second.sent[0]!);
    expect(secondHello.ok).toBe(true);
    if (!secondHello.ok) throw new Error("reconnected extension hello frame was malformed");
    second.receive(buildFrame("welcome", {
      sessionId: "session-2", serverVersion: "0.1.0", brain: "fake",
    }, { replyTo: secondHello.message.id }));
    expect(welcomed).toHaveBeenCalledTimes(2);
    second.disconnect();
  });
});
