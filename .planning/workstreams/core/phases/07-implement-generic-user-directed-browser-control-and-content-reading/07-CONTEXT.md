# Phase 7: Generic Browser Control and Content Reading - Context

**Gathered:** 2026-10-18  
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement core-owned, generic browser controls from the Phase 6 proposal. A user can start from a new or active tab, open a destination they named, navigate supported pages, inspect and read bounded visible content, select visible links, search, switch tabs, scroll, and find text. These primitives must use the existing extension, server, policy, and Executor authority path. This phase does not implement multi-step drafting or app-specific integrations; those belong to Phase 8. No site such as Gmail receives hardcoded behavior.

</domain>

<decisions>
## Implementation Decisions

### User-directed browser actions
- **D-01:** Browser controls are generic and derived from the user's words and current live page state. No page instruction or model output may invent a URL, query, link, tab, or action target.
- **D-02:** Support starting from a new/blank tab and opening a user-named site. Resolve destinations from the user's words, speak the resolved host, and ask for an exact destination-specific phrase such as “open [host]” before navigating. A bare “yes” does not authorize navigation.
- **D-03:** Search route may be selected from the request and page context. The query itself comes only from the user's words. Site search keeps the gated submit path; browser-default search uses its own exact-query, one-use authorization and cannot authorize result links.
- **D-04:** A link can be opened only when the user's words uniquely select a visible current link. Code resolves and rechecks its live destination. Unknown, hidden, ambiguous, or stale targets clarify or fail closed.
- **D-05:** Implement the Phase 6 browser primitive scope: location, bounded content reads, link listing/opening, named-site navigation, back/forward/reload where destination safety can be established, search, tabs, scrolling, and find-on-page. Unsupported or restricted pages are reported clearly.

### Content and privacy
- **D-06:** Direct reads speak bounded visible page content locally. Newly captured body text may reach tool-less AGY only when the user explicitly asks for a summary, page question, or later-phase draft. Keep the ordinary intent projection value-free.
- **D-07:** Page content remains untrusted data. It cannot authorize actions or alter user-sourced queries and destinations. Exclude credentials, passwords, payment data, and sensitive control values from model input and speech.
- **D-08:** Use a synthetic article/search/email-like fixture for automated acceptance. Do not require a real Gmail account, personal mailbox, or public URL.

### Safety and ownership
- **D-09:** Every dispatched browser action passes through deterministic validation and the existing Executor. Page/tab/URL/capture changes, stop, cancellation, and timeout invalidate stale IDs and grants.
- **D-10:** The core owner has authorized local implementation on the core branch. Keep voice-owned implementation files unchanged. Shared protocol/live-policy changes remain unmerged until the voice owner reviews the exact changes in writing.
- **D-11:** Important or gated actions use a deterministic, exact spoken phrase suited to the operation and target. A bare “yes” never authorizes navigation, submit, send, or another gated action. Phrase design for composed messages is handled in Phase 8.

### the agent's Discretion
- Choose additive protocol shapes, bounded capture limits, supported-page checks, and safe fallback wording consistent with Phase 6.
- Use the existing active-tab tracking and refresh flow rather than adding a second source of tab authority.
- Keep browser-default search fail-closed if the required API or permission is unavailable.
- Select the smallest generic content model sufficient for heading/paragraph reads and visible link resolution.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and safety contract
- `.planning/PROJECT.md` — project trust boundary, core/voice ownership, and collaboration model.
- `.planning/workstreams/core/REQUIREMENTS.md` — core requirements and existing gated-action invariants.
- `.planning/workstreams/core/ROADMAP.md` — Phase 6 proposal and Phases 7–8 scope.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-CONTEXT.md` — source decisions and original proposal boundary.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-PROPOSAL.md` — proposed browser capabilities, privacy rules, and authority paths.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-EVIDENCE-MATRIX.md` — source crosswalk, planned adversarial evidence, and review gates.
- `PROTOCOL.md` — current wire contract and additive compatibility rules.

### Protocol, policy, and server routing
- `packages/protocol/src/intent.ts` — current closed Intent union.
- `packages/protocol/src/messages.ts` — current WebSocket message registry.
- `packages/protocol/src/payloads-extension.ts` — extension request/result payloads.
- `packages/protocol/src/payloads-voice.ts` — voice state and tracked confirmation payloads.
- `packages/protocol/src/snapshot.ts` and `packages/protocol/src/act.ts` — current page and action contracts.
- `packages/policy/src/classify.ts` — deterministic action and link classification.
- `apps/server/src/turn.ts` — current user-utterance routing and Executor boundary.
- `apps/server/src/session/session.ts` and `apps/server/src/session/refresh.ts` — accepted page state, freshness, and refresh lifecycle.
- `apps/server/src/act/gated.ts`, `apps/server/src/act/grants.ts`, and `apps/server/src/act/gate-port.ts` — one-use grant authority.

### Extension and model boundary
- `apps/extension/src/content/snapshot.ts`, `walk.ts`, and `visibility.ts` — current bounded DOM capture and visibility checks.
- `apps/extension/src/background/navigation.ts` and `tabs.ts` — active-tab tracking and page-change lifecycle.
- `apps/extension/src/background/dispatch.ts` and `acts.ts` — extension action dispatch path.
- `apps/server/src/brain/agy/projection.ts`, `intent-router.ts`, and `privacy.ts` — value-free model projection, page-bound routing, and sensitive-text filtering.

### Cross-track interface references (read-only for this phase)
- `apps/server/src/voice/dialogue-runner.ts` and `apps/server/src/voice/core-gate-port.ts` — server integration with the voice reducer and GatePort.
- `packages/dialogue/src/confirm.ts` and `packages/dialogue/src/effects.ts` — voice-owned confirmation/effect boundary.
- `apps/voice/src/main.ts`, `socket.ts`, and `speak-bridge.ts` — current voice transport and tracked speech completion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/extension/src/background/navigation.ts` already tracks activation, navigation commits, history-state changes, tab removal, and window focus.
- `apps/server/src/session/refresh.ts` and the accepted Session model provide a freshness boundary for page-dependent commands.
- `packages/policy`, the core GatePort, and the extension live recheck provide deterministic action authority.
- `apps/server/src/brain/agy/projection.ts` already builds a bounded, value-free ordinary intent projection.

### Established Patterns
- AGY is tool-less and proposes typed data; server code validates and the Executor acts.
- Gated actions require tracked read-back, an exact phrase, the guard window, and one-use grant consumption.
- Extension captures are bounded and page text is untrusted.

### Integration Points
- New browser requests/results will extend `@blip/protocol`, route in the server, and dispatch through extension-owned Chrome APIs.
- Content capture must remain separate from ordinary form snapshots and must bind IDs to tab/page/capture identity.
- Voice-owned code is referenced for compatibility but is not edited here.

</code_context>

<specifics>
## Specific Ideas

The user's example begins in a new tab, opens a user-named service, and asks to read recent content. It is a generic capability example, not a Gmail-specific command or integration. Phase 7 provides the reusable navigation, content, link, and search primitives; Phase 8 handles multi-step reading and drafting.

</specifics>

<deferred>
## Deferred Ideas

- Multi-step reading, summarizing, drafting, revision, and send confirmation belong to Phase 8.
- Real account credentials, personal mailbox testing, and site-specific adapters are not required for this implementation phase.
- Shared requirements changes remain proposals until both track owners agree.

</deferred>

---

*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*  
*Context gathered: 2026-10-18*
