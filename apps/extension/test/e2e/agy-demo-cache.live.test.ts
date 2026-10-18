// @vitest-environment node
import { open, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoRepairCachePath } from "../../../../scripts/demo.js";
import { repairCacheIdentity } from "../../../server/src/brain/agy/repair-cache.js";
import type { AgyRole, AgyStartupDiagnostic } from "../../../server/src/brain/agy/session.js";
import { openFixturePage, type BrowserFixtureSession } from "./harness.js";

const APPROVAL_LINE = "phase05RepairCacheApproval: approve-05-11-synthetic-survey-cache";
const APPROVAL_ENV = "BLIP_PHASE05_REPAIR_CACHE_APPROVAL";
const APPROVED = process.env[APPROVAL_ENV] === "approve-05-11-synthetic-survey-cache";
const ENABLED = process.env["BLIP_E2E_BROWSER"] === "1" && APPROVED;
const MAX_SECONDS = 900;
const MAX_DISPATCHES = 8;
const PAGE_PATH = "/demo-form.html";
const PAGE_URL = "http://127.0.0.1:7791/demo-form.html";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const REPORT_PATH = path.join(
  REPO_ROOT,
  ".planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-11-REPAIR-CACHE-LIVE-CHECK.md",
);
const CLAIM_PATH = REPORT_PATH.replace(/\.md$/u, ".used");
const CACHE_DIRECTORY = demoRepairCachePath(REPO_ROOT);

type Stage = "claim" | "startup" | "survey" | "repair" | "cache-reuse" | "complete";

async function consumeFreshApproval(): Promise<void> {
  const current = await readFile(REPORT_PATH, "utf8");
  if (!current.includes(APPROVAL_LINE) ||
      !/^approvalUsed: false$/mu.test(current) ||
      !/^preflightPassed: true$/mu.test(current) ||
      !/^status: ready$/mu.test(current)) {
    throw new Error("the Phase 5 repair-cache live check has no fresh passing approval report");
  }
  const claim = await open(CLAIM_PATH, "wx");
  try {
    await claim.writeFile("consumed\n", "utf8");
  } finally {
    await claim.close();
  }
  await writeFile(REPORT_PATH, renderReport({ status: "live-running", approvalUsed: true }), "utf8");
}

type ReportData = {
  status: "ready" | "live-running" | "live-passed" | "live-failed";
  approvalUsed: boolean;
  stage?: Stage;
  elapsedMs?: number;
  dispatches?: { total: number; bootstrap: number; prompt: number; intent: number; repair: number };
  noToolsAgentAccepted?: { intent: boolean; repair: boolean };
  extensionConnected?: boolean;
  voiceConnected?: boolean;
  exactDemoIdentity?: boolean;
  cacheIdentitySha256?: string | null;
  repairedLabelCount?: number;
  cacheFilePresent?: boolean;
  reloadedFromCache?: boolean;
  dispatchesUnchangedOnCacheReload?: boolean;
};

function renderReport(data: ReportData): string {
  const dispatches = data.dispatches ?? { total: 0, bootstrap: 0, prompt: 0, intent: 0, repair: 0 };
  const noToolsAgent = data.noToolsAgentAccepted ?? { intent: false, repair: false };
  return [
    "---",
    "phase: 05-hostile-pages-real-web-and-freeze",
    "plan: 05-11",
    "check: synthetic-demo-repair-cache",
    APPROVAL_LINE,
    `approvalUsed: ${data.approvalUsed}`,
    `claimConsumed: ${data.approvalUsed}`,
    "preflightPassed: true",
    `status: ${data.status}`,
    `maxSeconds: ${MAX_SECONDS}`,
    `maxDispatches: ${MAX_DISPATCHES}`,
    `stage: ${data.stage ?? "claim"}`,
    `elapsedMs: ${data.elapsedMs ?? 0}`,
    `dispatchTotal: ${dispatches.total}`,
    `bootstrapDispatches: ${dispatches.bootstrap}`,
    `promptDispatches: ${dispatches.prompt}`,
    `intentDispatches: ${dispatches.intent}`,
    `repairDispatches: ${dispatches.repair}`,
    `intentNoToolsAgentAccepted: ${noToolsAgent.intent}`,
    `repairNoToolsAgentAccepted: ${noToolsAgent.repair}`,
    `extensionConnected: ${data.extensionConnected ?? false}`,
    `voiceConnected: ${data.voiceConnected ?? false}`,
    `exactDemoIdentity: ${data.exactDemoIdentity ?? false}`,
    `cacheIdentitySha256: ${data.cacheIdentitySha256 ?? "null"}`,
    `repairedLabelCount: ${data.repairedLabelCount ?? 0}`,
    `cacheFilePresent: ${data.cacheFilePresent ?? false}`,
    `reloadedFromCache: ${data.reloadedFromCache ?? false}`,
    `dispatchesUnchangedOnCacheReload: ${data.dispatchesUnchangedOnCacheReload ?? false}`,
    "---",
    "",
    "# Phase 5 Synthetic Demo Repair Cache Live Check",
    "",
    "One bounded, one-use AGY CLI check against the self-hosted synthetic survey only. The report stores no prompts, page prose, model output, field values, credentials, account state, or provider errors.",
    "",
    `- Exact page: ${PAGE_URL}`,
    `- Cache directory: .chrome-profile/demo-repair-cache-v1 (the launcher's dedicated cache)`,
    `- Dispatches: ${dispatches.total}/${MAX_DISPATCHES}; bootstrap ${dispatches.bootstrap}; prompts ${dispatches.prompt}.`,
    `- Result: ${data.status}; final stage ${data.stage ?? "claim"}; elapsed ${data.elapsedMs ?? 0} ms.`,
    `- Exact identity key: ${data.cacheIdentitySha256 ?? "not computed"}.`,
    "",
  ].join("\n");
}

