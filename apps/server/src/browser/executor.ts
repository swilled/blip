import {
  BrowserRequestPayload,
  BrowserResultPayload,
  newId,
  type BrowserOperation,
  type BrowserRequestPayload as BrowserRequest,
  type BrowserResultPayload as BrowserResult,
} from "@blip/protocol";
import type { Hub } from "../hub/hub";
import type { Session } from "../session/session";

const BROWSER_REQUEST_TIMEOUT_MS = 8_000;

export type BrowserExecutorResult =
  | { ok: true; payload: BrowserResult }
  | { ok: false; reason: "no-extension" | "no-current-tab" | "invalid-request" | "request-failed" | "invalid-result" };

export type BrowserExecutor = {
  execute(operation: BrowserOperation): Promise<BrowserExecutorResult>;
};

function sameIdentity(
  left: NonNullable<Session["browserCapture"]>["identity"],
  right: NonNullable<Session["browserCapture"]>["identity"],
): boolean {
  return left !== undefined && right !== undefined && left.captureId === right.captureId &&
    left.captureRevision === right.captureRevision && left.tabId === right.tabId && left.pageUrl === right.pageUrl;
}

function updateCurrentCapture(session: Session, payload: BrowserResult): void {
  if (!payload.ok) return;
  switch (payload.operation) {
    case "capture": {
      const previous = session.browserCapture;
      const keepPageData = sameIdentity(previous?.identity, payload.result);
      session.applyBrowserCapture({
        identity: payload.result,
        blocks: payload.result.blocks,
        items: payload.result.items ?? [],
        links: keepPageData ? previous!.links : [],
        ...(keepPageData && previous?.tabs !== undefined ? { tabs: previous.tabs } : {}),
      });
      return;
    }
    case "list-links": {
      const previous = session.browserCapture;
      const keepPageData = sameIdentity(previous?.identity, payload.result);
      session.applyBrowserCapture({
        identity: payload.result,
        blocks: keepPageData ? previous!.blocks : [],
        items: keepPageData ? previous?.items ?? [] : [],
        links: payload.result.links,
        ...(keepPageData && previous?.tabs !== undefined ? { tabs: previous.tabs } : {}),
      });
      return;
    }
    case "read-content": {
      const previous = session.browserCapture;
      const keepPageData = sameIdentity(previous?.identity, payload.result);
      session.applyBrowserCapture({
        identity: payload.result,
        blocks: payload.result.blocks,
        items: keepPageData ? previous?.items ?? [] : [],
        links: keepPageData ? previous!.links : [],
        ...(keepPageData && previous?.tabs !== undefined ? { tabs: previous.tabs } : {}),
      });
      return;
    }
    case "tabs": {
      const changedTab = session.tabId !== payload.result.activeTabId;
      if (changedTab) {
        session.clearBrowserAuthorization();
        session.stale = true;
        session.tabId = payload.result.activeTabId;
      }
      session.applyBrowserCapture({
        ...(changedTab ? { blocks: [], items: [], links: [] } : session.browserCapture ?? { blocks: [], items: [], links: [] }),
        tabs: payload.result,
      });
      return;
    }
    case "scroll":
    case "find": {
      const previous = session.browserCapture;
      if (previous?.identity === undefined) return;
      const keepPageData = sameIdentity(previous.identity, payload.result.identity);
      session.applyBrowserCapture({
        identity: payload.result.identity,
        blocks: keepPageData ? previous.blocks : [],
        items: keepPageData ? previous.items ?? [] : [],
        links: keepPageData ? previous.links : [],
        ...(keepPageData && previous.tabs !== undefined ? { tabs: previous.tabs } : {}),
      });
      return;
    }
    default:
      return;
  }
}

/** The single core dispatch path for the validated, closed browser.request operation union. */
export function createBrowserExecutor(options: { hub: Hub; session: Session }): BrowserExecutor {
  const { hub, session } = options;
  return {
    async execute(operation): Promise<BrowserExecutorResult> {
      if (!session.extensionConnected) return { ok: false, reason: "no-extension" };
      const tabOperation = operation.op === "tabs";
      const createsOrSelectsTab = tabOperation && (operation.action === "open-blank" || operation.action === "switch");
      if (session.tabId === null && !tabOperation) return { ok: false, reason: "no-current-tab" };

      const changesPage = operation.op === "navigate" || operation.op === "history" || operation.op === "reload" ||
        operation.op === "search" || operation.op === "open-link" || createsOrSelectsTab;
      if (changesPage) {
        session.clearBrowserAuthorization();
        session.browserCapture = null;
        session.stale = true;
      }

      const requestId = newId();
      const request: BrowserRequest = {
        requestId,
        ...(session.tabId !== null && !(operation.op === "tabs" && operation.action === "open-blank")
          ? { tabId: session.tabId }
          : {}),
        operation,
      };
      const checkedRequest = BrowserRequestPayload.safeParse(request);
      if (!checkedRequest.success) return { ok: false, reason: "invalid-request" };

      let response: { payload: BrowserResult };
      try {
        response = await hub.request(
          "extension",
          "browser.request",
          checkedRequest.data,
          { expect: "browser.result", timeoutMs: BROWSER_REQUEST_TIMEOUT_MS },
        );
      } catch {
        return { ok: false, reason: "request-failed" };
      }
      const checkedResult = BrowserResultPayload.safeParse(response.payload);
      if (!checkedResult.success || checkedResult.data.requestId !== requestId || checkedResult.data.operation !== operation.op) {
        return { ok: false, reason: "invalid-result" };
      }
      updateCurrentCapture(session, checkedResult.data);
      return { ok: true, payload: checkedResult.data };
    },
  };
}
