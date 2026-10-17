import { newId, type DialogueStateName, type FormModel, type Snapshot, type StatePayload } from "@blip/protocol";
import { buildBaselineFormModel, summarizeFormModel } from "../baseline";

export const SERVER_VERSION = "0.1.0";

export type Brain = "claude" | "fake";

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
  /** True when the cached model may no longer match the page (page.changed, new extension). */
  stale = true;
  /** The text of the last `speak` the server sent, for "repeat". */
  lastSpoken: string | null = null;

  #extensionConnected = false;

  constructor(brain: Brain) {
    this.brain = brain;
  }

  get extensionConnected(): boolean {
    return this.#extensionConnected;
  }

  /**
   * Whenever an extension binds (even a replacement), whatever model we cached belongs to a previous
   * connection, so mark it stale. Setting false changes nothing else: the cached model stays readable
   * until the next fetch, but `ensureSnapshot` refuses to speak about an unconnected page.
   */
  set extensionConnected(value: boolean) {
    if (value) this.stale = true;
    this.#extensionConnected = value;
  }

  /** Build the baseline model for a fresh snapshot and refresh the page summary. */
  applySnapshot(snapshot: Snapshot): FormModel {
    const model = buildBaselineFormModel(snapshot);
    const summary = summarizeFormModel(model);
    this.model = model;
    this.stale = false;
    this.page = {
      url: model.url,
      title: model.title,
      ...(model.step !== undefined ? { step: model.step } : {}),
      fieldCount: summary.fieldCount,
      requiredEmpty: summary.requiredEmpty,
      ...(snapshot.untrustedInstructionDetected === undefined
        ? {}
        : { untrustedInstructionDetected: snapshot.untrustedInstructionDetected }),
    };
    this.dialogue = "ready";
    return model;
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
