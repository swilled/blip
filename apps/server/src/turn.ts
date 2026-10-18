// One utterance, start to finish: transcript, routing, snapshot fetch, reply, state pushes (D-23, D-24).
// The fake and (later) real brain can only produce an Intent. Ungated Intents enter the established
// field action path; gated Intents enter the deterministic Executor and never authorize themselves.
import { newId, type Intent, type Message, type PayloadOf, type SpeakDonePayload } from "@blip/protocol";
import type { BrowserOperation, BrowserPageIdentity, BrowserContentBlock, BrowserResultPayload } from "@blip/protocol";
import type { IntentBrain } from "./brain/fake-brain";
import { matchGrammar, type LocalCommand } from "./brain/grammar";
import { matchFieldPhrase, resolveFieldPhrase, safePhraseForBrain, safePhraseForTranscript } from "./brain/phrases";
import { containsSensitivePageText, containsSensitiveUtterance, decideUtteranceForBrain } from "./brain/agy/privacy";
import { projectExplicitPageContentRequest } from "./brain/agy/content-projection";
import { classifySensitiveShape } from "@blip/policy/sensitive-shapes";
import { routeIntent, type IntentRoutePage } from "./brain/agy/intent-router";
import type { AgyProvider } from "./brain/agy/provider";
import type { Snapshot } from "@blip/protocol";
import { executeUngated } from "./act/ungated";
import { executeGatedAction, type GatedCommand } from "./act/gated";
import { createVoiceGateAdapter } from "./act/voice-gate-adapter";
import { formatResultErrors, interpretCurrentErrors } from "./results/interpret";
import type { Hub } from "./hub/hub";
import { describeReply, readFormReply, requiredReply } from "./reply";
import type { Refresher } from "./session/refresh";
import type { Session } from "./session/session";
import { parseBrowserCommand, type BrowserCapture, type BrowserCommand } from "./browser/commands";
import { createBrowserExecutor, type BrowserExecutorResult } from "./browser/executor";
import { BROWSER_AUTHORIZATION_GUARD_MS, BROWSER_AUTHORIZATION_TTL_MS, type BrowserAuthorizationTarget } from "./browser/authorization";

export type TurnContext = {
  message: Message;
  hub: Hub;
  session: Session;
  /** Maximum cached-model age for intents that explicitly read all field values. */
  freshnessMs: number;
  /** Shared page-change and read-intent snapshot path. */
  refresher: Refresher;
  /** Resolves model-routed utterances to an Intent (the fake brain in Phase 1). */
  brain: IntentBrain;
  /** Present only in Agy mode; the raw `IntentBrain` seam remains fake-only. */
  agyProvider?: AgyProvider;
  /** Injected only for deterministic cooldown/grant tests; production uses the process clock. */
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  /** Injectable watchdog clock; the provider call remains bounded in production too. */
  intentWatchdog?: { schedule(callback: () => void, delayMs: number): unknown; cancel(handle: unknown): void };
  /** The dialogue reducer owns gated requests; model output cannot start a parallel gate flow. */
  dialogueManaged?: boolean;
};

type SpeakCategory = PayloadOf<"speak">["category"];

export const MSG_NO_EXTENSION = "I can't see the page because the browser extension is not connected.";
export const MSG_READ_FAILED = "I couldn't read the page.";
export const MSG_NOT_YET = "I can't do that yet.";
export const MSG_NOTHING_TO_REPEAT = "There's nothing to repeat.";
export const MSG_STOPPED = "Stopped.";
export const MSG_UNKNOWN = "I didn't understand that.";
export const MSG_BRAIN_FAILED = "Something went wrong on my side.";
export const MSG_MODEL_FAILED = "I couldn't understand that";
export const MSG_FILLER = "One moment.";
const MSG_FIELD_PHRASE_TOO_LONG = "That value is too long to fill.";
const MSG_NO_CURRENT_ERRORS = "There are no errors currently detected.";
const INTENT_WATCHDOG_MS = 4_000;
const PAGE_CONTENT_WATCHDOG_MS = 4_000;

const intentRecoveries = new WeakMap<AgyProvider, Promise<void>>();
const contentRecoveries = new WeakMap<AgyProvider, Promise<void>>();

function startIntentRoleRecovery(provider: AgyProvider): Promise<void> {
  const pending = intentRecoveries.get(provider);
  if (pending !== undefined) return pending;
  const recovery = Promise.resolve()
    .then(() => provider.abortRole("intent"))
    .catch(() => {})
    .then(() => provider.recreateRole("intent"));
  intentRecoveries.set(provider, recovery);
  void recovery.finally(() => {
    if (intentRecoveries.get(provider) === recovery) intentRecoveries.delete(provider);
  }).catch(() => {});
  return recovery;
}

async function waitForIntentRecovery(provider: AgyProvider): Promise<void> {
  await intentRecoveries.get(provider);
}

function startContentRoleRecovery(provider: AgyProvider): Promise<void> {
  const pending = contentRecoveries.get(provider);
  if (pending !== undefined) return pending;
  const recovery = Promise.resolve()
    .then(() => provider.abortRole("content"))
    .catch(() => {})
    .then(() => provider.recreateRole("content"));
  contentRecoveries.set(provider, recovery);
  void recovery.finally(() => {
    if (contentRecoveries.get(provider) === recovery) contentRecoveries.delete(provider);
  }).catch(() => {});
  return recovery;
}

async function waitForContentRecovery(provider: AgyProvider): Promise<void> {
  await contentRecoveries.get(provider);
}

type SpeakOptions = { interrupt?: boolean; record?: boolean };

function speak(hub: Hub, session: Session, text: string, category: SpeakCategory, opts: SpeakOptions = {}): void {
  // Filler is never repeated, and "repeat"/"stop" must not overwrite what the user wants repeated.
  const speakId = newId();
  if (!hub.send("voice", "speak", { speakId, text, category, interrupt: opts.interrupt === true })) return;
  session.trackSpeech(speakId, category);
  if (category !== "filler" && opts.record !== false) session.lastSpoken = text;
}

function speakTracked(hub: Hub, session: Session, text: string, category: SpeakCategory, opts: SpeakOptions = {}): string | null {
  const speakId = newId();
  if (!hub.send("voice", "speak", { speakId, text, category, interrupt: opts.interrupt === true })) return null;
  session.trackSpeech(speakId, category);
  if (category !== "filler" && opts.record !== false) session.lastSpoken = text;
  return speakId;
}

