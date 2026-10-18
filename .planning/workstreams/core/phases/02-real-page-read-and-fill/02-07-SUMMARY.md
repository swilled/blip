---
phase: 02-real-page-read-and-fill
plan: 07
subsystem: api
tags: [websocket, snapshots, freshness, session-state]

# Dependency graph
requires:
  - phase: 01-contract-and-walking-skeleton
    provides: Server hub, session model, and extension snapshot request/reply path
provides:
  - Non-throwing single-flight snapshot refresher with one trailing request
  - Ordered snapshot application and age-based freshness for explicit read intents
affects: [remaining-phase-02-plans, phase-03-executor]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-flight refresh with a latest-reason trailing request, background snapshot apply that preserves active dialogue]

key-files:
  created:
    - apps/server/src/session/refresh.ts
    - apps/server/test/refresh.test.ts
  modified:
    - apps/server/src/session/session.ts
    - apps/server/src/server.ts
    - apps/server/src/turn.ts

key-decisions:
  - "Measure freshness from local model acceptance time; use capturedAt only to order snapshots within a tab."
  - "Keep describe on its cached model, while read_form and what's_required refresh after the configurable freshness threshold."

patterns-established:
  - "All page-change and read-intent refreshes share one refresher; bursts get one queued request carrying the newest reason."
  - "Background snapshot application may move no-page to ready but leaves busy and any active dialogue state untouched."

requirements-completed: [PAGE-05]

# Metrics
duration: 4min
completed: 2026-10-16
---

# Phase 2 Plan 7: Ordered server refresh and read-intent freshness Summary

**Page changes now refresh and push the current form model through one ordered request path, and explicit form reads refresh models older than two seconds.**

## Performance

- **Duration:** About 4 minutes
- **Started:** 2026-10-16T22:28:00-04:00
- **Completed:** 2026-10-16T22:32:01-04:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- A `page.changed` frame starts a snapshot refresh and pushes applied state without speaking or requiring an utterance.
- Refreshes allow one in-flight snapshot and one trailing snapshot shared by all waiting callers; the latest reason is used for the trailing request.
- Same-tab older snapshots are rejected, background applies preserve active dialogue state, and read_form/what's_required use a configurable 2,000 ms freshness threshold.

## Task Commits

Each task was committed atomically:

1. **Task 1: Trace page.changed through snapshot refresh to a state push** - `e251797` (feat)
2. **Task 2: Add refresh concurrency, ordering and age-based read freshness** - `6b5fe3a` (test), `b1b7989` (feat)

**Plan metadata:** Shared STATE/ROADMAP/REQUIREMENTS reconciliation is handled by the phase orchestrator after the parallel wave.

## Files Created/Modified

- `apps/server/src/session/refresh.ts` - Non-throwing snapshot refresher with single-flight and trailing follow-up semantics.
- `apps/server/src/session/session.ts` - Tracks accepted tab/model time and rejects older same-tab snapshots.
- `apps/server/src/server.ts` - Starts background refreshes on page changes and passes the freshness setting into turns.
- `apps/server/src/turn.ts` - Shares the refresher and applies max-age checks to explicit form reads.
- `apps/server/test/refresh.test.ts` - Covers page-change pushes, coalescing, order, dialogue preservation, failure handling, and read freshness.

## Decisions Made

- Model age starts when the server accepts a snapshot, while extension `capturedAt` participates in same-tab ordering.
- Describe keeps using the current cache; read_form and what's_required refresh when the configured age limit is exceeded.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The first typecheck attempt ran while the parallel 02-06 policy plan had added its test but not yet its implementation, so TypeScript could not resolve `packages/policy/src/classify`. After that sibling implementation landed, typecheck passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The server half of PAGE-05 is ready for the remaining Phase 2 extension refresh and browser work.
- `npm run typecheck` passes and `npx vitest run apps/server` passes all 218 tests.

## Self-Check: PASSED

- All five plan files and this summary exist.
- Task commits `e251797`, `6b5fe3a`, and `b1b7989` are present.
- Stub scan found no unfinished implementation; the existing Phase 4 availability message in `server.ts` is intentional.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*
