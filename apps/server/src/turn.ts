// One utterance, start to finish: transcript, routing, snapshot fetch, reply, state pushes (D-23, D-24).
// Nothing in here acts on the page. The fake and (later) real brain can only produce an Intent, and
// no Intent causes an act.request in Phase 1 (GATE-05 foundation, T-01-26).
import { newId, type Message, type PayloadOf } from "@blip/protocol";
import { HubRequestError, type Hub } from "./hub/hub";
import { matchGrammar } from "./brain/grammar";
import { describeReply } from "./reply";
import type { Session } from "./session/session";

export type TurnContext = {
  message: Message;
  hub: Hub;
  session: Session;
  /** How long a snapshot.request may take before the turn gives up. */
  snapshotTimeoutMs: number;
};

type SpeakCategory = PayloadOf<"speak">["category"];

export const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
export const MSG_READ_FAILED = "I couldn't read the page.";
export const MSG_NOT_YET = "I can't do that yet.";

function speak(ctx: TurnContext, text: string, category: SpeakCategory, interrupt = false): void {
  if (category !== "filler") ctx.session.lastSpoken = text;
  ctx.hub.send("voice", "speak", { speakId: newId(), text, category, interrupt });
}

/**
 * Make sure `session.model` matches the page. Returns an error reply to speak instead when it can't:
 * the extension is not connected, or the snapshot failed or timed out. Never throws.
 */
async function ensureSnapshot(ctx: TurnContext): Promise<{ ok: true } | { ok: false; reply: string }> {
  const { session, hub } = ctx;
  if (!session.extensionConnected) return { ok: false, reply: MSG_NO_EXTENSION };
  if (session.model !== null && !session.stale) return { ok: true };
  try {
    const result = await hub.request(
      "extension",
      "snapshot.request",
      { reason: "user" },
      { expect: "snapshot.result", timeoutMs: ctx.snapshotTimeoutMs },
    );
    if (!result.payload.ok) return { ok: false, reply: MSG_READ_FAILED };
    session.applySnapshot(result.payload.snapshot);
    return { ok: true };
  } catch (err) {
    if (err instanceof HubRequestError && (err.code === "disconnected" || err.code === "no-connection")) {
      return { ok: false, reply: MSG_NO_EXTENSION };
    }
    return { ok: false, reply: MSG_READ_FAILED };
  }
}

export async function handleUtterance(ctx: TurnContext): Promise<void> {
  const { message, hub, session } = ctx;
  if (message.type !== "utterance") return;
  const { utteranceId, text } = message.payload;

  const command = matchGrammar(text);
  hub.send("voice", "transcript", { utteranceId, heardAs: text, routedTo: command !== null ? "grammar" : "model" });

  session.busy = true;
  session.dialogue = "describing";
  hub.pushState();
  try {
    if (command?.type === "describe") {
      const ready = await ensureSnapshot(ctx);
      if (!ready.ok) speak(ctx, ready.reply, "error");
      else speak(ctx, describeReply(session.model!), "answer");
    } else {
      speak(ctx, MSG_NOT_YET, "answer");
    }
  } finally {
    session.busy = false;
    session.dialogue = session.model !== null && session.extensionConnected ? "ready" : "no-page";
    hub.pushState();
  }
}
