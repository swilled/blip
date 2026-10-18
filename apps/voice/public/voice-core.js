export const INJECTION_WARNING =
  "Warning. This page contains text directed at Blip or AI assistants. I ignore instructions from web pages and follow only your request.";

function warningKey(state) {
  const page = state?.page;
  if (page?.untrustedInstructionDetected !== true || typeof page.url !== "string") return null;
  try {
    const url = new URL(page.url);
    // Queries can contain user data. They are deliberately excluded from this local dedupe key.
    return JSON.stringify([url.origin, url.pathname, page.step ?? "", page.fieldCount]);
  } catch {
    return null;
  }
}

export class WarningGate {
  #lastKey = null;

  update(state) {
    const key = warningKey(state);
    if (key === null) {
      this.#lastKey = null;
      return false;
    }
    if (key === this.#lastKey) return false;
    this.#lastKey = key;
    return true;
  }
}

/** Only the latest server speech may complete the current server-side speakId. */
export class SpeechTracker {
  #currentSpeakId = null;
  #sendDone;

  constructor(sendDone) {
    this.#sendDone = sendDone;
  }

  start(speakId) {
    if (typeof speakId !== "string" || speakId.length === 0) return false;
    this.#currentSpeakId = speakId;
    return true;
  }

  complete(speakId, interrupted) {
    if (this.#currentSpeakId !== speakId) return false;
    this.#currentSpeakId = null;
    this.#sendDone({ speakId, interrupted: interrupted === true });
    return true;
  }

  interruptCurrent() {
    if (this.#currentSpeakId === null) return false;
    return this.complete(this.#currentSpeakId, true);
  }
}

function normalizeConfirmation(text) {
  return text
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[\p{P}\s]+$/gu, "")
    .trim();
}

function normalizeEmailReply(text) {
  return text.toLowerCase().replace(/[\p{P}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

const EMAIL_SEND_AFFIRMATIONS = new Set([
  "yes", "yeah", "yep", "sure", "okay", "ok", "go ahead", "send it", "yes please", "yes send it",
]);
const EMAIL_SEND_DECLINES = new Set([
  "no", "nope", "no thanks", "no thank you", "keep it as a draft", "leave it as a draft",
]);

/** Client reducer for server-owned confirmation state; it never stores or dispatches a ConsumedGrant. */
export class ConfirmationReducer {
  #pending = null;

  arm(payload) {
    if (
      typeof payload?.grantId !== "string" || payload.grantId.length === 0 ||
      typeof payload?.speakId !== "string" || payload.speakId.length === 0 ||
      typeof payload?.phrase !== "string" || payload.phrase.length === 0
    ) {
      this.#pending = null;
      return false;
    }
    this.#pending = {
      grantId: payload.grantId,
      speakId: payload.speakId,
      phrase: payload.phrase,
      redeeming: false,
    };
    return true;
  }

  clear(payload) {
    if (this.#pending?.grantId !== payload?.grantId) return false;
    this.#pending = null;
    return true;
  }

  redeem(text, utteranceId, source = "typed") {
    const pending = this.#pending;
    const normalized = normalizeConfirmation(text);
    const normalizedEmailReply = normalizeEmailReply(text);
    const affirmativeEmailReply = pending?.phrase === "send this email" && source === "voice" &&
      EMAIL_SEND_AFFIRMATIONS.has(normalizedEmailReply);
    const negativeEmailReply = pending?.phrase === "send this email" && source === "voice" &&
      EMAIL_SEND_DECLINES.has(normalizedEmailReply);
    if (
      pending === null || pending.redeeming ||
      typeof utteranceId !== "string" || utteranceId.length === 0 ||
      (source !== "voice" && source !== "typed") ||
      (normalized !== pending.phrase && !affirmativeEmailReply && !negativeEmailReply)
    ) return null;

    pending.redeeming = true;
    return {
      grantId: pending.grantId,
      speakId: pending.speakId,
      utteranceId,
      phrase: text.trim(),
      source,
    };
  }

  reset() {
    this.#pending = null;
  }

  get pending() {
    return this.#pending === null ? null : { ...this.#pending };
  }
}

export function makeFrame(type, payload, id = globalThis.crypto.randomUUID(), ts = Date.now()) {
  return { v: 1, id, type, ts, payload };
}
