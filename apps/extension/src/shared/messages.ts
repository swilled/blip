import type {
  ActRequest,
  ActResult,
  BrowserContentResult,
  BrowserLinkListResult,
  BrowserPageIdentity,
  BrowserResultPayload,
  Snapshot,
} from "@blip/protocol";

type BrowserFindResult = Extract<BrowserResultPayload, { ok: true; operation: "find" }>["result"];
type BrowserScrollResult = Extract<BrowserResultPayload, { ok: true; operation: "scroll" }>["result"];

export type BrowserContentRequest =
  | { t: "browser-content"; operation: "capture" | "list-links"; identity: BrowserPageIdentity }
  | { t: "browser-content"; operation: "read-content"; identity: BrowserPageIdentity; contentId: string; kind: "heading" | "paragraph" }
  | { t: "browser-content"; operation: "open-link"; identity: BrowserPageIdentity; linkId: string; authorizationId: string }
  | { t: "browser-content"; operation: "scroll"; identity: BrowserPageIdentity; direction: "up" | "down"; pixels: number }
  | { t: "browser-content"; operation: "scroll"; identity: BrowserPageIdentity; contentId: string; kind: "heading" | "paragraph" }
  | { t: "browser-content"; operation: "find"; identity: BrowserPageIdentity; query: string };

export type BrowserContentResponse =
  | { t: "browser-content.result"; operation: "capture"; result: BrowserContentResult }
  | { t: "browser-content.result"; operation: "list-links"; result: BrowserLinkListResult }
  | { t: "browser-content.result"; operation: "read-content"; result: BrowserContentResult }
  | { t: "browser-content.result"; operation: "open-link"; result: { identity: BrowserPageIdentity; frameId: number; href: string } }
  | { t: "browser-content.result"; operation: "scroll"; result: BrowserScrollResult }
  | { t: "browser-content.result"; operation: "find"; result: BrowserFindResult }
  | { t: "browser-content.error"; operation: BrowserContentRequest["operation"]; code: string; message: string };

/** Messages passed between the extension's service worker and each frame's content script. */
export type BackgroundToContentMessage =
  | { t: "snapshot"; topOrigin: string }
  | { t: "act"; request: ActRequest; snapshotVersion: number }
  | BrowserContentRequest;

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
  | "untrustedInstructionDetected"
  | "structuralHash"
  | "capturedAt"
>;

export type ContentResponse =
  | { t: "snapshot.result"; snapshot: ContentSnapshot }
  | { t: "act.result"; result: ActResult }
  | BrowserContentResponse
  | { t: "error"; message: string };

export type ContentToBackgroundMessage =
  | { t: "ready" }
  | { t: "mutated"; structuralHash: string; changeSignature: string };
