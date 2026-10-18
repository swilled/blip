---
phase: 03-gated-submit-and-result-reading
plan: 03-05
subsystem: results
tags: [deterministic, gated-actions, snapshots, validation-errors]

# Dependency graph
requires:
  - phase: 03-02
    provides: Gated Executor and session refresh path for post-action read-back
provides:
  - Page-evidence-only result classification and gated result speech
  - Fresh current-error reporting for the exact local "what went wrong" command
  - Accepted Snapshot returned by successful server refreshes
affects: [core-phase-03, gated-submit, result-reading, server-refresh]

# Tech tracking
tech-stack:
  added: []
  patterns: [interpret results only with a matching snapshot and FormModel, carry accepted snapshots through server refresh results]

key-files:
  created: [apps/server/src/results/interpret.ts]
  modified: [apps/server/src/act/gated.ts, apps/server/src/session/refresh.ts, apps/server/src/turn.ts, apps/server/src/brain/grammar.ts, apps/server/test/refresh.test.ts, apps/server/test/results.test.ts, apps/server/test/grammar.test.ts, apps/server/test/act-path.test.ts, apps/server/test/gated-flow.test.ts, apps/server/test/security.test.ts]

key-decisions:
  - "Result classification requires the current model to match the accepted snapshot version, URL, and structural hash."
  - "A successful dispatch is followed by one refresh; only captured page evidence can confirm the outcome."
  - "The exact normalized local command 'what went wrong' reads current errors after a fresh snapshot."

patterns-established:
  - "Successful Refresher results carry the exact snapshot accepted by Session.applySnapshot."
  - "Field errors are ordered by document order and spoken separately from page-level errors."

requirements-completed: [RES-01, RES-02]

# Metrics
duration: 9 min
completed: 2026-10-17
---

# Phase 03 Plan 05: Result Reading Summary

**Deterministic result speech now uses the accepted post-action snapshot, while the exact “what went wrong” command reports only current, labeled field and page errors.**

## Performance

- **Duration:** About 9 minutes
- **Started:** 2026-10-17T02:46:19-04:00 (first task commit)
- **Completed:** 2026-10-17T02:54:29-04:00
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added a deterministic classifier that confirms only from bounded heading or alert evidence and extracts a confirmation number only from the same evidence item.
- Gated actions now request one post-action snapshot and speak the interpretation of its accepted snapshot and matching model. Failed, stale, or mismatched results remain unverified.
- Added the exact local “what went wrong” command, which forces a fresh read and reports every current labeled field error in document order with page-level errors in a separate section.
- Added coverage for missing evidence, title/navigation-only claims, mismatched snapshots, error ordering, privacy redaction, current-error refresh, and post-action refresh failure.

## Task Commits

1. **Task 1: Classify fresh action results from explicit page evidence only** - `b846e95` (test), `eae14d6` (feat), `6fec890` (test)
2. **Task 2: Speak post-action evidence and repeat errors on request** - `c8cac93` (test), `ae98f14` (test), `75413dd` (feat)

**Plan metadata:** included in the final documentation commit.

## Files Created/Modified

- `apps/server/src/results/interpret.ts` - Deterministic result classification, privacy-safe error formatting, and evidence-only speech.
- `apps/server/src/act/gated.ts` - Refreshes after accepted gated actions and speaks evidence-based results.
- `apps/server/src/session/refresh.ts` - Returns the exact accepted Snapshot on successful refresh.
- `apps/server/src/turn.ts`, `apps/server/src/brain/grammar.ts` - Add exact current-error command routing.
- `apps/server/test/results.test.ts`, `apps/server/test/refresh.test.ts`, `apps/server/test/grammar.test.ts` - Cover result evidence, current errors, refresh contract, and deterministic grammar.
- `apps/server/test/act-path.test.ts`, `apps/server/test/gated-flow.test.ts`, `apps/server/test/security.test.ts` - Update directly affected refresh test doubles to return an accepted Snapshot.

## Decisions Made

- The classifier rejects a model whose snapshot version, structural hash, or URL differs from the supplied Snapshot.
- The gated action result is never treated as evidence of page success; the server makes one post-action refresh and interprets only that fresh page evidence.
- “What went wrong” is a deterministic exact local command and always reads the current page before speaking errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test doubles for the stricter RefreshResult success contract**
- **Found during:** Task 2 (Speak post-action evidence and repeat errors on request)
- **Issue:** Existing refresher mocks in three server suites returned success without the Snapshot now required by the internal contract, causing root typecheck errors.
- **Fix:** Updated only the affected `act-path.test.ts`, `gated-flow.test.ts`, and `security.test.ts` test doubles to return the fixture or exact accepted snapshot.
- **Verification:** The focused six-suite run passed; root typecheck then reported only the unrelated extension `chrome` ambient type error.
- **Committed in:** `75413dd`.

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The test-double updates were required to keep the server fixtures aligned with the new accepted-snapshot contract; no runtime scope was added.

## Issues Encountered

- Focused tests passed. Root `npx tsc -p tsconfig.json --noEmit` still reports `apps/extension/src/background/submit-method-guard.ts(25,27): Cannot find name 'chrome'`. This is outside this plan’s server scope and was left unchanged.
- `roadmap update-plan-progress 03` reported success but did not update the phase detail because the roadmap labels it “Phase 3”; updated only the Phase 03 plan-count line to reflect the five available plan summaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RES-01 and RES-02 behavior is implemented and covered by deterministic server tests.
- The unrelated extension Chrome ambient typing issue remains for its owning scope.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the plan output path.
- All task commits and the plan scope correction commit are present in git history.
