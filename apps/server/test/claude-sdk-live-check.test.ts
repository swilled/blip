import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Intent, type FormModel, type Snapshot } from "@blip/protocol";
import {
  LIVE_CHECK_MAX_SECONDS,
  LIVE_CHECK_PROMPT_LIMITS,
  LIVE_CHECK_APPROVAL_LINE,
  parseLiveCheckArguments,
  runApprovedProbeSequence,
  runOfflineFirstLiveCheck,
  type LiveCheckProbeEvidence,
  type LiveCheckProvider,
} from "../scripts/claude-sdk-live-check";
import { RepairCache } from "../src/brain/claude/repair-cache";
import { UnexpectedClaudeToolsError } from "../src/brain/claude/session";

const APPROVED_REPORT = `${LIVE_CHECK_APPROVAL_LINE}\n`;
const SYNTHETIC_URL = "https://synthetic.example/form/contact";
const SYNTHETIC_STRUCTURE = "synthetic-structure-v1";
const FIELD_ID = "synthetic-field";
const ACTION_ID = "synthetic-action";

function syntheticPage(): { snapshot: Snapshot; model: FormModel; isCurrent(): boolean; getCurrentModel(): FormModel } {
  const snapshot: Snapshot = {
    snapshotId: "synthetic-snapshot",
    version: 1,
    tabId: 9001,
    url: SYNTHETIC_URL,
    origin: "https://synthetic.example",
    title: "Synthetic contact form",
    headings: [{ level: 1, text: "Synthetic contact form" }],
    alerts: [],
    elements: [
      {
        id: FIELD_ID,
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
        id: ACTION_ID,
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
      id: FIELD_ID,
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
      id: ACTION_ID,
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

function fakeProvider(options: {
  intents?: unknown[];
  repair?: unknown;
  pendingCancellation?: boolean;
} = {}): LiveCheckProvider & {
  parseIntent: ReturnType<typeof vi.fn>;
  repairFormModel: ReturnType<typeof vi.fn>;
  abortRole: ReturnType<typeof vi.fn>;
  recreateRole: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  cancellationStarted: Promise<void>;
} {
  const intents = options.intents ?? [
    { type: "set_fields", fills: [{ fieldId: FIELD_ID, value: "provider-output-sentinel" }] },
    { type: "request_action", actionId: ACTION_ID },
    { type: "describe" },
    { type: "go_to_field", fieldId: FIELD_ID },
  ];
  let dispatch = 0;
  let resolveCancellationStarted!: () => void;
  const cancellationStarted = new Promise<void>((resolveStarted) => { resolveCancellationStarted = resolveStarted; });

  return {
    parseIntent: vi.fn(async (_prompt: string, signal?: AbortSignal): Promise<unknown> => {
      dispatch += 1;
      if (options.pendingCancellation && dispatch === 3) {
        resolveCancellationStarted();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("private cancellation detail")), { once: true });
        });
      }
      return intents[dispatch - 1] ?? intents[intents.length - 1];
    }),
    repairFormModel: vi.fn(async () => options.repair ?? {
      title: "Repaired synthetic title",
      fields: [{ id: FIELD_ID, label: "Work email address", confidence: 0.9 }],
    }),
    abortRole: vi.fn(async () => {}),
    recreateRole: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    cancellationStarted,
  };
}

