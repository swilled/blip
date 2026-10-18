// Hold / recognition / interruption / barge-in sequencing. No DOM access: every dependency
// is injected. This module never matches a confirm phrase; that lives in server code (GATE-08).
import { effectiveBargeInMode, SEND_HEARD_DURING_SPEECH, type BargeInMode } from "./config";
import { heardDuringSpeech, isEchoOfSpeech, isStopPhrase } from "./echo-filter";
import type { SttError, SttFinal } from "./stt";
import type { VoiceState } from "./state";

export const MSG_NOT_CONNECTED = "Not connected to the Blip server. Retrying. You can keep typing once it reconnects.";

export interface TalkStt {
  press(): void;
  release(): void;
  isActive(): boolean;
}

export interface SttHandlers {
  onInterim: (text: string) => void;
  onFinal: (final: SttFinal) => void;
  onError: (error: SttError) => void;
}

export interface UtteranceOut {
  source: "voice";
  text: string;
  sttConfidence?: number;
  alternatives?: string[];
  heardDuringSpeech?: boolean;
}

export interface TalkDeps {
  socket: {
    sendPtt(state: "start" | "end"): void;
    sendUtterance(u: UtteranceOut): string | null;
  };
  /** Builds the one recognizer; the controller supplies the handlers. */
  makeStt: (handlers: SttHandlers) => TalkStt;
  tts: {
    cancel(): void;
    markSent(): void;
    isSpeaking(): boolean;
    msSinceSpeechEnd(): number;
  };
  state: VoiceState;
  earcons: { play(name: "listening"): void };
  caption: { render(text: string, isFinal: boolean): void; clear(): void };
  log: { markInterrupted(): void; showMessage(text: string): void; userSaid(text: string): void };
  /** Handles exact local commands before any server dispatch or speech cancellation. */
  handleLocalUtterance?: (text: string) => boolean;
  /** The text of what Blip is currently saying, for the echo filter. */
  spokenText: () => string;
  bargeInMode?: () => BargeInMode;
  sendHeardDuringSpeech?: boolean;
  echoFilterRequired?: boolean;
}

export interface TalkController {
  activate(): void;
  onHold(state: "start" | "end"): void;
  onSpeechStart(): void;
  onSpeechEnd(): void;
  onStopTyped(): void;
}

export function createTalkController(deps: TalkDeps): TalkController {
  const mode = deps.bargeInMode ?? (() => effectiveBargeInMode());
  const sendHeard = deps.sendHeardDuringSpeech ?? SEND_HEARD_DURING_SPEECH;
  const echoRequired = deps.echoFilterRequired ?? true;

  let activated = false;
  let holding = false;
  let source: "hold" | "barge" | null = null;
  let heardFlag = false;

  function deliver(final: SttFinal): void {
    deps.caption.render(final.text, true);
    if (isStopPhrase(final.text)) {
      deps.tts.cancel();
      deps.caption.clear();
      if (source === "hold") deps.state.noTranscript();
      return;
    }
    if (deps.handleLocalUtterance?.(final.text)) {
      deps.caption.clear();
      return;
    }
    const u: UtteranceOut = {
      source: "voice",
      text: final.text,
      sttConfidence: final.confidence,
      alternatives: final.alternatives,
    };
    if (sendHeard) u.heardDuringSpeech = heardFlag;
    const id = deps.socket.sendUtterance(u);
    if (id === null) {
      deps.caption.clear();
      deps.state.noTranscript();
      deps.log.showMessage(MSG_NOT_CONNECTED);
      return;
    }
    deps.tts.markSent();
    deps.log.userSaid(final.text);
    deps.state.transcriptDelivered();
  }

  const stt = deps.makeStt({
    onInterim: (text) => {
      if (source === "hold") deps.caption.render(text, false);
    },
    onFinal: (final) => {
      if (source === "barge") {
        if (isStopPhrase(final.text)) {
          deps.tts.cancel();
          source = null;
          return;
        }
        if (echoRequired && isEchoOfSpeech(final.text, deps.spokenText())) {
          source = null;
          return;
        }
        if (deps.handleLocalUtterance?.(final.text)) {
          source = null;
          deps.caption.clear();
          return;
        }
        deps.tts.cancel();
        source = "hold"; // from here on it behaves like a normal delivered utterance
        heardFlag = true;
        deps.state.holdStart();
        deliver(final);
        source = null;
        return;
      }
      deliver(final);
      source = null;
    },
    onError: (error) => {
      const was = source;
      source = null;
      if (was === "barge") return; // armed silently; nothing to tell the user
      deps.caption.clear();
      deps.state.noTranscript();
      deps.log.showMessage(error.message);
    },
  });

  return {
    activate() {
      activated = true;
    },
    onHold(hold) {
      if (!activated) return;
      if (hold === "end") {
        if (!holding) return;
        holding = false;
        deps.socket.sendPtt("end");
        stt.release();
        return;
      }
      if (holding) return;
      const wasSpeaking = deps.tts.isSpeaking();
      const r = deps.state.holdStart();
      if (!r.started) return;
      holding = true;
      heardFlag = heardDuringSpeech(wasSpeaking, deps.tts.msSinceSpeechEnd());
      if (r.cancelSpeech) {
        deps.tts.cancel();
        deps.log.markInterrupted();
      }
      deps.socket.sendPtt("start");
      deps.earcons.play("listening");
      source = "hold";
      stt.press();
    },
    onSpeechStart() {
      if (!activated || holding || mode() !== "voice") return;
      if (stt.isActive()) return;
      source = "barge";
      stt.press();
    },
    onSpeechEnd() {
      if (source === "barge" && !holding) {
        stt.release(); // source stays "barge" so the trailing no-speech error stays silent
      }
    },
    onStopTyped() {
      deps.tts.cancel();
    },
  };
}
