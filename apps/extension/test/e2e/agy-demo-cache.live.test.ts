// @vitest-environment node
import { open, readFile, writeFile, access, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoRepairCachePath } from "../../../../scripts/demo.js";
import { repairCacheIdentity } from "../../../server/src/brain/agy/repair-cache.js";
import type { RepairDiagnostic } from "../../../server/src/brain/agy/repair-coordinator.js";
import type { AgyRole, AgyStartupDiagnostic } from "../../../server/src/brain/agy/session.js";
import { openFixturePage, type BrowserFixtureSession } from "./harness.js";

const requestedCheckId = process.env["BLIP_PHASE05_REPAIR_CACHE_CHECK_ID"] ?? "05-11";
const CHECK_ID = ["05-11", "05-12", "05-14", "05-15", "05-16", "05-17", "05-18", "05-19", "05-20", "05-21", "05-22", "05-23", "05-24", "05-25", "05-26", "05-27", "05-28", "05-29"].includes(requestedCheckId) ? requestedCheckId : "invalid";
const REVALIDATION_CHECK = ["05-12", "05-14", "05-15", "05-16", "05-17", "05-18", "05-19", "05-20", "05-21", "05-22", "05-23", "05-24", "05-25", "05-26"].includes(CHECK_ID);
const LAUNCHER_CACHE_REFRESH_CHECK = CHECK_ID === "05-27";
const APPROVAL_TOKEN = `approve-${CHECK_ID}-synthetic-survey-cache`;
const APPROVAL_LINE = `phase05RepairCacheApproval: ${APPROVAL_TOKEN}`;
const APPROVAL_ENV = "BLIP_PHASE05_REPAIR_CACHE_APPROVAL";
const APPROVED = process.env[APPROVAL_ENV] === APPROVAL_TOKEN;
const ENABLED = CHECK_ID !== "invalid" && process.env["BLIP_E2E_BROWSER"] === "1" && APPROVED;
const PREFLIGHT_ONLY = process.env["BLIP_PHASE05_REPAIR_CACHE_PREFLIGHT"] === "1";
const MAX_SECONDS = 900;
const MAX_DISPATCHES = 8;
const PAGE_PATH = "/demo-form.html";
const PAGE_URL = "http://127.0.0.1:7791/demo-form.html";
const EXPECTED_DEMO_IDENTITY = "ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const REPORT_PATH = path.join(
  REPO_ROOT,
  `.planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/${CHECK_ID}-REPAIR-CACHE-LIVE-CHECK.md`,
);
const CLAIM_PATH = REPORT_PATH.replace(/\.md$/u, ".used");
const CACHE_DIRECTORY = demoRepairCachePath(REPO_ROOT);

type Stage = "claim" | "startup" | "survey" | "repair" | "cache-reuse" | "agy-intent" | "fill" | "readback" | "submit" | "complete";

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
  dispatches?: { total: number; bootstrap: number; prompt: number; intent: number; repair: number; content: number };
  noToolsAgentAccepted?: { intent: boolean; repair: boolean; content: boolean };
  startupFailure?: { intent: string; repair: string; content: string };
  extensionConnected?: boolean;
  voiceConnected?: boolean;
  exactDemoIdentity?: boolean;
  cacheIdentitySha256?: string | null;
  repairedLabelCount?: number;
  repairStatus?: "baseline" | "pending" | "repaired" | "failed" | "unknown";
  repairStatusTrace?: Array<"baseline" | "pending" | "repaired" | "failed">;
  repairDiagnostics?: RepairDiagnostic[];
  pageChangedCount?: number;
  cacheFilePresent?: boolean;
  cacheRefreshForced?: boolean;
  cacheFileUpdated?: boolean;
  reloadedFromCache?: boolean;
  dispatchesUnchangedOnCacheReload?: boolean;
  agyIntentTurnCompleted?: boolean;
  trackedReadbackObserved?: boolean;
  exactConfirmationAccepted?: boolean;
  submitCount?: number;
  userUtteranceCount?: number;
};

