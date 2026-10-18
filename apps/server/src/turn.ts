// One utterance, start to finish: transcript, routing, snapshot fetch, reply, state pushes (D-23, D-24).
// The fake and (later) real brain can only produce an Intent. Ungated Intents enter the established
// field action path; gated Intents enter the deterministic Executor and never authorize themselves.
import { newId, type Intent, type Message, type PayloadOf } from "@blip/protocol";
import type { IntentBrain } from "./brain/fake-brain";
import { matchGrammar, type LocalCommand } from "./brain/grammar";
import { matchFieldPhrase, resolveFieldPhrase, safePhraseForBrain, safePhraseForTranscript } from "./brain/phrases";
import { containsSensitiveUtterance, decideUtteranceForBrain } from "./brain/claude/privacy";
import { routeIntent, type IntentRoutePage } from "./brain/claude/intent-router";
import type { ClaudeProvider } from "./brain/claude/provider";
import type { Snapshot } from "@blip/protocol";
import { executeUngated } from "./act/ungated";
import { executeGatedAction, type GatedCommand } from "./act/gated";
import { createVoiceGateAdapter } from "./act/voice-gate-adapter";
import { formatResultErrors, interpretCurrentErrors } from "./results/interpret";
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
  /** Present only in Claude mode; the raw `IntentBrain` seam remains fake-only. */
  claudeProvider?: ClaudeProvider;
  /** Injected only for deterministic cooldown/grant tests; production uses the process clock. */
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  /** Injectable watchdog clock; the provider call remains bounded in production too. */
  intentWatchdog?: { schedule(callback: () => void, delayMs: number): unknown; cancel(handle: unknown): void };
};

type SpeakCategory = PayloadOf<"speak">["category"];

export const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
export const MSG_READ_FAILED = "I couldn't read the page.";
export const MSG_NOT_YET = "I can't do that yet.";
export const MSG_NOTHING_TO_REPEAT = "There's nothing to repeat.";
export const MSG_STOPPED = "Stopped.";
export const MSG_UNKNOWN = "I didn't understand that.";
export const MSG_BRAIN_FAILED = "Something went wrong on my side.";
export const MSG_CLAUDE_FAILED = "I couldn't understand that";
export const MSG_FILLER = "One moment.";
const MSG_FIELD_PHRASE_TOO_LONG = "That value is too long to fill.";
const MSG_NO_CURRENT_ERRORS = "There are no errors currently detected.";
const CLAUDE_INTENT_WATCHDOG_MS = 4_000;

const intentRecoveries = new WeakMap<ClaudeProvider, Promise<void>>();

function startIntentRoleRecovery(provider: ClaudeProvider): Promise<void> {
  const pending = intentRecoveries.get(provider);
  if (pending !== undefined) return pending;
  const recovery = Promise.resolve()
    .then(() => provider.abortRole("intent"))
    .catch(() => {})
    .then(() => provider.recreateRole("intent"));
  intentRecoveries.set(provider, recovery);
  void recovery.finally(() => {
    if (intentRecoveries.get(provider) === recovery) intentRecoveries.delete(provider);
  }).catch(() => {});
  return recovery;
}

async function waitForIntentRecovery(provider: ClaudeProvider): Promise<void> {
  await intentRecoveries.get(provider);
}

type SpeakOptions = { interrupt?: boolean; record?: boolean };

function speak(hub: Hub, session: Session, text: string, category: SpeakCategory, opts: SpeakOptions = {}): void {
  // Filler is never repeated, and "repeat"/"stop" must not overwrite what the user wants repeated.
  const speakId = newId();
  if (!hub.send("voice", "speak", { speakId, text, category, interrupt: opts.interrupt === true })) return;
  session.trackSpeech(speakId, category);
  if (category !== "filler" && opts.record !== false) session.lastSpoken = text;
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

async function captureIntentPage(
  ctx: TurnContext,
): Promise<{ ok: true; snapshot: Snapshot; model: NonNullable<Session["model"]> } | { ok: false; reply: string }> {
  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    return { ok: false, reply: result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED };
  }
  const model = ctx.session.model;
  if (
    model === null ||
    ctx.session.stale ||
    ctx.session.tabId !== result.snapshot.tabId ||
    model.snapshotVersion !== result.snapshot.version ||
    model.structuralHash !== result.snapshot.structuralHash ||
    model.url !== result.snapshot.url
  ) return { ok: false, reply: MSG_READ_FAILED };
  return { ok: true, snapshot: result.snapshot, model };
}

