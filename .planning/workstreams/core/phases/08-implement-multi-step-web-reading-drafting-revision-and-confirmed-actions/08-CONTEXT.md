# Phase 8: Multi-Step Web Reading and Drafting - Context

**Gathered:** 2026-10-18  
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement generic multi-step tasks over supported web pages. Blip can locate and read user-requested content, summarize it on request, draft text for an existing page workflow, revise a draft from the user's edits, read the current draft back, and carry out a consequential action only after the user speaks the exact context-specific confirmation phrase. The email scenario is a non-site-specific capability example. Phase 8 builds on Phase 7 primitives and does not add a Gmail adapter.

</domain>

<decisions>
## Implementation Decisions

### Multi-step content tasks
- **D-01:** Treat the user's email example as a generic workflow: open a user-named site, identify requested visible content, read it, summarize on request, draft, revise, read back, and offer a final action. Do not hardcode Gmail, email labels, or one service's DOM.
- **D-02:** Use visible current-page items and user intent to resolve “latest” or similar references. If there are multiple plausible items or recency cannot be established from the page, ask the user to choose. Page text and AGY output cannot select hidden or stale targets.
- **D-03:** Direct reads are bounded and local. A request to summarize, answer a page question, or draft a response is explicit permission to send only the necessary bounded, filtered excerpt to tool-less AGY. Never send credentials, passwords, payment values, or unrequested page content.
- **D-04:** A draft is proposed text, not an action. Keep the draft tied to the source page/thread, recipient/target, and active session. User edits revise the same draft. Re-read the actual current draft field before presenting the updated version.
- **D-05:** Never send automatically after drafting or revision. Read the final draft back, then ask the user to say the exact phrase for that specific action, such as “send this email.” A yes/no question followed by “yes” is not authorization.

### Consequential-action confirmation
- **D-06:** Important actions use a deterministic exact spoken phrase suited to the operation and visible target. Ask for that phrase directly, such as “Can you say ‘send this email’?” for sending a message. A bare “yes” is never enough, even after a prompt. Page text and model output cannot choose or rewrite the confirmation phrase.
- **D-07:** The send phrase redeems one purpose-bound, one-use grant only after the full final-draft read-back completes and the existing confirmation guard has elapsed. Bind it to the exact draft hash, visible recipient/target, source page/thread identity, tab, operation, and tracked `speakId`.
- **D-08:** Stop, cancel, repeat, timeout, page/tab change, draft edit, recipient change, or changed confirmation target clears the pending send grant. Re-read and re-arm after any change.
- **D-09:** Report sent/success only after the current page provides a validated confirmation. A click or successful dispatch alone is not proof.
- **D-10:** The model may compose and revise proposed text from an explicitly requested bounded excerpt, but it cannot choose the recipient, confirmation phrase, authorize send, mint grants, or trigger page actions. The deterministic Executor controls every write and send.

### Test and integration scope
- **D-11:** Use synthetic, email-like and generic content fixtures for end-to-end acceptance. Do not use a real Gmail login, personal mailbox, or private user content in tests.
- **D-12:** Preserve the current voice output contract and do not edit voice-owned implementation files. Core may implement protocol/server/extension support locally; shared protocol or policy changes need written voice-owner review before merge.
- **D-13:** Add deterministic context-specific phrases to the existing exact-phrase vocabulary. Existing submit/result semantics, one-second guard, tracked speech, the bare-yes prohibition, and single Executor remain in force.
- **D-14:** Acceptance tests must show that a bare “yes” or other general affirmation is rejected even immediately after the exact-phrase prompt. Only the matching context-specific spoken phrase may redeem its bound one-use grant after read-back and the guard; wrong, stale, or mismatched phrases must not dispatch.