function renderReport(data: ReportData): string {
  const dispatches = data.dispatches ?? { total: 0, bootstrap: 0, prompt: 0, intent: 0, repair: 0, content: 0 };
  const noToolsAgent = data.noToolsAgentAccepted ?? { intent: false, repair: false, content: false };
  return [
    "---",
    "phase: 05-hostile-pages-real-web-and-freeze",
    `plan: ${CHECK_ID}`,
    `check: ${REVALIDATION_CHECK ? "synthetic-agy-i3-and-repair-cache" : "synthetic-demo-repair-cache"}`,
    APPROVAL_LINE,
    "authorizationBasis: user-standing-authorization-for-bounded-synthetic-checks",
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
    `contentDispatches: ${dispatches.content}`,
    `intentNoToolsAgentAccepted: ${noToolsAgent.intent}`,
    `repairNoToolsAgentAccepted: ${noToolsAgent.repair}`,
    `contentNoToolsAgentAccepted: ${noToolsAgent.content}`,
    `intentStartupFailure: ${data.startupFailure?.intent ?? "none"}`,
    `repairStartupFailure: ${data.startupFailure?.repair ?? "none"}`,
    `contentStartupFailure: ${data.startupFailure?.content ?? "none"}`,
    `extensionConnected: ${data.extensionConnected ?? false}`,
    `voiceConnected: ${data.voiceConnected ?? false}`,
    `exactDemoIdentity: ${data.exactDemoIdentity ?? false}`,
    `cacheIdentitySha256: ${data.cacheIdentitySha256 ?? "null"}`,
    `repairedLabelCount: ${data.repairedLabelCount ?? 0}`,
    `repairStatus: ${data.repairStatus ?? "unknown"}`,
    `repairStatusTrace: ${(data.repairStatusTrace ?? []).join(",") || "none"}`,
    `repairDiagnostics: ${(data.repairDiagnostics ?? []).map((diagnostic) => diagnostic.type === "repair-provider-error"
      ? `${diagnostic.type}:${diagnostic.category}`
      : diagnostic.type).join(",") || "none"}`,
    `pageChangedCount: ${data.pageChangedCount ?? 0}`,
    `cacheFilePresent: ${data.cacheFilePresent ?? false}`,
    `cacheRefreshForced: ${data.cacheRefreshForced ?? false}`,
    `cacheFileUpdated: ${data.cacheFileUpdated ?? false}`,
    `reloadedFromCache: ${data.reloadedFromCache ?? false}`,
    `dispatchesUnchangedOnCacheReload: ${data.dispatchesUnchangedOnCacheReload ?? false}`,
    `agyIntentTurnCompleted: ${data.agyIntentTurnCompleted ?? false}`,
    `trackedReadbackObserved: ${data.trackedReadbackObserved ?? false}`,
    `exactConfirmationAccepted: ${data.exactConfirmationAccepted ?? false}`,
    `submitCount: ${data.submitCount ?? 0}`,
    `userUtteranceCount: ${data.userUtteranceCount ?? 0}`,
    "---",
    "",
    `# Phase 5 ${REVALIDATION_CHECK ? "AGY I3 and Repair Cache" : "Synthetic Demo Repair Cache"} Live Check`,
    "",
    "One bounded, one-use AGY CLI check against the self-hosted synthetic survey only. The report stores no prompts, page prose, model output, field values, credentials, account state, or provider errors.",
    "",
    `- Exact page: ${PAGE_URL}`,
    `- Cache directory: ${REVALIDATION_CHECK ? "isolated temporary directory" : ".chrome-profile/demo-repair-cache-v1"}.`,
    `- Dispatches: ${dispatches.total}/${MAX_DISPATCHES}; bootstrap ${dispatches.bootstrap}; prompts ${dispatches.prompt}.`,
    `- Result: ${data.status}; final stage ${data.stage ?? "claim"}; elapsed ${data.elapsedMs ?? 0} ms.`,
    `- Exact identity key: ${data.cacheIdentitySha256 ?? "not computed"}.`,
    ...(REVALIDATION_CHECK ? [
      `- AGY intent roundtrip completed: ${data.agyIntentTurnCompleted ?? false}.`,
      `- Tracked read-back observed: ${data.trackedReadbackObserved ?? false}.`,
      `- Exact confirmation accepted: ${data.exactConfirmationAccepted ?? false}.`,
      `- Local submit count: ${data.submitCount ?? 0}.`,
      `- Synthetic voice utterances: ${data.userUtteranceCount ?? 0}/8.`,
    ] : []),
    "",
  ].join("\n");
}

