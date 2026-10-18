import { newId, type ActionKind, type DialogueStateName, type FormModel, type PayloadOf, type Snapshot, type StatePayload } from "@blip/protocol";
import { createGrantStore, type GrantBinding, type GrantStore } from "../act/grants";
import { buildBaselineFormModel, summarizeFormModel } from "../baseline";

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
  voiceEpoch = 0;
  speechRevision = 0;
  speechRate = 1;
  voiceCapture: { epoch: number; eligible: boolean; ended: boolean; startedAt: number; speechRevision: number; snapshotRevision: number; grantId: string | null } | null = null;
  get voiceConnected(): boolean { return this.#voiceConnected; }
  set voiceConnected(value: boolean) {
    if (value || value !== this.#voiceConnected) {
      this.voiceEpoch++;
      this.voiceCapture = null;
      this.grants.clear();
      this.pendingGatedAction = null;
      this.#speech.clear();
      this.activeSpeakId = null;
      this.speechRate = 1;
    }
    this.#voiceConnected = value;
  }
  #snapshotOrder: { tabId: number; version: number; capturedAt: number } | null = null;
  #snapshotRevision = 0;

  constructor(brain: Brain, clock: () => number = Date.now) {
    this.brain = brain;
    this.grants = createGrantStore(clock);
  }

  /** Track a speech only after its selected output path accepted the request. */
  trackSpeech(speakId: string, category = "answer"): void {
    this.speechRevision++;
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
    if (value) {
      this.clearPendingGatedAction();
      this.stale = true;
      this.#snapshotOrder = null;
    } else {
      this.clearPendingGatedAction();
    }
    this.#extensionConnected = value;
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
