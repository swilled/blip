---
phase: 06-browser-control-contract-and-policy-proposal
plan: 06-02
subsystem: protocol-policy
tags: [browser-control, acceptance-evidence, approval-gates, executor, privacy]

# Dependency graph
requires:
  - phase: 06-01
    provides: Proposal contract, policy boundaries, privacy rules, and lifecycle behavior
  - phase: 03-gated-submit-and-result-reading
    provides: Tracked read-back, exact purpose-specific confirmation, one-use grants, and Executor authority
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: Hostile-page trust boundary and unchanged release gates
provides:
  - Source-to-proposal evidence crosswalk distinguishing facts, user decisions, and recommendations
  - Twenty-six future adversarial acceptance cases and explicit approval/release gates
affects: [browser-control implementation planning, voice-owner protocol review, AGENT-01 sequencing]

# Tech tracking
tech-stack:
  added: []
patterns: [planned-evidence-not-executed, provenance-crosswalk, purpose-bound-review-gates]

key-files:
  created: [.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-EVIDENCE-MATRIX.md]
  modified: []

key-decisions:
  - "Keep every adversarial acceptance case explicitly planned and unexecuted until a later implementation phase records evidence."
  - "Treat exact top-level URL.origin and non-empty rel exclusion as research recommendations, while the current live link policy remains unchanged pending written voice-owner approval."
  - "Require browser-default search authorization to bind the exact query, operation, source tab, canonical URL, and page identity, without authority over result links."
  - "Keep AGENT-01 separate from browser primitives and preserve Phase 5 release gates and shared-file ownership rules."

requirements-completed: []

# Metrics
duration: 3 min
completed: 2026-10-18
---

# Phase 6 Plan 06-02: Browser Control Evidence Matrix Summary

**A review packet that traces proposal claims to their sources and defines 26 adversarial cases, approval blockers, and future sequencing without implying implementation or test results**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-18T04:35:41Z (approximate, after Plan 06-01 completion)
- **Completed:** 2026-10-18T04:39:02Z
- **Tasks:** 2
- **Files modified:** 1 planned artifact

## Accomplishments

- Added a source-to-proposal crosswalk that distinguishes user decisions, repository facts, official API facts, and research recommendations.
- Recorded the exact top-level `URL.origin` link boundary and non-empty `rel` exclusion as recommendations, with sibling-subdomain, framed-candidate, permission, minimum-version, and residual GET/redirect limits.
- Corrected the stale handoff statement about tab tracking and documented the current metadata projection, 250-element wire cap, hidden provider URL, absent `search`/`history` permissions, restricted-page limits, and Executor/GatePort authority.
- Added 26 separately labeled adversarial cases, each marked as planned evidence rather than an executed test.
- Recorded written voice-owner approval as a blocker for protocol/live-policy changes; kept Phase 5 release gates, AGENT-01 sequencing, and shared-file owner agreement intact.

## Task Commits

1. **Task 1: Build a source-to-proposal crosswalk** - `b3dc094` (`docs(06-02)`)
2. **Task 2: Record adversarial acceptance and review gates** - `2845a62` (`docs(06-02)`)

## Files Created/Modified

- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-EVIDENCE-MATRIX.md` - Source crosswalk, 26 planned acceptance scenarios, and approval/ownership/release gates.
- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-02-SUMMARY.md` - This execution summary.

## Verification

- Task 1 documentation literal check: passed, 33 required literals.
- Task 2 documentation literal check: passed, 49 required literals; all 26 case labels were present.
- Evidence status check: passed, all 26 rows are labeled “Planned evidence.”
- `git diff --check`: passed.
- Browser, product, and protocol tests were not run; this plan defines future evidence only.

## Decisions Made

- Keep repository/API cross-checks separate from executed tests and label every future acceptance scenario as planned evidence.
- Keep the browser-default search grant limited to one exact query and configured-provider operation, bound to the originating source page, with no inherited authority over result links.
- Require a recorded written voice-owner decision on schema, safe-link eligibility, confirmation semantics, and privacy projection before protocol or live-policy changes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Corrected stale Phase 6 plan count after GSD roadmap update**
- **Found during:** State and roadmap update after Task 2
- **Issue:** `roadmap update-plan-progress 06` checked both plan boxes but left the Phase 6 header at `0/2 plans executed`.
- **Fix:** Updated only the Phase 6 count to `2/2` after confirming both plan summaries exist.
- **Files modified:** `.planning/workstreams/core/ROADMAP.md`
- **Verification:** The Phase 6 block lists both plans as checked and reports `2/2`; Phase 5 release-gate text is unchanged.
- **Commit:** Included in the final metadata commit.

## Issues Encountered

The written voice-owner approval artifact remains pending. This is a documented future review gate, not a blocker to completing the proposal packet. Existing untracked `.claude/` and `apps/voice/DESIGN.md` files were left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6's proposal and evidence packet are ready for teammate and voice-owner review.
- Written voice-owner approval is still required before any protocol schema or live classifier change. No implementation, merge, push, or live-policy change was performed.
- Phase 5's written M0 sign-off, teammate review, mainline promotion, and `demo-safe` tag remain independent release gates.

---
*Phase: 06-browser-control-contract-and-policy-proposal*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Evidence matrix and summary exist.
- Task commits `b3dc094` and `2845a62` are present in git history.
- Required documentation checks and `git diff --check` passed.
