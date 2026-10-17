import { Snapshot, type RawElement, type Snapshot as SnapshotData } from "@blip/protocol";
import type { ContentSnapshot } from "../shared/messages.js";
import { computeStructuralHash, changeSignature } from "../shared/signature.js";
import { qualifyElementId } from "./ids.js";
import { snapshotVersions, type SnapshotVersionTracker } from "./versions.js";

export const MAX_SNAPSHOT_ELEMENTS = 250;
export const FRAME_REQUEST_TIMEOUT_MS = 1_500;
export const FRAME_FALLBACK_ALERT = "Part of this page could not be read.";

export interface FrameInfo {
  frameId: number;
  parentFrameId: number;
  url: string;
  errorOccurred?: boolean;
}

export interface FrameCaptureResult {
  frameId: number;
  visible: boolean;
  snapshot?: ContentSnapshot;
  error?: "timeout" | "unavailable" | "invalid-response";
}

export interface FrameCaptureAdapter {
  listFrames(): Promise<FrameInfo[]>;
  readFrame(frameId: number, topOrigin: string): Promise<unknown>;
  isFrameVisible(frame: FrameInfo): Promise<boolean>;
  injectOnce?(): Promise<void>;
}

export interface CaptureFramesOptions {
  tabId: number;
  tabUrl: string;
  tabTitle?: string;
  snapshotId?: string;
  capturedAt?: number;
  timeoutMs?: number;
  adapter: FrameCaptureAdapter;
  versions?: SnapshotVersionTracker;
}

function responseSnapshot(value: unknown): ContentSnapshot | undefined {
  if (!value || typeof value !== "object" || !("t" in value) || value.t !== "snapshot.result" || !("snapshot" in value)) {
    return undefined;
  }
  const snapshot = value.snapshot;
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const candidate = snapshot as Partial<ContentSnapshot>;
  if (
    typeof candidate.title !== "string" || typeof candidate.url !== "string" || typeof candidate.origin !== "string" ||
    !Array.isArray(candidate.headings) || !Array.isArray(candidate.alerts) || !Array.isArray(candidate.elements) ||
    typeof candidate.truncated !== "boolean" || typeof candidate.structuralHash !== "string" ||
    typeof candidate.capturedAt !== "number"
  ) return undefined;
  return candidate as ContentSnapshot;
}

function orderFrames(frames: readonly FrameInfo[], includeTop = false): FrameInfo[] {
  const byId = new Map<number, FrameInfo>();
  for (const frame of frames) {
    if (Number.isSafeInteger(frame.frameId) && frame.frameId >= 0) byId.set(frame.frameId, frame);
  }
  if (includeTop && !byId.has(0)) byId.set(0, { frameId: 0, parentFrameId: -1, url: "" });
  return [...byId.values()].sort((left, right) =>
    left.frameId === right.frameId ? 0 : left.frameId === 0 ? -1 : right.frameId === 0 ? 1 : left.frameId - right.frameId,
  );
}

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("frame request timed out")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Fan out concurrently, with a firm per-frame deadline and a safe failure record. */
export async function captureFrameResults(
  frames: readonly FrameInfo[],
  topOrigin: string,
  adapter: Pick<FrameCaptureAdapter, "readFrame" | "isFrameVisible">,
  timeoutMs = FRAME_REQUEST_TIMEOUT_MS,
): Promise<FrameCaptureResult[]> {
  return Promise.all(orderFrames(frames).map(async (frame): Promise<FrameCaptureResult> => {
    const visibilityPromise = frame.frameId === 0
      ? Promise.resolve(true)
      : timeout(adapter.isFrameVisible(frame), timeoutMs).catch(() => true);
    try {
      const [response, visible] = await Promise.all([
        timeout(adapter.readFrame(frame.frameId, topOrigin), timeoutMs),
        visibilityPromise,
      ]);
      const snapshot = responseSnapshot(response);
      return snapshot ? { frameId: frame.frameId, visible, snapshot } : { frameId: frame.frameId, visible, error: "invalid-response" };
    } catch (error) {
      const visible = await visibilityPromise;
      return { frameId: frame.frameId, visible, error: error instanceof Error && error.message.includes("timed out") ? "timeout" : "unavailable" };
    }
  }));
}

export interface MergeFrameSnapshotsOptions {
  tabId: number;
  tabUrl: string;
  tabTitle?: string;
  snapshotId: string;
  capturedAt: number;
  frames: readonly FrameCaptureResult[];
  versions?: SnapshotVersionTracker;
}

