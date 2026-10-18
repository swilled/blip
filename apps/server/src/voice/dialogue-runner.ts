import { dialogueStateName, initialState, reduce } from "@blip/dialogue";
import {
  newId,
  type ActionTarget,
  type Field,
  type ActRequest,
  type FormModel,
} from "@blip/protocol";
import { type HandlerContext, type Handlers, type Hub } from "../hub/hub";
import type { Session } from "../session/session";
import type { DialogueEvent, DialogueState, Effect, SpeakEffect } from "@blip/dialogue";
import { isOverlongSensitiveUtterance } from "@blip/dialogue";
import type { GatePort } from "./gate-port";
import profileTemplate from "../../../../fixtures/demo/profile.template.json" with { type: "json" };

type RunnerOptions = {
  gate: GatePort;
  now?: () => number;
  snapshotTimeoutMs?: number;
  actTimeoutMs?: number;
  onActRequest?: (request: ActRequest) => void;
  parseIntent?: (input: ParseIntentInput) => Promise<void>;
};

type ParseIntentInput = {
  utterance: string;
  form: {
    title: string;
    step?: string;
    fields: Array<Pick<Field, "id" | "type" | "label" | "required" | "autocomplete" | "hasValue" | "sensitive" | "disabled" | "order">>;
    actions: Array<Pick<ActionTarget, "id" | "label" | "kind" | "primary">>;
  } | null;
};

type ActEffect = Extract<Effect, { kind: "fill" | "select" | "focus" }>;