const MSG_BROWSER_NO_EXTENSION = "I can't reach the browser extension, so nothing was done.";
const MSG_BROWSER_READ_FAILED = "I couldn't safely read the current browser page.";
const MSG_BROWSER_AUTH_REFUSED = "That browser confirmation was not accepted. Nothing was done.";
const MSG_BROWSER_AUTH_EXPIRED = "That browser confirmation expired. Nothing was done.";
const MSG_BROWSER_AUTH_PAGE_CHANGED = "The browser page changed. Nothing was done; please ask again.";
const MSG_SITE_SEARCH_FIELD = "I couldn't uniquely identify a visible search field and submit action on this page, so nothing was submitted.";
const MSG_SITE_SEARCH_VALUE = "I couldn't verify the search query in the field, so nothing was submitted.";
const MSG_PRIVATE_PAGE_CONTENT = "I found page content that may contain private information, so I didn't read it aloud.";

function browserFailureText(result: BrowserExecutorResult): string {
  if (!result.ok) {
    switch (result.reason) {
      case "no-extension": return MSG_BROWSER_NO_EXTENSION;
      case "no-current-tab": return "There is no current browser tab to use.";
      case "invalid-request": return "That browser request could not be validated.";
      case "invalid-result": return MSG_BROWSER_READ_FAILED;
      case "request-failed": return "The browser did not complete that request.";
    }
  }
  if (!result.payload.ok) {
    switch (result.payload.error.code) {
      case "restricted-page": return "The browser page is restricted, so I can't read or control it.";
      case "unsupported-page": return "This page does not support that browser operation.";
      case "stale-page":
      case "stale-capture": return MSG_BROWSER_AUTH_PAGE_CHANGED;
      case "unsupported-frame": return "This browser frame does not support safe page reading.";
      case "not-found": return "I couldn't find that target on the current page.";
      case "ambiguous": return "More than one target matches. Please say a more specific target.";
      case "unauthorized": return MSG_BROWSER_AUTH_REFUSED;
      case "invalid-target": return "That browser target could not be used safely.";
      case "timeout": return "The browser request timed out.";
      case "unavailable": return "That browser feature is unavailable.";
      case "exception": return "The browser could not complete that operation.";
    }
  }
  return MSG_BROWSER_READ_FAILED;
}

function speakBrowserFailure(ctx: TurnContext, result: BrowserExecutorResult): void {
  speak(ctx.hub, ctx.session, browserFailureText(result), "error");
}

function identityMatches(left: BrowserPageIdentity, right: BrowserPageIdentity): boolean {
  return left.captureId === right.captureId && left.captureRevision === right.captureRevision &&
    left.tabId === right.tabId && left.pageUrl === right.pageUrl;
}

function idleDialogue(session: Session): "ready" | "no-page" {
  return session.model !== null && session.extensionConnected && !session.stale ? "ready" : "no-page";
}

function commandCapture(session: Session): BrowserCapture | null {
  const current = session.browserCapture;
  if (current !== null) return current;
  return null;
}

function speakLinks(ctx: TurnContext, result: Extract<BrowserResultPayload, { ok: true; operation: "list-links" }> | undefined): void {
  if (result === undefined) return speak(ctx.hub, ctx.session, "I couldn't safely read the current links.", "error");
  if (result.result.status === "restricted") return speak(ctx.hub, ctx.session, "This page does not expose readable links.", "answer");
  if (result.result.links.length === 0) return speak(ctx.hub, ctx.session, "I couldn't find any visible links on this page.", "answer");
  const links = result.result.links.slice(0, 12).map((link, index) =>
    `${index + 1}. ${link.label}${link.hostHint === null ? "" : `, ${link.hostHint}`}.`,
  );
  speak(ctx.hub, ctx.session, `I found ${result.result.links.length} visible links. ${links.join(" ")} Say the link label you want to open.`, "answer");
}

function speakContent(ctx: TurnContext, blocks: BrowserContentBlock[], mode: "read" | "summary" | "question", query?: string): void {
  const privateBlocks = blocks.filter((block) =>
    containsSensitiveUtterance(block.text) || classifySensitiveShape(block.text) !== null,
  );
  const safeBlocks = blocks.filter((block) => !privateBlocks.includes(block));
  const safeQuery = query !== undefined && containsSensitiveUtterance(query) ? "that text" : query;
  if (safeBlocks.length === 0) {
    return speak(ctx.hub, ctx.session, privateBlocks.length > 0 ? MSG_PRIVATE_PAGE_CONTENT : "I couldn't find readable page content.", "answer");
  }
  if (mode === "question") {
    const matches = safeBlocks.filter((block) => block.kind === "paragraph" && block.text.toLocaleLowerCase().includes(query!.toLocaleLowerCase()));
    if (matches.length === 0) return speak(ctx.hub, ctx.session, "I couldn't find page text about " + safeQuery + ".", "answer");
    return speak(ctx.hub, ctx.session, "I found this page text about " + safeQuery + ": " + matches.slice(0, 2).map((block) => block.text).join(" ") + (privateBlocks.length > 0 ? " " + MSG_PRIVATE_PAGE_CONTENT : ""), "answer");
  }
  if (mode === "summary") {
    const heading = safeBlocks.find((block) => block.kind === "heading")?.text;
    const paragraphs = safeBlocks.filter((block) => block.kind === "paragraph").slice(0, 2).map((block) => block.text);
    const parts = [heading, ...paragraphs].filter((part): part is string => part !== undefined && part !== "");
    return speak(ctx.hub, ctx.session, parts.length === 0 ? "I couldn't find a readable page summary." : "Page summary. " + parts.join(" ") + (privateBlocks.length > 0 ? " " + MSG_PRIVATE_PAGE_CONTENT : ""), "answer");
  }
  speak(ctx.hub, ctx.session, safeBlocks.map((block) => block.text).join(" ") + (privateBlocks.length > 0 ? " " + MSG_PRIVATE_PAGE_CONTENT : ""), "answer");
}

