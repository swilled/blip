import { dialogueStateName, initialState, reduce } from "@blip/dialogue";
import {
  newId,
  type ActRequest,
  type FormModel,
} from "@blip/protocol";
import { type HandlerContext, type Handlers, type Hub } from "../hub/hub";
import type { Session } from "../session/session";
import type { Refresher } from "../session/refresh";
import type { DialogueEvent, DialogueState, Effect, SpeakEffect } from "@blip/dialogue";
import type { GatePort } from "./gate-port";

type RunnerOptions = {
  gate: GatePort;
  now?: () => number;
  snapshotTimeoutMs?: number;
  actTimeoutMs?: number;
  refresher?: Refresher;
  onTurnComplete?: () => void;
  onActRequest?: (request: ActRequest) => void;
  parseIntent?: (text: string, ctx: HandlerContext) => Promise<void>;
};

type ActEffect = Extract<Effect, { kind: "fill" | "select" | "focus" }>;

/** Send a reducer-owned speech effect. Speech ids must already be tracked by DialogueState. */
export function sendSpeakEffect(hub: Hub, effect: SpeakEffect, session?: Session): boolean {
  if (typeof effect.speakId !== "string" || effect.speakId.trim() === "") {
    throw new Error("speak effect requires a tracked speakId");
  }

  const sent = hub.send("voice", "speak", {
    speakId: effect.speakId,
    text: effect.text,
    category: effect.category,
    interrupt: false,
  });
  if (sent) session?.trackSpeech(effect.speakId, effect.category);
  return sent;
}

