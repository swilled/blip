# Phase 6: Browser Control Contract and Policy Proposal - Context

**Gathered:** 2026-10-18  
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase produces a reviewable proposal for adding user-directed browser control to Blip. It defines the additive protocol and policy shape for page reading, navigation, links, search, tabs, scrolling, find-on-page, and bounded summaries. It does not implement those capabilities or merge a protocol change. Existing form filling, model privacy rules, and confirmation gates stay in force. The voice-track owner must approve the exact contract in writing before a protocol change can merge. Follow-on implementation phases come after that review.

</domain>

<decisions>
## Implementation Decisions

### Navigation and link safety
- **D-01:** For a direct URL or site the user names, resolve it from the user's words, say the resolved host, and wait for the user to confirm before navigating. For an “open link” request, the user's words must identify a specific visible link; code may resolve that element's `href`, but page text alone cannot initiate navigation or select the link, and the model cannot supply or change the destination. Cross-site link destinations require host read-back and explicit confirmation.
- **D-02:** Prepare a proposal for ungated ordinary same-site HTTP(S) GET links. Keep the live policy unchanged until the voice owner gives written approval. Define the site boundary explicitly during research; retain deterministic checks for destination, method, and gated or unsafe labels, and fail closed on unknown or malformed targets.
- **D-03:** Cross-site navigation and submit, pay, delete, or send actions retain the current read-back and purpose-specific confirmation gate. A general “yes” never substitutes for the exact submit phrase.
- **D-04:** User-reported teammate agreement is context, not the required written voice-owner approval artifact. Do not mark the contract approved until that artifact is recorded.

### Page text and questions
- **D-05:** Newly extracted body, paragraph, or article text may be sent to AGY only as a bounded, filtered excerpt when the user explicitly asks for a summary or asks a question about the page. This does not change the existing value-free title, heading, field-label, action-label, and option-label projection used for intent parsing. Do not send new body text for unrelated commands or by default.
- **D-06:** Page text remains untrusted data, never instructions. Keep sensitive values, passwords, and card numbers out of model input and speech. Code validates outputs and remains the only path to page actions.

### Search behavior
- **D-07:** For “search for…” requests, Blip chooses between the current site's search and the browser's default search based on the user's wording and current page context. Use only the query expressed by the user. Do not derive a query or destination from page instructions. If the route is ambiguous or cannot be validated, ask a short clarification or use the safe browser-search path.
- **D-08:** Site search remains subject to the existing gated-submit policy until a written protocol and policy approval changes it. Browser-search navigation follows the cross-site navigation gate.

### Multi-step requests
- **D-09:** Include AGENT-01 as a separate future phase after the browser-control contract and basic browser primitives are reviewed. It may coordinate multiple steps, but every page action must still pass through the deterministic Executor and existing policy gate. It cannot confirm actions, mint grants, or treat page text as authority.
- **D-10:** Keep any changes to shared `.planning/PROJECT.md` and shared requirements as proposals until both track owners agree. Phase 6 may describe the proposed placement of AGENT-01 without changing those shared files.

### the agent's Discretion
- Choose the smallest additive schema and action vocabulary that covers the agreed capabilities without weakening existing protocol invariants.
- Define bounded extraction limits, supported-page behavior, SPA and slow-load handling, and safe fallback messages in research and planning.
- Specify an explicit, purpose-bound confirmation for a user-named destination. Never reuse a submit grant or let a generic affirmation authorize a gated action.
- Resolve a link only from a specific user-selected visible link; ask which one when labels are duplicated or ambiguous. Never let hidden text or model interpretation initiate a link action.
- Determine whether “same-site” means a stricter same-origin boundary for the first proposal or a broader registrable-domain boundary; document the choice and fail closed where it cannot be verified.
- Keep unsupported pages, frames, and ambiguous targets fail-closed and explain the limitation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope, ownership, and safety principles
- `.planning/workstreams/core/ROADMAP.md` § Phase 6 — proposal scope and approval boundary.
- `.planning/workstreams/core/REQUIREMENTS.md` — current core requirements, cross-track ownership, and deferred AGENT-01.
- `.planning/PROJECT.md` — trust boundary, two-workstream ownership, and shared-file agreement rule.
- `PROTOCOL.md` — current frozen message, snapshot, intent, action, and confirmation contract.
- `.planning/workstreams/core/phases/03-gated-submit-and-result-reading/03-CONTEXT.md` — read-back, exact phrase, one-use grant, and Executor invariants.
- `.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-CONTEXT.md` — tool-less model roles, private data exclusions, and model output limitations.
- `.planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-CONTEXT.md` — hostile page trust boundary, local page acceptance, and existing protocol addition precedent.

