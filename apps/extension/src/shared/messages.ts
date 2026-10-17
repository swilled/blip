import type { ActRequest, ActResult, Snapshot } from "@blip/protocol";

/** Messages passed between the extension's service worker and each frame's content script. */
export type BackgroundToContentMessage =
  | { t: "snapshot"; topOrigin: string }
  | { t: "act"; request: ActRequest; snapshotVersion: number };

export type ContentSnapshot = Pick<
  Snapshot,
  | "title"
  | "url"
  | "origin"
  | "headings"
  | "alerts"
  | "stepHint"
  | "elements"
  | "truncated"
  | "structuralHash"
  | "capturedAt"
>;

export type ContentResponse =
  | { t: "snapshot.result"; snapshot: ContentSnapshot }
  | { t: "act.result"; result: ActResult }
  | { t: "error"; message: string };

export type ContentToBackgroundMessage =
  | { t: "ready" }
  | { t: "mutated"; structuralHash: string; changeSignature: string };