function safeActionLabel(label: string): string {
  return label.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function createDialogueHandlers(options: RunnerOptions): Handlers {
  const now = options.now ?? Date.now;
  const snapshotTimeoutMs = options.snapshotTimeoutMs ?? 5_000;
  const actTimeoutMs = options.actTimeoutMs ?? 5_000;
  let state: DialogueState = initialState();
  let lastSnapshotTabId: number | undefined;
  let queue: Promise<void> = Promise.resolve();
  const expiryTimers = new Map<string, NodeJS.Timeout>();

  function enqueue(job: () => Promise<void>): Promise<void> {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  }

  function currentForm(session: Session) {
    return session.extensionConnected && !session.stale ? session.model : null;
  }

  async function refreshSnapshot(session: Session, reason: "user" | "post-act"): Promise<boolean> {
    if (options.refresher !== undefined) {
      const refreshed = await options.refresher.request(reason === "post-act" ? "refresh" : "user");
      if (!refreshed.ok) {
        lastSnapshotTabId = undefined;
        return false;
      }
      lastSnapshotTabId = refreshed.snapshot.tabId;
      return true;
    }

    if (!session.extensionConnected) {
      lastSnapshotTabId = undefined;
      return false;
    }

    try {
      const result = await sessionHub.request("extension", "snapshot.request", { reason }, {
        expect: "snapshot.result",
        timeoutMs: snapshotTimeoutMs,
      });
      if (!result.payload.ok) {
        session.stale = true;
        return false;
      }
      lastSnapshotTabId = result.payload.snapshot.tabId;
      session.applySnapshot(result.payload.snapshot);
      return true;
    } catch {
      session.stale = true;
      return false;
    }
  }

  // The hub is stable for the lifetime of the injected handlers; set before requests are used.
  let sessionHub: Hub;

  async function dispatch(
    event: DialogueEvent,
    context?: HandlerContext,
    formOverride?: FormModel | null,
  ): Promise<boolean> {
    const session = context?.session ?? activeSession!;
    const form = formOverride !== undefined ? formOverride : currentForm(session);
    const result = reduce(state, event, { form, now: now() });
    const redeemed = result.effects.some((effect) => effect.kind === "redeem");
    state = result.state;
    const hub = context?.hub ?? sessionHub;

    try {
      if (event.type === "utterance") {
        const routedTo = result.effects.some((effect) => effect.kind === "parseIntent") ? "model" : "grammar";
        hub.send("voice", "transcript", {
          utteranceId: event.utterance.utteranceId,
          heardAs: event.utterance.text,
          routedTo,
        });
      }
      for (const effect of result.effects) await runEffect(effect, session, hub, context);
    } finally {
      session.dialogue = session.pendingGatedAction !== null
        ? session.pendingGatedAction.grantId === undefined ? "reading-back" : "awaiting-confirm"
        : currentForm(session) === null ? "no-page" : dialogueStateName(state.mode);
      session.focusFieldId = state.currentFieldId ?? undefined;
      session.busy = false;
      hub.pushState();
    }
    return redeemed;
  }

  let activeSession: Session | undefined;

  async function runAct(
    effect: ActEffect,
    session: Session,
    hub: Hub,
    context?: HandlerContext,
  ): Promise<void> {
    const model = currentForm(session);
    if (model === null || lastSnapshotTabId === undefined) {
      await dispatch({
        type: "act.result",
        op: effect.kind,
        fieldId: effect.fieldId,
        ok: false,
        error: "exception",
      });
      return;
    }

    const action = effect.kind === "fill"
      ? { op: "fill" as const, targetId: effect.fieldId, value: effect.value }
      : effect.kind === "select"
        ? { op: "select" as const, targetId: effect.fieldId, optionValue: effect.optionValue }
        : { op: "focus" as const, targetId: effect.fieldId };
    const request: ActRequest = {
      actId: newId(),
      tabId: lastSnapshotTabId,
      snapshotVersion: model.snapshotVersion,
      action,
      expectedKind: effect.kind === "select" ? "select" : "fill",
    };

    try {
      options.onActRequest?.(request);
      const result = await hub.request("extension", "act.request", request, {
        expect: "act.result",
        timeoutMs: actTimeoutMs,
      });
      const payload = result.payload;
      session.stale = true;
      await dispatch({
        type: "act.result",
        op: effect.kind,
        fieldId: effect.fieldId,
        ok: payload.ok,
        ...(payload.error !== undefined ? { error: payload.error } : {}),
        ...(payload.observedValue !== undefined ? { observedValue: payload.observedValue } : {}),
      }, context, model);
    } catch {
      session.stale = true;
      await dispatch({
        type: "act.result",
        op: effect.kind,
        fieldId: effect.fieldId,
        ok: false,
        error: "exception",
      }, context, model);
    }
  }

  async function runEffect(
    effect: Effect,
    session: Session,
    hub: Hub,
    context?: HandlerContext,
  ): Promise<void> {
    switch (effect.kind) {
      case "speak": {
        sendSpeakEffect(hub, effect, session);
        if (effect.category !== "filler") session.lastSpoken = effect.text;
        // NVDA dispatch acceptance is not completion. Hub falls back to agent voice before sending
        // when NVDA cannot provide a safe signal; only the voice client's real done/cancel settles it.
        return;
      }
      case "earcon":
        hub.send("voice", "earcon", { name: effect.name });
        return;
      case "cancelSpeech":
        if (typeof effect.speakId !== "string" || effect.speakId.trim() === "") {
          throw new Error("cancelSpeech effect requires a tracked speakId");
        }
        const sent = hub.send("voice", "speak", {
          speakId: effect.speakId,
          text: "Stopped.",
          category: "answer",
          interrupt: true,
        });
        if (sent) {
          session.trackSpeech(effect.speakId, "answer");
        }
        return;
      case "parseIntent":
        if (options.parseIntent && context) {
          await options.parseIntent(effect.text, context);
        } else {
          await dispatch({ type: "intent.reply", text: "I didn't understand that." });
        }
        return;
      case "fill":
      case "select":
      case "focus":
        await runAct(effect, session, hub, context);
        return;
      case "refreshForm":
        await refreshSnapshot(session, "post-act");
        await dispatch({ type: "form.changed" }, context);
        return;
      case "armConfirm": {
        let armed;
        try {
          armed = await options.gate.arm({
            actionId: effect.actionId,
            kind: effect.actionKind,
            title: effect.title,
            digest: effect.digest,
            speakId: effect.speakId,
          });
        } catch {
          await dispatch({ type: "confirm.refused", reason: "gate-error" });
          return;
        }

        if (!armed.ok) {
          await dispatch({ type: "confirm.refused", reason: armed.reason });
          return;
        }

        const actionLabel = safeActionLabel(
          session.model?.actions.find((action) => action.id === effect.actionId)?.label ?? "form",
        );
        hub.send("voice", "confirm.armed", {
          grantId: armed.grantId,
          speakId: armed.speakId,
          phrase: armed.phrase,
          kind: effect.actionKind,
          actionLabel,
          expiresAt: armed.expiresAt,
        });
        await dispatch({
          type: "confirm.armed",
          grantId: armed.grantId,
          speakId: armed.speakId,
          phrase: armed.phrase,
          expiresAt: armed.expiresAt,
        });

        const delayMs = Math.max(0, armed.expiresAt - now());
        const timer = setTimeout(() => {
          void enqueue(async () => {
            if (state.confirm?.grantId !== armed.grantId) return;
            expiryTimers.delete(armed.grantId);
            let clearedByGate = false;
            try {
              clearedByGate = (await options.gate.clear(armed.grantId, "expired")) === true;
            } finally {
              if (!clearedByGate) hub.send("voice", "confirm.cleared", { grantId: armed.grantId, reason: "expired" });
              await dispatch({
                type: "confirm.cleared",
                grantId: armed.grantId,
                reason: "expired",
              });
            }
          });
        }, delayMs);
        timer.unref();
        expiryTimers.set(armed.grantId, timer);
        return;
      }
      case "clearConfirm":
        clearTimeout(expiryTimers.get(effect.grantId));
        expiryTimers.delete(effect.grantId);
        let clearedByGate = false;
        try {
          clearedByGate = (await options.gate.clear(effect.grantId, effect.reason)) === true;
        } catch {
          // Clearing an in-memory voice stub is best effort; the UI still needs the clear frame.
        }
        if (!clearedByGate) hub.send("voice", "confirm.cleared", { grantId: effect.grantId, reason: effect.reason });
        return;
      case "redeem": {
        clearTimeout(expiryTimers.get(effect.grantId));
        expiryTimers.delete(effect.grantId);
        let outcome: { ok: boolean; reason?: string; handledByCore?: true };
        try {
          outcome = await options.gate.redeem({
            grantId: effect.grantId,
            speakId: effect.speakId,
            utteranceId: effect.utteranceId,
            phrase: effect.phrase,
            // This legacy reducer effect carries no source metadata; its gated forms retain the
            // existing phrase behavior and cannot start the core page-task send flow.
            source: "typed",
          });
        } catch {
          outcome = { ok: false, reason: "gate-error" };
        }
        if (outcome.handledByCore) {
          await dispatch({ type: "gated.result", ok: outcome.ok, silent: true }, context);
          return;
        }
        await dispatch({
          type: "gated.result",
          ok: outcome.ok,
          ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
        });
        hub.send("voice", "confirm.cleared", {
          grantId: effect.grantId,
          reason: outcome.ok ? "executed" : "cancelled",
        });
        return;
      }
    }
  }

  const handlers: Handlers = {
    utterance(context) {
      if (context.role !== "voice" || context.message.type !== "utterance") return;
      const utterance = context.message.payload;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        context.session.busy = true;
        context.hub.pushState();
        if (context.session.model === null || context.session.stale) {
          await refreshSnapshot(context.session, "user");
        }
        try {
          await dispatch({ type: "utterance", utterance }, context);
        } finally {
          options.onTurnComplete?.();
        }
      });
    },
    "confirm.redeem"(context) {
      if (context.role !== "voice" || context.message.type !== "confirm.redeem") return;
      const redemption = context.message.payload;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        context.session.busy = true;
        context.hub.pushState();
        try {
          // The browser voice UI has already matched its exact phrase. Re-enter the same reducer
          // path as a voice-role utterance so the server reducer clears its private pending state;
          // the core GatePort still validates the tracked grant/speak ids before dispatch.
          const confirm = state.confirm;
          if (confirm === null || confirm.grantId !== redemption.grantId || confirm.speakId !== redemption.speakId) {
            context.hub.send("voice", "confirm.cleared", {
              grantId: redemption.grantId,
              reason: "cancelled",
            });
            return;
          }
          const redeemed = await dispatch({
            type: "utterance",
            utterance: {
              utteranceId: redemption.utteranceId,
              text: redemption.phrase,
              source: "typed",
            },
          }, context);
          if (!redeemed && state.confirm?.grantId === redemption.grantId) {
            clearTimeout(expiryTimers.get(redemption.grantId));
            expiryTimers.delete(redemption.grantId);
            let clearedByGate = false;
            try {
              clearedByGate = (await options.gate.clear(redemption.grantId, "cancelled")) === true;
            } catch {
              // A rejected UI confirmation must never leave its local redeeming lock armed.
            }
            if (!clearedByGate) {
              context.hub.send("voice", "confirm.cleared", {
                grantId: redemption.grantId,
                reason: "cancelled",
              });
            }
            await dispatch({
              type: "confirm.cleared",
              grantId: redemption.grantId,
              reason: "cancelled",
            }, context);
          }
        } finally {
          context.session.busy = false;
          context.hub.pushState();
          options.onTurnComplete?.();
        }
      });
    },
    "speak.done"(context) {
      if (context.role !== "voice" || context.message.type !== "speak.done") return;
      const done = context.message.payload;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        // Never let an unknown, duplicate, NVDA-only, or otherwise untracked completion reach the
        // reducer. Matching a read-back id alone is not evidence that its output actually finished.
        if (!context.session.completeSpeech(done.speakId, done.interrupted, now())) return;
        await dispatch({ type: "speak.done", done }, context);
      });
    },
    settings(context) {
      if (context.role !== "voice" || context.message.type !== "settings") return;
      const nextMode = context.message.payload.outputMode;
      activeSession = context.session;
      sessionHub = context.hub;
      if (context.session.outputMode === nextMode) return;
      return enqueue(async () => {
        // Cancel speech and clear any armed/read-back state through GatePort while the old output
        // route is still active, then apply the new setting to this session.
        await dispatch({ type: "control", cmd: "stop" }, context);
        context.hub.setOutputMode(nextMode);
      });
    },
    "page.changed"(context) {
      if (context.role !== "extension" || context.message.type !== "page.changed") return;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        context.session.stale = true;
        const confirm = state.confirm;
        if (confirm !== null) {
          clearTimeout(expiryTimers.get(confirm.grantId));
          expiryTimers.delete(confirm.grantId);
          let clearedByGate = false;
          try {
            clearedByGate = (await options.gate.clear(confirm.grantId, "page-changed")) === true;
          } catch {
            // The reducer still clears its local confirmation state when the gate is unavailable.
          }
          if (!clearedByGate) context.hub.send("voice", "confirm.cleared", { grantId: confirm.grantId, reason: "page-changed" });
          await dispatch({ type: "confirm.cleared", grantId: confirm.grantId, reason: "page-changed" }, context, null);
        } else if (state.mode === "reading-back") {
          await dispatch({ type: "form.changed" }, context, null);
        }
        await refreshSnapshot(context.session, "user");
        options.onTurnComplete?.();
      });
    },
    ptt(context) {
      if (context.role !== "voice" || context.message.type !== "ptt" || context.message.payload.state !== "start") return;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        const confirm = state.confirm;
        if (confirm === null) return;
        clearTimeout(expiryTimers.get(confirm.grantId));
        expiryTimers.delete(confirm.grantId);
        let clearedByGate = false;
        try {
          clearedByGate = (await options.gate.clear(confirm.grantId, "cancelled")) === true;
        } catch {
          // Keep the UI fail-closed if the gate is unavailable.
        }
        if (!clearedByGate) context.hub.send("voice", "confirm.cleared", { grantId: confirm.grantId, reason: "cancelled" });
        await dispatch({ type: "confirm.cleared", grantId: confirm.grantId, reason: "cancelled" }, context);
      });
    },
    control(context) {
      if (context.role !== "voice" || context.message.type !== "control") return;
      const { cmd } = context.message.payload;
      const messageId = context.message.id;
      activeSession = context.session;
      sessionHub = context.hub;
      if (cmd !== "reconnect-browser") {
        return enqueue(async () => {
          await dispatch({ type: "control", cmd }, context);
        });
      }
      return enqueue(async () => {
        context.hub.send(
          "voice",
          "error",
          {
            code: "not-implemented",
            message: "the server has no handler for that command yet",
            fatal: false,
          },
          { replyTo: messageId },
        );
      });
    },
  };

  return handlers;
}
