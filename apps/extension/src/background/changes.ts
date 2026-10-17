import { onSocketWelcome, sendPageChanged } from "./socket.js";
import { findTargetTab } from "./tabs.js";
import { registerNavigationListeners } from "./navigation.js";

export type PageChange = {
  tabId: number;
  url: string;
  reason: "navigation" | "tab-activated" | "mutation";
  structuralHash?: string;
};

export type PageChangeScheduler = {
  enqueue(change: PageChange): void;
  cancel(tabId: number): void;
};

type TimerApi = {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
};

const PRIORITY: Record<PageChange["reason"], number> = {
  mutation: 1,
  "tab-activated": 2,
  navigation: 3,
};

/** Coalesce bursts per tab while retaining the strongest signal and newest URL/hash. */
export function createPageChangeScheduler(
  send: (change: PageChange) => void,
  options: { debounceMs?: number; timers?: TimerApi } = {},
): PageChangeScheduler {
  const debounceMs = Math.max(0, options.debounceMs ?? 60);
  const timers = options.timers ?? globalThis;
  const pending = new Map<number, { change: PageChange; timer: ReturnType<typeof setTimeout> }>();

  return {
    enqueue(change) {
      const previous = pending.get(change.tabId);
      if (previous) timers.clearTimeout(previous.timer);
      const reason = previous && PRIORITY[previous.change.reason] > PRIORITY[change.reason]
        ? previous.change.reason
        : change.reason;
      const merged: PageChange = {
        tabId: change.tabId,
        url: change.url,
        reason,
        ...(change.reason === "mutation" && change.structuralHash !== undefined
          ? { structuralHash: change.structuralHash }
          : {}),
      };
      const timer = timers.setTimeout(() => {
        pending.delete(change.tabId);
        try {
          send(merged);
        } catch {
          // A disconnected socket is recovered by the next welcome's initial target signal.
        }
      }, debounceMs);
      pending.set(change.tabId, { change: merged, timer });
    },
    cancel(tabId) {
      const previous = pending.get(tabId);
      if (!previous) return;
      timers.clearTimeout(previous.timer);
      pending.delete(tabId);
    },
  };
}

export type MutationSender = { id?: string; tab?: { id?: number } };

export function isAuthorizedMutation(message: unknown, sender: MutationSender, extensionId: string): message is {
  t: "mutated";
  structuralHash: string;
  changeSignature: string;
} {
  if (sender.id !== extensionId || !Number.isSafeInteger(sender.tab?.id)) return false;
  if (typeof message !== "object" || message === null || !("t" in message)) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.t === "mutated" &&
    typeof candidate.structuralHash === "string" && candidate.structuralHash.length > 0 && candidate.structuralHash.length <= 128 &&
    typeof candidate.changeSignature === "string" && candidate.changeSignature.length > 0 && candidate.changeSignature.length <= 512;
}

function mutationCandidate(message: unknown): boolean {
  return typeof message === "object" && message !== null && "t" in message &&
    (message as { t?: unknown }).t === "mutated";
}

let activeScheduler: PageChangeScheduler | undefined;
let stopNavigation: (() => void) | undefined;
let stopWelcome: (() => void) | undefined;

async function signalCurrentTarget(scheduler: PageChangeScheduler): Promise<void> {
  const target = await findTargetTab();
  if (target) scheduler.enqueue({ tabId: target.id, url: target.url, reason: "tab-activated" });
}

/** Register page events before opening the socket; the first signal is emitted only after welcome. */
export function registerPageChangeTracking(): void {
  if (activeScheduler) return;
  const scheduler = createPageChangeScheduler((change) => { sendPageChanged(change); });
  activeScheduler = scheduler;
  stopNavigation = registerNavigationListeners({ scheduler });
  stopWelcome = onSocketWelcome(() => { void signalCurrentTarget(scheduler); });
}

/** Consume content-script mutation messages; only the selected, supported page tab can report. */
export function handleContentRuntimeMessage(message: unknown, sender: MutationSender): boolean {
  if (!mutationCandidate(message)) return false;
  const extensionId = globalThis.chrome?.runtime?.id ?? "";
  if (!isAuthorizedMutation(message, sender, extensionId)) return true;
  const tabId = sender.tab!.id!;
  const scheduler = activeScheduler;
  if (!scheduler) return true;

  void (async () => {
    const [reportedTab, selectedTab] = await Promise.all([findTargetTab(tabId), findTargetTab()]);
    if (!reportedTab || selectedTab?.id !== tabId) return;
    scheduler.enqueue({
      tabId,
      url: reportedTab.url,
      reason: "mutation",
      structuralHash: message.structuralHash,
    });
  })();
  return true;
}

/** Test cleanup only; production keeps listeners for the lifetime of the MV3 worker. */
export function disposePageChangeTrackingForTest(): void {
  stopNavigation?.();
  stopWelcome?.();
  stopNavigation = undefined;
  stopWelcome = undefined;
  activeScheduler = undefined;
}
