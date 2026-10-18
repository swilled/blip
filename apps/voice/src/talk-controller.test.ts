import { describe, expect, it } from "vitest";
import { createVoiceState } from "./state";
import { createTalkController, MSG_NOT_CONNECTED, type SttHandlers, type TalkDeps, type UtteranceOut } from "./talk-controller";
import { MSG_DIDNT_CATCH } from "./stt";

function setup(over: Partial<TalkDeps> & { speaking?: boolean; sendResult?: string | null } = {}) {
  const calls: string[] = [];
  let handlers!: SttHandlers;
  const sent: UtteranceOut[] = [];
  const captions: string[] = [];
  const messages: string[] = [];
  let speaking = over.speaking ?? false;
  const state = createVoiceState(() => {});
  state.socketOpened();
  if (speaking) state.replyReceived();
  const tts = {
    cancel: () => {
      calls.push("tts.cancel");
      speaking = false;
    },
    markSent: () => calls.push("tts.markSent"),
    isSpeaking: () => speaking,
    msSinceSpeechEnd: () => 5000,
  };
  const deps: TalkDeps = {
    socket: {
      sendPtt: (s) => calls.push(`ptt.${s}`),
      sendUtterance: (u) => {
        sent.push(u);
        return over.sendResult === undefined ? "id1" : over.sendResult;
      },
    },
    makeStt: (h) => {
      handlers = h;
      return {
        press: () => calls.push("stt.press"),
        release: () => calls.push("stt.release"),
        isActive: () => false,
      };
    },
    tts,
    state,
    earcons: { play: (n) => calls.push(`earcon.${n}`) },
    caption: {
      render: (t, f) => captions.push(`${f ? "final" : "interim"}:${t}`),
      clear: () => captions.push("clear"),
    },
    log: {
      markInterrupted: () => calls.push("interrupted"),
      showMessage: (m) => messages.push(m),
      userSaid: () => {},
    },
    spokenText: () => "Your form has three fields. Name, email and phone.",
    bargeInMode: over.bargeInMode ?? (() => "ptt-only"),
    ...(over.sendHeardDuringSpeech !== undefined ? { sendHeardDuringSpeech: over.sendHeardDuringSpeech } : {}),
  };
  const c = createTalkController(deps);
  return { c, calls, sent, captions, messages, state, h: () => handlers, setSpeaking: (v: boolean) => (speaking = v) };
}

const final = (text: string) => ({ text, confidence: 0.9, alternatives: ["alt one"] });

describe("talk controller", () => {
  it("1: ignores a hold before the gate was activated", () => {
    const t = setup();
    t.c.onHold("start");
    expect(t.calls).toEqual([]);
  });

  it("2: hold start while idle sends ptt start, earcon, listening, stt.press", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    expect(t.calls).toEqual(["ptt.start", "earcon.listening", "stt.press"]);
    expect(t.state.get()).toBe("listening");
  });

  it("3: hold start while speaking cancels speech first and marks interrupted", () => {
    const t = setup({ speaking: true });
    t.c.activate();
    t.c.onHold("start");
    expect(t.calls.slice(0, 2)).toEqual(["tts.cancel", "interrupted"]);
    expect(t.calls).toContain("stt.press");
    expect(t.state.get()).toBe("listening");
  });

  it("4: hold end sends ptt end and releases stt", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    t.calls.length = 0;
    t.c.onHold("end");
    expect(t.calls).toEqual(["ptt.end", "stt.release"]);
  });

  it("5: final transcript sends a voice utterance without heardDuringSpeech by default", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    t.h().onFinal(final("fill my name"));
    expect(t.sent).toEqual([
      { source: "voice", text: "fill my name", sttConfidence: 0.9, alternatives: ["alt one"] },
    ]);
    expect(t.calls).toContain("tts.markSent");
    expect(t.state.get()).toBe("thinking");
  });

  it("5b: heardDuringSpeech is included only when the flag is on", () => {
    const t = setup({ speaking: true, sendHeardDuringSpeech: true });
    t.c.activate();
    t.c.onHold("start");
    t.h().onFinal(final("fill my name"));
    expect(t.sent[0]?.heardDuringSpeech).toBe(true);
  });

  it("6: a stop phrase cancels speech and sends nothing", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    t.h().onFinal(final("stop"));
    expect(t.sent).toEqual([]);
    expect(t.calls).toContain("tts.cancel");
    expect(t.state.get()).toBe("idle");
  });

  it("7: stt errors show the message and return to idle; a null send shows the connection message", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    t.h().onError({ kind: "no-speech", message: MSG_DIDNT_CATCH });
    expect(t.messages).toEqual([MSG_DIDNT_CATCH]);
    expect(t.state.get()).toBe("idle");
    expect(t.calls.filter((x) => x === "stt.press")).toHaveLength(1);

    const u = setup({ sendResult: null });
    u.c.activate();
    u.c.onHold("start");
    u.h().onFinal(final("hello"));
    expect(u.messages).toEqual([MSG_NOT_CONNECTED]);
    expect(u.state.get()).toBe("idle");
  });

  it("8: voice mode arms one recognition; stop cancels; echo is discarded; other speech barges in", () => {
    const mk = () => {
      const t = setup({ speaking: true, bargeInMode: () => "voice" });
      t.c.activate();
      t.c.onSpeechStart();
      return t;
    };
    const a = mk();
    expect(a.calls).toEqual(["stt.press"]);
    a.h().onFinal(final("stop"));
    expect(a.calls).toContain("tts.cancel");
    expect(a.sent).toEqual([]);

    const b = mk();
    b.h().onFinal(final("your form has three fields"));
    expect(b.sent).toEqual([]);
    expect(b.calls).not.toContain("tts.cancel");

    const c = mk();
    c.h().onFinal(final("my name is Sam Lee"));
    expect(c.calls).toContain("tts.cancel");
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0]?.source).toBe("voice");
  });

  it("9: ptt-only mode never arms recognition during speech", () => {
    const t = setup({ speaking: true, bargeInMode: () => "ptt-only" });
    t.c.activate();
    t.c.onSpeechStart();
    t.c.onSpeechEnd();
    expect(t.calls).not.toContain("stt.press");
    t.c.onHold("start");
    expect(t.calls.filter((x) => x === "stt.press")).toHaveLength(1);
  });

  it("10: interim and final results drive the live caption; an error clears it", () => {
    const t = setup();
    t.c.activate();
    t.c.onHold("start");
    t.h().onInterim("fill my");
    t.h().onFinal(final("fill my name"));
    expect(t.captions).toEqual(["interim:fill my", "final:fill my name"]);
    const e = setup();
    e.c.activate();
    e.c.onHold("start");
    e.h().onError({ kind: "other", message: "x" });
    expect(e.captions).toEqual(["clear"]);
  });
});
