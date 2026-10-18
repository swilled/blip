import { newId, type ActionKind, type DialogueStateName, type FormModel, type PayloadOf, type Snapshot, type StatePayload } from "@blip/protocol";
import { createGrantStore, type GrantBinding, type GrantStore } from "../act/grants";
import { buildBaselineFormModel, summarizeFormModel } from "../baseline";
import { createBrowserAuthorizationStore, type BrowserAuthorization, type BrowserAuthorizationStore } from "../browser/authorization";
import type { BrowserCapture } from "../browser/commands";
import { createPageTask, pageTaskMatchesCapture, type ActivePageTask, type NewPageTask } from "../browser/task-state";

export const SERVER_VERSION = "0.1.0";

export type Brain = "agy" | "fake";
export type OutputMode = PayloadOf<"settings">["outputMode"];

/** The pending read-back contains only the grant fingerprint inputs; sensitive field values are null. */
export type PendingGatedAction = {
  targetId: string;
  kind: ActionKind;
  actionLabel: string;
  phrase: string;
  tabId: number;
  url: string;
  snapshotVersion: number;
  speakId: string;
  speechCompletedAt: number | null;
  readyAt: number | null;
  binding: GrantBinding;
  grantId?: string;
  expiresAt?: number;
  dispatching?: boolean;
};

/**
 * Per-process session state the hub reports to the voice UI. The turn handler mutates `dialogue`,
 * `page`, `busy` and `model` and asks the hub to push; the hub itself only owns `extensionConnected`.
 */
