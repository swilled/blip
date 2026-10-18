import { Intent } from "@blip/protocol";
import { z } from "zod";
import type { IntentBrain } from "../fake-brain";
import {
  PageTaskIntentSchema,
  serializePageTaskIntentPrompt,
  type PageTaskInferenceContext,
  type PageTaskIntent,
} from "../../browser/task-intent";
import {
  BrowserRequestIntentSchema,
  isValidBrowserRequestIntent,
  serializeBrowserRequestPrompt,
  type BrowserRequestIntent,
} from "../../browser/request-intent";
import {
  containsPageActionInstruction,
  serializePageContentProjectionForPrompt,
  type PageContentProjection,
} from "./content-projection";
import { containsSensitivePageText } from "./privacy";
import { log } from "../../log";
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
const PageDraftSchema = z.object({ prose: z.string().min(1).max(1000) }).strict();

export type RepairPatch = z.infer<typeof RepairPatchSchema>;

export type AgyOutputFailureCategory =
  | "invalid_json"
  | "intent_schema_rejected"
  | "intent_shape_rejected"
  | "repair_schema_rejected"
  | "content_schema_rejected"
  | "browser_task_schema_rejected"
  | "browser_request_schema_rejected"
  | "content_prose_rejected";

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
  allowGeneralKnowledge: true;
  parseIntent(prompt: string, signal?: AbortSignal): Promise<z.infer<typeof Intent>>;
  /** Classifies natural page requests without receiving page text or producing action arguments. */
  classifyPageTask(utterance: string, context: PageTaskInferenceContext, signal?: AbortSignal): Promise<PageTaskIntent>;
  /** Classifies unfamiliar browser phrasing; arguments are copied from the user's words and validated locally. */
  classifyBrowserRequest(utterance: string, signal?: AbortSignal): Promise<BrowserRequestIntent>;
  repairFormModel(prompt: string, signal?: AbortSignal): Promise<RepairPatch>;
  /** Returns bounded prose only; page content cannot become a browser command or authorization. */
  answerPageQuestion(projection: PageContentProjection, signal?: AbortSignal): Promise<string>;
  /** Returns bounded proposed prose only for an explicit draft or revision request. */
  draftPageText(projection: PageContentProjection, signal?: AbortSignal): Promise<string>;
  abortRole(role: AgyRole): Promise<void>;
  recreateRole(role: AgyRole): Promise<void>;
  close(): Promise<void>;
};

export type AgyProviderOptions = AgySessionOptions;

/** Keep deterministic browser control available while the model process starts or recovers. */
export function createDeferredAgyProvider(options: AgyProviderOptions = {}): AgyProvider {
  let current: AgyProvider | null = null;
  let pending: Promise<AgyProvider> | null = null;
  let startup: AbortController | null = null;
  let closed = false;
  function ready(): Promise<AgyProvider> {
    if (closed) return Promise.reject(new Error("Agy provider is closed."));
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    startup = new AbortController();
    const signal = options.startupSignal
      ? AbortSignal.any([startup.signal, options.startupSignal]) : startup.signal;
    pending = createAgyProvider({ ...options, startupSignal: signal })
      .then((provider) => { current = provider; return provider; })
      .finally(() => { pending = null; });
    void pending.catch(() => {
      if (!closed && !startup?.signal.aborted) log("warn", { msg: "model startup unavailable; browser controls remain ready", code: "model-startup" });
    });
    return pending;
  }
  async function get(signal?: AbortSignal): Promise<AgyProvider> {
    signal?.throwIfAborted();
    const provider = ready();
    if (!signal) return provider;
    let abort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason ?? new Error("Model request aborted."));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      const result = await Promise.race([provider, aborted]);
      signal.throwIfAborted();
      return result;
    } finally { signal.removeEventListener("abort", abort); }
  }
  void ready().catch(() => {});
  return {
    allowGeneralKnowledge: true,
    parseIntent: async (prompt, signal?: AbortSignal) => (await get(signal)).parseIntent(prompt, signal),
    classifyPageTask: async (text, context, signal) => (await get(signal)).classifyPageTask(text, context, signal),
    classifyBrowserRequest: async (text, signal) => (await get(signal)).classifyBrowserRequest(text, signal),
    repairFormModel: async (prompt, signal) => (await get(signal)).repairFormModel(prompt, signal),
    answerPageQuestion: async (projection, signal) => (await get(signal)).answerPageQuestion(projection, signal),
    draftPageText: async (projection, signal) => (await get(signal)).draftPageText(projection, signal),
    async abortRole(role) {
      if (current) return current.abortRole(role);
      startup?.abort();
      await pending?.catch(() => {});
    },
    async recreateRole(role) {
      if (current) return current.recreateRole(role);
      await ready();
    },
    async close() {
      closed = true;
      startup?.abort();
      await pending?.catch(() => {});
      await current?.close();
    },
  };
}

function parseJson(role: AgyRole, raw: string): unknown {
  try {
    const trimmed = raw.trim();
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed);
    return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
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
    allowGeneralKnowledge: true,
    async parseIntent(prompt, signal?: AbortSignal) {
      return parseIntentStrict(await sessions.call("intent", prompt, signal));
    },
    async classifyPageTask(utterance, context, signal) {
      const raw = await sessions.call("intent", serializePageTaskIntentPrompt(utterance, context), signal);
      const value = parseJson("intent", raw);
      const parsed = PageTaskIntentSchema.safeParse(value);
      if (!parsed.success) throw new InvalidAgyOutputError("intent", "browser_task_schema_rejected");
      return parsed.data.intent;
    },
    async classifyBrowserRequest(utterance, signal) {
      const raw = await sessions.call("intent", serializeBrowserRequestPrompt(utterance), signal);
      const value = parseJson("intent", raw);
      const parsed = BrowserRequestIntentSchema.safeParse(value);
      if (!parsed.success || !isValidBrowserRequestIntent(parsed.data)) {
        throw new InvalidAgyOutputError("intent", "browser_request_schema_rejected");
      }
      return parsed.data;
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
    async draftPageText(projection, signal) {
      if (projection.type !== "draft" && projection.type !== "revision") {
        throw new InvalidAgyOutputError("content", "content_schema_rejected");
      }
      const raw = await sessions.call("content", serializePageContentProjectionForPrompt(projection), signal);
      const parsed = PageDraftSchema.safeParse(parseJson("content", raw));
      if (!parsed.success) throw new InvalidAgyOutputError("content", "content_schema_rejected");
      const prose = parsed.data.prose;
      if (Array.from(prose).length > 1000 || containsSensitivePageText(prose) || containsPageActionInstruction(prose)) {
        throw new InvalidAgyOutputError("content", "content_prose_rejected");
      }
      return prose;
    },
    abortRole: (role) => sessions.abortRole(role),
    recreateRole: (role) => sessions.recreateRole(role),
    close: () => sessions.close(),
  };
}

export { UnexpectedAgyToolCallError };
