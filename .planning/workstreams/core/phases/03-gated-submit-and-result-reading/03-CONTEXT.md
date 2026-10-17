# Phase 3: Gated Submit and Result Reading - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the deterministic Executor and default-deny policy gate for submit, pay, delete, send, and cross-domain navigation. A gated action can run only once for a fresh, unchanged page after a complete read-back and the exact spoken phrase for its kind arrives through the voice connection after speech has finished. The extension rechecks the live target and kind. Afterward, Blip reads only what the resulting page actually confirms or reports, including field-linked validation errors. The Phase 3 demo uses the local broken form and fake brain; Claude, hostile-page injection warnings, and the voice UI remain outside this phase.

</domain>

<decisions>
## Implementation Decisions

### Confirmation and phrase matching
- **D-01:** Before an irreversible action can be confirmed, read the fresh form model in document order: each non-sensitive field's current DOM value, required-but-empty fields, the page/form identity, and the requested action. State only that a sensitive field is present and whether it has a value; never speak its value. Values come from the latest DOM snapshot, not the dictated request or model output.
- **D-02:** Use one fixed literal phrase per gated `ActionKind`, independent of page-provided labels or text: `submit` → “submit booking”; `pay` → “confirm payment”; `delete` → “confirm deletion”; `send` → “confirm sending”; `navigate-cross-domain` → “leave this site”. Match the exact words after case folding, trimming/collapsing whitespace, and removing terminal punctuation. Do not accept “yes”, aliases, substrings, page-derived phrases, or model approval.
- **D-03:** A phrase is eligible only from the voice-role socket, after the final read-back/confirmation speech has a matching non-interrupted `speak.done` and the GATE-08 one-second cooldown has elapsed. The typed REPL continues to exercise the voice-role path; its `source: "typed"` does not grant a separate bypass.
- **D-04:** Bind the one-use grant to target id, gated kind, exact page URL, snapshot version, and a hash of every current field value/presence. It expires 30 seconds after arming. Consume it atomically before dispatch. A second use, expiry, page/URL/version change, value-hash change, live-kind mismatch, or extension refusal clears the pending grant; do not retry the action from the same phrase. Tell the user that no submission occurred and give the known refusal reason; require a new snapshot, complete read-back, and phrase to try again.

### Result evidence and errors
- **D-05:** An `act.result` only proves that the extension dispatched the action; it is not proof of success. Request a fresh snapshot after the action. Say success or a confirmation number only when explicit success evidence is present in captured page content (for example, a confirmation heading or status/alert); never infer success from a click result, navigation, title change, or HTTP-level completion alone.
- **D-06:** Report every detected validation error in document order, tied to its field label. Report page-level errors separately. “What went wrong” repeats the current page's detected errors. If the page shows neither an explicit confirmation nor errors, say the outcome could not be verified; do not claim success or invent a cause.

### Audit and refusal behavior
- **D-07:** Emit a local structured audit entry for every gated attempt, allowed or refused, including action kind, target id, outcome, and a bounded refusal code/reason. Reuse the payload-free server logger. Never log field values, transcripts, confirmation phrases, page labels/text, or URLs; no persistent audit store or UI is added in this phase.
- **D-08:** Keep every gated path default-deny. The Executor authorizes one action and the extension independently checks the live target, kind, and grant presence before clicking. Existing ungated behavior and the Phase 2 post-write sensitivity checks remain in force.

### the agent's Discretion
- Internal grant representation, expiry scheduling, hash encoding, and how the extension proves a server-issued grant are implementation choices, provided the binding, one-use, expiry, voice-role, and live-recheck rules above are tested.
- The `form.submit()` success criterion needs special attention: the HTML Standard specifies that `HTMLFormElement.submit()` bypasses validation and does not fire a `submit` event. Phase 2's act-scoped capture listener alone therefore cannot prove GATE-02. The plan must include a browser-level test for direct `form.submit()` and implement an interception that passes it; do not mark GATE-02 complete based only on `requestSubmit()` or `submit` event tests. If it cannot be made to pass, keep the gated operation blocked and surface the gap rather than weakening the requirement.
- Success/error evidence heuristics may use bounded snapshot headings, alerts, page errors, field errors, and field labels. Keep them deterministic and page-evidence-only; no model call in this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and safety requirements
- `.planning/workstreams/core/ROADMAP.md` §Phase 3 — fixed goal, success criteria, I2 acceptance flow, and adversarial test list.
- `.planning/workstreams/core/REQUIREMENTS.md` — GATE-01..05, GATE-08, RES-01..02 and cross-track dependencies/stand-ins.
- `.planning/REQUIREMENTS.md` — master requirement source and security/non-goal constraints.
- `.planning/PROJECT.md` — core value, intent-as-data, single Executor, deterministic confirmation, and sensitive-value invariants.
- `.planning/research/ARCHITECTURE.md` — initial protocol and gate architecture.