async function handlePrivacyHandoff(
  ctx: TurnContext,
  handoff: Extract<ReturnType<typeof decideUtteranceForBrain>, { kind: "withhold-and-handoff" }>['handoff'],
): Promise<void> {
  if (handoff.kind === "clarify") {
    speak(ctx.hub, ctx.session, handoff.spokenText, "answer");
    return;
  }
  const focused = await executeUngated(ctx, { type: "go_to_field", fieldId: handoff.fieldId });
  if (focused.category === "error") {
    speak(ctx.hub, ctx.session, focused.text, focused.category);
    return;
  }
  speak(ctx.hub, ctx.session, handoff.spokenText, "answer");
}

function currentIntentPage(ctx: TurnContext, snapshot: Snapshot, model: NonNullable<Session["model"]>): IntentRoutePage {
  const isCurrent = (): boolean => {
    const accepted = ctx.session.model;
    return !ctx.session.stale && accepted !== null &&
      ctx.session.tabId === snapshot.tabId &&
      accepted.url === snapshot.url &&
      accepted.snapshotVersion === snapshot.version &&
      accepted.structuralHash === snapshot.structuralHash;
  };
  return {
    snapshot,
    model,
    isCurrent,
    getCurrentModel: () => isCurrent() ? ctx.session.model : null,
  };
}

async function runClaudeIntent(ctx: TurnContext, text: string, snapshot: Snapshot, model: NonNullable<Session["model"]>): Promise<void> {
  const provider = ctx.claudeProvider;
  if (provider === undefined) {
    speak(ctx.hub, ctx.session, MSG_CLAUDE_FAILED, "error");
    return;
  }

  let timer: unknown;
  let settled = false;
  let rejectTimeout!: (error: Error) => void;
  const watchdog = ctx.intentWatchdog ?? {
    schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });

  try {
    await waitForIntentRecovery(provider);
    const controller = new AbortController();
    timer = watchdog.schedule(() => {
      if (settled) return;
      controller.abort(new Error("Claude intent watchdog expired."));
      void startIntentRoleRecovery(provider).catch(() => {});
      rejectTimeout(new Error("Claude intent watchdog expired."));
    }, CLAUDE_INTENT_WATCHDOG_MS);

    const routed = routeIntent(text, currentIntentPage(ctx, snapshot, model), provider, controller.signal);
    const result = await Promise.race([routed, timeout]);
    settled = true;
    if (result.kind === "intent") await runIntent(ctx, result.intent);
    else if (result.kind === "handoff") await handlePrivacyHandoff(ctx, result.handoff);
    else speak(ctx.hub, ctx.session, MSG_CLAUDE_FAILED, "error");
  } catch {
    settled = true;
    ctx.hub.send("voice", "earcon", { name: "error" });
    speak(ctx.hub, ctx.session, MSG_CLAUDE_FAILED, "error");
  } finally {
    settled = true;
    if (timer !== undefined) watchdog.cancel(timer);
  }
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

/** This command always reads the current page before repeating its detected errors. */
async function reportCurrentErrors(ctx: TurnContext): Promise<void> {
  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    speak(ctx.hub, ctx.session, result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED, "error");
    return;
  }
  if (ctx.session.model === null || ctx.session.stale) {
    speak(ctx.hub, ctx.session, MSG_READ_FAILED, "error");
    return;
  }
  const errors = formatResultErrors(interpretCurrentErrors(ctx.session.model));
  speak(ctx.hub, ctx.session, errors ?? MSG_NO_CURRENT_ERRORS, "answer");
}