### Protocol and policy implementation
- `packages/protocol/src/intent.ts` — current grammar/model intent vocabulary and deliberate absence of a confirmation intent.
- `packages/protocol/src/action-kind.ts` — current frozen action kinds and gated-kind membership.
- `packages/protocol/src/snapshot.ts` — current page snapshot contract and wire cap.
- `packages/protocol/src/act.ts` — current extension action request and result contract.
- `packages/policy/src/classify.ts` — deterministic action classification and current same-origin link rules.
- `apps/server/src/turn.ts` — server intent routing and Executor boundary.
- `packages/dialogue/` — existing dialogue reducer and effect boundary; inspect before proposing any integration shape.

### Page capture, navigation, and model boundary
- `apps/extension/src/content/snapshot.ts` — current page walk and the absence of general article/paragraph extraction.
- `apps/extension/src/background/navigation.ts` — current active-tab tracking, navigation listeners, history-state updates, and window-focus handling. The handoff's statement that Tabs is used only to find the active tab is outdated.
- `apps/server/src/brain/agy/projection.ts` — current bounded, value-free model projection and prompt budget behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/protocol` owns the shared zod message, snapshot, intent, action, and result contracts.
- `packages/policy/src/classify.ts` provides deterministic fail-closed page-action classification.
- `apps/extension/src/background/navigation.ts` already follows the selected active tab and schedules refreshes after activation, navigation, history changes, and window focus.
- `apps/server/src/brain/agy/projection.ts` has a value-free projection and a conservative prompt-token budget that can inform explicitly requested page summaries.
- `packages/dialogue/` and the single Executor are the integration points for multi-step dialogue and page actions.

### Established Patterns
- The model proposes structured data; deterministic code validates it and performs every action.
- Page content is untrusted. It cannot create an action, destination, query, or confirmation.
- Gated actions require tracked read-back and exact purpose-specific confirmation, then one-use grant consumption in the Executor.
- Sensitive values are excluded from model projections and ordinary read-back.
- Protocol changes must be additive and receive written voice-owner approval before merge.

### Integration Points
- New browser intents and results belong in `packages/protocol`, with routing in `apps/server/src/turn.ts` and execution through the existing Executor/policy.
- Page text extraction belongs in the extension snapshot path, with filtering and bounds enforced before any model projection.
- Browser navigation must use the existing active-tab tracking and refresh flow rather than inventing a parallel tab authority.
- Multi-step orchestration is deferred to its own phase and must emit only Executor-bound effects.

</code_context>

<specifics>
## Specific Ideas

The proposed browser-control scope should cover: “where am I”; reading by heading and paragraph; listing and opening links; navigating to a user-named site; back, forward, reload, and search; tabs; scrolling and find-on-page; summaries; and clear behavior for restricted pages, single-page apps, and slow loads. Search route selection should use the request and current context. Include AGENT-01 later as its own phase after the base contract and browser primitives.

</specifics>

<deferred>
## Deferred Ideas

- Implementation of browser-control features is for follow-on phases after Phase 6's contract review.
- AGENT-01 multi-step orchestration is a separate later phase.
- Any shared project or requirements edits remain proposals until both workstream owners agree.
- Changing live same-site link policy remains blocked on written voice-owner review of the precise contract.

</deferred>

---

*Phase: 06-browser-control-contract-and-policy-proposal*  
*Context gathered: 2026-10-18*
