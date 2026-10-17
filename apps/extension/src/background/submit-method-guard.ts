/// <reference types="chrome" />

const SUBMIT_METHOD_GUARD_SENTINEL = "blip-submit-method-guard-v1";

type SubmitMethodGuardProbeGlobal = typeof globalThis & {
  __blipSubmitMethodGuardInstalled?: unknown;
};

/** This function is serialized into the exact target frame's MAIN world by Chrome. */
function inspectSubmitMethodGuard(): string | null {
  const expectedSentinel = "blip-submit-method-guard-v1";
  if (typeof HTMLFormElement !== "function") return null;
  const scope = globalThis as SubmitMethodGuardProbeGlobal;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "submit");
  if (scope.__blipSubmitMethodGuardInstalled !== expectedSentinel ||
      descriptor?.configurable !== false || descriptor.writable !== false || descriptor.enumerable !== false ||
      typeof descriptor.value !== "function") {
    return null;
  }
  return expectedSentinel;
}

/** Verify one frame only; failed, missing, malformed, or ambiguous probes deny dispatch. */
export async function verifySubmitMethodGuard(tabId: number, frameId: number): Promise<boolean> {
  if (!Number.isSafeInteger(tabId) || tabId < 0 || !Number.isSafeInteger(frameId) || frameId < 0) return false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: inspectSubmitMethodGuard,
    });
    return Array.isArray(results) && results.length === 1 && results[0]?.result === SUBMIT_METHOD_GUARD_SENTINEL;
  } catch {
    return false;
  }
}