export class Session {
  readonly sessionId: string = newId();
  readonly brain: Brain;
  dialogue: DialogueStateName = "no-page";
  page: StatePayload["page"] = null;
  focusFieldId: string | undefined = undefined;
  busy = false;
  /** The latest baseline form model built from a snapshot, or null before the first one. */
  model: FormModel | null = null;
  /** The tab whose snapshot currently backs `model`. */
  tabId: number | null = null;
  /** Local time at which the currently cached model was accepted. */
  modelAt: number | null = null;
  /** True when the cached model may no longer match the page (page.changed, new extension). */
  stale = true;
  /** The text of the last `speak` the server sent, for "repeat". */
  lastSpoken: string | null = null;
  /** Voice output belongs to this session; a different voice connection cannot change another session. */
  outputMode: OutputMode = "agent-voice";
  /** Latest successfully sent speech; stale speak.done frames cannot complete newer speech. */
  activeSpeakId: string | null = null;
  #speech = new Map<string, {
    category: string;
    completedAt: number | null;
    interrupted: boolean;
    voiceCompletionExpected: boolean;
  }>();
  /** Confirmation state is local to this voice session and never comes from an Intent. */
  pendingGatedAction: PendingGatedAction | null = null;
  /** Existing server-only one-use grant store from the Phase 3 foundation. */
  readonly grants: GrantStore;

  #extensionConnected = false;
  /** Whether the current voice-role socket is bound to this session. */
  #voiceConnected = false;
  /** Current bounded browser capture and one-use authorization are separate from form submit grants. */
  #browserCapture: BrowserCapture | null = null;
  /** One bounded, identity-bound page task; proposed text is never stored as observed draft state. */
  activePageTask: ActivePageTask | null = null;
  readonly browserAuthorizations: BrowserAuthorizationStore = createBrowserAuthorizationStore();
  #snapshotOrder: { tabId: number; version: number; capturedAt: number } | null = null;
  #snapshotRevision = 0;

  constructor(brain: Brain, clock: () => number = Date.now) {
    this.brain = brain;
    this.grants = createGrantStore(clock);
  }

  /** Track a speech only after its selected output path accepted the request. */
  trackSpeech(speakId: string, category = "answer"): void {
    this.activeSpeakId = speakId;
    // NVDA's Controller Client speakText call only reports dispatch acceptance. It has no
    // completion callback, so its acknowledgement must never satisfy a confirmation read-back.
    this.#speech.set(speakId, {
      category,
      completedAt: null,
      interrupted: false,
      voiceCompletionExpected: this.outputMode === "agent-voice",
    });
    while (this.#speech.size > 256) {
      const oldest = this.#speech.keys().next().value;
      if (oldest === undefined) break;
      this.#speech.delete(oldest);
    }
  }

  /** Record completion only for speech emitted by this server session; duplicate frames are ignored. */
  completeSpeech(speakId: string, interrupted = false, completedAt = Date.now()): boolean {
    const speech = this.#speech.get(speakId);
    if (
      speech === undefined || speech.completedAt !== null || !speech.voiceCompletionExpected ||
      !Number.isFinite(completedAt)
    ) return false;
    this.#speech.set(speakId, { ...speech, completedAt, interrupted });
    if (this.activeSpeakId === speakId) this.activeSpeakId = null;
    return true;
  }

  /** Drop a speech whose selected output accepted it but cannot report when playback finished. */
  abandonSpeech(speakId: string): boolean {
    const removed = this.#speech.delete(speakId);
    if (this.activeSpeakId === speakId) this.activeSpeakId = null;
    return removed;
  }

  /** Read completion evidence for a server-tracked speech id. */
  speechCompletion(speakId: string): { category: string; completedAt: number; interrupted: boolean } | null {
    const speech = this.#speech.get(speakId);
    return speech?.completedAt === null || speech === undefined
      ? null
      : { category: speech.category, completedAt: speech.completedAt, interrupted: speech.interrupted };
  }

  get extensionConnected(): boolean {
    return this.#extensionConnected;
  }

  get browserCapture(): BrowserCapture | null {
    return this.#browserCapture;
  }

  /** Invalidate a task immediately whenever the accepted capture stops proving its source binding. */
  set browserCapture(value: BrowserCapture | null) {
    if (this.activePageTask !== null && !pageTaskMatchesCapture(this.activePageTask, value, this.tabId)) {
      this.clearPageTask();
    }
    this.#browserCapture = value;
  }

  /** Monotonic process-local generation for rejecting repair work from replaced accepted snapshots. */
  get snapshotRevision(): number {
    return this.#snapshotRevision;
  }

  /** Age of the cached model, or null before the first accepted snapshot. */
  get modelAgeMs(): number | null {
    return this.modelAt === null ? null : Math.max(0, Date.now() - this.modelAt);
  }

  /**
   * Whenever an extension binds (even a replacement), whatever model we cached belongs to a previous
   * connection, so mark it stale. Setting false changes nothing else: the cached model stays readable
   * until the next fetch, but `ensureSnapshot` refuses to speak about an unconnected page.
   */
  set extensionConnected(value: boolean) {
    const browserAuthorization = this.browserAuthorizations.invalidate();
    this.browserCapture = null;
    if (value) {
      this.clearPendingGatedAction();
      this.stale = true;
      this.#snapshotOrder = null;
    } else {
      this.clearPendingGatedAction();
    }
    this.#extensionConnected = value;
    if (browserAuthorization !== null) this.dialogue = this.model !== null && value && !this.stale ? "ready" : "no-page";
  }

  get voiceConnected(): boolean {
    return this.#voiceConnected;
  }

  set voiceConnected(value: boolean) {
    if (!value || this.#voiceConnected) {
      this.clearBrowserAuthorization();
      this.browserCapture = null;
      this.clearPageTask();
    }
    this.#voiceConnected = value;
  }

  get pendingBrowserAuthorization(): BrowserAuthorization | null {
    return this.browserAuthorizations.pending;
  }

  clearBrowserAuthorization(): BrowserAuthorization | null {
    const pending = this.browserAuthorizations.invalidate();
    if (pending !== null) this.dialogue = this.model !== null && this.extensionConnected && !this.stale ? "ready" : "no-page";
    return pending;
  }

  applyBrowserCapture(capture: BrowserCapture): void {
    const previous = this.browserCapture?.identity;
    const next = capture.identity;
    const sameIdentity = previous !== undefined && next !== undefined &&
      previous.captureId === next.captureId && previous.captureRevision === next.captureRevision &&
      previous.tabId === next.tabId && previous.pageUrl === next.pageUrl;
    if (previous !== undefined && next !== undefined && !sameIdentity) {
      this.clearBrowserAuthorization();
      this.stale = true;
    }
    const matchesCapture = (record: { identity: NonNullable<BrowserCapture["identity"]> }) => next !== undefined &&
      record.identity.captureId === next.captureId && record.identity.captureRevision === next.captureRevision &&
      record.identity.tabId === next.tabId && record.identity.pageUrl === next.pageUrl;
    this.browserCapture = {
      ...capture,
      blocks: next === undefined ? [] : capture.blocks.filter(matchesCapture),
      links: next === undefined ? [] : capture.links.filter(matchesCapture),
      ...(capture.items !== undefined ? { items: next === undefined ? [] : capture.items.filter(matchesCapture) } : {}),
    };
  }

  /** Replace the sole active page task after revalidating it against the exact accepted capture. */
  setActivePageTask(input: NewPageTask): boolean {
    const task = createPageTask(input);
    if (task === null || !pageTaskMatchesCapture(task, this.browserCapture, this.tabId)) return false;
    this.clearPageTask();
    this.activePageTask = task;
    return true;
  }

  /** Bind a later one-use grant to the active task without retaining a model proposal. */
  associatePageTaskGrant(grantId: string): boolean {
    const current = this.activePageTask;
    if (current === null) return false;
    const updated = createPageTask({ ...current, associatedGrantId: grantId });
    if (updated === null || !pageTaskMatchesCapture(updated, this.browserCapture, this.tabId)) return false;
    this.activePageTask = updated;
    return true;
  }

  /** Scrub retained text and draft bindings, and revoke a grant created for this task. */
  clearPageTask(): ActivePageTask | null {
    const task = this.activePageTask;
    if (task === null) return null;
    const grantId = task.associatedGrantId;
    if (grantId !== null) {
      this.grants.clear(grantId);
      if (this.pendingGatedAction?.grantId === grantId) this.clearPendingGatedAction();
    }
    task.sourceExcerpt = "";
    task.draftTargetId = null;
    task.recipientBinding = null;
    task.actionTargetBinding = null;
    task.lastObservedDraftValue = null;
    task.associatedGrantId = null;
    this.activePageTask = null;
    return task;
  }

  /** Drop any pending confirmation and its inaccessible one-use grant. */
  clearPendingGatedAction(): PendingGatedAction | null {
    const pending = this.pendingGatedAction;
    if (pending?.grantId !== undefined) this.grants.clear(pending.grantId);
    this.pendingGatedAction = null;
    return pending;
  }

  /** Build the baseline model for a fresh snapshot and refresh the page summary. */
  applySnapshot(snapshot: Snapshot, options: { updateDialogue?: boolean } = {}): boolean {
    const previous = this.#snapshotOrder;
    if (
      previous !== null &&
      previous.tabId === snapshot.tabId &&
      (snapshot.version < previous.version ||
        (snapshot.version === previous.version && snapshot.capturedAt < previous.capturedAt))
    ) {
      return false;
    }

    const model = buildBaselineFormModel(snapshot);
    this.clearBrowserAuthorization();
    if (this.activePageTask !== null && (
      this.activePageTask.identity.tabId !== snapshot.tabId || this.activePageTask.identity.pageUrl !== model.url
    )) this.clearPageTask();
    if (this.browserCapture?.identity !== undefined && (
      this.browserCapture.identity.tabId !== snapshot.tabId || this.browserCapture.identity.pageUrl !== model.url
    )) this.browserCapture = null;
    const pending = this.pendingGatedAction;
    if (pending !== null && (
      snapshot.tabId !== pending.tabId ||
      model.url !== pending.url ||
      model.snapshotVersion !== pending.snapshotVersion ||
      !model.actions.some((action) => action.id === pending.targetId && action.kind === pending.kind)
    )) {
      this.clearPendingGatedAction();
    }
    const summary = summarizeFormModel(model);
    this.model = model;
    this.tabId = snapshot.tabId;
    this.modelAt = Date.now();
    this.#snapshotRevision += 1;
    this.#snapshotOrder = { tabId: snapshot.tabId, version: snapshot.version, capturedAt: snapshot.capturedAt };
    this.stale = false;
    this.page = {
      url: model.url,
      title: model.title,
      ...(model.step !== undefined ? { step: model.step } : {}),
      fieldCount: summary.fieldCount,
      requiredEmpty: summary.requiredEmpty,
      untrustedInstructionDetected: snapshot.untrustedInstructionDetected === true,
    };
    if (options.updateDialogue !== false || this.dialogue === "no-page") this.dialogue = "ready";
    return true;
  }

  /** Apply a descriptive repair only while the exact accepted page snapshot is still current. */
  applyRepair(
    identity: { tabId: number; url: string; snapshotVersion: number; structuralHash: string; snapshotRevision: number },
    model: FormModel,
  ): boolean {
    const current = this.model;
    if (
      this.stale || current === null || this.tabId !== identity.tabId ||
      this.#snapshotRevision !== identity.snapshotRevision ||
      current.url !== identity.url || current.snapshotVersion !== identity.snapshotVersion ||
      current.structuralHash !== identity.structuralHash
    ) return false;

    this.model = model;
    if (this.page !== null) this.page = { ...this.page, title: model.title };
    return true;
  }

  statePayload(): StatePayload {
    return {
      dialogue: this.dialogue,
      page: this.page,
      ...(this.focusFieldId !== undefined ? { focusFieldId: this.focusFieldId } : {}),
      busy: this.busy,
      extensionConnected: this.extensionConnected,
      brain: this.brain,
    };
  }
}