async function answerExplicitPageContent(
  ctx: TurnContext,
  command: Extract<BrowserCommand, { type: "summary" | "question" }>,
  blocks: BrowserContentBlock[],
  identity: BrowserPageIdentity,
): Promise<void> {
  const provider = ctx.agyProvider;
  if (provider === undefined) {
    return speakContent(ctx, blocks, command.type === "summary" ? "summary" : "question", command.type === "question" ? command.query : undefined);
  }
  const request = command.type === "summary"
    ? { type: "summary" as const, identity }
    : { type: "page-question" as const, identity, question: command.query };
  const projection = projectExplicitPageContentRequest(request, blocks, identity);
  const current = ctx.session.browserCapture?.identity;
  if (projection === null) {
    return speak(ctx.hub, ctx.session, "I couldn't safely prepare an answer from the current page. Please ask again.", "error");
  }
  if (current === undefined || !identityMatches(current, projection.identity)) {
    return speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");
  }

  ctx.hub.send("voice", "earcon", { name: "thinking" });
  speak(ctx.hub, ctx.session, MSG_FILLER, "filler");
  let timer: unknown;
  let settled = false;
  let rejectTimeout!: (error: Error) => void;
  let controller: AbortController | undefined;
  const watchdog = ctx.intentWatchdog ?? {
    schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });

  try {
    await waitForContentRecovery(provider);
    controller = new AbortController();
    timer = watchdog.schedule(() => {
      if (settled) return;
      controller?.abort(new Error("Agy page-content watchdog expired."));
      void startContentRoleRecovery(provider).catch(() => {});
      rejectTimeout(new Error("Agy page-content watchdog expired."));
    }, PAGE_CONTENT_WATCHDOG_MS);
    const answer = await Promise.race([provider.answerPageQuestion(projection, controller.signal), timeout]);
    settled = true;
    const latest = ctx.session.browserCapture?.identity;
    if (latest === undefined || !identityMatches(latest, projection.identity)) {
      return speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");
    }
    if (containsSensitivePageText(answer)) {
      return speak(ctx.hub, ctx.session, MSG_PRIVATE_PAGE_CONTENT, "error");
    }
    const incompleteNotice = projection.incomplete ? "I could read only part of the visible page. " : "";
    speak(ctx.hub, ctx.session, incompleteNotice + answer.trim(), "answer");
  } catch {
    settled = true;
    speak(ctx.hub, ctx.session, "I couldn't safely answer about the current page. Please ask again.", "error");
  } finally {
    if (timer !== undefined) watchdog.cancel(timer);
  }
}

function authorizedPhrase(target: BrowserAuthorizationTarget, command?: BrowserCommand): string {
  switch (target.op) {
    case "navigate": return `open ${new URL(target.url).host.toLocaleLowerCase()}`;
    case "search": return `search for ${target.query} with browser default search`;
    case "open-link": {
      const host = command?.type === "open-link" ? command.hostHint : null;
      return host === null ? `open link ${command?.type === "open-link" ? command.label : target.linkId}` : `open ${host.toLocaleLowerCase()}`;
    }
  }
}

function authorizedPrompt(target: BrowserAuthorizationTarget, command?: BrowserCommand): string {
  const phrase = authorizedPhrase(target, command);
  if (target.op === "navigate") return `To open ${new URL(target.url).host.toLocaleLowerCase()}, say: ${phrase}.`;
  if (target.op === "search") return `To search for ${target.query} with browser default search, say: ${phrase}.`;
  const label = command?.type === "open-link" ? command.label : target.linkId;
  const host = command?.type === "open-link" ? command.hostHint : null;
  return `To open the visible link ${label}${host === null ? "" : ` at ${host}`}, say: ${phrase}.`;
}

type BrowserLifecycleContext = Pick<TurnContext, "hub" | "session" | "clock" | "schedule">;

function scheduleBrowserAuthorizationExpiry(ctx: BrowserLifecycleContext, authorizationId: string, expiresAt: number): void {
  const schedule = ctx.schedule ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const clock = ctx.clock ?? Date.now;
  let now: number;
  try { now = clock(); } catch { now = Number.NaN; }
  const delay = Math.max(1, expiresAt - (Number.isFinite(now) ? now : Date.now()));
  schedule(() => {
    const pending = ctx.session.pendingBrowserAuthorization;
    if (pending === null || pending.authorizationId !== authorizationId) return;
    let now: number;
    try { now = clock(); } catch { now = Number.NaN; }
    if (!Number.isFinite(now) || now >= expiresAt) {
      ctx.session.clearBrowserAuthorization();
      ctx.session.dialogue = idleDialogue(ctx.session);
      speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_EXPIRED, "error");
      ctx.hub.pushState();
    } else {
      scheduleBrowserAuthorizationExpiry(ctx, authorizationId, expiresAt);
    }
  }, delay);
}

function scheduleBrowserAuthorizationArm(ctx: BrowserLifecycleContext, authorizationId: string, readyAt: number): void {
  const schedule = ctx.schedule ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const clock = ctx.clock ?? Date.now;
  const pending = ctx.session.pendingBrowserAuthorization;
  if (pending === null || pending.authorizationId !== authorizationId) return;
  let now: number;
  try { now = clock(); } catch { now = Number.NaN; }
  if (!Number.isFinite(now) || now >= pending.expiresAt) {
    ctx.session.clearBrowserAuthorization();
    ctx.session.dialogue = idleDialogue(ctx.session);
    speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_EXPIRED, "error");
    ctx.hub.pushState();
    return;
  }
  if (now < readyAt) {
    schedule(() => scheduleBrowserAuthorizationArm(ctx, authorizationId, readyAt), Math.max(1, readyAt - now));
    return;
  }
  if (ctx.session.browserAuthorizations.arm(now)) {
    ctx.session.dialogue = "awaiting-confirm";
    ctx.hub.pushState();
  }
}

/** Accept only the tracked browser read-back completion and arm after the one-second guard. */
export function handleBrowserSpeakDone(ctx: BrowserLifecycleContext, payload: SpeakDonePayload): boolean {
  const pending = ctx.session.pendingBrowserAuthorization;
  if (pending === null || pending.readbackSpeakId !== payload.speakId) return false;
  if (pending.speechCompletedAt !== null) return true;
  let now: number;
  try { now = (ctx.clock ?? Date.now)(); } catch { now = Number.NaN; }
  if (!Number.isFinite(now)) {
    ctx.session.clearBrowserAuthorization();
    ctx.session.dialogue = idleDialogue(ctx.session);
    speak(ctx.hub, ctx.session, MSG_BROWSER_READ_FAILED, "error");
    ctx.hub.pushState();
    return true;
  }
  if (!ctx.session.completeSpeech(payload.speakId, payload.interrupted, now)) {
    ctx.session.clearBrowserAuthorization();
    ctx.session.dialogue = idleDialogue(ctx.session);
    speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_REFUSED, "error");
    ctx.hub.pushState();
    return true;
  }
  if (!ctx.session.browserAuthorizations.completeSpeech(payload.speakId, payload.interrupted, now)) {
    ctx.session.dialogue = idleDialogue(ctx.session);
    if (payload.interrupted) speak(ctx.hub, ctx.session, "The browser confirmation read-back was interrupted. Nothing was done.", "error");
    ctx.hub.pushState();
    return true;
  }
  const readyAt = ctx.session.pendingBrowserAuthorization?.readyAt;
  if (readyAt !== null && readyAt !== undefined) scheduleBrowserAuthorizationArm(ctx, pending.authorizationId, readyAt);
  return true;
}

