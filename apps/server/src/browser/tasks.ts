import {
  BrowserContentItem,
  BrowserPageIdentity,
  type BrowserOperation,
  type BrowserPageIdentity as BrowserPageIdentityValue,
} from "@blip/protocol";
import {
  projectExplicitPageContentRequest,
  type PageContentProjection,
} from "../brain/agy/content-projection";
import { containsSensitivePageText } from "../brain/agy/privacy";
import type { Session } from "../session/session";
import type { BrowserExecutor, BrowserExecutorResult } from "./executor";
import { filterPageTaskItem, pageTaskMatchesCapture, type ActivePageTask } from "./task-state";

const MAX_COMMAND_CODE_POINTS = 600;
const MAX_SELECTOR_CODE_POINTS = 200;
const MAX_QUERY_CODE_POINTS = 500;
const INVALID_TEXT = /[\u0000-\u001f\u007f]/u;

export type PageTaskSelection = { type: "latest" } | { type: "current" } | { type: "text"; value: string };

/** Closed command data comes only from the current user's utterance. */
export type PageTaskCommand =
  | { type: "read-item"; selection: PageTaskSelection }
  | { type: "read-items"; count: number }
  | { type: "summarize-item"; selection: PageTaskSelection }
  | { type: "question-item"; selection: PageTaskSelection; question: string }
  | { type: "draft"; selection: PageTaskSelection; recipientWords: string; targetWords: string; instruction: string }
  | { type: "revise"; instruction: string }
  | { type: "send-draft" }
  | { type: "cancel" }
  | { type: "clarify"; message: string };

export type PageTaskContentRequest =
  | { type: "summary" | "page-question"; projection: PageContentProjection }
  | { type: "draft"; sourceExcerpt: string; recipientWords: string; targetWords: string; instruction: string }
  | { type: "revise"; sourceExcerpt: string; observedDraft: string; instruction: string };

export type PageTaskCommandResult =
  | { type: "not-task" }
  | { type: "clarify"; message: string }
  | { type: "cancelled" }
  | { type: "send-draft" }
  | { type: "read"; taskId: string; itemId: string; text: string }
  | { type: "read-many"; text: string }
  | { type: "model-request"; taskId: string; request: PageTaskContentRequest }
  | { type: "answer"; taskId: string; text: string }
  | { type: "model-unavailable" };

export type PageTaskItemSelection = { ok: true; item: ReturnType<typeof BrowserContentItem.parse> } | { ok: false; message: string };

export type PageTaskPorts = {
  executor: Pick<BrowserExecutor, "execute">;
  /** Called only for explicit summary or page-question commands. Direct reads never use this port. */
  requestContent?: (projection: PageContentProjection) => Promise<string>;
};

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizeSelector(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Preserve ISO fractional seconds beyond Date's millisecond precision when proving a unique latest item. */
function visibleDateNanoseconds(value: string): bigint | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (match === null) return null;
  const wholeSecondMs = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(wholeSecondMs)) return null;
  const fractionalNanoseconds = BigInt(((match[2] ?? "") + "000000000").slice(0, 9));
  return BigInt(wholeSecondMs) * 1_000_000n + fractionalNanoseconds;
}

function clarify(message: string): PageTaskCommand {
  return { type: "clarify", message };
}

function selectionFrom(raw: string): PageTaskSelection | null {
  const value = raw.trim().replace(/\s+/gu, " ");
  if (/^(?:the\s+)?latest(?:\s+(?:item|email|message|article))?$/iu.test(value)) return { type: "latest" };
  if (/^(?:it|that|this|the\s+(?:same|current)\s+(?:item|email|message)|(?:that|this|the)\s+(?:email|message))$/iu.test(value)) {
    return { type: "current" };
  }
  const selector = value.replace(/^the\s+item\s+/iu, "").replace(/^item\s+/iu, "").trim();
  return selector !== "" && codePointLength(selector) <= MAX_SELECTOR_CODE_POINTS && !INVALID_TEXT.test(selector)
    ? { type: "text", value: selector }
    : null;
}