const cacheDirectories: string[] = [];
async function temporaryCacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "blip-approved-probe-"));
  cacheDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.useRealTimers();
  for (const directory of cacheDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function runFakeProbe(
  provider: ReturnType<typeof fakeProvider>,
  options: { maxSeconds?: number; cancellationDelayMs?: number; now?: () => number } = {},
) {
  const cacheDirectory = await temporaryCacheDirectory();
  const verify = vi.fn(async (
    guarded: LiveCheckProvider,
    signal: AbortSignal,
    evidence: LiveCheckProbeEvidence,
  ) => runApprovedProbeSequence(guarded, signal, evidence, {
    cacheDirectory,
    cancellationDelayMs: options.cancellationDelayMs,
    now: options.now,
  }));
  const createProvider = vi.fn(async () => provider);
  const result = await runOfflineFirstLiveCheck(
    { live: true, maxSeconds: options.maxSeconds ?? LIVE_CHECK_MAX_SECONDS },
    {
      readReport: async () => APPROVED_REPORT,
      createProvider,
      verify,
      ...(options.now === undefined ? {} : { now: options.now }),
    },
  );
  return { result, cacheDirectory, createProvider, verify };
}

describe("Claude SDK approved-mode synthetic verifier", () => {
  it("keeps offline mode ahead of report reads, provider creation, and probe dispatch", async () => {
    const readReport = vi.fn(async () => APPROVED_REPORT);
    const createProvider = vi.fn(async () => fakeProvider());
    const verify = vi.fn(async () => {});

    const result = await runOfflineFirstLiveCheck(
      parseLiveCheckArguments(["--offline"]),
      { readReport, createProvider, verify },
    );

    expect(result).toMatchObject({
      status: "offline",
      stage: "not_started",
      promptCounts: { intent: 0, repair: 0, total: 0 },
    });
    expect(readReport).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses deferred, old, missing, and non-exact approval lines before provider creation", async () => {
    const deferredReport = "phase04FollowupApproval: defer-04-08-live-check\nstatus: externally_blocked\n";
    const reports = [
      deferredReport,
      "sdkPinApproval: @anthropic-ai/claude-agent-sdk@0.3.302\nownerLiveUse: confirmed\n",
      "No approval line is present.\n",
      `${LIVE_CHECK_APPROVAL_LINE} \n`,
      `${LIVE_CHECK_APPROVAL_LINE}\nphase04FollowupApproval: defer-04-08-live-check\n`,
    ];

    for (const report of reports) {
      const createProvider = vi.fn(async () => fakeProvider());
      const verify = vi.fn(async () => {});
      const result = await runOfflineFirstLiveCheck(
        { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
        { readReport: async () => report, createProvider, verify },
      );

      expect(result).toMatchObject({
        status: "externally_blocked",
        stage: "not_started",
        promptCounts: { intent: 0, repair: 0, total: 0 },
        subsequentPromptsAfterBlock: 0,
      });
      expect(createProvider).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    }
  });

  it("does not pass the actual deferred report to provider creation or prompt dispatch", async () => {
    const report = await readFile(resolve(
      process.cwd(),
      ".planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-08-LIVE-CHECK.md",
    ), "utf8");
    const provider = fakeProvider();
    const createProvider = vi.fn(async () => provider);
    const verify = vi.fn(async () => {});

    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      { readReport: async () => report, createProvider, verify },
    );

    expect(result).toMatchObject({
      status: "externally_blocked",
      stage: "not_started",
      promptCounts: { intent: 0, repair: 0, total: 0 },
    });
    expect(createProvider).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(provider.parseIntent).not.toHaveBeenCalled();
    expect(provider.repairFormModel).not.toHaveBeenCalled();
  });

  it("runs two grammar misses through routeIntent and caches a validated synthetic repair", async () => {
    const provider = fakeProvider();
    const { result, cacheDirectory, createProvider, verify } = await runFakeProbe(provider, {
      now: (() => { let time = 100; return () => time++; })(),
    });
    const cache = new RepairCache({ directory: cacheDirectory });

    expect(createProvider).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
    expect(provider.parseIntent).toHaveBeenCalledTimes(3);
    expect(provider.repairFormModel).toHaveBeenCalledOnce();
    expect(provider.parseIntent.mock.calls.slice(0, 2).every(([prompt]) =>
      typeof prompt === "string" && !prompt.includes("provider-output-sentinel"),
    )).toBe(true);
    expect(result).toMatchObject({
      status: "completed",
      stage: "complete",
      promptCounts: { intent: 3, repair: 1, total: 4 },
      intentAccepted: [true, true],
      intentSchemaValid: [true, true],
      currentSyntheticIdMatched: [true, true],
      cancellationVerified: false,
      repairSchemaValid: true,
      repairCacheReloaded: true,
      subsequentPromptsAfterBlock: 0,
    });
    expect(result.intentLatenciesMs).toHaveLength(2);
    expect(result.intentLatenciesMs.every((latency) => Number.isFinite(latency) && latency >= 0)).toBe(true);
    expect(cache.load(SYNTHETIC_URL, SYNTHETIC_STRUCTURE)).toEqual({
      title: "Repaired synthetic title",
      fields: [{ id: FIELD_ID, label: "Work email address", confidence: 0.9 }],
    });

    const serialized = JSON.stringify(result);
    for (const privateValue of [
      "provider-output-sentinel", "Repaired synthetic title", "Work email address", FIELD_ID, ACTION_ID,
      "set_fields", "request_action", "synthetic prompt", "Bash", "ANTHROPIC_API_KEY", "credential",
    ]) expect(serialized).not.toContain(privateValue);
    expect(Object.keys(result).sort()).toEqual([
      "cancellationVerified", "currentSyntheticIdMatched", "elapsedMs", "intentAccepted", "intentLatenciesMs",
      "intentSchemaValid", "invalidToolList", "promptCounts", "rejectingRole", "repairCacheReloaded",
      "repairSchemaValid", "recreatedIntentToolCount", "stage", "status", "subsequentPromptsAfterBlock", "toolCount",
    ].sort());
  });

  it("stops routeIntent's invalid-output retry before a second provider dispatch", async () => {
    const provider = fakeProvider({ intents: [{ type: "unsupported-intent", private: "invalid-output-sentinel" }] });
    const { result } = await runFakeProbe(provider);

    expect(result).toMatchObject({
      status: "failed",
      stage: "intent_probe_1",
      promptCounts: { intent: 1, repair: 0, total: 1 },
      intentAccepted: [false],
      intentSchemaValid: [false],
      currentSyntheticIdMatched: [false],
    });
    expect(provider.parseIntent).toHaveBeenCalledOnce();
    expect(provider.repairFormModel).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("invalid-output-sentinel");
  });

  it("aborts a pending intent, recreates the role, then runs one current-ID recovery route", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ pendingCancellation: true });
    const cacheDirectory = await temporaryCacheDirectory();
    const verify = vi.fn(async (
      guarded: LiveCheckProvider,
      signal: AbortSignal,
      evidence: LiveCheckProbeEvidence,
    ) => runApprovedProbeSequence(guarded, signal, evidence, { cacheDirectory, cancellationDelayMs: 500 }));
    const resultPromise = runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      { readReport: async () => APPROVED_REPORT, createProvider: async () => provider, verify },
    );

    await provider.cancellationStarted;
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(provider.abortRole).toHaveBeenCalledOnce();
    expect(provider.abortRole).toHaveBeenCalledWith("intent");
    expect(provider.recreateRole).toHaveBeenCalledOnce();
    expect(provider.recreateRole).toHaveBeenCalledWith("intent");
    expect(provider.parseIntent).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      status: "completed",
      promptCounts: { intent: 4, repair: 1, total: 5 },
      cancellationVerified: true,
      recreatedIntentToolCount: 0,
      currentSyntheticIdMatched: [true, true, true],
    });
  });

  it("records early cancellation completion as unverified without another cancellation dispatch", async () => {
    const provider = fakeProvider({
      intents: [
        { type: "set_fields", fills: [{ fieldId: FIELD_ID, value: "safe value" }] },
        { type: "request_action", actionId: ACTION_ID },
        { type: "go_to_field", fieldId: FIELD_ID },
      ],
    });
    const { result } = await runFakeProbe(provider);

    expect(result.cancellationVerified).toBe(false);
    expect(provider.abortRole).not.toHaveBeenCalled();
    expect(provider.recreateRole).not.toHaveBeenCalled();
    expect(provider.parseIntent).toHaveBeenCalledTimes(3);
    expect(result.promptCounts).toEqual({ intent: 3, repair: 1, total: 4 });
  });

  it("rejects invalid or stale repair patches without writing cache entries", async () => {
    const invalidPatches = [
      { fields: [{ id: FIELD_ID, label: "Valid label", surprise: "unsupported" }] },
      { fields: [{ id: "stale-field-id", label: "Stale label" }] },
    ];

    for (const repair of invalidPatches) {
      const provider = fakeProvider({ repair });
      const { result, cacheDirectory } = await runFakeProbe(provider);
      const cache = new RepairCache({ directory: cacheDirectory });

      expect(result.status).toBe("failed");
      expect(result.repairSchemaValid).toBe(false);
      expect(result.repairCacheReloaded).toBe(false);
      expect(await readdir(cacheDirectory)).toEqual([]);
      expect(cache.load(SYNTHETIC_URL, SYNTHETIC_STRUCTURE)).toBeNull();
    }
  });

  it("preserves monotonic counts and sends no prompt after a recreated role reports tools", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ pendingCancellation: true });
    provider.recreateRole.mockRejectedValue(new UnexpectedClaudeToolsError("intent", 2));
    const cacheDirectory = await temporaryCacheDirectory();
    const resultPromise = runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => provider,
        verify: (guarded, signal, evidence) => runApprovedProbeSequence(guarded, signal, evidence, {
          cacheDirectory,
          cancellationDelayMs: 500,
        }),
      },
    );
    await provider.cancellationStarted;
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result).toMatchObject({
      status: "externally_blocked",
      rejectingRole: "intent",
      toolCount: 2,
      recreatedIntentToolCount: 2,
      promptCounts: { intent: 3, repair: 0, total: 3 },
      subsequentPromptsAfterBlock: 0,
    });
    expect(provider.parseIntent).toHaveBeenCalledTimes(3);
    expect(provider.repairFormModel).not.toHaveBeenCalled();
  });

  it("aborts and closes a hung probe at the injected deadline while retaining its dispatch count", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    const provider = fakeProvider();
    provider.parseIntent.mockImplementationOnce(async (_prompt: string, signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });
    const cacheDirectory = await temporaryCacheDirectory();
    const resultPromise = runOfflineFirstLiveCheck(
      { live: true, maxSeconds: 1 },
      {
        readReport: async () => APPROVED_REPORT,
        createProvider: async () => provider,
        verify: (guarded, signal, evidence) => runApprovedProbeSequence(guarded, signal, evidence, { cacheDirectory }),
      },
    );

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(result).toMatchObject({
      status: "timeout",
      stage: "intent_probe_1",
      promptCounts: { intent: 1, repair: 0, total: 1 },
      subsequentPromptsAfterBlock: 0,
    });
    expect(receivedSignal?.aborted).toBe(true);
    expect(provider.parseIntent).toHaveBeenCalledOnce();
    expect(provider.close).toHaveBeenCalledOnce();
    expect(provider.repairFormModel).not.toHaveBeenCalled();
  });

  it("keeps duration and role-specific prompt ceilings bounded", () => {
    expect(LIVE_CHECK_PROMPT_LIMITS).toEqual({ intent: 4, repair: 1, total: 5 });
    expect(parseLiveCheckArguments(["--offline"])).toEqual({ live: false, maxSeconds: LIVE_CHECK_MAX_SECONDS });
    expect(() => parseLiveCheckArguments(["--offline", "--live"])).toThrow(/cannot be combined/);
    expect(() => parseLiveCheckArguments(["--live", "--max-seconds", "901"])).toThrow(/900 seconds/);
    expect(parseLiveCheckArguments(["--live", "--max-seconds", "900"])).toEqual({ live: true, maxSeconds: 900 });
    expect(Intent.safeParse({ type: "unknown" }).success).toBe(true);
  });

  it("counts prompts immediately before dispatch and enforces the four-plus-one caps", async () => {
    const provider = fakeProvider();
    const createProvider = vi.fn(async () => provider);
    const verify = vi.fn(async (guarded: LiveCheckProvider) => {
      for (let index = 0; index < LIVE_CHECK_PROMPT_LIMITS.intent; index += 1) {
        await guarded.parseIntent(`synthetic intent ${index}`);
      }
      await expect(guarded.parseIntent("must not dispatch over the intent cap")).rejects.toThrow(/prompt cap/);
      await guarded.repairFormModel("one synthetic repair");
      await expect(guarded.repairFormModel("must not dispatch over the repair cap")).rejects.toThrow(/prompt cap/);
    });
    const result = await runOfflineFirstLiveCheck(
      { live: true, maxSeconds: LIVE_CHECK_MAX_SECONDS },
      { readReport: async () => APPROVED_REPORT, createProvider, verify },
    );

    expect(result).toMatchObject({
      status: "completed",
      promptCounts: { intent: 4, repair: 1, total: 5 },
      subsequentPromptsAfterBlock: 0,
    });
    expect(provider.parseIntent).toHaveBeenCalledTimes(4);
    expect(provider.repairFormModel).toHaveBeenCalledOnce();
  });
});