function noToolsAgentObserver(value: AgyStartupDiagnostic, state: { intent: boolean; repair: boolean }): void {
  if (value.kind !== "milestone" || value.milestone !== "no_tools_agent_accepted") return;
  state[value.role] = true;
}

async function waitForRepair(fixture: BrowserFixtureSession, timeoutMs: number): Promise<NonNullable<ReturnType<BrowserFixtureSession["model"]>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const model = fixture.model();
    if (model?.repairStatus === "repaired" && model.modelLabelCount > 0) return model;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("the synthetic survey label repair did not complete");
}

describe("bounded live AGY cache prewarm for the local survey", () => {
  it.skipIf(!ENABLED)("repairs the exact demo identity and reloads the validated patch without another provider prompt", async () => {
    if (!process.env["BLIP_BROWSER"]) throw new Error("BLIP_BROWSER must name the dedicated Edge executable");
    await consumeFreshApproval();

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("bounded synthetic check time limit")), MAX_SECONDS * 1_000);
    const counts = { total: 0, bootstrap: 0, prompt: 0, intent: 0, repair: 0 };
    const noToolsAgentAccepted = { intent: false, repair: false };
    let stage: Stage = "startup";
    let passed = false;
    let exactDemoIdentity = false;
    let identity: string | null = null;
    let repairedLabelCount = 0;
    let cacheFilePresent = false;
    let reloadedFromCache = false;
    let dispatchesUnchangedOnCacheReload = false;
    let extensionConnected = false;
    let voiceConnected = false;
    let fixture: BrowserFixtureSession | undefined;

    const admitDispatch = (role: AgyRole, kind: "bootstrap" | "prompt"): void => {
      if (controller.signal.aborted || counts.total >= MAX_DISPATCHES) {
        controller.abort(new Error("bounded synthetic check dispatch cap reached"));
        throw new Error("bounded synthetic check dispatch cap reached");
      }
      counts.total += 1;
      counts[kind] += 1;
      counts[role] += 1;
    };

    const report = async (status: ReportData["status"]): Promise<void> => {
      await writeFile(REPORT_PATH, renderReport({
        status,
        approvalUsed: true,
        stage,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        dispatches: { ...counts },
        noToolsAgentAccepted: { ...noToolsAgentAccepted },
        extensionConnected,
        voiceConnected,
        exactDemoIdentity,
        cacheIdentitySha256: identity,
        repairedLabelCount,
        cacheFilePresent,
        reloadedFromCache,
        dispatchesUnchangedOnCacheReload,
      }), "utf8");
    };

    try {
      fixture = await openFixturePage(PAGE_PATH, {
        brain: "agy",
        pagePort: 7791,
        repairCacheDirectory: CACHE_DIRECTORY,
        agySessionHooks: {
          startupSignal: controller.signal,
          beforeBootstrapDispatch: (role) => admitDispatch(role, "bootstrap"),
          beforePromptDispatch: (role) => admitDispatch(role, "prompt"),
          onStartupDiagnostic: (diagnostic) => noToolsAgentObserver(diagnostic, noToolsAgentAccepted),
        },
      });
      stage = "survey";
      await fixture.waitForReport(PAGE_PATH, "page-ready");
      const initial = await fixture.requestSnapshot();
      exactDemoIdentity = initial.url === PAGE_URL && initial.title === "Blip Synthetic Survey";
      identity = repairCacheIdentity(initial.url, initial.structuralHash);
      if (!exactDemoIdentity || identity === null) throw new Error("the accepted page was not the exact local demo identity");

      await fixture.voiceClient.sendUtterance("what's here");
      stage = "repair";
      const repaired = await waitForRepair(fixture, 60_000);
      repairedLabelCount = repaired.modelLabelCount;
      if (repairedLabelCount < 1) throw new Error("the repair did not apply a model-sourced field label");
      await access(path.join(CACHE_DIRECTORY, `${identity}.json`));
      cacheFilePresent = true;

      stage = "cache-reuse";
      const promptsBeforeReload = counts.prompt;
      await fixture.voiceClient.sendUtterance("what's here");
      const reloaded = await waitForRepair(fixture, 10_000);
      reloadedFromCache = reloaded.modelLabelCount > 0;
      await new Promise((resolve) => setTimeout(resolve, 300));
      dispatchesUnchangedOnCacheReload = counts.prompt === promptsBeforeReload;
      if (!reloadedFromCache || !dispatchesUnchangedOnCacheReload) {
        throw new Error("the exact demo cache entry was not reused without a provider prompt");
      }
      if (!noToolsAgentAccepted.intent || !noToolsAgentAccepted.repair || counts.total > MAX_DISPATCHES) {
        throw new Error("AGY startup or dispatch bounds were not satisfied");
      }
      stage = "complete";
      passed = true;
    } catch {
      // Do not surface provider output, prompts, local auth state, or exception text.
      throw new Error(`the bounded synthetic demo repair check failed at ${stage}; see its sanitized report`);
    } finally {
      clearTimeout(timer);
      controller.abort();
      extensionConnected = fixture?.extensionConnected() ?? false;
      voiceConnected = fixture?.voiceUiConnected() ?? false;
      if (fixture !== undefined) await fixture.close().catch(() => { passed = false; });
      await report(passed ? "live-passed" : "live-failed");
      if (passed) {
        process.stdout.write(`BLIP_PHASE05_REPAIR_CACHE=PASS dispatches=${counts.total}/${MAX_DISPATCHES} repaired-labels=${repairedLabelCount} cache-reused=${reloadedFromCache}\n`);
      }
    }
  }, MAX_SECONDS * 1_000 + 30_000);
});