### the agent's Discretion
- Implement a bounded task/session state machine with explicit user-visible next steps and a clear cancel path.
- Keep model context as small as possible and retain only the minimum source excerpt and draft state needed for an active task.
- Require clarification when the source item, recipient, or draft target is ambiguous.
- Do not introduce autonomous open-ended browsing; each page action must have a typed, user-derived request and pass through the current safety policy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and trust rules
- `.planning/PROJECT.md` — core value, model boundary, and cross-track ownership.
- `.planning/workstreams/core/REQUIREMENTS.md` — current gated action and privacy rules; the bare-yes prohibition remains in force.
- `.planning/workstreams/core/ROADMAP.md` — Phase 8 goal and dependency.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-PROPOSAL.md` — browser-control privacy, target resolution, and Executor boundaries.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-EVIDENCE-MATRIX.md` — planned hostile-page, stale-state, and confirmation evidence.
- `.planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-CONTEXT.md` — Phase 7 primitives and destination rules.
- `PROTOCOL.md` — current message contracts and compatibility rules.

### Model and turn management
- `apps/server/src/turn.ts` — current request routing and action flow.
- `apps/server/src/brain/agy/intent-router.ts`, `projection.ts`, and `privacy.ts` — model routing, page projection, and sensitive-content boundaries.
- `apps/server/src/brain/agy/provider.ts` — tool-less AGY provider interface.
- `apps/server/src/session/session.ts` and `refresh.ts` — accepted page identity and freshness.

### Action and confirmation authority
- `apps/server/src/act/gated.ts`, `grants.ts`, `gate-port.ts`, and `voice-gate-adapter.ts` — current grant and confirmation boundary.
- `packages/policy/src/confirmation.ts` and `classify.ts` — exact phrase parsing, guard interval, and action classification.
- `packages/dialogue/src/confirm.ts` and `effects.ts` — voice-owned reducer boundary; read only in this phase.
- `apps/server/src/voice/dialogue-runner.ts` and `core-gate-port.ts` — current core integration; inspect before changing protocol flow.

### Extension and synthetic fixtures
- `apps/extension/src/content/snapshot.ts`, `act.ts`, and `fill.ts` — current page observation and field writes.
- `apps/extension/src/background/dispatch.ts`, `acts.ts`, and `navigation.ts` — live dispatch and page identity tracking.
- `tools/test-pages/` — synthetic local acceptance fixtures; never use real account content.
- `apps/voice/src/main.ts` and `speak-bridge.ts` — current tracked speech output; read only for compatibility.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Server has tracked speech completion and one-use grants bound to page/model identity.
- AGY currently receives a bounded, value-free form-metadata projection. The explicit body-excerpt path in Phase 6 is proposed and must be implemented separately for page summaries and drafts.
- The extension can fill current form fields and verify actual DOM values.
- Synthetic test pages and loopback browser harness can exercise generic task surfaces.

### Established Patterns
- Page text is untrusted data and never becomes authority.
- Gated actions are confirmed on voice-originated utterances after tracked read-back and the guard.
- The browser revalidates live DOM and page identity before dispatch.
- User requests and model outputs are typed; the model has no browser tools.

### Integration Points
- Add a core-owned task state that stores only bounded, explicitly requested source content and the current draft binding.
- Route draft writes through existing extension operations and deterministic policy; route sending through the same Executor grant path.
- Preserve voice-side tracked speech and cancellation protocol without modifying voice-owned code.

</code_context>

<specifics>
## Specific Ideas

The user's example is illustrative, not a hardcoded script: from a new tab, open a named site, read the user's latest item, summarize if asked again, draft a reply, apply edits, read the final draft, ask for a context-specific phrase such as “send this email,” and report success only after page confirmation. All site names, content types, and copy remain generic.

</specifics>

<deferred>
## Deferred Ideas

- Real mailbox integration, account credentials, personal content, and Gmail-specific DOM adapters are out of scope.
- Editing voice-owned UI/reducer files requires the voice owner to implement or explicitly take that work; Phase 8 keeps core to its own protocol/server/extension ownership.
- Shared requirements and PROJECT changes remain subject to cross-track agreement.

</deferred>

---

*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*  
*Context gathered: 2026-10-18*
