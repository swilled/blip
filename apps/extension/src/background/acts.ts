import { ActResult as ActResultSchema, buildFrame, type ActRequest, type ActResult, type Message, type Snapshot as SnapshotData } from "@blip/protocol";
import { createFrameCaptureAdapter } from "./dispatch.js";
import {
  captureTabSnapshot,
  FRAME_REQUEST_TIMEOUT_MS,
  sensitiveValueShape,
  type CaptureFramesOptions,
  type FrameCaptureAdapter,
} from "./frames.js";
import { parseElementId } from "./ids.js";
import { findTargetTab, type TargetTab } from "./tabs.js";

type ActRequestMessage = Extract<Message, { type: "act.request" }>;
type ActSocket = Pick<WebSocket, "readyState" | "send">;

export interface ActFrameAdapter extends FrameCaptureAdapter {
  sendAct(frameId: number, request: ActRequest, snapshotVersion: number): Promise<unknown>;
}

export interface ActDispatchDependencies {
  findTargetTab(requestedTabId?: number): Promise<TargetTab | undefined>;
  createFrameAdapter(tabId: number, tabUrl: string): ActFrameAdapter;
  captureTabSnapshot(options: CaptureFramesOptions): Promise<SnapshotData>;
}

const defaultDependencies: ActDispatchDependencies = {
  findTargetTab,
  createFrameAdapter: createFrameCaptureAdapter,
  captureTabSnapshot,
};

function reply(socket: ActSocket, message: ActRequestMessage, result: ActResult): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(buildFrame("act.result", result, { replyTo: message.id })));
}

function failure(actId: string, error: NonNullable<ActResult["error"]>, newSnapshotVersion?: number): ActResult {
  return {
    actId,
    ok: false,
    error,
    ...(newSnapshotVersion !== undefined ? { newSnapshotVersion } : {}),
  };
}

function contentActResult(value: unknown, expectedActId: string): ActResult | undefined {
  if (!value || typeof value !== "object" || !("t" in value) || value.t !== "act.result" || !("result" in value)) {
    return undefined;
  }
  const parsed = ActResultSchema.safeParse(value.result);
  if (!parsed.success || parsed.data.actId !== expectedActId) return undefined;
  return parsed.data;
}

/** Recheck page-controlled output before it crosses from the service worker to the server. */
function sanitizeActResult(result: ActResult): ActResult {
  if (result.error === "sensitive-field") {
    return { actId: result.actId, ok: false, error: "sensitive-field", observedValue: null };
  }
  if (typeof result.observedValue === "string" && sensitiveValueShape(result.observedValue)) {
    return { actId: result.actId, ok: false, error: "sensitive-field", observedValue: null };
  }
  return result;
}

async function capture(
  dependencies: ActDispatchDependencies,
  tab: TargetTab,
  adapter: ActFrameAdapter,
): Promise<SnapshotData> {
  return dependencies.captureTabSnapshot({
    tabId: tab.id,
    tabUrl: tab.url,
    ...(tab.title !== undefined ? { tabTitle: tab.title } : {}),
    adapter,
  });
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("frame action timed out")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Resolve a server action against a fresh frame tree, act in its owning frame, then refresh. */
export async function dispatchActRequest(
  message: ActRequestMessage,
  socket: ActSocket,
  dependencies: ActDispatchDependencies = defaultDependencies,
): Promise<void> {
  const request = message.payload;
  try {
    const tab = await dependencies.findTargetTab(request.tabId);
    if (!tab || tab.id !== request.tabId) {
      reply(socket, message, failure(request.actId, "target-not-found"));
      return;
    }

    const identity = parseElementId(request.action.targetId);
    if (!identity) {
      reply(socket, message, failure(request.actId, "target-not-found"));
      return;
    }

    const adapter = dependencies.createFrameAdapter(tab.id, tab.url);
    let before: SnapshotData;
    try {
      before = await capture(dependencies, tab, adapter);
    } catch {
      reply(socket, message, failure(request.actId, "exception"));
      return;
    }

    const target = before.elements.find((element) => element.id === request.action.targetId && element.frameId === identity.frameId);
    if (!target) {
      reply(socket, message, failure(request.actId, "target-not-found", before.version));
      return;
    }
    if (before.version !== request.snapshotVersion) {
      reply(socket, message, failure(request.actId, "stale-snapshot", before.version));
      return;
    }

    let result: ActResult;
    try {
      const contentResponse = await withDeadline(
        adapter.sendAct(identity.frameId, request, before.version),
        FRAME_REQUEST_TIMEOUT_MS,
      );
      result = contentActResult(contentResponse, request.actId) ?? failure(request.actId, "exception");
    } catch {
      result = failure(request.actId, "exception");
    }
    result = sanitizeActResult(result);

    // Even a failed frame response may follow a page-side write. Recapture before returning any
    // observation so a card-shaped value is classified and removed at the background boundary.
    try {
      const after = await capture(dependencies, tab, adapter);
      result = { ...result, newSnapshotVersion: after.version };
    } catch {
      // Never return an unverified read-back if the post-act snapshot cannot be sanitized.
      result = failure(request.actId, result.error === "sensitive-field" ? "sensitive-field" : "exception");
    }
    reply(socket, message, result);
  } catch {
    reply(socket, message, failure(request.actId, "exception"));
  }
}
