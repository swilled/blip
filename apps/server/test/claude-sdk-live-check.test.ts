import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_CHECK_PROMPT_LIMITS,
  LIVE_CHECK_MAX_SECONDS,
  parseLiveCheckArguments,
  runOfflineFirstLiveCheck,
  type LiveCheckProvider,
} from "../scripts/claude-sdk-live-check";
import { UnexpectedClaudeToolsError } from "../src/brain/claude/session";

const APPROVED_REPORT = "phase04FollowupApproval: approve-04-08-live-check\n";

function fakeProvider(): LiveCheckProvider & {
  parseIntent: ReturnType<typeof vi.fn>;
  repairFormModel: ReturnType<typeof vi.fn>;
  abortRole: ReturnType<typeof vi.fn>;
  recreateRole: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    parseIntent: vi.fn(async () => ({ type: "describe", secretOutput: "must-not-be-recorded" })),
    repairFormModel: vi.fn(async () => ({ fields: [] })),
    abortRole: vi.fn(async () => {}),
    recreateRole: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

afterEach(() => vi.useRealTimers());

describe("Claude SDK live-check gate", () => {
  it("returns offline without reading approval or importing/creating the SDK provider", async () => {
    const readReport = vi.fn(async () => APPROVED_REPORT);
    const createProvider = vi.fn(async () => fakeProvider());
    const verify = vi.fn(async () => {});

    const result = await runOfflineFirstLiveCheck(
      { live: false, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      { readReport, createProvider, verify },
    );

    expect(result.status).toBe("offline");
    expect(result.promptCounts).toEqual({ intent: 0, repair: 0, total: 0 });
    expect(readReport).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("does not treat the earlier spike approval as authorization", async () => {
    const createProvider = vi.fn(async () => fakeProvider());

    await expect(runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => "sdkPinApproval: @anthropic-ai/claude-agent-sdk@0.3.302\nownerLiveUse: confirmed\n",
        createProvider,
        verify: async () => {},
      },
    )).rejects.toThrow(/exact plan-specific approval/);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("reports only role and numeric tool count when initial init is nonempty", async () => {
    const verify = vi.fn(async () => {});
    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => { throw new UnexpectedClaudeToolsError("repair", 1); },
        verify,
      },
    );

    expect(result).toMatchObject({
      status: "externally_blocked",
      rejectingRole: "repair",
      toolCount: 1,
      promptCounts: { intent: 0, repair: 0, total: 0 },
      subsequentPromptsAfterBlock: 0,
    });
    expect(JSON.stringify(result)).not.toContain("Bash");
    expect(verify).not.toHaveBeenCalled();
  });

  it("reaches an injected provider call only after its empty-init factory resolves", async () => {
    const provider = fakeProvider();
    const createProvider = vi.fn(async () => provider);
    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider,
        verify: async (guardedProvider) => {
          await guardedProvider.parseIntent("synthetic prompt");
        },
      },
    );

    expect(createProvider).toHaveBeenCalledOnce();
    expect(provider.parseIntent).toHaveBeenCalledOnce();
    expect(result.promptCounts).toEqual({ intent: 1, repair: 0, total: 1 });
    expect(JSON.stringify(result)).not.toContain("must-not-be-recorded");
  });

  it("keeps prompt counts monotonic and blocks calls after a recreated role reports tools", async () => {
    const provider = fakeProvider();
    provider.recreateRole.mockRejectedValue(new UnexpectedClaudeToolsError("intent", 2));
    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => provider,
        verify: async (guardedProvider) => {
          await guardedProvider.parseIntent("first synthetic prompt");
          await expect(guardedProvider.recreateRole("intent")).rejects.toBeInstanceOf(UnexpectedClaudeToolsError);
          await expect(guardedProvider.parseIntent("must not dispatch")).rejects.toThrow(/blocked after init/);
        },
      },
    );

    expect(result).toMatchObject({
      status: "externally_blocked",
      rejectingRole: "intent",
      toolCount: 2,
      promptCounts: { intent: 1, repair: 0, total: 1 },
      subsequentPromptsAfterBlock: 0,
    });
    expect(provider.parseIntent).toHaveBeenCalledOnce();
  });

  it("enforces the 900-second ceiling and the Task 2 per-role prompt caps", async () => {
    expect(LIVE_CHECK_PROMPT_LIMITS).toEqual({ intent: 4, repair: 1, total: 5 });
    expect(() => parseLiveCheckArguments(["--live", "--max-seconds", "901"])).toThrow(/900 seconds/);
    expect(parseLiveCheckArguments(["--live", "--max-seconds", "900"])).toEqual({ live: true, maxSeconds: 900 });

    const provider = fakeProvider();
    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: 1 },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => provider,
        verify: async (guardedProvider) => {
          for (let index = 0; index < LIVE_CHECK_PROMPT_LIMITS.intent; index += 1) {
            await guardedProvider.parseIntent(`synthetic intent ${index}`);
          }
          await expect(guardedProvider.parseIntent("over the intent cap")).rejects.toThrow(/prompt cap/);
          await guardedProvider.repairFormModel("one synthetic repair");
          await expect(guardedProvider.repairFormModel("over the repair cap")).rejects.toThrow(/prompt cap/);
        },
      },
    );

    expect(result.promptCounts).toEqual({ intent: 4, repair: 1, total: 5 });
  });

  it("hard-stops a hung verifier at the configured maximum", async () => {
    vi.useFakeTimers();
    const resultPromise = runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => fakeProvider(),
        verify: async () => new Promise<void>(() => {}),
      },
    );

    await vi.advanceTimersByTimeAsync(LIVE_CHECK_MAX_SECONDS * 1_000);
    await expect(resultPromise).resolves.toMatchObject({ status: "timeout", stage: "verification" });
  });

  it("passes the deadline signal into provider startup and closes a provider created after timeout", async () => {
    vi.useFakeTimers();
    let resolveProvider!: (provider: LiveCheckProvider) => void;
    const providerPromise = new Promise<LiveCheckProvider>((resolve) => { resolveProvider = resolve; });
    const provider = fakeProvider();
    const receivedSignals: AbortSignal[] = [];
    const resultPromise = runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async (signal) => {
          receivedSignals.push(signal);
          return providerPromise;
        },
        verify: async () => {},
      },
    );

    await vi.advanceTimersByTimeAsync(LIVE_CHECK_MAX_SECONDS * 1_000);
    await expect(resultPromise).resolves.toMatchObject({ status: "timeout", stage: "initialization" });
    expect(receivedSignals).toHaveLength(1);
    expect(receivedSignals[0]?.aborted).toBe(true);
    resolveProvider(provider);
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.close).toHaveBeenCalled();
  });
});
