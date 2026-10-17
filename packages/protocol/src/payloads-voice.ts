import { z } from "zod";
import { ActionKind } from "./action-kind";

// Voice-to-server and server-to-voice payload schemas (plan 01-02). The `utterance` and `speak`
// payloads stay in messages.ts (plan 01-01). Default z.object everywhere (D-17), no .default().

/** D-16: the nine dialogue states the server reports to the voice UI. Closed enum. */
export const DialogueStateName = z.enum([
  "no-page",
  "ready",
  "describing",
  "awaiting-value",
  "reading-back",
  "awaiting-confirm",
  "executing",
  "awaiting-result",
  "reading-result",
]);
export type DialogueStateName = z.infer<typeof DialogueStateName>;

// ---- voice -> server -------------------------------------------------------------------------

/** Push-to-talk state from the voice UI. On `start` the server stops speech and cancels the brain turn. */
export const PttPayload = z.object({ state: z.enum(["start", "end"]) });
export type PttPayload = z.infer<typeof PttPayload>;

/** Required for read-back -> arm sequencing. */
export const SpeakDonePayload = z.object({
  speakId: z.string().min(1).max(64),
  interrupted: z.boolean(),
});
export type SpeakDonePayload = z.infer<typeof SpeakDonePayload>;

export const SettingsPayload = z.object({
  outputMode: z.enum(["agent-voice", "screen-reader", "both"]),
  rate: z.number().optional(),
  verbosity: z.enum(["short", "normal"]).optional(),
});
export type SettingsPayload = z.infer<typeof SettingsPayload>;

export const ControlPayload = z.object({
  cmd: z.enum(["stop", "repeat", "reconnect-browser"]),
});
export type ControlPayload = z.infer<typeof ControlPayload>;

// ---- server -> voice -------------------------------------------------------------------------

/** Non-verbal latency cue. */
export const EarconPayload = z.object({
  name: z.enum(["listening", "thinking", "done", "blocked", "error"]),
});
export type EarconPayload = z.infer<typeof EarconPayload>;

/** Informational only: the UI shows "Say: <phrase>". Arming and matching happen in server code. */
export const ConfirmArmedPayload = z.object({
  grantId: z.string().min(1).max(64),
  phrase: z.string().min(1),
  kind: ActionKind,
  actionLabel: z.string(),
  expiresAt: z.number(),
});
export type ConfirmArmedPayload = z.infer<typeof ConfirmArmedPayload>;

export const ConfirmClearedPayload = z.object({
  grantId: z.string().min(1).max(64),
  reason: z.enum(["executed", "cancelled", "expired", "page-changed", "value-changed"]),
});
export type ConfirmClearedPayload = z.infer<typeof ConfirmClearedPayload>;

/** Pushed on every change. `page` is null when no page is attached. */
export const StatePayload = z.object({
  dialogue: DialogueStateName,
  page: z
    .object({
      url: z.string(),
      title: z.string(),
      step: z.string().optional(),
      fieldCount: z.number().int(),
      requiredEmpty: z.number().int(), // counted with hasValue, never from a sensitive value
      untrustedInstructionDetected: z.boolean().optional(), // warning-only; does not grant action authority
    })
    .nullable(),
  focusFieldId: z.string().optional(),
  busy: z.boolean(),
  extensionConnected: z.boolean(),
  brain: z.enum(["claude", "fake"]),
});
export type StatePayload = z.infer<typeof StatePayload>;

/** Debug/demo panel: what the server heard and how it routed it. */
export const TranscriptPayload = z.object({
  utteranceId: z.string().min(1).max(64),
  heardAs: z.string(),
  routedTo: z.enum(["grammar", "model"]),
});
export type TranscriptPayload = z.infer<typeof TranscriptPayload>;