/** Merge top-frame first and then ascending frame id, validate at the trust boundary. */
export function mergeFrameSnapshots(options: MergeFrameSnapshotsOptions): SnapshotData {
  let pageUrl: URL;
  try {
    pageUrl = new URL(options.tabUrl);
  } catch {
    throw new Error("target tab does not have a valid HTTP page URL");
  }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    throw new Error("target tab is not an HTTP page");
  }

  const frames = [...options.frames].sort((left, right) =>
    left.frameId === right.frameId ? 0 : left.frameId === 0 ? -1 : right.frameId === 0 ? 1 : left.frameId - right.frameId,
  );
  const top = frames.find((frame) => frame.frameId === 0 && frame.snapshot);
  if (!top?.snapshot) throw new Error("top frame snapshot was not available");

  const allElements: RawElement[] = [];
  const headings: Array<{ level: number; text: string }> = [];
  const alerts: string[] = [];
  let aFrameWasTruncated = false;
  for (const frame of frames) {
    if (frame.snapshot) {
      aFrameWasTruncated ||= frame.snapshot.truncated;
      for (const element of frame.snapshot.elements) {
        allElements.push({
          ...element,
          id: qualifyElementId(frame.frameId, element.id),
          frameId: frame.frameId,
        });
      }
      headings.push(...frame.snapshot.headings);
      alerts.push(...frame.snapshot.alerts);
    } else if (frame.frameId !== 0 && frame.visible) {
      alerts.push(FRAME_FALLBACK_ALERT);
    }
  }

  const elements = allElements.slice(0, MAX_SNAPSHOT_ELEMENTS);
  const snapshotWithoutVersion: Omit<SnapshotData, "version"> = {
    snapshotId: options.snapshotId,
    tabId: options.tabId,
    url: pageUrl.href,
    origin: pageUrl.origin,
    title: top.snapshot.title || options.tabTitle || "",
    headings: headings.slice(0, 40),
    alerts: alerts.slice(0, 20),
    elements,
    truncated: aFrameWasTruncated || allElements.length > MAX_SNAPSHOT_ELEMENTS,
    structuralHash: computeStructuralHash(elements),
    capturedAt: options.capturedAt,
  };
  if (top.snapshot.stepHint !== undefined) snapshotWithoutVersion.stepHint = top.snapshot.stepHint;

  const signature = changeSignature(snapshotWithoutVersion);
  const version = (options.versions ?? snapshotVersions).next(options.tabId, signature);
  const parsed = Snapshot.safeParse({ ...snapshotWithoutVersion, version });
  if (!parsed.success) throw new Error("merged frame snapshot failed protocol schema validation");
  return parsed.data;
}

/** Complete browser-backed capture, leaving Chrome API details behind the adapter. */
export async function captureTabSnapshot(options: CaptureFramesOptions): Promise<SnapshotData> {
  const tabUrl = new URL(options.tabUrl);
  if (tabUrl.protocol !== "http:" && tabUrl.protocol !== "https:") {
    throw new Error("target tab is not an HTTP page");
  }

  let discovered: FrameInfo[];
  try {
    discovered = await options.adapter.listFrames();
  } catch {
    discovered = [];
  }
  const ordered = orderFrames(discovered, true);
  let results = await captureFrameResults(ordered, tabUrl.origin, options.adapter, options.timeoutMs);
  const missingFrames = ordered.filter((frame) => !results.find((result) => result.frameId === frame.frameId)?.snapshot);
  if (missingFrames.length > 0 && options.adapter.injectOnce) {
    try {
      await timeout(options.adapter.injectOnce(), options.timeoutMs ?? FRAME_REQUEST_TIMEOUT_MS);
    } catch {
      // Injection is best-effort; the bounded retry below will produce the normal fallback result.
    }
    const retried = await captureFrameResults(missingFrames, tabUrl.origin, options.adapter, options.timeoutMs);
    const retriedById = new Map(retried.map((result) => [result.frameId, result]));
    results = results.map((result) => retriedById.get(result.frameId) ?? result);
  }
  return mergeFrameSnapshots({
    tabId: options.tabId,
    tabUrl: options.tabUrl,
    ...(options.tabTitle !== undefined ? { tabTitle: options.tabTitle } : {}),
    snapshotId: options.snapshotId ?? `${options.tabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    capturedAt: options.capturedAt ?? Date.now(),
    frames: results,
    ...(options.versions ? { versions: options.versions } : {}),
  });
}

