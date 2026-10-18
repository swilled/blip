import { Intent } from "@blip/protocol";
import { z } from "zod";
import type { IntentBrain } from "../fake-brain";
import { serializePageContentProjectionForPrompt, type PageContentProjection } from "./content-projection";
import {
  AgyRoleSessionManager,
  UnexpectedAgyToolCallError,
  type AgyRole,
  type AgySessionOptions,
} from "./session";

const RepairPatchSchema = z.object({
  title: z.string().max(300).optional(),
  fields: z.array(z.object({
    id: z.string().min(1).max(200),
    label: z.string().max(120).optional(),
    group: z.string().max(120).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }).strict()).max(250),
}).strict();

const PageAnswerSchema = z.object({ prose: z.string().min(1).max(1000) }).strict();

export type RepairPatch = z.infer<typeof RepairPatchSchema>;

export type AgyOutputFailureCategory =
  | "invalid_json"
  | "intent_schema_rejected"
  | "intent_shape_rejected"
  | "repair_schema_rejected"
  | "content_schema_rejected";

export class InvalidAgyOutputError extends Error {
  readonly role: AgyRole;
  readonly category: AgyOutputFailureCategory;

  constructor(role: AgyRole, category: AgyOutputFailureCategory) {
    super("Agy output was rejected by local validation.");
    this.name = "InvalidAgyOutputError";
    this.role = role;
    this.category = category;
  }
}

/**
 * Process-level model boundary. Prompts are built upstream from privacy-approved, sanitized input;
 * this API accepts no CLI/process handle and returns only existing protocol Intent data or a descriptive patch.
 */
export type AgyProvider = IntentBrain & {
  parseIntent(prompt: string, signal?: AbortSignal): Promise<z.infer<typeof Intent>>;
  repairFormModel(prompt: string, signal?: AbortSignal): Promise<RepairPatch>;
  /** Returns bounded prose only; page content cannot become a browser command or authorization. */
  answerPageQuestion(projection: PageContentProjection, signal?: AbortSignal): Promise<string>;
  abortRole(role: AgyRole): Promise<void>;
  recreateRole(role: AgyRole): Promise<void>;
  close(): Promise<void>;
};

export type AgyProviderOptions = AgySessionOptions;

function parseJson(role: AgyRole, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidAgyOutputError(role, "invalid_json");
  }
}

function parseIntentStrict(raw: string): z.infer<typeof Intent> {
  const value = parseJson("intent", raw);
  const parsed = Intent.safeParse(value);
  if (!parsed.success) {
    throw new InvalidAgyOutputError("intent", "intent_schema_rejected");
  }

  const allowedKeys: Record<z.infer<typeof Intent>["type"], string[]> = {
    describe: ["type"],
    read_form: ["type"],
    whats_required: ["type"],
    what_went_wrong: ["type"],
    read_back: ["type"],
    fill_profile: ["type"],
    go_to_field: ["type", "fieldId"],
    set_fields: ["type", "fills"],
    spell: ["type", "fieldId"],
    undo: ["type"],
    stop: ["type"],
    request_action: ["type", "actionId"],
    click_safe: ["type", "actionId"],
    answer: ["type", "text"],
    clarify: ["type", "question"],
    unknown: ["type"],
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidAgyOutputError("intent", "intent_shape_rejected");
  }
  const object = value as Record<string, unknown>;
  const allowed = allowedKeys[parsed.data.type];
  if (Object.keys(object).some((key) => !allowed.includes(key))) {
    throw new InvalidAgyOutputError("intent", "intent_shape_rejected");
  }
  if (parsed.data.type === "set_fields") {
    const fills = object.fills;
    if (!Array.isArray(fills) || fills.some((fill) =>
      typeof fill !== "object" || fill === null || Array.isArray(fill) ||
      Object.keys(fill).some((key) => key !== "fieldId" && key !== "value"),
    )) {
      throw new InvalidAgyOutputError("intent", "intent_shape_rejected");
    }
  }
  return parsed.data;
}

export async function createAgyProvider(options: AgyProviderOptions = {}): Promise<AgyProvider> {
  const sessions = new AgyRoleSessionManager(options);
  await sessions.start();

  return {
    async parseIntent(prompt, signal?: AbortSignal) {
      return parseIntentStrict(await sessions.call("intent", prompt, signal));
    },
    async repairFormModel(prompt, signal) {
      const parsed = RepairPatchSchema.safeParse(parseJson("repair", await sessions.call("repair", prompt, signal)));
      if (!parsed.success) throw new InvalidAgyOutputError("repair", "repair_schema_rejected");
      return parsed.data;
    },
    async answerPageQuestion(projection, signal) {
      const raw = await sessions.call("content", serializePageContentProjectionForPrompt(projection), signal);
      const parsed = PageAnswerSchema.safeParse(parseJson("content", raw));
      if (!parsed.success) throw new InvalidAgyOutputError("content", "content_schema_rejected");
      return parsed.data.prose;
    },
    abortRole: (role) => sessions.abortRole(role),
    recreateRole: (role) => sessions.recreateRole(role),
    close: () => sessions.close(),
  };
}

export { UnexpectedAgyToolCallError };