/** Send a reducer-owned speech effect. Speech ids must already be tracked by DialogueState. */
export function sendSpeakEffect(hub: Hub, effect: SpeakEffect): void {
  if (typeof effect.speakId !== "string" || effect.speakId.trim() === "") {
    throw new Error("speak effect requires a tracked speakId");
  }

  hub.send("voice", "speak", {
    speakId: effect.speakId,
    text: effect.text,
    category: effect.category,
    interrupt: false,
  });
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
  ): Promise<void> {
    const session = context?.session ?? activeSession!;
    const form = formOverride !== undefined ? formOverride : currentForm(session);
    const currentFieldId = state.currentFieldId;
    const overlongSensitiveUtterance = event.type === "utterance"
      && isOverlongSensitiveUtterance(event.utterance.text, form, currentFieldId);
    const injectionDetected = form !== null && session.page?.untrustedInstructionDetected === true;
    const result = reduce(state, event, {
      form,
      now: now(),
      profile: profileTemplate,
      untrustedInstructionDetected: injectionDetected,
      ...(injectionDetected
        ? { pageInjectionKey: `${lastSnapshotTabId ?? "unknown"}:${form.snapshotVersion}` }
        : {}),
    });
    state = result.state;
    const hub = context?.hub ?? sessionHub;

    try {
      if (event.type === "utterance") {
        const routedTo = result.effects.some((effect) => effect.kind === "parseIntent") ? "model" : "grammar";
        const sensitiveHandoff = overlongSensitiveUtterance || result.effects.some((effect) => effect.kind === "focus"
          && form?.fields.some((field) => field.id === effect.fieldId && field.sensitive !== "none"));
        hub.send("voice", "transcript", {
          utteranceId: event.utterance.utteranceId,
          heardAs: sensitiveHandoff ? "[sensitive entry withheld]" : event.utterance.text,
          routedTo,
        });
      }
      for (const effect of result.effects) await runEffect(effect, session, hub, context);
    } finally {
      session.dialogue = dialogueStateName(state.mode);
      session.focusFieldId = state.currentFieldId ?? undefined;
      session.busy = false;
      hub.pushState();
    }
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
      case "speak":
        sendSpeakEffect(hub, effect);
        if (effect.category !== "filler") session.lastSpoken = effect.text;
        return;
      case "earcon":
        hub.send("voice", "earcon", { name: effect.name });
        return;
      case "cancelSpeech":
        if (typeof effect.speakId !== "string" || effect.speakId.trim() === "") {
          throw new Error("cancelSpeech effect requires a tracked speakId");
        }
        hub.send("voice", "speak", {
          speakId: effect.speakId,
          text: "Stopped.",
          category: "answer",
          interrupt: true,
        });
        return;
      case "parseIntent":
        if (options.parseIntent && context) {
          const observed = currentForm(session);
          await options.parseIntent({
            utterance: effect.text,
            form: observed === null ? null : {
              title: observed.title,
              ...(observed.step === undefined ? {} : { step: observed.step }),
              fields: observed.fields.map(({ id, type, label, required, autocomplete, hasValue, sensitive, disabled, order }) => ({
                id, type, label, required, ...(autocomplete === undefined ? {} : { autocomplete }), hasValue, sensitive, disabled, order,
              })),
              actions: observed.actions.map(({ id, label, kind, primary }) => ({ id, label, kind, primary })),
            },
          });
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
          phrase: armed.phrase,
          kind: effect.actionKind,
          actionLabel,
          expiresAt: armed.expiresAt,
        });
        await dispatch({
          type: "confirm.armed",
          grantId: armed.grantId,
          phrase: armed.phrase,
          expiresAt: armed.expiresAt,
        });

        const delayMs = Math.max(0, armed.expiresAt - now());
        const timer = setTimeout(() => {
          void enqueue(async () => {
            if (state.confirm?.grantId !== armed.grantId) return;
            expiryTimers.delete(armed.grantId);
            try {
              await options.gate.clear(armed.grantId, "expired");
            } finally {
              hub.send("voice", "confirm.cleared", { grantId: armed.grantId, reason: "expired" });
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
        try {
          await options.gate.clear(effect.grantId, effect.reason);
        } catch {
          // Clearing an in-memory voice stub is best effort; the UI still needs the clear frame.
        }
        hub.send("voice", "confirm.cleared", { grantId: effect.grantId, reason: effect.reason });
        return;
      case "redeem": {
        clearTimeout(expiryTimers.get(effect.grantId));
        expiryTimers.delete(effect.grantId);
        let outcome: { ok: boolean; reason?: string };
        try {
          outcome = await options.gate.redeem(effect.grantId);
        } catch {
          outcome = { ok: false, reason: "gate-error" };
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
        await dispatch({ type: "utterance", utterance }, context);
      });
    },
    "speak.done"(context) {
      if (context.role !== "voice" || context.message.type !== "speak.done") return;
      const done = context.message.payload;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(() => dispatch({ type: "speak.done", done }, context));
    },
    "page.changed"(context) {
      if (context.role !== "extension" || context.message.type !== "page.changed") return;
      activeSession = context.session;
      sessionHub = context.hub;
      return enqueue(async () => {
        context.session.stale = true;
        if (state.mode === "awaiting-confirm" && state.confirm !== null) {
          const grantId = state.confirm.grantId;
          clearTimeout(expiryTimers.get(grantId));
          expiryTimers.delete(grantId);
          try {
            await options.gate.clear(grantId, "page-changed");
          } catch {
            // The confirm banner still has to clear when the voice-side gate is unavailable.
          }
          context.hub.send("voice", "confirm.cleared", { grantId, reason: "page-changed" });
          await dispatch({ type: "confirm.cleared", grantId, reason: "page-changed" }, context);
        }
        // Re-snapshot on a page change so the warning-only GATE-07 bit can be spoken before
        // the next page response. Snapshot text remains data and never enters gate matching.
        await refreshSnapshot(context.session, "user");
        await dispatch({ type: "form.changed" }, context);
      });
    },
    control(context) {
      if (context.role !== "voice" || context.message.type !== "control") return;
      const { cmd } = context.message.payload;
      const messageId = context.message.id;
      activeSession = context.session;
      sessionHub = context.hub;
      if (cmd !== "reconnect-browser") {
        return enqueue(() =>
          dispatch({ type: "control", cmd }, context),
        );
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