function noToolsAgentObserver(
  value: AgyStartupDiagnostic,
  state: Record<AgyRole, boolean>,
  failures: Record<AgyRole, string>,
): void {
  if (value.kind === "milestone" && value.milestone === "no_tools_agent_accepted") state[value.role] = true;
  if (value.kind === "failure") failures[value.role] = value.category;
}

async function waitForRepair(
  fixture: BrowserFixtureSession,
  timeoutMs: number,
  statusTrace: Array<"baseline" | "pending" | "repaired" | "failed"> = [],
): Promise<NonNullable<ReturnType<BrowserFixtureSession["model"]>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const model = fixture.model();
    if (model !== null && statusTrace.at(-1) !== model.repairStatus) statusTrace.push(model.repairStatus);
    if (model?.repairStatus === "repaired" && model.modelLabelCount > 0) return model;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("the synthetic survey label repair did not complete");
}

async function waitForInitialPageStable(fixture: BrowserFixtureSession, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let previousChangeCount = fixture.pageChangedCount();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const changeCount = fixture.pageChangedCount();
    if (changeCount !== previousChangeCount) {
      previousChangeCount = changeCount;
      stableSince = Date.now();
    }
    if (fixture.extensionConnected() && fixture.model()?.url === PAGE_URL && Date.now() - stableSince >= 500) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the accepted local survey page did not stabilize");
}

