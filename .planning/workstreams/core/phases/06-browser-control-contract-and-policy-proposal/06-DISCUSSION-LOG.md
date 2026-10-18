# Phase 6: Browser Control Contract and Policy Proposal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `06-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-10-18  
**Phase:** 06-browser-control-contract-and-policy-proposal  
**Areas discussed:** named destinations, same-origin links, page text and model use, search routing, multi-step agent mode

---

## Named destinations

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate immediately to the user-named site | Resolve the destination and navigate without a spoken check | |
| Say the resolved host and wait for confirmation | Read the resolved host back, then wait for the user | ✓ |

**User's choice:** “say the resolved host” before navigating.  
**Notes:** Destinations must come from the user's words, never page text.

## Same-origin links

| Option | Description | Selected |
|--------|-------------|----------|
| Keep same-origin links gated | Preserve the current phrase gate for ordinary same-origin links | |
| Prepare an ungated safe-GET proposal | Propose ungated same-site HTTP(S) GET links, with deterministic exclusions and teammate review | ✓ |

**User's choice:** “ungated and my teammate is fine with anything.”  
**Notes:** This records the core owner's preference and reported teammate agreement. The exact boundary for “same-site” needs to be defined in the proposal. The required written voice-owner approval artifact is still outstanding, so live policy stays unchanged.

## Page text and model use

| Option | Description | Selected |
|--------|-------------|----------|
| Never send page text to the model | Keep page text out of all model calls | |
| Send bounded page text only for explicit summary or question requests | Include filtered page text only when the user asks about it | ✓ |

**User's choice:** Allow bounded page text for explicit summaries and questions.  
**Notes:** Existing sensitive-data exclusions and untrusted-page rules remain.

## Search routing

| Option | Description | Selected |
|--------|-------------|----------|
| Always use the browser's default search engine | Treat every “search for” request as a web search | |
| Always use the current site's search box | Prefer the current page's own search control | |
| Choose based on the request and current context | Select a validated route from user wording and page context | ✓ |

**User's choice:** “search for should be based on context the agent should be able to choose.”  
**Notes:** Search query comes from the user's words, not page text. Existing submit and cross-origin gates remain.

## Multi-step agent mode

| Option | Description | Selected |
|--------|-------------|----------|
| Leave AGENT-01 out of the roadmap | Keep the current deferred requirement only | |
| Include it as a separate later phase | Plan multi-step orchestration after browser primitives, routed through the Executor | ✓ |

**User's choice:** “multi step should be included.”  
**Notes:** Keep it separate from Phase 6 and preserve Executor-only actions and the existing gate.

## the agent's Discretion

- Keep Phase 6 limited to a teammate-reviewable protocol and policy proposal.
- Use additive schemas and deterministic validation; fail closed on unsupported pages and ambiguous targets.
- Treat the reported teammate agreement as pending until written voice-owner approval is recorded.
- Do not edit shared `PROJECT.md` or shared requirements before both track owners agree.

## Deferred Ideas

- Implement the browser-control capabilities in follow-on phases.
- Implement AGENT-01 in its own later phase.
- Change live same-origin link behavior only after written voice-owner approval.