/** Keep this grammar distinct from Phase 7's whole-page and heading/paragraph commands. */
function explicitItemSelectionFrom(raw: string): PageTaskSelection | null {
  const value = raw.trim().replace(/\s+/gu, " ");
  if (/^(?:the\s+)?latest(?:\s+(?:item|email|message|article))?$/iu.test(value)) return { type: "latest" };
  const item = /^(?:the\s+)?item(?:\s+([\s\S]*))?$/iu.exec(value);
  if (item !== null) return item[1] === undefined ? null : selectionFrom(item[1]);
  if (/^(?:(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+item)?|(?:item\s+)?\d{1,2})$/iu.test(value)) {
    return selectionFrom(value);
  }
  return null;
}

function parseQuestion(input: string): PageTaskCommand | null {
  const ask = /^ask\s+(latest|item\s+.+?):\s*([\s\S]+)$/iu.exec(input);
  const naturalLatest = /^what\s+does\s+(?:the\s+)?latest(?:\s+item)?\s+say\s+about\s+([\s\S]+)$/iu.exec(input);
  const naturalCurrent = /^what\s+does\s+(?:it|that|this|the\s+(?:same|current)\s+(?:item|email|message))\s+say\s+about\s+([\s\S]+)$/iu.exec(input);
  const naturalItem = /^what\s+does\s+(?:the\s+)?item\s+(.+?)\s+say\s+about\s+([\s\S]+)$/iu.exec(input);
  const match = ask ?? (naturalLatest === null && naturalCurrent === null ? naturalItem : null);
  if (naturalCurrent !== null) {
    const question = naturalCurrent[1]!.trim();
    if (question === "" || codePointLength(question) > MAX_QUERY_CODE_POINTS || INVALID_TEXT.test(question) || containsSensitivePageText(question)) {
      return clarify("Say a short question about the visible item without private values.");
    }
    return { type: "question-item", selection: { type: "current" }, question };
  }
  if (naturalLatest !== null) {
    const question = naturalLatest[1]!.trim();
    if (question === "" || codePointLength(question) > MAX_QUERY_CODE_POINTS || INVALID_TEXT.test(question) || containsSensitivePageText(question)) {
      return clarify("Say a short question about the visible item without private values.");
    }
    return { type: "question-item", selection: { type: "latest" }, question };
  }
  if (match === null) return null;

  let selection: PageTaskSelection | null;
  let question: string;
  if (ask !== null) {
    const rawSelection = ask[1]!.toLocaleLowerCase() === "latest" ? "latest" : ask[1]!;
    selection = selectionFrom(rawSelection);
    question = ask[2]!.trim();
  } else {
    selection = selectionFrom(naturalItem![1]!);
    question = naturalItem![2]!.trim();
  }
  if (selection === null || question === "" || codePointLength(question) > MAX_QUERY_CODE_POINTS ||
      INVALID_TEXT.test(question) || containsSensitivePageText(question)) {
    return clarify("Say which visible item you mean and a short question without private values.");
  }
  return { type: "question-item", selection, question };
}