### Frozen contract and prior decisions
- `PROTOCOL.md` — message, role, Intent, ActRequest, and grant payload contract; post-M0 changes are additive-only.
- `.planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-CONTEXT.md` — frozen protocol, role separation, no-confirm Intent, and REPL decisions.
- `.planning/workstreams/core/phases/02-real-page-read-and-fill/02-CONTEXT.md` — live classification, DOM read-back, privacy, and submit-event barrier decisions.
- `https://html.spec.whatwg.org/multipage/forms.html#the-form-element` — standard behavior of `form.submit()` and `requestSubmit()` relevant to GATE-02.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/protocol/src/intent.ts`, `act.ts`, and `payloads-voice.ts`: frozen Intent has no confirmation variant; ActRequest already has optional `gate {grantId, kind}`; `ConfirmArmed`, `ConfirmCleared`, and `speak.done` payloads already exist.
- `packages/protocol/src/snapshot.ts` and `form-model.ts`: snapshots carry bounded headings/alerts and field-level `value`, `hasValue`, `sensitive`, and `error`; the FormModel carries page-level errors and action kinds.
- `apps/server/src/act/ungated.ts`, `apps/server/src/session/refresh.ts`, and `apps/server/src/baseline/`: existing single request path, fresh snapshot path, and deterministic model builder are reusable.
- `tools/repl/src/repl.ts`: typed voice-role client prints confirm messages and auto-responds to `speak.done`, making it a ready I2 test harness.
- `packages/protocol/fixtures/result-ok.snapshot.json` and `result-errors.snapshot.json`: pre-existing confirmation and validation-error examples.

### Established Patterns
- `apps/server/src/hub/hub.ts` enforces message sender roles from the protocol registry and routes replies; only a voice-role client can send `utterance` or `speak.done`.
- `apps/server/src/session/session.ts` currently owns the cached model, tab, freshness, dialogue state, and last-spoken text. It has no grant or outstanding-speech state yet.
- `apps/server/src/turn.ts` handles deterministic grammar/field intents and ungated acts; it currently has no Executor or gated confirmation flow. `apps/server/src/server.ts` currently leaves `speak.done` as a no-op.
- `apps/server/src/brain/phrases.ts` is a deterministic parser for typed field commands and redacts dictated field values from transcript/model input; keep confirmation matching in separate deterministic code.
- `apps/server/src/log.ts` only permits a small set of payload-free, sanitized log keys; use it for audit outcomes without widening logs to page content.
- `apps/server/src/reply.ts` builds bounded deterministic speech. `FormModel` already exposes field/page errors but does not yet have post-submit result interpretation.
- `apps/extension/src/content/act.ts` reclassifies the live target and currently refuses every gated click. `apps/extension/src/background/acts.ts` resolves frame/tab targets and checks snapshot freshness before dispatch.
- `apps/extension/src/content/submit-guard.ts` blocks submit events only during an act. It will need a separate, proven solution for the direct `form.submit()` case in GATE-02.
- `packages/policy` has the browser-safe classification helpers and tests; `tools/test-pages` contains Phase 2 browser fixtures to extend with gated success/error and bypass cases.

### Integration Points
- The server's serialized utterance turn queue and voice message handler are the natural place to sequence read-back, `speak.done`, cooldown, phrase match, grant consumption, and result read.
- The existing `hub.request("extension", "act.request", ...)` / `act.result` path is the single action dispatch route; gate checks belong in the Executor before this request and in the extension before its live click.
- After an accepted gated act, call the shared refresher to build the result model before speaking; refresh and grant invalidation must remain ordered with `page.changed` and extension reconnection.
- I2 voice UI components (`DLG-08`, `DLG-09`, `VOX-04`) are voice-track dependencies. Core must keep the REPL/stub path and cannot wait for those components or for Claude.

</code_context>

<specifics>
## Specific Ideas

- Keep confirmation phrases short, fixed by kind, and independent of page labels; read the requested action and page identity before presenting the phrase.
- The local I2 path remains describe → fill → fresh full read-back → exact phrase → one gated action → fresh result snapshot → confirmation/errors.
- A failed or stale gate always tells the user the action did not occur and requires a new read-back.

</specifics>

<deferred>
## Deferred Ideas

- Voice UI integration is owned by the voice workstream; the REPL and stub dialogue remain the Core stand-ins for I2.
- Claude-based intent and result interpretation belong to Phase 4 or later; Phase 3 stays deterministic and fake-brain compatible.
- Prompt-injection warning and hostile-page defense tests are Phase 5 (GATE-06/07), although this phase's fixed phrase table must not be derived from page content.
- Persistent audit storage or a user-facing audit-history UI is not required for the Phase 3 local demo.

</deferred>

---

*Phase: 03-gated-submit-and-result-reading*
*Context gathered: 2026-10-17*
