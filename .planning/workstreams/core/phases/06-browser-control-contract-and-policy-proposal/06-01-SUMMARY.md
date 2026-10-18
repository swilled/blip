---
phase: 06-browser-control-contract-and-policy-proposal
plan: 06-01
subsystem: protocol-policy
tags: [browser-control, chrome-mv3, executor, privacy, navigation]

# Dependency graph
requires:
  - phase: 03-gated-submit-and-result-reading
    provides: Tracked read-back, exact purpose-specific confirmation, one-use grants, and the deterministic Executor boundary
  - phase: 04-claude-brain-and-label-repair
    provides: Tool-less AGY roles and a bounded value-free metadata projection
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: Hostile-page trust boundary and additive protocol review precedent
provides:
  - Teammate-reviewable browser-control capability and contract proposal
  - Explicit policy, page-text privacy, confirmation, lifecycle, and failure boundaries for later planning
affects: [06-02, browser-control implementation, voice-owner protocol review]

# Tech tracking
tech-stack:
  added: []
  patterns: [proposal-only additive contract, deterministic Executor authority, separately bounded page-content path]

key-files:
  created: [.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-PROPOSAL.md]
  modified: []

key-decisions:
  - "Keep all runtime and frozen protocol behavior unchanged until written voice-owner approval is recorded."
  - "Separate the user's safe-GET direction from the research recommendation for exact top-level URL.origin."
  - "Keep direct reads local and send bounded page text to AGY only for explicit summaries or page questions."
  - "Use a query-redacted route suggestion and bind browser-default search to its exact query and source page."
  - "Keep AGENT-01 in a separate future phase after the browser-control contract and primitives are reviewed."

patterns-established:
  - "Browser actions remain data-only until server policy and the deterministic Executor authorize dispatch."
  - "New content excerpts use independent bounds and truncation state, separate from Snapshot.truncated."

requirements-completed: []

# Metrics
duration: 5 min
completed: 2026-10-18
---

# Phase 6 Plan 06-01: Browser Control Contract Proposal Summary

**A review-ready 20-capability browser-control proposal with bounded local reads, explicit AGY excerpts, destination-bound navigation, and fail-closed search and link policies**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-18T04:30:51Z (approximate, from the Phase 6 state update)
- **Completed:** 2026-10-18T04:35:41Z
- **Tasks:** 2
- **Files modified:** 1 planned artifact

## Accomplishments

- Mapped all 20 requested browser capabilities to illustrative additive request/result shapes, deterministic authority paths, gates/refusals, stale-state invalidation, and follow-on owners.
- Defined bounded local heading/paragraph reads, explicit-only filtered excerpts for AGY summaries and questions, and the unchanged 250-element `Snapshot.truncated` semantics.
- Specified user-word-derived destinations, host read-back, one-use purpose-bound authorization, the proposed same-origin safe-GET boundary and residual risks, contextual search routing, browser-default search authorization, and explicit lifecycle/failure behavior.
- Kept protocol, policy, manifest, runtime, voice-owned, shared project/requirements, and Phase 5 release-gate files untouched.

## Task Commits

1. **Task 1: Define the additive capability and contract matrix** - `dbcb553` (`docs(06-01)`)
2. **Task 2: Specify policy, privacy, lifecycle, and failure behavior** - `cc13ace` (`docs(06-01)`)

## Files Created/Modified

- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-PROPOSAL.md` - Capability matrix, illustrative additive contract, deterministic authority rules, privacy boundaries, search/link policy, failure responses, and approval status.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-01-SUMMARY.md` - This execution summary.

## Verification

- Task 1 documentation literal check: passed, 26 required literals.
- Task 2 documentation literal check: passed, 35 required literals.
- Capability matrix check: all 20 required rows present.
- `git diff --check`: passed.
- Product tests were not run, as the plan explicitly limits verification to documentation checks.

## Decisions Made

- Keep the proposal clearly unapproved; a reported teammate agreement is not the written voice-owner approval artifact.
- Treat exact top-level HTTP(S) `URL.origin` as a research recommendation for review, not as the user's locked meaning of “same-site.”
- Keep browser-default search's hidden-provider limitation visible and require an operation-bound confirmation instead of claiming host verification.
- Keep query extraction local and allow only a query-redacted AGY route suggestion; page text and model output cannot rewrite a query or target.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The required written voice-owner approval remains a follow-on review gate, not an implementation blocker for this proposal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06-02 can crosswalk the proposal's proposed contract and acceptance cases without assuming any runtime behavior has changed.
- Written voice-owner approval of the exact contract is still required before any protocol or live classifier change may merge. No push was performed.

---
*Phase: 06-browser-control-contract-and-policy-proposal*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Proposal and summary files exist.
- Task commits `dbcb553` and `cc13ace` are present in git history.
- Required documentation checks and `git diff --check` passed.