async function beginBrowserAuthorization(
  ctx: TurnContext,
  target: BrowserAuthorizationTarget,
  command?: BrowserCommand,
): Promise<void> {
  const { session } = ctx;
  if (session.pendingGatedAction !== null) return speak(ctx.hub, session, "Please finish or cancel the current form confirmation first.", "error");
  if (session.outputMode !== "agent-voice") return speak(ctx.hub, session, "I can't verify the browser confirmation read-back in the current output mode. Nothing was done.", "error");
  const executor = createBrowserExecutor({ hub: ctx.hub, session });
  const captured = await executor.execute({ op: "capture" });
  if (!captured.ok || !captured.payload.ok || captured.payload.operation !== "capture") return speakBrowserFailure(ctx, captured);
  const identity = captured.payload.result;
  if (target.op === "open-link" && !identityMatches(target.identity, identity)) {
    return speak(ctx.hub, session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");
  }
  if (identity.status !== "supported" && target.op === "open-link") return speak(ctx.hub, session, "This page does not expose links that can be opened.", "error");
  if (session.tabId !== null && session.tabId !== identity.tabId) return speak(ctx.hub, session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");
  if (!session.stale && session.model !== null && session.model.url !== identity.pageUrl) return speak(ctx.hub, session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");

  let now: number;
  try { now = (ctx.clock ?? Date.now)(); } catch { now = Number.NaN; }
  if (!Number.isFinite(now)) return speak(ctx.hub, session, MSG_BROWSER_READ_FAILED, "error");
  const prompt = authorizedPrompt(target, command);
  const phrase = authorizedPhrase(target, command);
  const speakId = speakTracked(ctx.hub, session, prompt, "confirm-prompt", { interrupt: true });
  if (speakId === null) return;
  const authorization = session.browserAuthorizations.begin({
    target,
    sourcePageIdentity: identity,
    readbackSpeakId: speakId,
    phrase,
    now,
  });
  if (authorization === null) {
    session.clearBrowserAuthorization();
    return speak(ctx.hub, session, MSG_BROWSER_READ_FAILED, "error");
  }
  session.dialogue = "awaiting-confirm";
  scheduleBrowserAuthorizationExpiry(ctx, authorization.authorizationId, authorization.expiresAt);
  ctx.hub.pushState();
}

function matchesSearchField(snapshot: Snapshot, model: NonNullable<Session["model"]>): Array<NonNullable<Session["model"]>["fields"][number]> {
  const visibleFields = new Set(snapshot.elements.filter((element) => element.category === "field" && element.visible).map((element) => element.id));
  return model.fields.filter((field) => {
    if (!visibleFields.has(field.id) || field.disabled || field.sensitive !== "none") return false;
    if (!["text", "email", "url", "textarea"].includes(field.type)) return false;
    return /search/iu.test([field.label, field.role, field.autocomplete ?? ""].join(" "));
  });
}

async function trySiteSearch(ctx: TurnContext, query: string, forced: boolean): Promise<"submitted" | "not-site-search" | "refused"> {
  const captured = await captureIntentPage(ctx);
  if (!captured.ok) {
    speak(ctx.hub, ctx.session, captured.reply, "error");
    return "refused";
  }
  const fields = matchesSearchField(captured.snapshot, captured.model);
  if (fields.length === 0) return forced ? (speak(ctx.hub, ctx.session, MSG_SITE_SEARCH_FIELD, "error"), "refused") : "not-site-search";
  if (fields.length !== 1) {
    speak(ctx.hub, ctx.session, "More than one visible search field matches. Nothing was submitted.", "error");
    return "refused";
  }
  const submitActions = captured.model.actions.filter((action) => action.kind === "submit");
  if (submitActions.length !== 1) {
    speak(ctx.hub, ctx.session, MSG_SITE_SEARCH_FIELD, "error");
    return "refused";
  }
  const field = fields[0]!;
  const fill = await executeUngated(ctx, { type: "set_fields", fills: [{ fieldId: field.id, value: query }] });
  if (fill.category === "error") {
    speak(ctx.hub, ctx.session, fill.text, "error");
    return "refused";
  }
  const observed = ctx.session.model?.fields.find((candidate) => candidate.id === field.id);
  if (observed === undefined || observed.value !== query || !observed.hasValue) {
    speak(ctx.hub, ctx.session, MSG_SITE_SEARCH_VALUE, "error");
    return "refused";
  }
  // The existing form Executor owns the tracked full-form read-back and exact submit phrase.
  await createVoiceGateAdapter(ctx).arm({ actionId: submitActions[0]!.id });
  return "submitted";
}

function speakBrowserResult(ctx: TurnContext, payload: BrowserResultPayload, command: BrowserCommand): void {
  if (!payload.ok) return speak(ctx.hub, ctx.session, browserFailureText({ ok: true, payload }), "error");
  switch (payload.operation) {
    case "location": {
      const url = new URL(payload.result.pageUrl);
      return speak(ctx.hub, ctx.session, payload.result.status === "restricted"
        ? `You are on a restricted browser page at ${url.host || url.protocol}.`
        : `You are on ${payload.result.title || url.host}.`, "answer");
    }
    case "capture":
      if (payload.result.status === "restricted") return speak(ctx.hub, ctx.session, "This page is restricted and does not expose readable content.", "answer");
      if (payload.result.status === "empty") return speak(ctx.hub, ctx.session, "I couldn't find readable page content.", "answer");
      if (payload.result.status === "timeout") return speak(ctx.hub, ctx.session, "Page content took too long to read.", "error");
      if (payload.result.status === "capture-failed") return speak(ctx.hub, ctx.session, MSG_BROWSER_READ_FAILED, "error");
      return speakContent(ctx, payload.result.blocks, command.type === "summary" ? "summary" : command.type === "question" ? "question" : "read", command.type === "question" ? command.query : undefined);
    case "list-links": return speakLinks(ctx, payload);
    case "tabs": {
      if (command.type === "open-blank") return speak(ctx.hub, ctx.session, "Opened a blank tab.", "answer");
      if (payload.result.tabs.length === 0) return speak(ctx.hub, ctx.session, "There are no browser tabs available.", "answer");
      const tabs = payload.result.tabs.slice(0, 12).map((tab, index) => `${index + 1}. ${tab.title || tab.hostHint || "Untitled tab"}.`);
      return speak(ctx.hub, ctx.session, `I found ${payload.result.tabs.length} browser tabs. ${tabs.join(" ")} Say the tab number to switch.`, "answer");
    }
    case "scroll": return speak(ctx.hub, ctx.session, payload.result.moved ? "Scrolled the page." : "The page could not scroll further in that direction.", "answer");
    case "find": return speak(ctx.hub, ctx.session, payload.result.found ? `I found ${payload.result.matchCount} matches for that text.` : "I couldn't find that text on the page.", "answer");
    case "navigate": return speak(ctx.hub, ctx.session, "Opened the requested website.", "answer");
    case "search": return speak(ctx.hub, ctx.session, "Browser-default search was submitted.", "answer");
    case "open-link": return speak(ctx.hub, ctx.session, "Opened the selected visible link.", "answer");
    case "history": return speak(ctx.hub, ctx.session, "Moved through browser history.", "answer");
    case "reload": return speak(ctx.hub, ctx.session, "Reloaded the current page.", "answer");
    case "read-content":
      if (payload.result.status === "restricted") return speak(ctx.hub, ctx.session, "This page is restricted and does not expose readable content.", "answer");
      if (payload.result.status === "empty") return speak(ctx.hub, ctx.session, "I couldn't find readable page content.", "answer");
      if (payload.result.status === "timeout") return speak(ctx.hub, ctx.session, "The selected page text took too long to read.", "error");
      if (payload.result.status === "capture-failed") return speak(ctx.hub, ctx.session, MSG_BROWSER_READ_FAILED, "error");
      return speakContent(ctx, payload.result.blocks, "read");
  }
}

async function executeAuthorizedBrowserCommand(ctx: TurnContext, auth: ReturnType<Session["browserAuthorizations"]["begin"]>): Promise<void> {
  if (auth === null) return speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_REFUSED, "error");
  let now: number;
  try { now = (ctx.clock ?? Date.now)(); } catch { now = Number.NaN; }
  const identity = ctx.session.browserCapture?.identity ?? null;
  const currentIdentityMatches = identity !== null && identity.tabId === auth.sourceTabId && identity.pageUrl === auth.sourcePageUrl;
  const consumed = ctx.session.browserAuthorizations.consume({
    phrase: ctx.message.type === "utterance" ? ctx.message.payload.text : "",
    source: ctx.message.type === "utterance" ? ctx.message.payload.source : "typed",
    tabId: ctx.session.tabId === auth.sourceTabId ? ctx.session.tabId : null,
    pageUrl: currentIdentityMatches ? identity.pageUrl : null,
    pageIdentity: currentIdentityMatches ? identity : null,
    now,
  });
  if (!consumed.ok) {
    ctx.session.dialogue = idleDialogue(ctx.session);
    ctx.hub.pushState();
    return speak(ctx.hub, ctx.session, consumed.reason === "expired" ? MSG_BROWSER_AUTH_EXPIRED :
      consumed.reason === "page-changed" || consumed.reason === "tab-changed" ? MSG_BROWSER_AUTH_PAGE_CHANGED : MSG_BROWSER_AUTH_REFUSED, "error");
  }

  const executor = createBrowserExecutor({ hub: ctx.hub, session: ctx.session });
  const target = consumed.authorization.target;
  let operation: BrowserOperation;
  switch (target.op) {
    case "navigate": operation = { ...target, authorizationId: consumed.authorization.authorizationId }; break;
    case "search": operation = { ...target, authorizationId: consumed.authorization.authorizationId }; break;
    case "open-link": operation = { ...target, authorizationId: consumed.authorization.authorizationId }; break;
  }
  const result = await executor.execute(operation);
  ctx.session.dialogue = idleDialogue(ctx.session);
  ctx.hub.pushState();
  if (!result.ok || !result.payload.ok) return speakBrowserFailure(ctx, result);
  const userCommand = target.op === "navigate"
    ? { type: "navigate", url: target.url, host: new URL(target.url).host } as const
    : target.op === "search"
      ? { type: "search", query: target.query, route: "browser-default" } as const
      : { type: "open-link", linkId: target.linkId, identity: target.identity, label: "selected link", hostHint: null } as const;
  if (target.op === "search") {
    const list = await executor.execute({ op: "list-links" });
    if (!list.ok || !list.payload.ok || list.payload.operation !== "list-links") {
      speak(ctx.hub, ctx.session, "Search was submitted. I couldn't read the visible results yet.", "answer");
      return;
    }
    speakLinks(ctx, list.payload);
    return;
  }
  speakBrowserResult(ctx, result.payload, userCommand);
}

async function runBrowserCommand(ctx: TurnContext, command: BrowserCommand, source: "voice" | "typed"): Promise<void> {
  if (command.type === "clarify") return speak(ctx.hub, ctx.session, command.question, "answer");
  if (command.type === "search") {
    if (command.route === "site" && source !== "typed") return speak(ctx.hub, ctx.session, "Use the typed site-search command to search this page.", "error");
    if (command.route !== "browser-default") {
      const site = await trySiteSearch(ctx, command.query, command.route === "site");
      if (site !== "not-site-search") return;
    }
    return beginBrowserAuthorization(ctx, { op: "search", route: "browser-default", query: command.query }, command);
  }
  if (command.type === "navigate") {
    return beginBrowserAuthorization(ctx, { op: "navigate", url: command.url }, command);
  }
  if (command.type === "open-link") {
    const current = ctx.session.browserCapture?.identity;
    if (current === undefined || !identityMatches(current, command.identity)) return speak(ctx.hub, ctx.session, MSG_BROWSER_AUTH_PAGE_CHANGED, "error");
    return beginBrowserAuthorization(ctx, { op: "open-link", linkId: command.linkId, identity: command.identity }, command);
  }

  const executor = createBrowserExecutor({ hub: ctx.hub, session: ctx.session });
  if (command.type === "read-page" || command.type === "summary" || command.type === "question") {
    if (command.type === "read-page" && command.kind !== undefined && command.target !== undefined) {
      const capture = await executor.execute({ op: "capture" });
      if (!capture.ok || !capture.payload.ok || capture.payload.operation !== "capture") return speakBrowserFailure(ctx, capture);
      const selected = capture.payload.result.blocks.filter((block) =>
        block.kind === command.kind && block.text.toLocaleLowerCase().includes(command.target!.toLocaleLowerCase()),
      );
      if (selected.length === 0) return speak(ctx.hub, ctx.session, "I couldn't find that visible page text.", "answer");
      if (selected.length > 1) return speak(ctx.hub, ctx.session, "More than one page text block matches. Please be more specific.", "answer");
      const read = await executor.execute({
        op: "read-content",
        kind: selected[0]!.kind,
        contentId: selected[0]!.contentId,
        identity: capture.payload.result,
      });
      if (!read.ok || !read.payload.ok) return speakBrowserFailure(ctx, read);
      if (read.payload.operation !== "read-content") return speak(ctx.hub, ctx.session, MSG_BROWSER_READ_FAILED, "error");
      return speakBrowserResult(ctx, read.payload, command);
    }
    const capture = await executor.execute({ op: "capture" });
    if (!capture.ok || !capture.payload.ok || capture.payload.operation !== "capture") return speakBrowserFailure(ctx, capture);
    if (capture.payload.result.status === "restricted") return speak(ctx.hub, ctx.session, "This page is restricted and does not expose readable content.", "answer");
    if (capture.payload.result.status === "timeout") return speak(ctx.hub, ctx.session, "Page content took too long to read.", "error");
    if (capture.payload.result.status === "capture-failed") return speak(ctx.hub, ctx.session, MSG_BROWSER_READ_FAILED, "error");
    if (capture.payload.result.status === "empty") return speak(ctx.hub, ctx.session, "I couldn't find readable page content.", "answer");
    if (command.type === "summary" || command.type === "question") {
      return answerExplicitPageContent(ctx, command, capture.payload.result.blocks, capture.payload.result);
    }
    return speakContent(ctx, capture.payload.result.blocks, "read");
  }

  if (command.type === "switch-tab") {
    const result = await executor.execute({ op: "tabs", action: "switch", targetTabId: command.targetTabId });
    if (!result.ok || !result.payload.ok) return speakBrowserFailure(ctx, result);
    return speak(ctx.hub, ctx.session, "Switched to the selected browser tab.", "answer");
  }
  if (command.type === "scroll-to-content") {
    const capture = await executor.execute({ op: "capture" });
    if (!capture.ok || !capture.payload.ok || capture.payload.operation !== "capture") return speakBrowserFailure(ctx, capture);
    const selected = capture.payload.result.blocks.filter((block) =>
      block.kind === command.kind && block.text.toLocaleLowerCase().includes(command.target.toLocaleLowerCase()),
    );
    if (selected.length === 0) return speak(ctx.hub, ctx.session, "I couldn't find that visible page text.", "answer");
    if (selected.length > 1) return speak(ctx.hub, ctx.session, "More than one page text block matches. Please be more specific.", "answer");
    const result = await executor.execute({
      op: "scroll",
      identity: capture.payload.result,
      contentId: selected[0]!.contentId,
      kind: selected[0]!.kind,
    });
    if (!result.ok || !result.payload.ok) return speakBrowserFailure(ctx, result);
    return speakBrowserResult(ctx, result.payload, command);
  }
  if (command.type === "scroll" || command.type === "find") {
    const capture = await executor.execute({ op: "capture" });
    if (!capture.ok || !capture.payload.ok || capture.payload.operation !== "capture") return speakBrowserFailure(ctx, capture);
    const identity = capture.payload.result;
    const operation: BrowserOperation = command.type === "scroll"
      ? { op: "scroll", identity, direction: command.direction, pixels: command.pixels }
      : { op: "find", identity, query: command.query };
    const result = await executor.execute(operation);
    if (!result.ok || !result.payload.ok) return speakBrowserFailure(ctx, result);
    return speakBrowserResult(ctx, result.payload, command);
  }
  let operation: BrowserOperation;
  switch (command.type) {
    case "location": operation = { op: "location" }; break;
    case "list-links": operation = { op: "list-links" }; break;
    case "list-tabs": operation = { op: "tabs", action: "list" }; break;
    case "open-blank": operation = { op: "tabs", action: "open-blank" }; break;
    case "history": operation = { op: "history", direction: command.direction }; break;
    case "reload": operation = { op: "reload" }; break;
    default: return speak(ctx.hub, ctx.session, "I couldn't safely carry out that browser request.", "error");
  }
  const result = await executor.execute(operation);
  if (!result.ok || !result.payload.ok) return speakBrowserFailure(ctx, result);
  speakBrowserResult(ctx, result.payload, command);
}

async function handleBrowserUtterance(ctx: TurnContext): Promise<boolean> {
  if (ctx.message.type !== "utterance") return false;
  const { text, source } = ctx.message.payload;
  const executor = createBrowserExecutor({ hub: ctx.hub, session: ctx.session });

  // Resolve user-selected links and tabs only against a fresh bounded capture/list.
  if (/^(?:open|click)\s+(?:the\s+)?link\b/iu.test(text)) {
    const listed = await executor.execute({ op: "list-links" });
    if (!listed.ok || !listed.payload.ok || listed.payload.operation !== "list-links") {
      speakBrowserFailure(ctx, listed);
      return true;
    }
  } else if (/^(?:switch to|go to)\s+tab\b/iu.test(text)) {
    const listed = await executor.execute({ op: "tabs", action: "list" });
    if (!listed.ok || !listed.payload.ok || listed.payload.operation !== "tabs") {
      speakBrowserFailure(ctx, listed);
      return true;
    }
  }

  const command = parseBrowserCommand(text, commandCapture(ctx.session));
  if (command === null) return false;
  await runBrowserCommand(ctx, command, source);
  return true;
}

/** `stop`: cut off whatever the voice UI is saying. */
export function sayStop(hub: Hub, session: Session): void {
  speak(hub, session, MSG_STOPPED, "answer", { interrupt: true, record: false });
}

/** `repeat`: re-send the last spoken text. */
export function sayRepeat(hub: Hub, session: Session): void {
  if (session.lastSpoken === null) speak(hub, session, MSG_NOTHING_TO_REPEAT, "answer", { record: false });
  else speak(hub, session, session.lastSpoken, "answer", { record: false });
}

/**
 * Make sure `session.model` matches the page. Returns an error reply to speak instead when it can't:
 * the extension is not connected, or the snapshot failed or timed out. Never throws.
 */
async function ensureSnapshot(
  ctx: TurnContext,
  maxAgeMs?: number,
): Promise<{ ok: true } | { ok: false; reply: string }> {
  const { session } = ctx;
  const freshEnough =
    session.model !== null &&
    !session.stale &&
    (maxAgeMs === undefined || (session.modelAgeMs !== null && session.modelAgeMs <= maxAgeMs));
  if (freshEnough) return { ok: true };

  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    return { ok: false, reply: result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED };
  }
  if (session.model === null || session.stale) return { ok: false, reply: MSG_READ_FAILED };
  return { ok: true };
}

async function captureIntentPage(
  ctx: TurnContext,
): Promise<{ ok: true; snapshot: Snapshot; model: NonNullable<Session["model"]> } | { ok: false; reply: string }> {
  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    return { ok: false, reply: result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED };
  }
  const model = ctx.session.model;
  if (
    model === null ||
    ctx.session.stale ||
    ctx.session.tabId !== result.snapshot.tabId ||
    model.snapshotVersion !== result.snapshot.version ||
    model.structuralHash !== result.snapshot.structuralHash ||
    model.url !== result.snapshot.url
  ) return { ok: false, reply: MSG_READ_FAILED };
  return { ok: true, snapshot: result.snapshot, model };
}