/** Parse only explicit user task phrases. Capture prose is never an input to this parser. */
export function parsePageTaskCommand(utterance: string): PageTaskCommand | null {
  if (codePointLength(utterance) > MAX_COMMAND_CODE_POINTS || INVALID_TEXT.test(utterance)) {
    return clarify("That page-task request is too long or contains unsupported control characters.");
  }
  const input = utterance.trim().replace(/\s+/gu, " ")
    .replace(/^(?:(?:can|could|would) you(?: please)?|please)[,\s]+/iu, "")
    .trim();
  if (input === "") return null;
  const commandText = input.replace(/[.!?,]+$/gu, "").trim();
  const lower = commandText.toLocaleLowerCase().replace(/,/gu, " ").replace(/\s+/gu, " ").trim();

  if (["cancel task", "cancel this task", "cancel the page task"].includes(lower)) return { type: "cancel" };
  // This only begins the separate, tracked send read-back. It never dispatches the send itself.
  if (["yes that's good", "yes that looks good", "that's good", "that looks good", "looks good", "i like that", "that works"].includes(lower)) {
    return { type: "send-draft" };
  }
  if (/^(?:send|submit)\s+(?:this\s+email|the\s+draft|the\s+message|this\s+message)$/iu.test(input)) {
    return { type: "send-draft" };
  }

  const revise = /^(?:revise|edit)\s+(?:the\s+)?draft\s+(?:to\s+say\s+)?([\s\S]+)$/iu.exec(commandText);
  const naturalRevise = /^(?:make|change|rewrite|edit)\s+(?:(?:it|that|the\s+draft|the\s+reply|the\s+response)\s+)?(?:to\s+say\s+)?([\s\S]+)$/iu.exec(commandText);
  const revision = revise ?? naturalRevise;
  if (revision !== null) {
    const instruction = revision[1]!.trim();
    if (instruction === "" || codePointLength(instruction) > MAX_QUERY_CODE_POINTS || containsSensitivePageText(instruction)) {
      return clarify("Say a short edit for the current draft without private values.");
    }
    return { type: "revise", instruction };
  }

  const question = parseQuestion(input);
  if (question !== null) return question;

  const latestEmailQuestion = /^(?:(?:what(?:'s|’s| is)|tell me|show me)\s+(?:(?:the|my)\s+)?latest\s+(?:email|message|item)(?:\s+(?:i\s+have|in\s+(?:my\s+)?inbox|on this page))?|what(?:'s|’s| is)\s+my\s+latest\s+(?:email|message|item))$/iu;
  if (latestEmailQuestion.test(commandText)) return { type: "read-item", selection: { type: "latest" } };
  const multiLatest = /^(?:(?:what\s+are|show\s+me|list|read|tell\s+me)\s+)?(?:(?:the|my)\s+)?(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:latest|newest|most\s+recent)\s+(?:emails?|messages?|items?)(?:\s+(?:i\s+have|in\s+(?:my\s+)?inbox|on this page))?$/iu.exec(commandText);
  const spokenCount = multiLatest === null ? null : itemCount(multiLatest[1]!);
  if (spokenCount !== null) return { type: "read-items", count: spokenCount };

  if (["summarize the email", "summarize that email", "summarize this email", "summarize it", "summarize that", "summarize this", "summarize it again", "summarize that again", "summarize this again", "summarize the email again", "summarize that email again"].includes(lower)) {
    return { type: "summarize-item", selection: { type: "current" } };
  }
  const summary = /^(?:summarize|summary\s+of)\s+(?:the\s+)?(latest(?:\s+(?:item|email|message|article))?|item(?:\s+[\s\S]*)?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+item)?|(?:item\s+)?\d{1,2})$/iu.exec(commandText);
  if (summary !== null) {
    const selection = explicitItemSelectionFrom(summary[1]!);
    return selection === null
      ? clarify("Say 'summarize latest' or name one visible item to summarize.")
      : { type: "summarize-item", selection };
  }

  if (/^(?:read|tell me)\s+(?:(?:me|my)\s+)?(?:the\s+)?latest\s+(?:email|message|item)(?:\s+(?:to me|aloud|out loud))?$/iu.test(commandText) ||
      /^read\s+the\s+latest\s+(?:email|message|item)\s+to\s+me$/iu.test(commandText)) {
    return { type: "read-item", selection: { type: "latest" } };
  }
  if (/^(?:read|tell me|repeat)\s+(?:(?:the\s+)?(?:same\s+)?(?:email|message|item)|it|that|this)(?:\s+again|\s+to me|\s+aloud|\s+out loud)?$/iu.test(commandText)) {
    return { type: "read-item", selection: { type: "current" } };
  }
  const read = /^read\s+(?:the\s+)?(latest(?:\s+(?:item|email|message|article))?|item(?:\s+[\s\S]*)?|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+item)?|(?:item\s+)?\d{1,2})$/iu.exec(commandText);
  if (read !== null) {
    const selection = explicitItemSelectionFrom(read[1]!);
    if (selection !== null) return { type: "read-item", selection };
    return clarify("Say 'read latest' or 'read item' followed by its visible text.");
  }

  const draft = /^(?:draft|write)\s+(?:a\s+)?(?:reply|response)\s+to\s+(.+?)\s+for\s+recipient\s+(.+?)\s+in\s+(?:the\s+)?field\s+(.+)$/iu.exec(commandText);
  if (draft !== null) {
    const selection = selectionFrom(draft[1]!);
    const recipientWords = draft[2]!.trim();
    const targetWords = draft[3]!.trim();
    const safeSelector = (value: string) => value !== "" && codePointLength(value) <= MAX_SELECTOR_CODE_POINTS &&
      !INVALID_TEXT.test(value) && !containsSensitivePageText(value);
    if (selection === null) return clarify("Name one visible item to use for the draft.");
    if (!safeSelector(recipientWords) || !safeSelector(targetWords)) {
      return clarify("Name a visible recipient or target value and a supported text field without private values.");
    }
    return { type: "draft", selection, recipientWords, targetWords, instruction: "Draft a response to the selected visible item." };
  }
  const simpleDraft = /^(?:draft|write)(?:\s+me)?\s+(?:a\s+)?(?:reply|response)$/iu.exec(commandText);
  if (simpleDraft !== null) {
    const selection = selectionFrom("it");
    if (selection === null) return clarify("Name one visible item to use for the draft.");
    return {
      type: "draft",
      selection,
      recipientWords: "recipient",
      targetWords: "reply",
      instruction: "Draft a response to the selected visible item.",
    };
  }
  const incompleteDraft = /^(?:draft|write)\s+(?:a\s+)?(?:reply|response)\s+to\s+(.+)$/iu.exec(commandText);
  if (incompleteDraft !== null) {
    return selectionFrom(incompleteDraft[1]!) === null
      ? clarify("Name one visible item to use for the draft.")
      : clarify("To draft safely, say 'draft a reply to latest for recipient [visible value] in field [visible text field]'.");
  }

  return null;
}

