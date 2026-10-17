import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

export type LiveCheckResult = {
  status: "offline" | "completed" | "externally_blocked" | "timeout" | "failed";
  stage: "not_started" | "initialization" | "verification" | "complete";
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
  verify(provider: GuardedLiveCheckProvider, signal: AbortSignal): Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

export function parseLiveCheckArguments(args: string[]): LiveCheckArguments {
  let live = false;
  let maxSeconds = LIVE_CHECK_MAX_SECONDS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--live") {
      live = true;
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
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > LIVE_CHECK_MAX_SECONDS) {
    throw new Error("Live-check duration must be between 1 and 900 seconds.");
  }
  return { live, maxSeconds };
}

function emptyCounts(): LiveCheckResult["promptCounts"] {
  return { intent: 0, repair: 0, total: 0 };
}

function safeToolDiagnostic(error: unknown): Pick<LiveCheckResult, "rejectingRole" | "toolCount" | "invalidToolList"> | null {
  if (!(error instanceof UnexpectedClaudeToolsError)) return null;
  return {
    rejectingRole: error.role,
    toolCount: error.toolCount,
    invalidToolList: error.invalidToolList,
  };
}

function mergeSignals(primary: AbortSignal, optional?: AbortSignal): AbortSignal {
  return optional === undefined ? primary : AbortSignal.any([primary, optional]);
}

export async function runOfflineFirstLiveCheck(
  args: LiveCheckArguments,
  dependencies: LiveCheckDependencies,
): Promise<LiveCheckResult> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const base = {
    elapsedMs: 0,
    promptCounts: emptyCounts(),
    rejectingRole: null,
    toolCount: null,
    invalidToolList: false,
    subsequentPromptsAfterBlock: 0 as const,
  };

  if (!args.live) return { ...base, status: "offline", stage: "not_started" };
  if (!Number.isSafeInteger(args.maxSeconds) || args.maxSeconds < 1 || args.maxSeconds > LIVE_CHECK_MAX_SECONDS) {
    throw new Error("Live-check duration must be between 1 and 900 seconds.");
  }

  const report = await dependencies.readReport();
  if (!report.split(/\r?\n/).includes(LIVE_CHECK_APPROVAL_LINE)) {
    throw new Error("Live check refused: 04-08-LIVE-CHECK.md needs the exact plan-specific approval line.");
  }

  const promptCounts = emptyCounts();
  const controller = new AbortController();
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let provider: LiveCheckProvider | undefined;
  const blockState: { current: ReturnType<typeof safeToolDiagnostic> } = { current: null };
  let stage: LiveCheckResult["stage"] = "initialization";
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
      stage = "verification";

      const spendPrompt = async <T>(role: "intent" | "repair", action: () => Promise<T>): Promise<T> => {
        if (blockState.current !== null) throw new Error("Live check blocked after init tools were reported.");
        if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Live check aborted.");
        if (promptCounts[role] >= LIVE_CHECK_PROMPT_LIMITS[role] || promptCounts.total >= LIVE_CHECK_PROMPT_LIMITS.total) {
          throw new Error(`Live check ${role} prompt cap reached.`);
        }
        // Count immediately before dispatch, including a call that is later aborted.
        promptCounts[role] += 1;
        promptCounts.total += 1;
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
          } catch (error) {
            blockState.current = safeToolDiagnostic(error);
            throw error;
          }
        },
        close: () => provider!.close(),
      };

      await dependencies.verify(guardedProvider, controller.signal);
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

  return {
    ...base,
    status: timedOut ? "timeout" : status!,
    stage: timedOut ? stage : status === "completed" ? "complete" : stage,
    elapsedMs: Math.max(0, Math.round(now() - startedAt)),
    promptCounts,
    rejectingRole: blockState.current?.rejectingRole ?? null,
    toolCount: blockState.current?.toolCount ?? null,
    invalidToolList: blockState.current?.invalidToolList ?? false,
  };
}

async function main(): Promise<void> {
  const args = parseLiveCheckArguments(process.argv.slice(2));
  const result = await runOfflineFirstLiveCheck(args, {
    readReport: () => readFile(REPORT_PATH, "utf8"),
    async createProvider(startupSignal) {
      const { createClaudeProvider } = await import("../src/brain/claude/provider");
      return createClaudeProvider({ startupSignal });
    },
    // Task 3 supplies the approved production probes; no placeholder prompt runs here.
    async verify() {
      throw new Error("The production probe sequence is not configured.");
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
