import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Intent } from "@blip/protocol";
import { z } from "zod";

const SDK_PIN = "@anthropic-ai/claude-agent-sdk@0.3.302";
const MAX_SPIKE_SECONDS = 1_800;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const REPEATS_PER_ROLE = 3;
const SPIKE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const REPORT_PATH = resolve(
  SPIKE_DIR,
  ".planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-SDK-SPIKE.md",
);

const RepairPatch = z.strictObject({
  title: z.string().max(160).optional(),
  fields: z
    .array(
      z.strictObject({
        fieldId: z.string().min(1).max(160),
        label: z.string().min(1).max(160).optional(),
        group: z.string().max(120).nullable().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(250),
});

type RoleProbe = {
  role: "intent" | "repair";
  model: "haiku" | "sonnet";
  schema: z.ZodType;
  prompt: string;
};

type Observation = {
  role: RoleProbe["role"];
  repetition: number;
  model: RoleProbe["model"];
  startupMs: number | null;
  wallMs: number;
  sdkDurationMs: number | null;
  inputTokens: number | null;
  structuredOutputPresent: boolean;
  schemaValid: boolean;
  initToolsEmpty: boolean | null;
  error: "timeout" | "unexpected-tools" | "sdk-error" | null;
};

class ProbeTimeoutError extends Error {
  constructor() {
    super("probe-timeout");
    this.name = "ProbeTimeoutError";
  }
}

function readArguments(argv: string[]): { live: boolean; maxSeconds: number } {
  let live = false;
  let maxSeconds = MAX_SPIKE_SECONDS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--max-seconds") {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--max-seconds must be an integer from 1 to 1800");
      }
      maxSeconds = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (maxSeconds > MAX_SPIKE_SECONDS) {
    throw new Error("--max-seconds cannot exceed 1800");
  }
  return { live, maxSeconds };
}

async function assertLiveApprovals(): Promise<void> {
  const report = await readFile(REPORT_PATH, "utf8");
  const hasPinApproval = /^sdkPinApproval: @anthropic-ai\/claude-agent-sdk@0\.3\.302$/m.test(report);
  const hasOwnerConfirmation = /^ownerLiveUse: confirmed$/m.test(report);

  if (!hasPinApproval || !hasOwnerConfirmation) {
    throw new Error(
      "Live probe refused: 04-SDK-SPIKE.md must contain exact sdkPinApproval and ownerLiveUse: confirmed lines.",
    );
  }
}

function roleProbes(): RoleProbe[] {
  return [
    {
      role: "intent",
      model: "haiku",
      schema: Intent,
      prompt:
        'Return the structured Intent for the synthetic utterance "what is on this page?". Do not add explanation.',
    },
    {
      role: "repair",
      model: "sonnet",
      schema: RepairPatch,
      prompt:
        'For a synthetic form with one field whose id is "field-1", return a descriptive patch with title "Sample form" and label "Example label". Do not add other field ids or explanation.',
    },
  ];
}

async function runOneProbe(
  role: RoleProbe,
  repetition: number,
  deadline: number,
): Promise<Observation> {
  const startedAt = performance.now();
  const abortController = new AbortController();
  const cwd = await mkdtemp(join(tmpdir(), "blip-sdk-spike-cwd-"));
  const configDir = await mkdtemp(join(tmpdir(), "blip-sdk-spike-config-"));
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.CLAUDE_CONFIG_DIR = configDir;
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";

  const remainingMs = Math.max(1, deadline - Date.now());
  const timeoutMs = Math.min(DEFAULT_REQUEST_TIMEOUT_MS, remainingMs);
  let timedOut = false;
  let warm: Awaited<ReturnType<typeof import("@anthropic-ai/claude-agent-sdk").startup>> | undefined;
  let startupMs: number | null = null;
  let initToolsEmpty: boolean | null = null;
  let structuredOutput: unknown;
  let structuredOutputPresent = false;
  let sdkDurationMs: number | null = null;
  let inputTokens: number | null = null;
  let probeError: Observation["error"] = null;
  let timeoutTimer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      warm?.close();
      reject(new ProbeTimeoutError());
    }, timeoutMs);
    timeoutTimer.unref?.();
  });

  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    const outputSchema = z.toJSONSchema(role.schema, { target: "draft-7" });
    const startupStartedAt = performance.now();
    const run = (async () => {
      warm = await sdk.startup({
        options: {
          cwd,
          model: role.model,
          tools: [],
          settingSources: [],
          strictMcpConfig: true,
          permissionMode: "dontAsk",
          permissionPrompts: "none",
          mcpServers: {},
          outputFormat: { type: "json_schema", schema: outputSchema },
          abortController,
          env,
        },
      });
      startupMs = performance.now() - startupStartedAt;
      if (timedOut) {
        warm.close();
        return;
      }

      const query = warm.query(role.prompt);
      for await (const message of query) {
        if (message.type === "system" && message.subtype === "init") {
          initToolsEmpty = message.tools.length === 0;
          if (!initToolsEmpty) {
            probeError = "unexpected-tools";
            abortController.abort();
            warm.close();
            return;
          }
        }
        if (message.type === "result") {
          if ("structured_output" in message) {
            structuredOutput = message.structured_output;
            structuredOutputPresent = message.structured_output !== undefined;
          }
          if ("duration_ms" in message) sdkDurationMs = message.duration_ms;
          if ("usage" in message && typeof message.usage.input_tokens === "number") {
            inputTokens = message.usage.input_tokens;
          }
          if (message.subtype !== "success" || message.is_error) probeError = "sdk-error";
        }
      }
      if (initToolsEmpty === null && probeError === null) probeError = "sdk-error";
    })();

    await Promise.race([run, timeout]);
  } catch (error) {
    probeError = error instanceof ProbeTimeoutError ? "timeout" : "sdk-error";
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    warm?.close();
    abortController.abort();
    await Promise.all([
      rm(cwd, { recursive: true, force: true }),
      rm(configDir, { recursive: true, force: true }),
    ]);
  }

  return {
    role: role.role,
    repetition,
    model: role.model,
    startupMs: startupMs === null ? null : Math.round(startupMs),
    wallMs: Math.round(performance.now() - startedAt),
    sdkDurationMs,
    inputTokens,
    structuredOutputPresent,
    schemaValid: role.schema.safeParse(structuredOutput).success,
    initToolsEmpty,
    error: probeError,
  };
}