async function handlePrivacyHandoff(
  ctx: TurnContext,
  handoff: Extract<ReturnType<typeof decideUtteranceForBrain>, { kind: "withhold-and-handoff" }>['handoff'],
): Promise<void> {
  if (handoff.kind === "clarify") {
    speak(ctx.hub, ctx.session, handoff.spokenText, "answer");
    return;
  }
  const focused = await executeUngated(ctx, { type: "go_to_field", fieldId: handoff.fieldId });
  if (focused.category === "error") {
    speak(ctx.hub, ctx.session, focused.text, focused.category);
    return;
  }
  speak(ctx.hub, ctx.session, handoff.spokenText, "answer");
}

function currentIntentPage(ctx: TurnContext, snapshot: Snapshot, model: NonNullable<Session["model"]>): IntentRoutePage {
  const isCurrent = (): boolean => {
    const accepted = ctx.session.model;
    return !ctx.session.stale && accepted !== null &&
      ctx.session.tabId === snapshot.tabId &&
      accepted.url === snapshot.url &&
      accepted.snapshotVersion === snapshot.version &&
      accepted.structuralHash === snapshot.structuralHash;
  };
  return {
    snapshot,
    model,
    isCurrent,
    getCurrentModel: () => isCurrent() ? ctx.session.model : null,
  };
}

