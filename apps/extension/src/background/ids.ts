export interface FrameElementIdentity {
  frameId: number;
  localId: string;
}

const LOCAL_ID_PATTERN = /^e[1-9]\d*$/;
const QUALIFIED_ID_PATTERN = /^f(0|[1-9]\d*)(e[1-9]\d*)$/;

/** Frame ids are browser-owned; local ids come from the content script's private registry. */
export function qualifyElementId(frameId: number, localId: string): string {
  if (!Number.isSafeInteger(frameId) || frameId < 0) throw new RangeError("frameId must be a non-negative safe integer");
  if (!LOCAL_ID_PATTERN.test(localId)) throw new TypeError("local element id is invalid");
  return `f${frameId}${localId}`;
}

/** Decode only ids that could have been produced by qualifyElementId. */
export function parseElementId(id: string): FrameElementIdentity | null {
  const match = QUALIFIED_ID_PATTERN.exec(id);
  if (!match) return null;
  const frameId = Number(match[1]);
  if (!Number.isSafeInteger(frameId)) return null;
  return { frameId, localId: match[2]! };
}