function currentItems(session: Session): { items: Array<ReturnType<typeof BrowserContentItem.parse>>; identity: BrowserPageIdentityValue } | { message: string } {
  const capture = session.browserCapture;
  if (!session.extensionConnected || session.tabId === null || capture?.identity === undefined) {
    return { message: "I need a fresh visible-item capture from the current page first." };
  }
  const identity = BrowserPageIdentity.safeParse(capture.identity);
  if (!identity.success || identity.data.tabId !== session.tabId) {
    return { message: "The current page identity changed. Refresh the visible items and ask again." };
  }

  const items: Array<ReturnType<typeof BrowserContentItem.parse>> = [];
  const ids = new Set<string>();
  for (const raw of capture.items ?? []) {
    const candidateIdentity = typeof raw === "object" && raw !== null
      ? (raw as { identity?: unknown }).identity
      : undefined;
    const candidate = BrowserPageIdentity.safeParse(candidateIdentity);
    if (!candidate.success || candidate.data.captureId !== identity.data.captureId ||
        candidate.data.captureRevision !== identity.data.captureRevision || candidate.data.tabId !== identity.data.tabId ||
        candidate.data.pageUrl !== identity.data.pageUrl) continue;

    const parsed = BrowserContentItem.safeParse(raw);
    if (!parsed.success || ids.has(parsed.data.itemId)) {
      return { message: "The visible-item capture is inconsistent. Refresh it before choosing an item." };
    }
    ids.add(parsed.data.itemId);
    items.push(parsed.data);
  }
  return { items, identity: identity.data };
}

