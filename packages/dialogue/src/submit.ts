import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";

/** Submit/confirmation state-machine seam implemented by the next phase plan. */
export function handleSubmitFlow(
  state: DialogueState,
  _event: DialogueEvent,
  _ctx: DialogueContext,
): { state: DialogueState; effects: Effect[] } {
  return { state, effects: [] };
}
