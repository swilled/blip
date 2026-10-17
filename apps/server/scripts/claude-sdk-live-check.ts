import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Intent, type FormModel, type Intent as IntentData, type Snapshot } from "@blip/protocol";
import { routeIntent } from "../src/brain/claude/intent-router";
import { RepairCache } from "../src/brain/claude/repair-cache";
import { validateRepairPatch } from "../src/brain/claude/repair-schema";
import { UnexpectedClaudeToolsError, type ClaudeRole } from "../src/brain/claude/session";

export const LIVE_CHECK_MAX_SECONDS = 900;
export const LIVE_CHECK_PROMPT_LIMITS = { intent: 4, repair: 1, total: 5 } as const;
export const LIVE_CHECK_APPROVAL_LINE = "phase04FollowupApproval: approve-04-08-live-check";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(
  SCRIPT_DIR,
  "../../../.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-08-LIVE-CHECK.md",
);

export type LiveCheckArguments = { live: boolean; maxSeconds: number };

export type LiveCheckProvider = {
  parseIntent(prompt: string, signal?: AbortSignal): Promise<unknown>;
  repairFormModel(prompt: string, signal?: AbortSignal): Promise<unknown>;
  abortRole(role: ClaudeRole): Promise<void>;
  recreateRole(role: ClaudeRole): Promise<void>;
  close(): Promise<void>;
};

export type GuardedLiveCheckProvider = LiveCheckProvider;

export type LiveCheckStage =
  | "not_started"
  | "initialization"
  | "verification"
  | "intent_probe_1"
  | "intent_probe_2"
  | "cancellation"
  | "recreation"
  | "recovery"
  | "repair"
  | "complete";

export type LiveCheckProbeEvidence = {
  stage: LiveCheckStage;
  intentLatenciesMs: number[];
  intentAccepted: boolean[];
  intentSchemaValid: boolean[];
  currentSyntheticIdMatched: boolean[];
  cancellationVerified: boolean | null;
  recreatedIntentToolCount: number | null;
  repairSchemaValid: boolean | null;
  repairCacheReloaded: boolean | null;
};

export type LiveCheckResult = LiveCheckProbeEvidence & {
  status: "offline" | "completed" | "externally_blocked" | "timeout" | "failed";
  elapsedMs: number;
  promptCounts: { intent: number; repair: number; total: number };
  rejectingRole: ClaudeRole | null;
  toolCount: number | null;
  invalidToolList: boolean;
  subsequentPromptsAfterBlock: 0;
};

