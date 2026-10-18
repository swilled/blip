import { buildFrame } from "@blip/protocol";
import type { ActRequest, Message } from "@blip/protocol";
import {
  captureTabSnapshot,
  type FrameInfo,
  type FrameCaptureAdapter,
} from "./frames.js";
import { findTargetTab } from "./tabs.js";
import type { BrowserContentRequest } from "../shared/messages.js";

type SnapshotRequest = Extract<Message, { type: "snapshot.request" }>;
type SnapshotSocket = Pick<WebSocket, "readyState" | "send">;
type VisibleFrameElement = { url: string; visible: boolean };
type BrowserFrame = { frameId: number; parentFrameId: number; url: string; errorOccurred?: boolean };
type BrowserApi = {
  tabs: {
    sendMessage(tabId: number, message: unknown, options: { frameId: number }): Promise<unknown>;
  };
  scripting: {
    executeScript(options: {
      target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
      func?: () => VisibleFrameElement[];
      files?: string[];
    }): Promise<Array<{ result?: unknown }>>;
  };
  webNavigation: {
    getAllFrames(options: { tabId: number }): Promise<BrowserFrame[] | undefined>;
  };
};

function browserApi(): BrowserApi {
  const api = (globalThis as typeof globalThis & { chrome?: BrowserApi }).chrome;
  if (!api) throw new Error("extension browser APIs are unavailable");
  return api;
}

/** Route content-only browser reads to the top frame; child-frame data is never aggregated here. */
export function sendBrowserContentRequest(tabId: number, request: BrowserContentRequest): Promise<unknown> {
  return browserApi().tabs.sendMessage(tabId, request, { frameId: 0 });
}

function visibleFrameElements(): VisibleFrameElement[] {
  return Array.from(document.querySelectorAll("iframe, frame"), (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const url = "src" in element && typeof element.src === "string" ? element.src : "";
    return {
      url,
      visible: !element.hasAttribute("hidden") && style.display !== "none" &&
        style.visibility !== "hidden" && style.visibility !== "collapse" && rect.width > 0 && rect.height > 0,
    };
  });
}

function urlKey(value: string, base: string): string | undefined {
  try {
    const url = new URL(value, base);
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function visibilityByFrameId(
  parentFrame: FrameInfo,
  children: readonly FrameInfo[],
  elements: readonly VisibleFrameElement[],
): Map<number, boolean> {
  const assignments = new Map<number, boolean>();
  const remaining = new Set(elements.map((_, index) => index));
  const parentUrl = parentFrame.url;

  for (const child of children) {
    const childKey = urlKey(child.url, parentUrl);
    if (childKey === undefined) continue;
    const match = [...remaining].find((index) => urlKey(elements[index]!.url, parentUrl) === childKey);
    if (match === undefined) continue;
    remaining.delete(match);
    assignments.set(child.frameId, elements[match]!.visible);
  }

  // Redirects can change the final frame URL; pair remaining children with the remaining DOM frames.
  for (const child of children) {
    if (assignments.has(child.frameId)) continue;
    const next = remaining.values().next().value as number | undefined;
    if (next === undefined) {
      // A frame exists in webNavigation but has no matching DOM element; visibility is unknown.
      assignments.set(child.frameId, true);
    } else {
      remaining.delete(next);
      assignments.set(child.frameId, elements[next]!.visible);
    }
  }
  return assignments;
}

export function createFrameCaptureAdapter(tabId: number, _tabUrl: string): FrameCaptureAdapter & {
  sendAct(frameId: number, request: ActRequest, snapshotVersion: number): Promise<unknown>;
} {
  let frames: FrameInfo[] = [];
  const visibilityByParent = new Map<number, Promise<Map<number, boolean>>>();

  async function inspectParent(parentFrameId: number): Promise<Map<number, boolean>> {
    const existing = visibilityByParent.get(parentFrameId);
    if (existing) return existing;
    const pending = (async () => {
      const parent = frames.find((frame) => frame.frameId === parentFrameId);
      const siblings = frames.filter((frame) => frame.parentFrameId === parentFrameId)
        .sort((left, right) => left.frameId - right.frameId);
      if (!parent || siblings.length === 0) return new Map<number, boolean>();
      const results = await browserApi().scripting.executeScript({
        target: { tabId, frameIds: [parentFrameId] },
        func: visibleFrameElements,
      });
      const elements = results[0]?.result as VisibleFrameElement[] | undefined;
      if (!Array.isArray(elements)) throw new Error("frame visibility was unavailable");
      return visibilityByFrameId(parent, siblings, elements);
    })();
    visibilityByParent.set(parentFrameId, pending);
    return pending;
  }

  return {
    async listFrames() {
      const discovered = await browserApi().webNavigation.getAllFrames({ tabId });
      frames = (discovered ?? []).map((frame) => ({
        frameId: frame.frameId,
        parentFrameId: frame.parentFrameId,
        url: frame.url,
        errorOccurred: frame.errorOccurred,
      }));
      return frames;
    },
    async readFrame(frameId, topOrigin) {
      const frame = frames.find((candidate) => candidate.frameId === frameId);
      if (frame?.errorOccurred) throw new Error("frame navigation failed");
      return browserApi().tabs.sendMessage(tabId, { t: "snapshot", topOrigin }, { frameId });
    },
    async sendAct(frameId, request, snapshotVersion) {
      const frame = frames.find((candidate) => candidate.frameId === frameId);
      if (!frame || frame.errorOccurred) throw new Error("target frame is unavailable");
      return browserApi().tabs.sendMessage(tabId, { t: "act", request, snapshotVersion }, { frameId });
    },
    async isFrameVisible(frame) {
      const byId = await inspectParent(frame.parentFrameId);
      return byId.get(frame.frameId) ?? true;
    },
    async injectOnce() {
      await browserApi().scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"],
      });
    },
  };
}

function reply(socket: SnapshotSocket, message: SnapshotRequest, payload: { ok: false; error: { code: string; message: string } } | { ok: true; snapshot: Awaited<ReturnType<typeof captureTabSnapshot>> }): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(buildFrame("snapshot.result", payload, { replyTo: message.id })));
}

/** Handle the real WebSocket snapshot request using Chrome's browser-owned frame tree. */
export function dispatchSnapshotRequest(message: SnapshotRequest, socket: SnapshotSocket): void {
  void (async () => {
    const tab = await findTargetTab(message.payload.tabId);
    if (!tab || tab.id === undefined || tab.url === undefined) {
      reply(socket, message, { ok: false, error: { code: "unsupported-page", message: "No supported page tab is available." } });
      return;
    }
    let snapshot;
    try {
      snapshot = await captureTabSnapshot({
        tabId: tab.id,
        tabUrl: tab.url,
        ...(tab.title !== undefined ? { tabTitle: tab.title } : {}),
        adapter: createFrameCaptureAdapter(tab.id, tab.url),
      });
    } catch {
      reply(socket, message, { ok: false, error: { code: "snapshot-unavailable", message: "The page could not be read safely." } });
      return;
    }
    reply(socket, message, { ok: true, snapshot });
  })();
}