async function runAgyIntent(ctx: TurnContext, text: string, snapshot: Snapshot, model: NonNullable<Session["model"]>): Promise<void> {
  const provider = ctx.agyProvider;
  if (provider === undefined) {
    speak(ctx.hub, ctx.session, MSG_MODEL_FAILED, "error");
    return;
  }

  let timer: unknown;
  let settled = false;
  let rejectTimeout!: (error: Error) => void;
  const watchdog = ctx.intentWatchdog ?? {
    schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });

  try {
    await waitForIntentRecovery(provider);
    const controller = new AbortController();
    timer = watchdog.schedule(() => {
      if (settled) return;
      controller.abort(new Error("Agy intent watchdog expired."));
      void startIntentRoleRecovery(provider).catch(() => {});
      rejectTimeout(new Error("Agy intent watchdog expired."));
    }, INTENT_WATCHDOG_MS);

    const routed = routeIntent(text, currentIntentPage(ctx, snapshot, model), provider, controller.signal);
    const result = await Promise.race([routed, timeout]);
    settled = true;
    if (result.kind === "intent") await runIntent(ctx, result.intent);
    else if (result.kind === "handoff") await handlePrivacyHandoff(ctx, result.handoff);
    else speak(ctx.hub, ctx.session, MSG_MODEL_FAILED, "error");
  } catch {
    settled = true;
    ctx.hub.send("voice", "earcon", { name: "error" });
    speak(ctx.hub, ctx.session, MSG_MODEL_FAILED, "error");
  } finally {
    settled = true;
    if (timer !== undefined) watchdog.cancel(timer);
  }
}