export type LiveCheckDependencies = {
  /** Read only the plan-specific report; this callback is not called in offline mode. */
  readReport(): Promise<string>;
  /** The production implementation dynamically imports the SDK only after approval passes. */
  createProvider(signal: AbortSignal): Promise<LiveCheckProvider>;
  /** Injected so offline tests can prove gates without sending any provider prompt. */
  verify(
    provider: GuardedLiveCheckProvider,
    signal: AbortSignal,
    evidence: LiveCheckProbeEvidence,
  ): Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

export type ApprovedProbeOptions = {
  /** A caller-owned temporary directory. The sequence never uses the application's persistent cache. */
  cacheDirectory: string;
  cancellationDelayMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

const SYNTHETIC_URL = "https://synthetic.example/form/contact";
const SYNTHETIC_ORIGIN = "https://synthetic.example";
const SYNTHETIC_STRUCTURE = "synthetic-structure-v1";
const SYNTHETIC_FIELD_ID = "synthetic-field";
const SYNTHETIC_ACTION_ID = "synthetic-action";

function makeSyntheticPage(): {
  snapshot: Snapshot;
  model: FormModel;
  isCurrent(): boolean;
  getCurrentModel(): FormModel;
} {
  const snapshot: Snapshot = {
    snapshotId: "synthetic-snapshot",
    version: 1,
    tabId: 9001,
    url: SYNTHETIC_URL,
    origin: SYNTHETIC_ORIGIN,
    title: "Synthetic contact form",
    headings: [{ level: 1, text: "Synthetic contact form" }],
    alerts: [],
    elements: [
      {
        id: SYNTHETIC_FIELD_ID,
        frameId: 0,
        category: "field",
        tag: "input",
        inputType: "email",
        role: "textbox",
        labelCandidates: [{ text: "Work email", source: "placeholder", confidence: 0.65 }],
        name: "workEmail",
        required: false,
        requiredSource: "none",
        invalid: false,
        errorText: null,
        value: null,
        hasValue: false,
        sensitive: "none",
        disabled: false,
        visible: true,
        order: 0,
      },
      {
        id: SYNTHETIC_ACTION_ID,
        frameId: 0,
        category: "action",
        tag: "button",
        role: "button",
        labelCandidates: [{ text: "Continue", source: "aria", confidence: 1 }],
        required: false,
        requiredSource: "none",
        invalid: false,
        errorText: null,
        value: null,
        hasValue: false,
        sensitive: "none",
        disabled: false,
        visible: true,
        order: 1,
        text: "Continue",
        buttonType: "button",
        inForm: true,
        kind: "click-safe",
        kindReasons: ["synthetic action"],
      },
    ],
    truncated: false,
    structuralHash: SYNTHETIC_STRUCTURE,
    capturedAt: 1,
  };
  const model: FormModel = {
    snapshotVersion: 1,
    structuralHash: SYNTHETIC_STRUCTURE,
    url: SYNTHETIC_URL,
    title: "Synthetic contact form",
    fields: [{
      id: SYNTHETIC_FIELD_ID,
      role: "textbox",
      type: "email",
      label: "Work email",
      labelSource: "placeholder",
      confidence: 0.65,
      required: false,
      autocomplete: "email",
      value: null,
      hasValue: false,
      sensitive: "none",
      error: null,
      disabled: false,
      order: 0,
    }],
    actions: [{
      id: SYNTHETIC_ACTION_ID,
      label: "Continue",
      kind: "click-safe",
      kindReasons: ["synthetic action"],
      primary: false,
    }],
    groups: [],
    pageErrors: [],
    repairStatus: "baseline",
  };
  return { snapshot, model, isCurrent: () => true, getCurrentModel: () => model };
}

export function createLiveCheckProbeEvidence(): LiveCheckProbeEvidence {
  return {
    stage: "not_started",
    intentLatenciesMs: [],
    intentAccepted: [],
    intentSchemaValid: [],
    currentSyntheticIdMatched: [],
    cancellationVerified: null,
    recreatedIntentToolCount: null,
    repairSchemaValid: null,
    repairCacheReloaded: null,
  };
}

function safeToolDiagnostic(error: unknown): Pick<LiveCheckResult, "rejectingRole" | "toolCount" | "invalidToolList"> | null {
  if (!(error instanceof UnexpectedClaudeToolsError)) return null;
  return {
    rejectingRole: error.role === "intent" || error.role === "repair" ? error.role : null,
    toolCount: typeof error.toolCount === "number" && Number.isSafeInteger(error.toolCount) && error.toolCount >= 0
      ? error.toolCount
      : null,
    invalidToolList: error.invalidToolList === true,
  };
}

function mergeSignals(primary: AbortSignal, optional?: AbortSignal): AbortSignal {
  return optional === undefined ? primary : AbortSignal.any([primary, optional]);
}

function assertProbeActive(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Live check aborted.");
}

function currentIdMatches(intent: ReturnType<typeof Intent.parse>, model: FormModel): boolean {
  switch (intent.type) {
    case "go_to_field":
    case "spell":
      return model.fields.some((field) => field.id === intent.fieldId);
    case "set_fields":
      return intent.fills.length > 0 && intent.fills.every((fill) => model.fields.some((field) => field.id === fill.fieldId));
    case "request_action":
    case "click_safe":
      return model.actions.some((action) => action.id === intent.actionId);
    default:
      return true;
  }
}

/** Run only synthetic probes against an already initialized, tool-checked provider. */
export async function runApprovedProbeSequence(
  provider: GuardedLiveCheckProvider,
  signal: AbortSignal,
  evidence: LiveCheckProbeEvidence,
  options: ApprovedProbeOptions,
): Promise<void> {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const page = makeSyntheticPage();

  const routeOnce = async (utterance: string, stage: LiveCheckStage, measureLatency: boolean): Promise<void> => {
    assertProbeActive(signal);
    evidence.stage = stage;
    const dispatchIndex = { count: 0 };
    const routedProvider = {
      parseIntent(prompt: string, routeSignal?: AbortSignal) {
        if (dispatchIndex.count !== 0) throw new Error("One-dispatch route limit reached.");
        dispatchIndex.count += 1;
        return provider.parseIntent(prompt, routeSignal) as Promise<IntentData>;
      },
    };
    const evidenceIndex = evidence.intentAccepted.length;
    evidence.intentAccepted.push(false);
    evidence.intentSchemaValid.push(false);
    evidence.currentSyntheticIdMatched.push(false);
    const startedAt = now();
    try {
      const routed = await routeIntent(utterance, page, routedProvider, signal);
      if (routed.kind !== "intent") throw new Error("Synthetic route was not resolved by the provider.");
      const parsed = Intent.safeParse(routed.intent);
      evidence.intentSchemaValid[evidenceIndex] = parsed.success;
      if (!parsed.success) throw new Error("Synthetic route did not pass the Intent schema.");
      const currentModel = page.getCurrentModel();
      const matchesCurrentId = currentIdMatches(parsed.data, currentModel);
      evidence.currentSyntheticIdMatched[evidenceIndex] = matchesCurrentId;
      if (!matchesCurrentId) throw new Error("Synthetic route referenced no current id.");
      evidence.intentAccepted[evidenceIndex] = true;
    } finally {
      if (measureLatency) evidence.intentLatenciesMs.push(Math.max(0, Math.round(now() - startedAt)));
    }
  };

  await routeOnce("A copper cloud drifts beyond a silent mountain.", "intent_probe_1", true);
  await routeOnce("The northern lantern hums beside the quiet river.", "intent_probe_2", true);

  assertProbeActive(signal);
  evidence.stage = "cancellation";
  const cancellationController = new AbortController();
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
  const cancellationPending = provider.parseIntent("Synthetic cancellation probe.", cancellationController.signal)
    .then(() => "resolved" as const, () => "rejected" as const);
  const abortDelay = new Promise<"elapsed">((resolveDelay) => {
    cancellationTimer = setTimer(() => resolveDelay("elapsed"), options.cancellationDelayMs ?? 500);
    cancellationTimer.unref?.();
  });
  const cancellationRace = await Promise.race([
    cancellationPending.then((outcome) => ({ kind: "settled" as const, outcome })),
    abortDelay.then(() => ({ kind: "elapsed" as const })),
  ]);
  if (cancellationTimer !== undefined) clearTimer(cancellationTimer);

  if (cancellationRace.kind === "settled") {
    evidence.cancellationVerified = false;
  } else {
    assertProbeActive(signal);
    cancellationController.abort(new Error("Synthetic cancellation requested."));
    await provider.abortRole("intent");
    const cancellationOutcome = await cancellationPending;
    evidence.cancellationVerified = cancellationOutcome === "rejected" && cancellationController.signal.aborted;
    if (evidence.cancellationVerified) {
      assertProbeActive(signal);
      evidence.stage = "recreation";
      await provider.recreateRole("intent");
      evidence.recreatedIntentToolCount = 0;
      assertProbeActive(signal);
      await routeOnce("The blue lantern is beside the quiet river.", "recovery", false);
    }
  }

  assertProbeActive(signal);
  evidence.stage = "repair";
  const captured = page.model;
  const current = page.getCurrentModel();
  const repairOutput = await provider.repairFormModel("Apply synthetic descriptive label suggestions only.", signal);
  const validatedPatch = validateRepairPatch(repairOutput, captured, current);
  evidence.repairSchemaValid = validatedPatch !== null;
  if (validatedPatch === null) {
    evidence.repairCacheReloaded = false;
    throw new Error("Synthetic repair patch was rejected.");
  }

  const cache = new RepairCache({ directory: options.cacheDirectory, now: () => Math.max(0, Math.floor(now())) });
  if (!cache.save(current.url, current.structuralHash, validatedPatch)) {
    evidence.repairCacheReloaded = false;
    throw new Error("Synthetic repair patch was not cached.");
  }
  const reloaded = cache.load(current.url, current.structuralHash);
  evidence.repairCacheReloaded = reloaded !== null &&
    JSON.stringify(reloaded) === JSON.stringify(validatedPatch) &&
    validateRepairPatch(reloaded, captured, current) !== null;
  if (!evidence.repairCacheReloaded) throw new Error("Synthetic repair cache round trip failed.");
  evidence.stage = "complete";
}

export function parseLiveCheckArguments(args: string[]): LiveCheckArguments {
  let live = false;
  let offline = false;
  let maxSeconds = LIVE_CHECK_MAX_SECONDS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--live") {
      live = true;
    } else if (arg === "--offline") {
      offline = true;
    } else if (arg === "--max-seconds") {
      const raw = args[index + 1];
      if (raw === undefined || !/^\d+$/.test(raw)) {
        throw new Error("--max-seconds requires an integer from 1 to 900.");
      }
      maxSeconds = Number(raw);
      index += 1;
    } else {
      throw new Error("Unsupported live-check argument.");
    }
  }
  if (live && offline) throw new Error("--offline cannot be combined with --live.");
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > LIVE_CHECK_MAX_SECONDS) {
    throw new Error("Live-check duration must be between 1 and 900 seconds.");
  }
  return { live, maxSeconds };
}

