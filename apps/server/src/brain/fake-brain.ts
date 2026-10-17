// The offline stand-in for the model (D-23). Deterministic: the same text always gives the same
// Intent, after a fixed delay that exercises the filler/earcon path. It cannot request an action
// unless a test sets `requestActionId`, and even then the server never turns that into an act.request.
import type { Intent } from "@blip/protocol";

export type FakeBrainOptions = {
  /** How long a model-routed turn takes. The dev default is 1500 ms (the server passes it). */
  delayMs: number;
  /** Injectable so unit tests do not wait. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Test-only: make every parse return request_action for this action id. */
  requestActionId?: string;
  /** Test-only: when paired with requestActionId, trigger only on this exact model-routed utterance. */
  requestActionPhrase?: string;
};

export type IntentBrain = {
  parseIntent(text: string): Promise<Intent>;
};

export const FAKE_CLARIFY_QUESTION =
  "I'm in offline mode. I understand: what's here, what's required, read the form, stop and repeat.";

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createFakeBrain(options: FakeBrainOptions): IntentBrain {
  const sleep = options.sleep ?? realSleep;
  return {
    async parseIntent(text: string): Promise<Intent> {
      await sleep(options.delayMs);
      if (options.requestActionId !== undefined &&
          (options.requestActionPhrase === undefined || text === options.requestActionPhrase)) {
        return { type: "request_action", actionId: options.requestActionId };
      }
      return { type: "clarify", question: FAKE_CLARIFY_QUESTION };
    },
  };
}