async function runLiveProbe(maxSeconds: number): Promise<void> {
  await assertLiveApprovals();

  const startedAt = new Date();
  const deadline = Date.now() + maxSeconds * 1_000;
  const observations: Observation[] = [];
  const roles = roleProbes();

  for (const role of roles) {
    for (let repetition = 1; repetition <= REPEATS_PER_ROLE; repetition += 1) {
      if (Date.now() >= deadline) break;
      const observation = await runOneProbe(role, repetition, deadline);
      observations.push(observation);
      if (observation.error === "timeout" || observation.error === "sdk-error") {
        // One restart attempt per role exercises recovery without unbounded retries.
        if (repetition < REPEATS_PER_ROLE && Date.now() < deadline) {
          const retry = await runOneProbe(role, repetition + 1, deadline);
          observations.push(retry);
        }
        break;
      }
      if (observation.error === "unexpected-tools") break;
    }
  }

  const outcome = {
    startedAt: startedAt.toISOString(),
    elapsedMs: Date.now() - startedAt.getTime(),
    maxSeconds,
    observations,
    warmHandleReuse: "WarmQuery.query() is documented as one-use; each probe starts a fresh prewarmed handle.",
  };
  const rendered = JSON.stringify(outcome, null, 2);
  await appendFile(REPORT_PATH, `\n\n## Live SDK probe\n\n\`\`\`json\n${rendered}\n\`\`\`\n`, "utf8");
  console.log(rendered);
}

async function main(): Promise<void> {
  const { live, maxSeconds } = readArguments(process.argv.slice(2));
  if (!live) {
    console.log(`Offline mode passed; live mode is disabled. Max window: ${maxSeconds}s.`);
    console.log("The SDK is not imported and no provider request is made in offline mode.");
    return;
  }
  await runLiveProbe(maxSeconds);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown spike error";
  console.error(message);
  process.exitCode = 1;
});
