import type {
  BrowserContentBlock,
  BrowserContentItem,
  BrowserLinkRecord,
  BrowserPageIdentity,
  BrowserResultPayload,
} from "@blip/protocol";

type BrowserTabsResult = Extract<BrowserResultPayload, { ok: true; operation: "tabs" }> ["result"];

/** The latest visible, extension-captured page data available to deterministic commands. */
export type BrowserCapture = {
  identity?: BrowserPageIdentity;
  blocks: BrowserContentBlock[];
  items?: BrowserContentItem[];
  links: BrowserLinkRecord[];
  tabs?: BrowserTabsResult;
};

export type BrowserCommand =
  | { type: "location" }
  | { type: "read-page"; identity?: BrowserPageIdentity; kind?: "heading" | "paragraph"; target?: string }
  | { type: "list-links" }
  | {
      type: "open-link";
      linkId: string;
      identity: BrowserPageIdentity;
      label: string;
      hostHint: string | null;
      navigationSafety: "same-origin-safe-get" | "confirmation-required" | "unsupported";
    }
  | { type: "navigate"; url: string; host: string }
  | { type: "search"; query: string; route: "site" | "browser-default" | "auto" }
  | { type: "list-tabs" }
  | { type: "switch-tab"; targetTabId: number }
  | { type: "open-blank" }
  | { type: "history"; direction: "back" | "forward" }
  | { type: "reload" }
  | { type: "scroll"; direction: "up" | "down"; pixels: number }
  | { type: "scroll-to-content"; kind: "heading" | "paragraph"; target: string }
  | { type: "find"; query: string }
  | { type: "summary"; identity?: BrowserPageIdentity }
  | { type: "question"; query: string; identity?: BrowserPageIdentity }
  | { type: "clarify"; question: string };

const MAX_COMMAND_LENGTH = 600;
const MAX_QUERY_CODE_POINTS = 500;
const INVALID_TEXT = /[\u0000-\u001f\u007f]/u;

function clarify(question: string): BrowserCommand {
  return { type: "clarify", question };
}

function exactTail(text: string, prefixLength: number): string | null {
  const raw = text.slice(prefixLength).trim();
  if (raw.length === 0 || INVALID_TEXT.test(raw) || Array.from(raw).length > MAX_QUERY_CODE_POINTS) return null;
  return raw;
}

function normalizeSelector(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
}

type Destination = { url: string; host: string } | { kind: "name"; query: string } | { error: string };

function parseDestination(raw: string): Destination {
  const value = raw.trim();
  if (value === "" || value.length > 2048 || INVALID_TEXT.test(value)) {
    return { error: "Say a complete web address or site name." };
  }

  if (/^[a-z][a-z\d+.-]*:/iu.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { error: "That web address is malformed." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "I can only open HTTP or HTTPS web addresses." };
    }
    if (parsed.username !== "" || parsed.password !== "" || parsed.hostname === "") {
      return { error: "That web address is unsafe or ambiguous." };
    }
    return { url: parsed.href, host: parsed.host.toLocaleLowerCase() };
  }

  // A bare address must be an unmistakable DNS name or IPv4 address. Single words such as
  // "gmail" remain user-named sites and go through browser-default search, without a site map.
  if (!/\s/u.test(value) && value.includes(".")) {
    let parsed: URL;
    try {
      parsed = new URL(`https://${value}`);
    } catch {
      return { error: "That web address is malformed." };
    }
    const hostname = parsed.hostname.toLocaleLowerCase();
    const labels = hostname.split(".");
    const validDns = labels.length >= 2 && labels.every((label) =>
      label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/iu.test(label),
    );
    if (!validDns || parsed.username !== "" || parsed.password !== "") {
      return { error: "That web address is unsafe or ambiguous." };
    }
    return { url: parsed.href, host: parsed.host.toLocaleLowerCase() };
  }

  if (value.toLocaleLowerCase() === "localhost") {
    return { error: "That host is ambiguous. Say its full HTTP or HTTPS address." };
  }
  if (value.includes("://") || /[\\/?#@]/u.test(value)) {
    return { error: "Say a complete HTTP or HTTPS web address." };
  }
  const query = exactTail(value, 0);
  return query === null
    ? { error: "Say a site name with no control characters and no more than 500 characters." }
    : { kind: "name", query };
}