async function sendFromVoiceUi(fixture: BrowserFixtureSession, text: string): Promise<void> {
  const encoded = JSON.stringify(text);
  const sent = await fixture.evaluateInVoiceUi(`(() => {
    const input = document.querySelector('#utterance');
    const form = document.querySelector('#utterance-form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement) || input.disabled) return false;
    input.value = ${encoded};
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  if (sent !== true) throw new Error("the isolated voice UI did not accept the synthetic utterance");
}

async function currentVoiceUiReply(fixture: BrowserFixtureSession): Promise<string> {
  const reply = await fixture.evaluateInVoiceUi("document.querySelector('#reply')?.textContent ?? ''");
  return typeof reply === "string" ? reply : "";
}

async function waitForVoiceUiIdle(fixture: BrowserFixtureSession, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const done = await fixture.evaluateInVoiceUi(`(() => {
      const send = document.querySelector('#send');
      const busy = document.querySelector('#utterance-form')?.getAttribute('aria-busy');
      return send instanceof HTMLButtonElement && !send.disabled && busy === 'false';
    })()`);
    if (done === true) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the isolated voice UI did not return to idle");
}

async function waitForVoiceUiReply(fixture: BrowserFixtureSession, text: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reply = await fixture.evaluateInVoiceUi("document.querySelector('#reply')?.textContent ?? ''");
    if (typeof reply === "string" && reply.includes(text)) {
      await waitForVoiceUiIdle(fixture, timeoutMs);
      return reply;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the isolated voice UI did not show the expected fixed response");
}

async function waitForVoiceUiReplyChange(
  fixture: BrowserFixtureSession,
  previous: string,
  timeoutMs = 60_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reply = await currentVoiceUiReply(fixture);
    if (reply !== "" && reply !== previous && reply !== "One moment.") {
      await waitForVoiceUiIdle(fixture, timeoutMs);
      return reply;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the isolated voice UI did not produce a new reply");
}

async function waitForVoiceUiSubmitResult(fixture: BrowserFixtureSession, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reply = await currentVoiceUiReply(fixture);
    if (/page confirms|local submit observed/iu.test(reply)) {
      await waitForVoiceUiIdle(fixture, timeoutMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the synthetic submit did not receive its final voice result");
}

async function waitForVoiceUiConfirmation(fixture: BrowserFixtureSession, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const armed = await fixture.evaluateInVoiceUi("document.querySelector('#confirmation')?.hidden === false");
    if (armed === true) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function waitForNewRepairCacheHit(diagnostics: readonly RepairDiagnostic[], previousCount: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (diagnostics.filter((diagnostic) => diagnostic.type === "repair-cache-hit").length > previousCount) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function waitForReport(fixture: BrowserFixtureSession, pagePath: string, type: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await fixture.reports(pagePath)).some((report) => report.type === type)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the synthetic survey did not record the expected local submit");
}

function countReports(reports: readonly Record<string, unknown>[], type: string): number {
  return reports.filter((report) => report["type"] === type).length;
}

describe("bounded live AGY cache prewarm for the local survey", () => {
  it.skipIf(!PREFLIGHT_ONLY)("preflights the exact synthetic survey and voice UI without an AGY dispatch", async () => {
    if (!process.env["BLIP_BROWSER"]) throw new Error("BLIP_BROWSER must name the dedicated Edge executable");
    let fixture: BrowserFixtureSession | undefined;
    const isolatedCache = await mkdtemp(path.join(tmpdir(), "blip-agy-phase05-preflight-cache-"));
    try {
      fixture = await openFixturePage(PAGE_PATH, {
        brain: "fake",
        pagePort: 7791,
        repairCacheDirectory: isolatedCache,
        dialogueRunner: true,
        voiceUi: true,
        autoCompleteSpeech: false,
      });
      await fixture.waitForReport(PAGE_PATH, "page-ready");
      const snapshot = await fixture.requestSnapshot();
      const identity = repairCacheIdentity(snapshot.url, snapshot.structuralHash);
      if (!fixture.extensionConnected() || !fixture.voiceUiConnected() ||
          snapshot.url !== PAGE_URL || snapshot.title !== "Blip Synthetic Survey" || identity === null) {
        throw new Error("the exact local survey, extension, and voice UI did not pass preflight");
      }
      await fixture.evaluateInVoiceUi(`(() => {
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: { cancel() {}, resume() {}, speak(item) { queueMicrotask(() => item.onend?.()); } },
        });
        document.querySelector('#enable-audio')?.click();
        return true;
      })()`);
      const replyBefore = await currentVoiceUiReply(fixture);
      await sendFromVoiceUi(fixture, "what's here");
      await waitForVoiceUiReplyChange(fixture, replyBefore, 15_000);
      const voiceReplyVisible = (await currentVoiceUiReply(fixture)).trim().length > 0;
      const cacheEntries = await readdir(isolatedCache);
      if (voiceReplyVisible !== true || fixture.inboundVoiceUtteranceCount() !== 1 ||
          fixture.actResults().length !== 0 || (await fixture.reports(PAGE_PATH)).some((entry) => entry.type === "demo-survey-submit") ||
          cacheEntries.length !== 0) {
        throw new Error("the no-provider survey and cache preflight did not stay side-effect free");
      }
      const report = [
        "---",
        "phase: 05-hostile-pages-real-web-and-freeze",
        `plan: ${CHECK_ID}`,
        `check: ${REVALIDATION_CHECK ? "synthetic-agy-i3-and-repair-cache" : "synthetic-demo-repair-cache"}`,
        APPROVAL_LINE,
        "authorizationBasis: user-standing-authorization-for-bounded-synthetic-checks",
        "approvalUsed: false",
        "claimConsumed: false",
        "preflightPassed: true",
        "status: ready",
        "maxSeconds: 900",
        "maxDispatches: 8",
        "---",
        "",
        "# Phase 5 AGY I3 and Repair Cache Live Check",
        "",
        "Preflight used the exact local synthetic survey, a harness-owned browser profile, the first-party voice UI, the core dialogue runner, and an isolated empty cache. The fake-brain turn completed with zero provider dispatches, acts, or submits. This report is a fresh one-use claim for the separately bounded AGY run.",
        "",
        `- Exact demo identity matched: true (${identity}).`,
        "- Extension and voice UI connected: true.",
        "- Synthetic voice turn completed: true.",
        "- Real AGY dispatches during preflight: 0.",
        "- Page acts and submits during preflight: 0.",
        "- Isolated cache remained empty: true.",
        "",
      ].join("\n");
      await writeFile(REPORT_PATH, report, { encoding: "utf8", flag: "wx" });
    } finally {
      await fixture?.close();
      await rm(isolatedCache, { recursive: true, force: true });
    }
  }, 120_000);

  it.skipIf(!ENABLED)(REVALIDATION_CHECK
    ? "revalidates AGY intent, repair cache, tracked read-back, and exact synthetic submit"
    : "repairs the exact demo identity and reloads the validated patch without another provider prompt", async () => {
    if (!process.env["BLIP_BROWSER"]) throw new Error("BLIP_BROWSER must name the dedicated Edge executable");
    await consumeFreshApproval();

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("bounded synthetic check time limit")), MAX_SECONDS * 1_000);
    const counts = { total: 0, bootstrap: 0, prompt: 0, intent: 0, repair: 0, content: 0 };
    const noToolsAgentAccepted = { intent: false, repair: false, content: false };
    const startupFailure = { intent: "none", repair: "none", content: "none" };
    let intentPromptDispatches = 0;
    let stage: Stage = "startup";
    let passed = false;
    let exactDemoIdentity = false;
    let identity: string | null = null;
    let repairedLabelCount = 0;
    const repairStatusTrace: Array<"baseline" | "pending" | "repaired" | "failed"> = [];
    const repairDiagnostics: RepairDiagnostic[] = [];
    let cacheFilePresent = false;
    let cacheFileUpdated = false;
    let reloadedFromCache = false;
    let dispatchesUnchangedOnCacheReload = false;
    let extensionConnected = false;
    let voiceConnected = false;
    let agyIntentTurnCompleted = false;
    let trackedReadbackObserved = false;
    let exactConfirmationAccepted = false;
    let submitCount = 0;
    let userUtteranceCount = 0;
    let fixture: BrowserFixtureSession | undefined;
    let freshCacheDirectory: string | undefined;
    let priorCacheMtimeMs: number | null = null;

    const admitDispatch = (role: AgyRole, kind: "bootstrap" | "prompt"): void => {
      if (role === "content") {
        controller.abort(new Error("content role is outside the Phase 5 live check"));
        throw new Error("content role is outside the Phase 5 live check");
      }
      if (controller.signal.aborted || counts.total >= MAX_DISPATCHES) {
        controller.abort(new Error("bounded synthetic check dispatch cap reached"));
        throw new Error("bounded synthetic check dispatch cap reached");
      }
      counts.total += 1;
      counts[kind] += 1;
      counts[role] += 1;
      if (role === "intent" && kind === "prompt") intentPromptDispatches += 1;
    };

    const report = async (status: ReportData["status"]): Promise<void> => {
      await writeFile(REPORT_PATH, renderReport({
        status,
        approvalUsed: true,
        stage,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        dispatches: { ...counts },
        noToolsAgentAccepted: { ...noToolsAgentAccepted },
        startupFailure: { ...startupFailure },
        extensionConnected,
        voiceConnected,
        exactDemoIdentity,
        cacheIdentitySha256: identity,
        repairedLabelCount,
        repairStatus: fixture?.model()?.repairStatus ?? "unknown",
        repairStatusTrace: [...repairStatusTrace],
        repairDiagnostics: [...repairDiagnostics],
        pageChangedCount: fixture?.pageChangedCount() ?? 0,
        cacheFilePresent,
        cacheRefreshForced: LAUNCHER_CACHE_REFRESH_CHECK,
        cacheFileUpdated,
        reloadedFromCache,
        dispatchesUnchangedOnCacheReload,
        agyIntentTurnCompleted,
        trackedReadbackObserved,
        exactConfirmationAccepted,
        submitCount,
        userUtteranceCount,
      }), "utf8");
    };

    try {
      if (REVALIDATION_CHECK) {
        freshCacheDirectory = await mkdtemp(path.join(tmpdir(), "blip-agy-phase05-cache-"));
      }
      if (!REVALIDATION_CHECK) {
        try {
          priorCacheMtimeMs = (await stat(path.join(CACHE_DIRECTORY, `${EXPECTED_DEMO_IDENTITY}.json`))).mtimeMs;
        } catch {
          priorCacheMtimeMs = null;
        }
      }
      fixture = await openFixturePage(PAGE_PATH, {
        brain: "agy",
        pagePort: 7791,
        repairCacheDirectory: freshCacheDirectory ?? CACHE_DIRECTORY,
        onRepairDiagnostic: (diagnostic) => repairDiagnostics.push(diagnostic),
        ...(LAUNCHER_CACHE_REFRESH_CHECK ? { forceRepairCacheRefreshIdentity: EXPECTED_DEMO_IDENTITY } : {}),
        ...(REVALIDATION_CHECK ? { dialogueRunner: true, voiceUi: true, autoCompleteSpeech: false } : {}),
        agySessionHooks: {
          startupSignal: controller.signal,
          beforeBootstrapDispatch: (role) => admitDispatch(role, "bootstrap"),
          beforePromptDispatch: (role) => admitDispatch(role, "prompt"),
          onStartupDiagnostic: (diagnostic) => noToolsAgentObserver(diagnostic, noToolsAgentAccepted, startupFailure),
        },
      });
      stage = "survey";
      await fixture.waitForReport(PAGE_PATH, "page-ready");
      await waitForInitialPageStable(fixture);
      const initial = fixture.model();
      identity = initial === null ? null : repairCacheIdentity(initial.url, initial.structuralHash);
      exactDemoIdentity = initial?.url === PAGE_URL && identity === EXPECTED_DEMO_IDENTITY;
      if (!exactDemoIdentity || identity === null) throw new Error("the accepted page was not the exact local demo identity");

      if (REVALIDATION_CHECK) {
        await fixture.evaluateInVoiceUi(`(() => {
          window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
          Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            value: { cancel() {}, resume() {}, speak(item) { queueMicrotask(() => item.onend?.()); } },
          });
          document.querySelector('#enable-audio')?.click();
          return true;
        })()`);
        const sendSynthetic = async (text: string) => {
          if (userUtteranceCount >= 8) throw new Error("the synthetic voice utterance limit was reached");
          userUtteranceCount += 1;
          await sendFromVoiceUi(fixture!, text);
        };
        const firstReply = await currentVoiceUiReply(fixture);
        await sendSynthetic("what's here");
        await waitForVoiceUiReplyChange(fixture, firstReply);
      } else {
        await fixture.voiceClient.sendUtterance("what's here");
      }
      stage = "repair";
      const repaired = await waitForRepair(fixture, 60_000, repairStatusTrace);
      repairedLabelCount = repaired.modelLabelCount;
      if (repairedLabelCount < 1) throw new Error("the repair did not apply a model-sourced field label");
      const cacheEntryPath = path.join(freshCacheDirectory ?? CACHE_DIRECTORY, `${identity}.json`);
      await access(cacheEntryPath);
      cacheFilePresent = true;
      const cacheEntryStat = await stat(cacheEntryPath);
      cacheFileUpdated = priorCacheMtimeMs === null || cacheEntryStat.mtimeMs > priorCacheMtimeMs;
      if (LAUNCHER_CACHE_REFRESH_CHECK && (!cacheFileUpdated || !repairDiagnostics.some((diagnostic) => diagnostic.type === "repair-applied"))) {
        throw new Error("AGY did not replace the launcher cache entry with a fresh validated repair");
      }

      stage = "cache-reuse";
      const promptsBeforeReload = counts.prompt;
      const cacheHitsBeforeReload = LAUNCHER_CACHE_REFRESH_CHECK || REVALIDATION_CHECK
        ? repairDiagnostics.filter((diagnostic) => diagnostic.type === "repair-cache-hit").length
        : -1;
      if (LAUNCHER_CACHE_REFRESH_CHECK || CHECK_ID === "05-28") await fixture.requestSnapshot();
      if (REVALIDATION_CHECK) {
        const sendSynthetic = async (text: string) => {
          if (userUtteranceCount >= 8) throw new Error("the synthetic voice utterance limit was reached");
          userUtteranceCount += 1;
          await sendFromVoiceUi(fixture!, text);
        };
        const replyBeforeCacheCheck = await currentVoiceUiReply(fixture);
        await sendSynthetic("read the form");
        await waitForVoiceUiReplyChange(fixture, replyBeforeCacheCheck);
      } else {
        await fixture.voiceClient.sendUtterance("what's here");
      }
      const reloaded = await waitForRepair(fixture, 10_000);
      reloadedFromCache = reloaded.modelLabelCount > 0 &&
        await waitForNewRepairCacheHit(repairDiagnostics, cacheHitsBeforeReload);
      await new Promise((resolve) => setTimeout(resolve, 300));
      dispatchesUnchangedOnCacheReload = counts.prompt === promptsBeforeReload;
      if (!reloadedFromCache || !dispatchesUnchangedOnCacheReload) {
        throw new Error("the exact demo cache entry was not reused without a provider prompt");
      }

      if (REVALIDATION_CHECK) {
        const sendSynthetic = async (text: string) => {
          if (userUtteranceCount >= 8) throw new Error("the synthetic voice utterance limit was reached");
          userUtteranceCount += 1;
          await sendFromVoiceUi(fixture!, text);
        };
        stage = "agy-intent";
        const freeform = "Please tell me what details this community survey asks me to provide.";
        const intentPromptsBefore = intentPromptDispatches;
        const replyBeforeIntent = await currentVoiceUiReply(fixture);
        await sendSynthetic(freeform);
        await waitForVoiceUiReplyChange(fixture, replyBeforeIntent);
        agyIntentTurnCompleted = intentPromptDispatches > intentPromptsBefore;
        if (!agyIntentTurnCompleted) throw new Error("the free-form turn did not reach AGY");

        stage = "fill";
        await sendSynthetic("fill Name with Grace Example");
        await waitForVoiceUiReply(fixture, "is now Grace Example.");
        await sendSynthetic("fill Email with grace@example.invalid");
        await waitForVoiceUiReply(fixture, "is now grace@example.invalid.");
        const repairedLabels = fixture.model()?.fieldLabels ?? [];
        const nameLabel = repairedLabels.find((label) => /\bname\b/iu.test(label));
        const emailLabel = repairedLabels.find((label) => /\bemail\b/iu.test(label));
        if (nameLabel === undefined || emailLabel === undefined ||
            fixture.sessionField(nameLabel)?.value !== "Grace Example" ||
            fixture.sessionField(emailLabel)?.value !== "grace@example.invalid") {
          throw new Error("the fictional survey fields were not read back from the accepted model");
        }

        stage = "readback";
        const actsBeforeSubmit = fixture.actResults().length;
        const replyBeforeReadback = await currentVoiceUiReply(fixture);
        await sendSynthetic("submit survey");
        const readbackReply = await waitForVoiceUiReplyChange(fixture, replyBeforeReadback);
        if (!readbackReply.includes("Reading back")) throw new Error("the tracked read-back response did not arrive");
        const armed = await waitForVoiceUiConfirmation(fixture);
        trackedReadbackObserved = armed && fixture.actResults().length === actsBeforeSubmit;
        if (!trackedReadbackObserved) throw new Error("the voice UI did not arm after its tracked read-back");

        stage = "submit";
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        await sendSynthetic("submit survey");
        await waitForReport(fixture, PAGE_PATH, "demo-survey-submit");
        await waitForVoiceUiSubmitResult(fixture);
        const surveyReports = await fixture.reports(PAGE_PATH);
        submitCount = countReports(surveyReports, "demo-survey-submit");
        const newActs = fixture.actResults().slice(actsBeforeSubmit);
        exactConfirmationAccepted = submitCount === 1 && newActs.length === 1 &&
          newActs[0]?.ok === true && newActs[0].liveKind === "submit";
        if (!exactConfirmationAccepted) throw new Error("the exact phrase did not produce exactly one local submit");
        const localStatus = await fixture.evaluateInPage("document.querySelector('#form-status')?.textContent ?? ''");
        if (localStatus !== "Local submit observed. No data was sent.") {
          throw new Error("the local survey did not display its non-network submit result");
        }
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
      if (freshCacheDirectory !== undefined) await rm(freshCacheDirectory, { recursive: true, force: true });
      if (passed) {
        process.stdout.write(`BLIP_PHASE05_AGY_REVALIDATION=PASS dispatches=${counts.total}/${MAX_DISPATCHES} repaired-labels=${repairedLabelCount} cache-reused=${reloadedFromCache} i3=${exactConfirmationAccepted}\n`);
      }
    }
  }, MAX_SECONDS * 1_000 + 30_000);
});
