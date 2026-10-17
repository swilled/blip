import { z } from "zod";
import { MAX_UTTERANCE_CHARS } from "./constants";
import { ErrorMsg, Envelope, Hello, Welcome, type Sender } from "./envelope";
import { newId } from "./ids";

// ---------------------------------------------------------------------------------------------
// Payload schemas owned by this file (the tracer set). Plan 01-02 adds the rest of the D-14 set.
// Default z.object everywhere: unknown keys are stripped, never rejected (D-17).
// No .default() in wire schemas: input and output types must agree (research Pitfall 9).
// ---------------------------------------------------------------------------------------------

const Utterance = z.object({
  utteranceId: z.string().min(1).max(64),
  text: z.string().min(1).max(MAX_UTTERANCE_CHARS),
  source: z.enum(["voice", "typed"]),
  sttConfidence: z.number().min(0).max(1).optional(),
  alternatives: z.array(z.string().max(MAX_UTTERANCE_CHARS)).max(3).optional(),
});

const SpeakCategory = z.enum(["answer", "filler", "readback", "confirm-prompt", "error", "result"]);

const Speak = z.object({
  speakId: z.string().min(1).max(64),
  text: z.string(),
  category: SpeakCategory,
  interrupt: z.boolean(),
  spell: z.boolean().optional(),
});

// ---------------------------------------------------------------------------------------------
// The registry: the single source of truth for the Message union, per-role senders/receivers
// (D-04), the hub router, and the PROTOCOL.md consistency test (D-18).
// ---------------------------------------------------------------------------------------------

type RegistryEntry = {
  readonly senders: readonly Sender[];
  readonly receivers: readonly Sender[];
  readonly payload: z.ZodType;
};

export const MESSAGES = {
  hello: { senders: ["extension", "voice"], receivers: ["server"], payload: Hello },
  welcome: { senders: ["server"], receivers: ["extension", "voice"], payload: Welcome },
  error: { senders: ["server"], receivers: ["extension", "voice"], payload: ErrorMsg },
  utterance: { senders: ["voice"], receivers: ["server"], payload: Utterance },
  speak: { senders: ["server"], receivers: ["voice"], payload: Speak },
} as const satisfies Record<string, RegistryEntry>;

export type MessageType = keyof typeof MESSAGES;
export type PayloadOf<T extends MessageType> = z.infer<(typeof MESSAGES)[T]["payload"]>;

/** Builds the zod object for one typed envelope. */
function frame<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    v: z.literal(1),
    id: z.string().min(1).max(64),
    type: z.literal(type),
    replyTo: z.string().optional(),
    ts: z.number(),
    payload,
  });
}

// Explicit member list (zod's tuple typing resists Object.entries). The parity test in
// test/registry.test.ts fails if this list and MESSAGES drift apart.
export const Message = z.discriminatedUnion("type", [
  frame("hello", MESSAGES.hello.payload),
  frame("welcome", MESSAGES.welcome.payload),
  frame("error", MESSAGES.error.payload),
  frame("utterance", MESSAGES.utterance.payload),
  frame("speak", MESSAGES.speak.payload),
]);
export type Message = z.infer<typeof Message>;

export function isMessageType(type: string): type is MessageType {
  return Object.hasOwn(MESSAGES, type);
}

/** Can a connection acting as `sender` put a frame of this type on the wire? */
export function canSend(sender: Sender, type: MessageType): boolean {
  return (MESSAGES[type].senders as readonly Sender[]).includes(sender);
}

/** Is `receiver` a legitimate recipient of this type? */
export function canReceive(receiver: Sender, type: MessageType): boolean {
  return (MESSAGES[type].receivers as readonly Sender[]).includes(receiver);
}

// ---------------------------------------------------------------------------------------------
// parseFrame: two-stage, never throws, never echoes the offending input value.
// ---------------------------------------------------------------------------------------------

export type ParseFailureCode = "bad-json" | "bad-envelope" | "unknown-type" | "invalid-payload";

export type ParseResult =
  | { ok: true; message: Message; bytes: number }
  | {
      ok: false;
      code: ParseFailureCode;
      message: string;
      id?: string;
      type?: string;
      issues?: { path: string; message: string }[];
      bytes: number;
    };

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

export function parseFrame(raw: string | Uint8Array): ParseResult {
  let text: string;
  let bytes: number;
  try {
    if (typeof raw === "string") {
      text = raw;
      bytes = encoder.encode(raw).length;
    } else {
      bytes = raw.length;
      text = strictDecoder.decode(raw);
    }
  } catch {
    return { ok: false, code: "bad-json", message: "frame is not valid UTF-8", bytes: raw.length };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "bad-json", message: "frame is not valid JSON", bytes };
  }

  // Stage 1: loose envelope.
  const env = Envelope.safeParse(json);
  if (!env.success) {
    const rawId = (json as { id?: unknown } | null)?.id;
    const id = typeof rawId === "string" && rawId.length > 0 ? rawId.slice(0, 64) : undefined;
    return {
      ok: false,
      code: "bad-envelope",
      message: "frame is not a valid envelope",
      ...(id !== undefined ? { id } : {}),
      issues: toIssues(env.error),
      bytes,
    };
  }

  const { id, type } = env.data;
  if (!isMessageType(type)) {
    return { ok: false, code: "unknown-type", message: "unknown message type", id, type, bytes };
  }

  // Stage 2: full message (envelope + per-type payload).
  const full = Message.safeParse(env.data);
  if (!full.success) {
    return {
      ok: false,
      code: "invalid-payload",
      message: "payload does not match the schema for this type",
      id,
      type,
      issues: toIssues(full.error),
      bytes,
    };
  }
  return { ok: true, message: full.data, bytes };
}

/** Path and message only. zod 4 issues never echo the input value; we do not add it either. */
function toIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

// ---------------------------------------------------------------------------------------------
// Frame builders
// ---------------------------------------------------------------------------------------------

export type BuildOpts = { id?: string; replyTo?: string; ts?: number };

export type BuiltFrame<T extends string = string, P = unknown> = {
  v: 1;
  id: string;
  type: T;
  replyTo?: string;
  ts: number;
  payload: P;
};

/** Validated frame. Throws on an invalid payload: that is a bug in our own sender. */
export function buildFrame<T extends MessageType>(
  type: T,
  payload: PayloadOf<T>,
  opts: BuildOpts = {},
): BuiltFrame<T, PayloadOf<T>> {
  const parsed = MESSAGES[type].payload.parse(payload) as PayloadOf<T>;
  return buildRawFrame(type, parsed, opts) as BuiltFrame<T, PayloadOf<T>>;
}

/** Unvalidated frame, for attack tooling (REPL /raw) and negative tests. */
export function buildRawFrame(type: string, payload: unknown, opts: BuildOpts = {}): BuiltFrame {
  return {
    v: 1,
    id: opts.id ?? newId(),
    type,
    ...(opts.replyTo !== undefined ? { replyTo: opts.replyTo } : {}),
    ts: opts.ts ?? Date.now(),
    payload,
  };
}