const ORDINALS = new Map<string, number>([
  ["first", 1], ["second", 2], ["third", 3], ["fourth", 4], ["fifth", 5],
  ["sixth", 6], ["seventh", 7], ["eighth", 8], ["ninth", 9], ["tenth", 10],
]);

function itemCount(value: string): number | null {
  const numeric = /^\d{1,2}$/u.test(value) ? Number(value) : ORDINALS.get(value.toLocaleLowerCase());
  return numeric !== undefined && numeric !== null && numeric >= 2 && numeric <= 10 ? numeric : null;
}

function orderedLatestItems(items: Array<ReturnType<typeof BrowserContentItem.parse>>): Array<ReturnType<typeof BrowserContentItem.parse>> | null {
  if (items.length === 0) return [];
  if (items.every((item) => item.visibleDate === null)) return items;
  if (items.some((item) => item.visibleDate === null || visibleDateNanoseconds(item.visibleDate) === null)) return null;
  return items.map((item, index) => ({ item, index, instant: visibleDateNanoseconds(item.visibleDate!)! }))
    .sort((left, right) => left.instant === right.instant ? left.index - right.index : left.instant > right.instant ? -1 : 1)
    .map(({ item }) => item);
}

export function resolvePageTaskItem(session: Session, selection: PageTaskSelection): PageTaskItemSelection {
  const current = currentItems(session);
  if ("message" in current) return { ok: false, message: current.message };
  if (current.items.length === 0) return { ok: false, message: "I couldn't find a current visible item on this page." };

  let selected: ReturnType<typeof BrowserContentItem.parse> | undefined;
  if (selection.type === "current") {
    const active = session.activePageTask;
    if (active !== null && pageTaskMatchesCapture(active, session.browserCapture, session.tabId)) {
      selected = current.items.find((item) => item.itemId === active.itemId);
      if (selected === undefined) {
        return { ok: false, message: "The item we were discussing is no longer visible. Please choose a current item." };
      }
    }
  }
  if (selection.type === "latest" || (selection.type === "current" && selected === undefined)) {
    const ordered = orderedLatestItems(current.items);
    if (ordered === null) return { ok: false, message: "I can't reliably order these visible items because some dates are missing. Please choose one by its position or text." };
    selected = ordered[0];
  } else if (selection.type === "text") {
    const wanted = normalizeSelector(selection.value);
    const ordinal = /^(?:(?:item|number)\s+)?(\d{1,2})$/iu.exec(wanted);
    const ordinalWord = /^(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+item)?$/iu.exec(wanted);
    const index = ordinal !== null ? Number(ordinal[1]) : ordinalWord === null ? undefined : ORDINALS.get(ordinalWord[1]!.toLocaleLowerCase());
    if (index !== undefined) {
      selected = current.items[index - 1];
      if (selected === undefined) return { ok: false, message: "I couldn't find that many current visible items." };
    } else {
      const exact = current.items.filter((item) => normalizeSelector(item.text) === wanted);
      const matches = exact.length > 0 ? exact : current.items.filter((item) => normalizeSelector(item.text).includes(wanted));
      if (matches.length !== 1) {
        return { ok: false, message: matches.length === 0
          ? "I couldn't find that text in a current visible item. Ask me to list visible items, then choose one."
          : "More than one visible item matches. Please say a more specific part of its text." };
      }
      selected = matches[0];
    }
  }

  if (selected === undefined) return { ok: false, message: "I couldn't identify the current visible item. Please choose one." };
  if (selected.frameId !== 0) return { ok: false, message: "That item is outside the supported top frame. Please choose a visible top-frame item." };
  const filtered = filterPageTaskItem(selected, current.identity);
  if (filtered === null) return { ok: false, message: "I can't safely use that item. Please choose another visible item." };
  return { ok: true, item: filtered.item };
}

function taskKind(command: Exclude<PageTaskCommand, { type: "cancel" | "clarify" | "revise" | "send-draft" | "read-items" }>): ActivePageTask["taskKind"] {
  switch (command.type) {
    case "read-item": return "read-item";
    case "summarize-item": return "summarize-item";
    case "question-item": return "question-item";
    case "draft": return "draft";
  }
}

