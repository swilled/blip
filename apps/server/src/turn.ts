// One utterance, start to finish: transcript, routing, snapshot fetch, reply, state pushes (D-23, D-24).
// Nothing in here acts on the page. The fake and (later) real brain can only produce an Intent, and
// no Intent causes an act.request or a confirm.armed in Phase 1: the Executor does not exist until
// Phase 3 (GATE-05 foundation, T-01-26).
import { newId, type Intent, type Message, type PayloadOf } from "@blip/protocol";
import type { IntentBrain } from "./brain/fake-brain";
import { matchGrammar, type LocalCommand } from "./brain/grammar";
import { matchFieldPhrase, resolveFieldPhrase } from "./brain/phrases";
import { executeUngated } from "./act/ungated";
import type { Hub } from "./hub/hub";
import { describeReply, readFormReply, requiredReply } from "./reply";
import type { Refresher } from "./session/refresh";
import type { Session } from "./session/session";

export type TurnContext = {
  message: Message;
  hub: Hub;
  session: Session;
  /** Maximum cached-model age for intents that explicitly read all field values. */
  freshnessMs: number;
  /** Shared page-change and read-intent snapshot path. */
  refresher: Refresher;
  /** Resolves model-routed utterances to an Intent (the fake brain in Phase 1). */
  brain: IntentBrain;
};

type SpeakCategory = PayloadOf<"speak">["category"];

export const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
export const MSG_READ_FAILED = "I couldn't read the page.";
export const MSG_NOT_YET = "I can't do that yet.";
export const MSG_NOTHING_TO_REPEAT = "There's nothing to repeat.";
export const MSG_STOPPED = "Stopped.";
export const MSG_UNKNOWN = "I didn't understand that.";
export const MSG_BRAIN_FAILED = "Something went wrong on my side.";
export const MSG_FILLER = "One moment.";
const MSG_FIELD_PHRASE_TOO_LONG = "That value is too long to fill.";

type SpeakOptions = { interrupt?: boolean; record?: boolean };

function speak(hub: Hub, session: Session, text: string, category: SpeakCategory, opts: SpeakOptions = {}): void {
  // Filler is never repeated, and "repeat"/"stop" must not overwrite what the user wants repeated.
  if (category !== "filler" && opts.record !== false) session.lastSpoken = text;
  hub.send("voice", "speak", { speakId: newId(), text, category, interrupt: opts.interrupt === true });
}

/** `stop`: cut off whatever the voice UI is saying. */
export function sayStop(hub: Hub, session: Session): void {
  speak(hub, session, MSG_STOPPED, "answer", { interrupt: true, record: false });
}

/** `repeat`: re-send the last spoken text. */
export function sayRepeat(hub: Hub, session: Session): void {
  if (session.lastSpoken === null) speak(hub, session, MSG_NOTHING_TO_REPEAT, "answer", { record: false });
  else speak(hub, session, session.lastSpoken, "answer", { record: false });
}

/**
 * Make sure `session.model` matches the page. Returns an error reply to speak instead when it can't:
 * the extension is not connected, or the snapshot failed or timed out. Never throws.
 */
async function ensureSnapshot(
  ctx: TurnContext,
  maxAgeMs?: number,
): Promise<{ ok: true } | { ok: false; reply: string }> {
  const { session } = ctx;
  const freshEnough =
    session.model !== null &&
    !session.stale &&
    (maxAgeMs === undefined || (session.modelAgeMs !== null && session.modelAgeMs <= maxAgeMs));
  if (freshEnough) return { ok: true };

  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    return { ok: false, reply: result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED };
  }
  if (session.model === null || session.stale) return { ok: false, reply: MSG_READ_FAILED };
  return { ok: true };
}

/** The intents that read the form back. Everything here is built from labels and counts only. */
async function readOut(
  ctx: TurnContext,
  build: (model: NonNullable<Session["model"]>) => string,
  maxAgeMs?: number,
): Promise<void> {
  const ready = await ensureSnapshot(ctx, maxAgeMs);
  if (!ready.ok) speak(ctx.hub, ctx.session, ready.reply, "error");
  else speak(ctx.hub, ctx.session, build(ctx.session.model!), "answer");
}

/**
 * Carry out an Intent (from the grammar or the brain). The only intents Phase 1 understands are the
 * read-only ones. Every other type, including request_action, click_safe and set_fields, is refused
 * out loud and causes no act.request and no confirm.armed.
 */
async function runIntent(ctx: TurnContext, intent: Intent | LocalCommand): Promise<void> {
  const { hub, session } = ctx;
  switch (intent.type) {
    case "describe":
      return readOut(ctx, describeReply);
    case "whats_required":
      return readOut(ctx, requiredReply, ctx.freshnessMs);
    case "read_form":
      return readOut(ctx, readFormReply, ctx.freshnessMs);
    case "stop":
      return sayStop(hub, session);
    case "repeat":
      return sayRepeat(hub, session);
    case "clarify":
      return speak(hub, session, intent.question, "answer");
    case "answer":
      return speak(hub, session, intent.text, "answer");
    case "unknown":
      return speak(hub, session, MSG_UNKNOWN, "answer");
    case "set_fields":
    case "go_to_field": {
      const result = await executeUngated(ctx, intent);
      return speak(hub, session, result.text, result.category);
    }
    default:
      // request_action, click_safe, set_fields, fill_profile, ...: nothing acts in Phase 1 (T-01-26).
      return speak(hub, session, MSG_NOT_YET, "answer");
  }
}

export async function handleUtterance(ctx: TurnContext): Promise<void> {
  const { message, hub, session } = ctx;
  if (message.type !== "utterance") return;
  const { utteranceId, text } = message.payload;

  const command = matchGrammar(text);
  const fieldPhrase = matchFieldPhrase(text);
  hub.send("voice", "transcript", {
    utteranceId,
    heardAs: text,
    routedTo: command !== null || fieldPhrase !== null ? "grammar" : "model",
  });

  session.busy = true;
  session.dialogue = "describing";
  hub.pushState();
  try {
    if (command !== null) {
      await runIntent(ctx, command);
    } else {
      hub.send("voice", "earcon", { name: "thinking" });
      speak(hub, session, MSG_FILLER, "filler");
      let intent: Intent;
      try {
        intent = await ctx.brain.parseIntent(text);
      } catch {
        hub.send("voice", "earcon", { name: "error" });
        speak(hub, session, MSG_BRAIN_FAILED, "error");
        return;
      }
      if (fieldPhrase !== null && intent.type !== "request_action") {
        if (fieldPhrase.type === "invalid") {
          return speak(hub, session, fieldPhrase.reason === "too-long" ? MSG_FIELD_PHRASE_TOO_LONG : "Say a field and the value to fill.", "error");
        }
        const ready = await ensureSnapshot(ctx, ctx.freshnessMs);
        if (!ready.ok) return speak(hub, session, ready.reply, "error");
        intent = resolveFieldPhrase(session.model!, fieldPhrase);
      }
      await runIntent(ctx, intent);
    }
  } finally {
    session.busy = false;
    session.dialogue = session.model !== null && session.extensionConnected ? "ready" : "no-page";
    hub.pushState();
  }
}