/**
 * Carry out an Intent (from the grammar or the brain). Only deterministic local commands are resolved
 * in grammar; model-produced gated Intents enter the single Executor, while safe field actions retain
 * the existing ungated path.
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
    case "what_went_wrong":
      return reportCurrentErrors(ctx);
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
    case "request_action":
      return createVoiceGateAdapter(ctx).arm({ actionId: intent.actionId });
    case "click_safe":
      return executeGatedAction(ctx, intent);
    default:
      // No Intent approves an action; request_action and click_safe only enter the Executor above.
      return speak(hub, session, MSG_NOT_YET, "answer");
  }
}

export async function handleUtterance(ctx: TurnContext): Promise<void> {
  const { message, hub, session } = ctx;
  if (message.type !== "utterance") return;
  const { utteranceId, text } = message.payload;

  const hasPendingConfirmation = session.pendingGatedAction !== null;
  const command = hasPendingConfirmation ? null : matchGrammar(text);
  const fieldPhrase = hasPendingConfirmation ? null : matchFieldPhrase(text);
  const privateUtterance = containsSensitiveUtterance(text);
  hub.send("voice", "transcript", {
    utteranceId,
    heardAs: privateUtterance
      ? "private content withheld"
      : hasPendingConfirmation ? text : fieldPhrase === null ? text : safePhraseForTranscript(fieldPhrase),
    routedTo: hasPendingConfirmation || command !== null || fieldPhrase !== null ? "grammar" : "model",
  });

  session.busy = true;
  session.dialogue = hasPendingConfirmation ? "awaiting-confirm" : "describing";
  hub.pushState();
  try {
    if (hasPendingConfirmation) {
      const confirmation: GatedCommand = { type: "confirmation", text };
      await executeGatedAction(ctx, confirmation);
      return;
    }

    if (command !== null) {
      await runIntent(ctx, command);
    } else if (fieldPhrase !== null) {
      if (fieldPhrase.type === "invalid") {
        return speak(
          hub,
          session,
          fieldPhrase.reason === "too-long" ? MSG_FIELD_PHRASE_TOO_LONG : "Say a field and the value to fill.",
          "error",
        );
      }

      // Claude mode resolves every parsed field phrase locally. Apply the same privacy classifier
      // before a local write so a dictated card/password value gets a value-free focus handoff.
      if (ctx.claudeProvider !== undefined) {
        const captured = await captureIntentPage(ctx);
        if (!captured.ok) return speak(hub, session, captured.reply, "error");
        const decision = decideUtteranceForBrain(text, captured.model);
        if (decision.kind === "withhold-and-handoff") {
          await handlePrivacyHandoff(ctx, decision.handoff);
          return;
        }
        await runIntent(ctx, resolveFieldPhrase(captured.model, fieldPhrase));
        return;
      }

      // Keep the offline fake brain's request_action test hook, but never pass a field value to it.
      hub.send("voice", "earcon", { name: "thinking" });
      speak(hub, session, MSG_FILLER, "filler");
      let modelIntent: Intent | null = null;
      try {
        modelIntent = await ctx.brain.parseIntent(safePhraseForBrain(fieldPhrase));
      } catch {
        // The typed field grammar is deterministic and does not depend on the offline brain.
      }
      if (modelIntent?.type === "request_action") {
        await runIntent(ctx, modelIntent);
        return;
      }
      const ready = await ensureSnapshot(ctx, ctx.freshnessMs);
      if (!ready.ok) return speak(hub, session, ready.reply, "error");
      await runIntent(ctx, resolveFieldPhrase(session.model!, fieldPhrase));
    } else if (ctx.claudeProvider !== undefined) {
      hub.send("voice", "earcon", { name: "thinking" });
      speak(hub, session, MSG_FILLER, "filler");
      const captured = await captureIntentPage(ctx);
      if (!captured.ok) return speak(hub, session, captured.reply, "error");
      await runClaudeIntent(ctx, text, captured.snapshot, captured.model);
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
      await runIntent(ctx, intent);
    }
  } finally {
    session.busy = false;
    session.dialogue = session.pendingGatedAction !== null
      ? session.pendingGatedAction.grantId === undefined ? "reading-back" : "awaiting-confirm"
      : session.model !== null && session.extensionConnected ? "ready" : "no-page";
    hub.pushState();
  }
}
