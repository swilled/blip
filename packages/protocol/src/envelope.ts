import { z } from "zod";

export const Role = z.enum(["extension", "voice"]);
export type Role = z.infer<typeof Role>;

/** Who can put a frame on the wire. The server is a sender too (welcome, speak, state, ...). */
export type Sender = Role | "server";

/**
 * Loose envelope (stage 1 of the two-stage parse). The payload is validated per type in stage 2.
 * Default (non-strict) object: unknown keys are stripped so an additive field never breaks a peer (D-17).
 */
export const Envelope = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  type: z.string(),
  replyTo: z.string().optional(),
  ts: z.number(),
  payload: z.unknown(),
});
export type Envelope = z.infer<typeof Envelope>;

// client -> server (first frame, required within HELLO_TIMEOUT_MS)
export const Hello = z.object({
  role: Role,
  clientVersion: z.string(),
  protocolVersion: z.literal(1),
});
export type Hello = z.infer<typeof Hello>;

// server -> client
export const Welcome = z.object({
  sessionId: z.string(),
  serverVersion: z.string(),
  brain: z.enum(["agy", "fake"]),
});
export type Welcome = z.infer<typeof Welcome>;

export const ErrorMsg = z.object({
  code: z.string(),
  message: z.string(),
  fatal: z.boolean(),
});
export type ErrorMsg = z.infer<typeof ErrorMsg>;
