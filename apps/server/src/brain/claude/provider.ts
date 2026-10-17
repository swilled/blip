import { Intent } from "@blip/protocol";
import { z } from "zod";
import type { IntentBrain } from "../fake-brain";
import {
  ClaudeRoleSessionManager,
  UnexpectedClaudeToolsError,
  type ClaudeRole,
  type ClaudeSessionOptions,
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

export type RepairPatch = z.infer<typeof RepairPatchSchema>;

export class InvalidClaudeOutputError extends Error {
  constructor(role: ClaudeRole, reason: string) {
    super(`Claude ${role} output was not valid JSON data: ${reason}`);
    this.name = "InvalidClaudeOutputError";
  }
}

/**
 * Process-level model boundary. Prompts are built upstream from privacy-approved, sanitized input;
 * this API accepts no SDK handle and returns only existing protocol Intent data or a descriptive patch.
 */
export type ClaudeProvider = IntentBrain & {
  parseIntent(prompt: string, signal?: AbortSignal): Promise<z.infer<typeof Intent>>;
  repairFormModel(prompt: string, signal?: AbortSignal): Promise<RepairPatch>;
  abortRole(role: ClaudeRole): Promise<void>;
  recreateRole(role: ClaudeRole): Promise<void>;
  close(): Promise<void>;
};

export type ClaudeProviderOptions = ClaudeSessionOptions;

function parseJson(role: ClaudeRole, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidClaudeOutputError(role, "the response was not a JSON value");
  }
}

function parseIntentStrict(raw: string): z.infer<typeof Intent> {
  const value = parseJson("intent", raw);
  const parsed = Intent.safeParse(value);
  if (!parsed.success) {
    throw new InvalidClaudeOutputError("intent", "the response did not match the Intent schema");
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
    throw new InvalidClaudeOutputError("intent", "the response must be an object");
  }
  const object = value as Record<string, unknown>;
  const allowed = allowedKeys[parsed.data.type];
  if (Object.keys(object).some((key) => !allowed.includes(key))) {
    throw new InvalidClaudeOutputError("intent", "the response contained unsupported fields");
  }
  if (parsed.data.type === "set_fields") {
    const fills = object.fills;
    if (!Array.isArray(fills) || fills.some((fill) =>
      typeof fill !== "object" || fill === null || Array.isArray(fill) ||
      Object.keys(fill).some((key) => key !== "fieldId" && key !== "value"),
    )) {
      throw new InvalidClaudeOutputError("intent", "set_fields contained unsupported fields");
    }
  }
  return parsed.data;
}

export async function createClaudeProvider(options: ClaudeProviderOptions = {}): Promise<ClaudeProvider> {
  const sessions = new ClaudeRoleSessionManager(options);
  await sessions.start();

  return {
    async parseIntent(prompt, signal?: AbortSignal) {
      return parseIntentStrict(await sessions.call("intent", prompt, signal));
    },
    async repairFormModel(prompt, signal) {
      const parsed = RepairPatchSchema.safeParse(parseJson("repair", await sessions.call("repair", prompt, signal)));
      if (!parsed.success) throw new InvalidClaudeOutputError("repair", "the response did not match the repair patch schema");
      return parsed.data;
    },
    abortRole: (role) => sessions.abortRole(role),
    recreateRole: (role) => sessions.recreateRole(role),
    close: () => sessions.close(),
  };
}

export { UnexpectedClaudeToolsError };
