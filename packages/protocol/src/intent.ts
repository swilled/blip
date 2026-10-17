import { z } from "zod";

// Intent: what the model (or the grammar) says the user wants.
//
// THE ABSENCE OF A confirm / approve / submit_now VARIANT IS DELIBERATE AND TESTED (D-15).
// The model may REQUEST an action (request_action); it can never GRANT one. Confirmation is
// matched in deterministic code on utterances from the voice socket only (GATE-05).
export const Intent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("describe") }), // "what's on this page"
  z.object({ type: z.literal("read_form") }),
  z.object({ type: z.literal("whats_required") }),
  z.object({ type: z.literal("what_went_wrong") }),
  z.object({ type: z.literal("read_back") }),
  z.object({ type: z.literal("fill_profile") }),
  z.object({ type: z.literal("go_to_field"), fieldId: z.string() }),
  z.object({
    type: z.literal("set_fields"),
    fills: z.array(z.object({ fieldId: z.string(), value: z.string().max(300) })).max(20),
  }),
  z.object({ type: z.literal("spell"), fieldId: z.string() }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("request_action"), actionId: z.string() }), // REQUEST only; never executes a gated kind
  z.object({ type: z.literal("click_safe"), actionId: z.string() }), // executor re-checks kind
  z.object({ type: z.literal("answer"), text: z.string().max(300) }), // free-form question answered from the model
  z.object({ type: z.literal("clarify"), question: z.string().max(200) }),
  z.object({ type: z.literal("unknown") }),
]);
export type Intent = z.infer<typeof Intent>;