/** The intents that read the form back. Everything here is built from labels and counts only. */
async function readOut(
  ctx: TurnContext,
  build: (model: NonNullable<Session["model"]>) => string,
  maxAgeMs?: number,
): Promise<void> {
  const ready = await ensureSnapshot(ctx, maxAgeMs);
  if (!ready.ok) speak(ctx.hub, ctx.session, ready.reply, "error");
  else speak(ctx.hub, ctx.session, build(ctx.session.model!), "answer");
}

/** This command always reads the current page before repeating its detected errors. */
async function reportCurrentErrors(ctx: TurnContext): Promise<void> {
  const result = await ctx.refresher.request("user");
  if (!result.ok) {
    speak(ctx.hub, ctx.session, result.kind === "no-extension" ? MSG_NO_EXTENSION : MSG_READ_FAILED, "error");
    return;
  }
  if (ctx.session.model === null || ctx.session.stale) {
    speak(ctx.hub, ctx.session, MSG_READ_FAILED, "error");
    return;
  }
  const errors = formatResultErrors(interpretCurrentErrors(ctx.session.model));
  speak(ctx.hub, ctx.session, errors ?? MSG_NO_CURRENT_ERRORS, "answer");
}

/**
 * Carry out an Intent (from the grammar or the brain). Only deterministic local commands are resolved
 * in grammar; model-produced gated Intents enter the single Executor, while safe field actions retain
 * the existing ungated path.
 */