function safeEvidence(evidence: LiveCheckProbeEvidence): LiveCheckProbeEvidence {
  const allowedStages: LiveCheckStage[] = [
    "not_started", "initialization", "verification", "intent_probe_1", "intent_probe_2",
    "cancellation", "recreation", "recovery", "repair", "complete",
  ];
  const boolArray = (values: unknown): boolean[] => Array.isArray(values)
    ? values.filter((value): value is boolean => typeof value === "boolean")
    : [];
  const numericArray = (values: unknown): number[] => Array.isArray(values)
    ? values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.max(0, Math.round(value)))
    : [];
  const nullableBoolean = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
  const nullableCount = (value: unknown): number | null => Number.isSafeInteger(value) && typeof value === "number" && value >= 0
    ? value
    : null;
  return {
    stage: allowedStages.includes(evidence.stage) ? evidence.stage : "verification",
    intentLatenciesMs: numericArray(evidence.intentLatenciesMs),
    intentAccepted: boolArray(evidence.intentAccepted),
    intentSchemaValid: boolArray(evidence.intentSchemaValid),
    currentSyntheticIdMatched: boolArray(evidence.currentSyntheticIdMatched),
    cancellationVerified: nullableBoolean(evidence.cancellationVerified),
    recreatedIntentToolCount: nullableCount(evidence.recreatedIntentToolCount),
    repairSchemaValid: nullableBoolean(evidence.repairSchemaValid),
    repairCacheReloaded: nullableBoolean(evidence.repairCacheReloaded),
  };
}

