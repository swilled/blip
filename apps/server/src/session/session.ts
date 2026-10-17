import { newId, type DialogueStateName, type StatePayload } from "@blip/protocol";

export const SERVER_VERSION = "0.1.0";

export type Brain = "claude" | "fake";

/**
 * Per-process session state the hub reports to the voice UI. Plan 01-05 mutates `dialogue`, `page`
 * and `busy` and asks the hub to push; the hub itself only owns `extensionConnected`.
 */
export class Session {
  readonly sessionId: string = newId();
  readonly brain: Brain;
  extensionConnected = false;
  dialogue: DialogueStateName = "no-page";
  page: StatePayload["page"] = null;
  focusFieldId: string | undefined = undefined;
  busy = false;

  constructor(brain: Brain) {
    this.brain = brain;
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