function resolveLink(selector: string, capture: BrowserCapture | null): BrowserCommand {
  if (capture === null || capture.identity === undefined) return clarify("I need a fresh list of visible links before I can open one.");
  const wanted = normalizeSelector(selector);
  if (wanted === "") return clarify("Say the visible link label you want to open.");
  const exact = capture.links.filter((link) => normalizeSelector(link.label) === wanted);
  const matches = exact.length > 0
    ? exact
    : capture.links.filter((link) => normalizeSelector(link.label).includes(wanted));
  if (matches.length !== 1) {
    return clarify(matches.length === 0
      ? "I couldn't find that visible link. Ask me to list the links, then choose one."
      : "More than one visible link matches. Say its full link label.");
  }
  const link = matches[0]!;
  return {
    type: "open-link",
    linkId: link.linkId,
    identity: capture.identity,
    label: link.label,
    hostHint: link.hostHint,
    navigationSafety: link.navigationSafety ?? "confirmation-required",
  };
}

function selectedTab(selector: string, capture: BrowserCapture | null): BrowserCommand {
  const tabs = capture?.tabs?.tabs;
  if (tabs === undefined) return clarify("Ask me to list the browser tabs before choosing one.");
  const ordinal = /^(?:tab\s+)?(\d{1,2})$/iu.exec(selector.trim());
  const matches = ordinal === null
    ? tabs.filter((tab) => normalizeSelector(tab.title) === normalizeSelector(selector))
    : Number(ordinal[1]) >= 1 && Number(ordinal[1]) <= tabs.length ? [tabs[Number(ordinal[1])! - 1]!] : [];
  if (matches.length !== 1) {
    return clarify(matches.length === 0 ? "I couldn't find that browser tab." : "More than one browser tab has that title.");
  }
  return { type: "switch-tab", targetTabId: matches[0]!.tabId };
}

const COURTESY_PREFIX = /^(?:(?:hey|ok|okay)[,\s]+)?(?:blip[,\s]+)?(?:(?:can|could|would|will) you(?: please)?|please|i want to|i'd like to|i would like to|let's|lets)[,\s]+/iu;
const QUERY_COMMAND = /^(?:search|browser search|web search|site-search|find|look for|what does (?:this|the) page say about|what does it say about)\b/iu;
const QUERY_SUFFIX = /[\s,]+(?:please|for me)[.!?]*$/iu;
const COMMAND_SUFFIX = /[\s,]+(?:please|for me|thanks|thank you|now|in (?:microsoft )?edge|in chrome|in (?:the|my|this) browser)$/iu;
const TRAILING_PUNCTUATION = /[.!?,]+$/u;

/**
 * Remove the conversational wrapper people naturally put around a command ("can you … in Edge,
 * please?"), so speech matches the closed grammar. Only wrapper words are removed: the command,
 * destination and query are still the user's own words. Query-bearing commands keep their
 * punctuation and lose only a trailing "please" or "for me".
 */
export function relaxBrowserUtterance(input: string): string {
  let text = input.trim();
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(COURTESY_PREFIX, "").trim();
  }
  if (QUERY_COMMAND.test(text)) return text.replace(QUERY_SUFFIX, "").trim();
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(TRAILING_PUNCTUATION, "").replace(COMMAND_SUFFIX, "").trim();
  }
  return text;
}

/**
 * Parse only user words into a closed browser command. Capture text is deliberately not consulted
 * for command intent, destinations, queries, or tab selection; it is used only to resolve an
 * explicitly named visible link/tab against fresh extension-provided identifiers.
 */