function readItemFromExecutor(
  result: BrowserExecutorResult,
  expected: ReturnType<typeof BrowserContentItem.parse>,
  identity: BrowserPageIdentityValue,
):
  | { ok: true; item: ReturnType<typeof BrowserContentItem.parse> }
  | { ok: false; message: string } {
  if (!result.ok) return { ok: false, message: "I couldn't verify that item on the current page. Please refresh and ask again." };
  const payload = result.payload;
  if (!payload.ok || payload.operation !== "read-item" || payload.result.itemId !== expected.itemId ||
      payload.result.frameId !== 0 || payload.result.identity.captureId !== identity.captureId ||
      payload.result.identity.captureRevision !== identity.captureRevision || payload.result.identity.tabId !== identity.tabId ||
      payload.result.identity.pageUrl !== identity.pageUrl || payload.result.text !== expected.text ||
      payload.result.visibleDate !== expected.visibleDate) {
    return { ok: false, message: "That visible item changed or is stale. Please choose again from the current page." };
  }
  const filtered = filterPageTaskItem(payload.result, identity);
  return filtered === null
    ? { ok: false, message: "I can't safely use that item. Please choose another visible item." }
    : { ok: true, item: filtered.item };
}

function summarizeRequest(item: ReturnType<typeof BrowserContentItem.parse>, identity: BrowserPageIdentityValue, command: PageTaskCommand): PageTaskContentRequest | null {
  if (command.type === "summarize-item") {
    const projection = projectExplicitPageContentRequest({ type: "summary", identity }, [{
      contentId: item.itemId,
      kind: "paragraph",
      text: item.text,
      identity,
      frameId: item.frameId,
    }], identity);
    return projection === null ? null : { type: "summary", projection };
  }
  if (command.type === "question-item") {
    const projection = projectExplicitPageContentRequest({ type: "page-question", identity, question: command.question }, [{
      contentId: item.itemId,
      kind: "paragraph",
      text: item.text,
      identity,
      frameId: item.frameId,
    }], identity);
    return projection === null ? null : { type: "page-question", projection };
  }
  if (command.type === "draft") return {
    type: "draft",
    sourceExcerpt: item.text,
    recipientWords: command.recipientWords,
    targetWords: command.targetWords,
    instruction: command.instruction,
  };
  return null;
}

function activeTaskForRevision(session: Session): { task: ActivePageTask; sourceExcerpt: string; currentDraft: string } | null {
  const task = session.activePageTask;
  if (task === null || !pageTaskMatchesCapture(task, session.browserCapture, session.tabId) ||
      task.draftTargetId === null || task.lastObservedDraftValue === null) return null;
  return { task, sourceExcerpt: task.sourceExcerpt, currentDraft: task.lastObservedDraftValue };
}

