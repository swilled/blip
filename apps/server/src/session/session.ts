import { newId, type ActionKind, type DialogueStateName, type FormModel, type Snapshot, type StatePayload } from "@blip/protocol";
import { createGrantStore, type GrantBinding, type GrantStore } from "../act/grants";
import { buildBaselineFormModel, summarizeFormModel } from "../baseline";

export const SERVER_VERSION = "0.1.0";

export type Brain = "claude" | "fake";

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
  /** Confirmation state is local to this voice session and never comes from an Intent. */
  pendingGatedAction: PendingGatedAction | null = null;
  /** Existing server-only one-use grant store from the Phase 3 foundation. */
  readonly grants: GrantStore;

  #extensionConnected = false;
  #snapshotOrder: { tabId: number; version: number; capturedAt: number } | null = null;
  #snapshotRevision = 0;

  constructor(brain: Brain, clock: () => number = Date.now) {
    this.brain = brain;
    this.grants = createGrantStore(clock);
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