function emptyCounts(): LiveCheckResult["promptCounts"] {
  return { intent: 0, repair: 0, total: 0 };
}

export async function runOfflineFirstLiveCheck(
  args: LiveCheckArguments,
  dependencies: LiveCheckDependencies,
): Promise<LiveCheckResult> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const evidence = createLiveCheckProbeEvidence();
  const counts = emptyCounts();
  const result = (
    status: LiveCheckResult["status"],
    role: ClaudeRole | null = null,
    toolCount: number | null = null,
    invalidToolList = false,
  ): LiveCheckResult => ({
    ...safeEvidence(evidence),
    status,
    elapsedMs: Math.max(0, Math.round(now() - startedAt)),
    promptCounts: { intent: counts.intent, repair: counts.repair, total: counts.total },
    rejectingRole: role === "intent" || role === "repair" ? role : null,
    toolCount: Number.isSafeInteger(toolCount) && toolCount !== null && toolCount >= 0 ? toolCount : null,
    invalidToolList: invalidToolList === true,
    subsequentPromptsAfterBlock: 0,
  });

  if (!args.live) return result("offline");
  if (!Number.isSafeInteger(args.maxSeconds) || args.maxSeconds < 1 || args.maxSeconds > LIVE_CHECK_MAX_SECONDS) {
    throw new Error("Live-check duration must be between 1 and 900 seconds.");
  }

  const report = await dependencies.readReport();
  const approvalLines = report.split(/\r?\n/).filter((line) => /phase04FollowupApproval/i.test(line));
  if (approvalLines.length !== 1 || approvalLines[0] !== LIVE_CHECK_APPROVAL_LINE) {
    return result("externally_blocked");
  }

  const controller = new AbortController();
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let provider: LiveCheckProvider | undefined;
  const blockState: { current: ReturnType<typeof safeToolDiagnostic> } = { current: null };
  evidence.stage = "initialization";
  let timedOut = false;

  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timeoutHandle = setTimer(() => {
      timedOut = true;
      controller.abort(new Error("Live-check time limit reached."));
      resolveTimeout("timeout");
    }, args.maxSeconds * 1_000);
    timeoutHandle.unref?.();
  });

  const run = (async (): Promise<"completed" | "externally_blocked" | "failed"> => {
    try {
      provider = await dependencies.createProvider(controller.signal);
      if (controller.signal.aborted) {
        await provider.close().catch(() => {});
        provider = undefined;
        return "failed";
      }

      const spendPrompt = async <T>(role: "intent" | "repair", action: () => Promise<T>): Promise<T> => {
        if (blockState.current !== null) throw new Error("Live check blocked after init tools were reported.");
        if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Live check aborted.");
        if (counts[role] >= LIVE_CHECK_PROMPT_LIMITS[role] || counts.total >= LIVE_CHECK_PROMPT_LIMITS.total) {
          throw new Error("Live check prompt cap reached.");
        }
        // Count immediately before dispatch, including a call that is later aborted.
        counts[role] += 1;
        counts.total += 1;
        return action();
      };

      const guardedProvider: GuardedLiveCheckProvider = {
        parseIntent: (prompt, signal) => spendPrompt("intent", () =>
          provider!.parseIntent(prompt, mergeSignals(controller.signal, signal))),
        repairFormModel: (prompt, signal) => spendPrompt("repair", () =>
          provider!.repairFormModel(prompt, mergeSignals(controller.signal, signal))),
        abortRole: (role) => provider!.abortRole(role),
        async recreateRole(role) {
          try {
            await provider!.recreateRole(role);
            if (role === "intent") evidence.recreatedIntentToolCount = 0;
          } catch (error) {
            blockState.current = safeToolDiagnostic(error);
            if (role === "intent" && blockState.current !== null) {
              evidence.recreatedIntentToolCount = blockState.current.toolCount;
            }
            throw error;
          }
        },
        close: () => provider!.close(),
      };

      evidence.stage = "intent_probe_1";
      await dependencies.verify(guardedProvider, controller.signal, evidence);
      return blockState.current === null ? "completed" : "externally_blocked";
    } catch (error) {
      blockState.current = safeToolDiagnostic(error) ?? blockState.current;
      return blockState.current === null ? "failed" : "externally_blocked";
    }
  })();

  let status: LiveCheckResult["status"];
  try {
    const outcome = await Promise.race([run, timeout]);
    status = outcome === "timeout" ? "timeout" : outcome;
  } finally {
    if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
    if (provider !== undefined) await provider.close().catch(() => {});
  }

  return result(timedOut ? "timeout" : status!, blockState.current?.rejectingRole ?? null,
    blockState.current?.toolCount ?? null, blockState.current?.invalidToolList ?? false);
}

async function main(): Promise<void> {
  const args = parseLiveCheckArguments(process.argv.slice(2));
  const result = await runOfflineFirstLiveCheck(args, {
    readReport: () => import("node:fs/promises").then(({ readFile }) => readFile(REPORT_PATH, "utf8")),
    async createProvider(startupSignal) {
      const { createClaudeProvider } = await import("../src/brain/claude/provider");
      return createClaudeProvider({ startupSignal });
    },
    async verify(provider, signal, evidence) {
      const cacheDirectory = await mkdtemp(join(tmpdir(), "blip-claude-live-check-"));
      try {
        await runApprovedProbeSequence(provider, signal, evidence, { cacheDirectory });
      } finally {
        await rm(cacheDirectory, { recursive: true, force: true });
      }
    },
  });

  console.log(JSON.stringify(result));
}

const directScript = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directScript) {
  main().catch((error: unknown) => {
    const message = error instanceof Error && /approval|duration|argument/i.test(error.message)
      ? error.message
      : "Live check stopped safely; no model output is displayed.";
    console.error(message);
    process.exitCode = 1;
  });
}