export function parseBrowserCommand(utterance: string, currentCapture: BrowserCapture | null = null): BrowserCommand | null {
  if (utterance.length > MAX_COMMAND_LENGTH || INVALID_TEXT.test(utterance)) {
    return clarify("That browser request is too long or contains unsupported control characters.");
  }
  const input = relaxBrowserUtterance(utterance);
  const lower = input.toLocaleLowerCase();
  if (input === "") return clarify("Say what you want me to do in the browser.");

  if (["where am i", "what page am i on", "what site is this", "current page"].includes(lower)) {
    return { type: "location" };
  }
  if (["list links", "what links are here", "read the links"].includes(lower)) return { type: "list-links" };
  if (["list tabs", "what tabs are open", "show browser tabs"].includes(lower)) return { type: "list-tabs" };
  if (["read this page", "read the page", "read page", "read the headings"].includes(lower)) {
    return { type: "read-page", ...(currentCapture?.identity !== undefined ? { identity: currentCapture.identity } : {}) };
  }
  if (["summarize this page", "summarize the page", "give me a summary of this page"].includes(lower)) {
    return { type: "summary", ...(currentCapture?.identity !== undefined ? { identity: currentCapture.identity } : {}) };
  }
  if (lower === "go back" || lower === "back") return { type: "history", direction: "back" };
  if (lower === "go forward" || lower === "forward") return { type: "history", direction: "forward" };
  if (["reload", "reload this page", "refresh this page"].includes(lower)) return { type: "reload" };
  if ([
    "open a blank tab", "open blank tab", "open a new tab", "new tab", "open new tab", "open up a new tab",
    "open another tab", "open a new browser tab", "create a new tab", "make a new tab", "start a new tab",
  ].includes(lower)) return { type: "open-blank" };

  const switchMatch = /^(?:switch to|go to)\s+tab\s+(.+)$/iu.exec(input);
  if (switchMatch !== null) return selectedTab(switchMatch[1]!, currentCapture);
  const titleSwitch = /^switch to tab named\s+(.+)$/iu.exec(input);
  if (titleSwitch !== null) return selectedTab(titleSwitch[1]!, currentCapture);

  const siteSearch = /^site-search\s+([\s\S]+)$/iu.exec(input);
  if (siteSearch !== null) {
    const query = exactTail(input, input.length - siteSearch[1]!.length);
    return query === null ? clarify("Say a search query up to 500 characters.") : { type: "search", query, route: "site" };
  }
  const explicitDefault = /^(?:browser search for|search the web for|web search for)\s+([\s\S]+)$/iu.exec(input);
  if (explicitDefault !== null) {
    const query = exactTail(input, input.length - explicitDefault[1]!.length);
    return query === null ? clarify("Say a search query up to 500 characters.") : { type: "search", query, route: "browser-default" };
  }
  const search = /^search(?:\s+for)?\s+([\s\S]+)$/iu.exec(input);
  if (search !== null) {
    const query = exactTail(input, input.length - search[1]!.length);
    return query === null ? clarify("Say a search query up to 500 characters.") : { type: "search", query, route: "auto" };
  }

  const openLink = /^(?:open|click)\s+(?:the\s+)?link\s+(?:named\s+)?([\s\S]+)$/iu.exec(input);
  if (openLink !== null) return resolveLink(openLink[1]!.trim(), currentCapture);
  const open = /^(?:open|go to|navigate to|take me to|bring up|pull up)\s+([\s\S]+)$/iu.exec(input);
  if (open !== null) {
    const destination = parseDestination(open[1]!);
    if ("error" in destination) return clarify(destination.error);
    return "kind" in destination
      ? { type: "search", query: destination.query, route: "browser-default" }
      : { type: "navigate", url: destination.url, host: destination.host };
  }

  const scroll = /^scroll\s+(up|down)(?:\s+(\d{1,4})(?:\s+pixels?)?)?$/iu.exec(input);
  if (scroll !== null) {
    const pixels = scroll[2] === undefined ? 600 : Number(scroll[2]);
    if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > 2000) return clarify("Say a scroll amount from 1 to 2000 pixels.");
    return { type: "scroll", direction: scroll[1]!.toLocaleLowerCase() as "up" | "down", pixels };
  }

  const scrollTarget = /^scroll\s+to\s+(?:the\s+)?(heading|paragraph)\s+(?:about|named|containing)\s+([\s\S]+)$/iu.exec(input);
  if (scrollTarget !== null) {
    const target = exactTail(input, input.length - scrollTarget[2]!.length);
    return target === null
      ? clarify("Say which heading or paragraph you want to bring into view.")
      : { type: "scroll-to-content", kind: scrollTarget[1]!.toLocaleLowerCase() as "heading" | "paragraph", target };
  }

  const find = /^(?:find|look for)\s+([\s\S]+)$/iu.exec(input);
  if (find !== null) {
    const query = exactTail(input, input.length - find[1]!.length);
    return query === null ? clarify("Say what text to find.") : { type: "find", query };
  }
  const question = /^(?:what does this page say about|what does the page say about|what does it say about)\s+([\s\S]+)$/iu.exec(input);
  if (question !== null) {
    const query = exactTail(input, input.length - question[1]!.length);
    return query === null
      ? clarify("Say what you want to ask about the page.")
      : { type: "question", query, ...(currentCapture?.identity !== undefined ? { identity: currentCapture.identity } : {}) };
  }
  const readTarget = /^read\s+(?:the\s+)?(heading|paragraph)\s+(?:about|named|containing)\s+([\s\S]+)$/iu.exec(input);
  if (readTarget !== null) {
    const target = exactTail(input, input.length - readTarget[2]!.length);
    if (target === null) return clarify("Say the heading or paragraph you want me to read.");
    return currentCapture?.identity === undefined
      ? clarify("I need a fresh page capture before I can read that content.")
      : { type: "read-page", identity: currentCapture.identity, kind: readTarget[1]!.toLocaleLowerCase() as "heading" | "paragraph", target };
  }

  return null;
}