/** Resolve one explicit task, using live extension revalidation before any text is returned or projected. */
export async function runPageTaskCommand(
  session: Session,
  utterance: string,
  ports: PageTaskPorts,
  inferredCommand?: PageTaskCommand,
): Promise<PageTaskCommandResult> {
  const command = inferredCommand ?? parsePageTaskCommand(utterance);
  if (command === null) return { type: "not-task" };
  if (command.type === "clarify") return { type: "clarify", message: command.message };
  if (command.type === "cancel") {
    session.clearPageTask();
    return { type: "cancelled" };
  }
  if (command.type === "send-draft") return { type: "send-draft" };

  if (command.type === "read-items") {
    const current = currentItems(session);
    if ("message" in current) return { type: "clarify", message: current.message };
    const ordered = orderedLatestItems(current.items);
    if (ordered === null) return { type: "clarify", message: "I can't reliably order these visible items because some dates are missing. Please choose them by position or text." };
    const chosen = ordered.slice(0, command.count);
    if (chosen.length === 0) return { type: "clarify", message: "I couldn't find any current visible items on this page." };
    const read: string[] = [];
    for (let index = 0; index < chosen.length; index += 1) {
      const item = chosen[index]!;
      const liveResult = await ports.executor.execute({ op: "read-item", itemId: item.itemId, identity: item.identity });
      const liveItem = readItemFromExecutor(liveResult, item, item.identity);
      if (!liveItem.ok) return { type: "clarify", message: liveItem.message };
      const filtered = filterPageTaskItem(liveItem.item, item.identity);
      if (filtered === null) return { type: "clarify", message: "I can't safely read one of those visible items." };
      read.push(`Item ${index + 1}: ${filtered.item.text}`);
    }
    return { type: "read-many", text: read.join(" ") };
  }

  if (command.type === "revise") {
    const active = activeTaskForRevision(session);
    if (active === null) return { type: "clarify", message: "There isn't a current observed draft to revise. Start a draft first." };
    const updated: ActivePageTask = { ...active.task, taskKind: "revise", associatedGrantId: null };
    if (!session.setActivePageTask(updated)) return { type: "clarify", message: "The source page changed. Please start the task again." };
    return {
      type: "model-request",
      taskId: session.activePageTask!.taskId,
      request: {
        type: "revise",
        sourceExcerpt: active.sourceExcerpt,
        observedDraft: active.currentDraft,
        instruction: command.instruction,
      },
    };
  }

  const selection = resolvePageTaskItem(session, command.selection);
  if (!selection.ok) return { type: "clarify", message: selection.message };
  const identity = selection.item.identity;
  const operation: BrowserOperation = { op: "read-item", itemId: selection.item.itemId, identity };
  const liveResult = await ports.executor.execute(operation);
  const liveItem = readItemFromExecutor(liveResult, selection.item, identity);
  if (!liveItem.ok) return { type: "clarify", message: liveItem.message };
  const filtered = filterPageTaskItem(liveItem.item, identity);
  if (filtered === null) return { type: "clarify", message: "I can't safely use that item. Please choose another visible item." };

  const input = {
    identity,
    itemId: filtered.item.itemId,
    frameId: filtered.item.frameId,
    sourceExcerpt: filtered.excerpt,
    taskKind: taskKind(command),
    draftTargetId: null,
    recipientBinding: null,
    actionTargetBinding: null,
    lastObservedDraftValue: null,
    associatedGrantId: null,
  } as const;
  if (!session.setActivePageTask(input)) return { type: "clarify", message: "The page changed while I was reading. Please ask again." };
  const taskId = session.activePageTask!.taskId;

  if (command.type === "read-item") {
    // This local branch intentionally has no content-role/provider call.
    return { type: "read", taskId, itemId: filtered.item.itemId, text: filtered.item.text };
  }

  const request = summarizeRequest(filtered.item, identity, command);
  if (request === null) return { type: "clarify", message: "I couldn't safely prepare that request from the current item." };
  if (request.type === "summary" || request.type === "page-question") {
    if (ports.requestContent === undefined) return { type: "model-request", taskId, request };
    try {
      if (session.activePageTask?.taskId !== taskId || !pageTaskMatchesCapture(session.activePageTask, session.browserCapture, session.tabId)) {
        return { type: "clarify", message: "The page changed while I was preparing the answer. Please ask again." };
      }
      const answer = await ports.requestContent(request.projection);
      if (session.activePageTask?.taskId !== taskId || !pageTaskMatchesCapture(session.activePageTask, session.browserCapture, session.tabId)) {
        return { type: "clarify", message: "The page changed before the answer was ready. Please ask again." };
      }
      if (codePointLength(answer) > 1_000 || containsSensitivePageText(answer)) {
        return { type: "clarify", message: "I couldn't safely validate the page answer. Please ask again." };
      }
      return { type: "answer", taskId, text: answer };
    } catch {
      return { type: "model-unavailable" };
    }
  }
  return { type: "model-request", taskId, request };
}