async function runIntent(ctx: TurnContext, intent: Intent | LocalCommand): Promise<void> {
  const { hub, session } = ctx;
  switch (intent.type) {
    case "describe":
      return readOut(ctx, describeReply);
    case "whats_required":
      return readOut(ctx, requiredReply, ctx.freshnessMs);
    case "read_form":
      return readOut(ctx, readFormReply, ctx.freshnessMs);
    case "what_went_wrong":
      return reportCurrentErrors(ctx);
    case "stop":
      return sayStop(hub, session);
    case "repeat":
      return sayRepeat(hub, session);
    case "clarify":
      return speak(hub, session, intent.question, "answer");
    case "answer":
      return speak(hub, session, intent.text, "answer");
    case "unknown":
      return speak(hub, session, MSG_UNKNOWN, "answer");
    case "set_fields":
    case "go_to_field": {
      const result = await executeUngated(ctx, intent);
      return speak(hub, session, result.text, result.category);
    }
    case "request_action":
      if (ctx.dialogueManaged) {
        return speak(hub, session, "I can't act on that request directly. Ask me to read the form back to start its confirmation flow.", "error");
      }
      return createVoiceGateAdapter(ctx).arm({ actionId: intent.actionId });
    case "click_safe":
      if (ctx.dialogueManaged) {
        return speak(hub, session, "I can't run that action from a model suggestion. Ask me to read the form back to start its confirmation flow.", "error");
      }
      return executeGatedAction(ctx, intent);
    default:
      // No Intent approves an action; request_action and click_safe only enter the Executor above.
      return speak(hub, session, MSG_NOT_YET, "answer");
  }
}

/**
 * Resolve a reducer-unmatched utterance through the configured brain while leaving busy state,
 * transcript routing, and dialogue state ownership with the voice reducer runner.
 */
export async function handleDialogueFallback(ctx: TurnContext): Promise<void> {
  const { message, hub, session } = ctx;
  if (message.type !== "utterance") return;
  const { text } = message.payload;
  const fieldPhrase = matchFieldPhrase(text);

  if (fieldPhrase !== null) {
    if (fieldPhrase.type === "invalid") {
      return speak(
        hub,
        session,
        fieldPhrase.reason === "too-long" ? MSG_FIELD_PHRASE_TOO_LONG : "Say a field and the value to fill.",
        "error",
      );
    }

    if (ctx.agyProvider !== undefined) {
      const captured = await captureIntentPage(ctx);
      if (!captured.ok) return speak(hub, session, captured.reply, "error");
      const decision = decideUtteranceForBrain(text, captured.model);
      if (decision.kind === "withhold-and-handoff") {
        await handlePrivacyHandoff(ctx, decision.handoff);
        return;
      }
      await runIntent(ctx, resolveFieldPhrase(captured.model, fieldPhrase));
      return;
    }

    hub.send("voice", "earcon", { name: "thinking" });
    speak(hub, session, MSG_FILLER, "filler");
    let modelIntent: Intent | null = null;
    try {
      modelIntent = await ctx.brain.parseIntent(safePhraseForBrain(fieldPhrase));
    } catch {
      // Field phrase matching is deterministic and does not depend on the offline brain.
    }
    if (modelIntent?.type === "request_action") {
      await runIntent(ctx, modelIntent);
      return;
    }
    const ready = await ensureSnapshot(ctx, ctx.freshnessMs);
    if (!ready.ok) return speak(hub, session, ready.reply, "error");
    await runIntent(ctx, resolveFieldPhrase(session.model!, fieldPhrase));
    return;
  }

  if (await handleBrowserUtterance(ctx)) return;

  hub.send("voice", "earcon", { name: "thinking" });
  speak(hub, session, MSG_FILLER, "filler");
  if (ctx.agyProvider !== undefined) {
    const captured = await captureIntentPage(ctx);
    if (!captured.ok) return speak(hub, session, captured.reply, "error");
    await runAgyIntent(ctx, text, captured.snapshot, captured.model);
    return;
  }

  let intent: Intent;
  try {
    intent = await ctx.brain.parseIntent(text);
  } catch {
    hub.send("voice", "earcon", { name: "error" });
    speak(hub, session, MSG_BRAIN_FAILED, "error");
    return;
  }
  await runIntent(ctx, intent);
}

export async function handleUtterance(ctx: TurnContext): Promise<void> {
  const { message, hub, session } = ctx;
  if (message.type !== "utterance") return;
  const { utteranceId, text } = message.payload;

  const hasPendingConfirmation = session.pendingGatedAction !== null;
  const pendingBrowserAuthorization = hasPendingConfirmation ? null : session.pendingBrowserAuthorization;
  const command = hasPendingConfirmation ? null : matchGrammar(text);
  const fieldPhrase = hasPendingConfirmation || pendingBrowserAuthorization !== null ? null : matchFieldPhrase(text);
  const privateUtterance = containsSensitiveUtterance(text);
  hub.send("voice", "transcript", {
    utteranceId,
    heardAs: privateUtterance
      ? "private content withheld"
      : hasPendingConfirmation || pendingBrowserAuthorization !== null ? text : fieldPhrase === null ? text : safePhraseForTranscript(fieldPhrase),
    routedTo: hasPendingConfirmation || pendingBrowserAuthorization !== null || command !== null || fieldPhrase !== null ? "grammar" : "model",
  });

  session.busy = true;
  session.dialogue = hasPendingConfirmation ? "awaiting-confirm" : "describing";
  hub.pushState();
  try {
    if (hasPendingConfirmation) {
      const confirmation: GatedCommand = { type: "confirmation", text };
      await executeGatedAction(ctx, confirmation);
      return;
    }

    if (pendingBrowserAuthorization !== null) {
      const cancelText = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
      if (command?.type === "stop" || command?.type === "repeat" || ["cancel", "never mind", "nevermind"].includes(cancelText)) {
        session.clearBrowserAuthorization();
        session.dialogue = idleDialogue(session);
        if (command !== null) await runIntent(ctx, command);
        else speak(hub, session, "Cancelled. Nothing was done.", "answer");
        return;
      }
      await executeAuthorizedBrowserCommand(ctx, pendingBrowserAuthorization);
      return;
    }

    if (command !== null) await runIntent(ctx, command);
    else await handleDialogueFallback(ctx);
  } finally {
    session.busy = false;
    session.dialogue = session.pendingGatedAction !== null
      ? session.pendingGatedAction.grantId === undefined ? "reading-back" : "awaiting-confirm"
      : idleDialogue(session);
    hub.pushState();
  }
}
