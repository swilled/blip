import { newId, type BrowserPageIdentity } from "@blip/protocol";

export const BROWSER_AUTHORIZATION_TTL_MS = 30_000;
export const BROWSER_AUTHORIZATION_GUARD_MS = 1_000;

export type BrowserAuthorizationTarget =
  | { op: "navigate"; url: string }
  | { op: "search"; route: "browser-default"; query: string }
  | { op: "open-link"; linkId: string; identity: BrowserPageIdentity };

export type BrowserAuthorization = {
  authorizationId: string;
  operation: BrowserAuthorizationTarget["op"];
  targetBinding: string;
  sourceTabId: number;
  sourcePageUrl: string;
  sourcePageIdentity: BrowserPageIdentity;
  readbackSpeakId: string;
  issuedAt: number;
  expiresAt: number;
  phrase: string;
  target: BrowserAuthorizationTarget;
  status: "awaiting-speech" | "guard" | "armed" | "consumed" | "invalidated";
  speechCompletedAt: number | null;
  readyAt: number | null;
};

export type BrowserAuthorizationFailure =
  | "missing"
  | "typed"
  | "phrase-mismatch"
  | "speech-incomplete"
  | "guard-active"
  | "expired"
  | "page-changed"
  | "tab-changed"
  | "already-used";

export type BrowserAuthorizationStore = {
  pending: BrowserAuthorization | null;
  begin(input: {
    target: BrowserAuthorizationTarget;
    sourcePageIdentity: BrowserPageIdentity;
    readbackSpeakId: string;
    phrase: string;
    now: number;
  }): BrowserAuthorization | null;
  completeSpeech(speakId: string, interrupted: boolean, now: number): boolean;
  arm(now: number): boolean;
  consume(input: {
    phrase: string;
    source: "voice" | "typed";
    tabId: number | null;
    pageUrl: string | null;
    pageIdentity: BrowserPageIdentity | null;
    now: number;
  }): { ok: true; authorization: BrowserAuthorization } | { ok: false; reason: BrowserAuthorizationFailure };
  invalidate(): BrowserAuthorization | null;
};

function normalizeExactPhrase(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/gu, " ").trim().replace(/[\p{P}\s]+$/gu, "").trim();
}

function bindingFor(target: BrowserAuthorizationTarget): string {
  switch (target.op) {
    case "navigate": return JSON.stringify([target.op, target.url]);
    case "search": return JSON.stringify([target.op, target.route, target.query]);
    case "open-link": return JSON.stringify([target.op, target.linkId, target.identity]);
  }
}

function sameIdentity(left: BrowserPageIdentity, right: BrowserPageIdentity): boolean {
  return left.captureId === right.captureId && left.captureRevision === right.captureRevision &&
    left.tabId === right.tabId && left.pageUrl === right.pageUrl;
}

/** In-memory one-use authorizations for high-impact browser operations. */
export function createBrowserAuthorizationStore(): BrowserAuthorizationStore {
  let pending: BrowserAuthorization | null = null;
  return {
    get pending() { return pending; },

    begin(input): BrowserAuthorization | null {
      this.invalidate();
      const expiresAt = input.now + BROWSER_AUTHORIZATION_TTL_MS;
      const identity = input.sourcePageIdentity;
      let canonicalPageUrl = false;
      try {
        canonicalPageUrl = identity.pageUrl !== "" && new URL(identity.pageUrl).href === identity.pageUrl;
      } catch {
        canonicalPageUrl = false;
      }
      if (!Number.isFinite(input.now) || !Number.isFinite(expiresAt) ||
          identity.tabId < 0 || identity.pageUrl === "" || input.readbackSpeakId === "" || input.phrase.trim() === "" ||
          !canonicalPageUrl) return null;
      const authorization: BrowserAuthorization = {
        authorizationId: newId(),
        operation: input.target.op,
        targetBinding: bindingFor(input.target),
        sourceTabId: identity.tabId,
        sourcePageUrl: identity.pageUrl,
        sourcePageIdentity: { ...identity },
        readbackSpeakId: input.readbackSpeakId,
        issuedAt: input.now,
        expiresAt,
        phrase: input.phrase,
        target: input.target,
        status: "awaiting-speech",
        speechCompletedAt: null,
        readyAt: null,
      };
      pending = authorization;
      return authorization;
    },

    completeSpeech(speakId, interrupted, now): boolean {
      if (pending === null || pending.status !== "awaiting-speech" || pending.readbackSpeakId !== speakId) return false;
      if (interrupted || !Number.isFinite(now) || now >= pending.expiresAt) {
        pending.status = "invalidated";
        pending = null;
        return false;
      }
      pending.speechCompletedAt = now;
      pending.readyAt = now + BROWSER_AUTHORIZATION_GUARD_MS;
      pending.status = "guard";
      return true;
    },

    arm(now): boolean {
      if (pending === null || pending.status !== "guard" || pending.readyAt === null) return false;
      if (!Number.isFinite(now) || now >= pending.expiresAt) {
        pending.status = "invalidated";
        pending = null;
        return false;
      }
      if (now < pending.readyAt) return false;
      pending.status = "armed";
      return true;
    },

    consume(input) {
      const current = pending;
      if (current === null) return { ok: false, reason: "missing" };
      const refuse = (reason: BrowserAuthorizationFailure) => {
        current.status = "invalidated";
        pending = null;
        return { ok: false as const, reason };
      };
      if (current.status === "consumed") return refuse("already-used");
      if (input.source !== "voice") return refuse("typed");
      if (normalizeExactPhrase(input.phrase) !== normalizeExactPhrase(current.phrase)) return refuse("phrase-mismatch");
      if (current.status === "awaiting-speech" || current.speechCompletedAt === null) return refuse("speech-incomplete");
      if (current.status !== "armed") {
        if (current.readyAt !== null && input.now < current.readyAt) return refuse("guard-active");
        return refuse("speech-incomplete");
      }
      if (!Number.isFinite(input.now) || input.now >= current.expiresAt) return refuse("expired");
      if (input.tabId !== current.sourceTabId) return refuse("tab-changed");
      if (input.pageUrl !== current.sourcePageUrl || input.pageIdentity === null ||
          !sameIdentity(input.pageIdentity, current.sourcePageIdentity)) return refuse("page-changed");

      // Clear the only live reference before the caller awaits or dispatches anything.
      current.status = "consumed";
      pending = null;
      return { ok: true, authorization: current };
    },

    invalidate() {
      const current = pending;
      if (current !== null) current.status = "invalidated";
      pending = null;
      return current;
    },
  };
}
