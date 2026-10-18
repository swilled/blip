---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-03
subsystem: browser-control/session
tags: [typescript, session-state, browser-content, identity-binding]

# Dependency graph
requires:
  - phase: 08-01
    provides: bounded visible items with capture identity and visible-date evidence
  - phase: 08-02
    provides: live identity-bound read-item operation and extension revalidation
provides:
  - one bounded, ephemeral page task per Session with lifecycle cleanup and grant revocation
  - deterministic user-derived item selection and live revalidation for page-task commands
affects: [08-04, 08-05, 08-06, page-task workflows]

# Tech tracking
tech-stack:
  added: []
  patterns: [session-owned ephemeral task state, exact capture identity binding, explicit user-command parsing]

key-files:
  created:
    - apps/server/src/browser/task-state.ts
    - apps/server/src/browser/task-state.test.ts
    - apps/server/src/browser/tasks.ts
    - apps/server/src/browser/tasks.test.ts
  modified:
    - apps/server/src/session/session.ts

key-decisions:
  - "Keep one bounded page task in Session and scrub it on voice, extension, capture, page, tab, replacement, or cancellation transitions."
  - "Resolve targets only from the current identity-bound visible-item capture; latest requires complete valid date evidence and a unique greatest instant."
  - "Keep exact-phrase confirmation in the existing deterministic action gate; affirmative text such as 'yes' is not modeled as authorization in page-task state."

patterns-established:
  - "Use closed user-derived commands, then revalidate the selected item with the live read-item executor before returning or projecting text."
  - "Direct item reads stay local; optional content dispatch receives a filtered projection only after explicit summary or page-question requests."

requirements-completed: []

# Metrics
duration: 8m
completed: 2026-10-18
---

# Phase 08 Plan 08-03: Page-task state and deterministic visible-item resolution Summary

**One session-bound page task now retains a bounded safe excerpt, while user-derived commands resolve only a uniquely supported current visible item and revalidate it live.**

## Performance

- **Duration:** About 8 minutes
- **Started:** 2026-10-18T07:19:00Z
- **Completed:** 2026-10-18T07:27:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added one ephemeral page task per Session, with bounded source and observed-draft values, identity matching, scrubbing, and associated one-use grant cleanup.
- Added deterministic parsing and visible-item resolution. `latest` requires every current item to have valid visible-date evidence and one uniquely greatest date; ambiguous, stale, hidden-ID, and unsupported targets clarify.
- Direct reads revalidate through the live `read-item` executor and return locally without content-role dispatch. Summary and page-question requests use filtered projections only after explicit user commands.
- Kept page-task state separate from authorization. The existing exact-phrase gate still rejects a bare affirmation such as “yes.”

## Task Commits

Each task was committed atomically:

1. **Task 1: Define ephemeral page-task state and lifecycle** - `3df82f1` (feat)
2. **Task 2: Resolve visible item requests without model authority** - `0952a35` (feat)

## Files Created/Modified

- `apps/server/src/browser/task-state.ts` - bounded task model, content filtering, identity checks, and lifecycle helpers.
- `apps/server/src/browser/task-state.test.ts` - task replacement, bounds, identity changes, cleanup, and grant revocation coverage.
- `apps/server/src/browser/tasks.ts` - closed command parser, deterministic visible-item resolver, live read revalidation, and filtered content-request builder.
- `apps/server/src/browser/tasks.test.ts` - selection, recency, stale/ambiguous target, local read, explicit dispatch, and task cancellation coverage.
- `apps/server/src/session/session.ts` - Session-owned capture accessor and active task lifecycle integration.

## Decisions Made

- Kept selection and task state local to the server Session and bound each item to the exact current capture identity.
- Required complete valid date evidence before resolving “latest”; ties and missing or malformed dates ask the user to choose.
- Preserved the existing exact-phrase confirmation gate as the only authorization source. Page-task commands do not record affirmative consent.

## Deviations from Plan

None - plan executed as specified. The resolver compares ISO fractional seconds beyond JavaScript millisecond precision so a rounded tie cannot select the wrong latest item.

## Issues Encountered

- A test initially treated an instruction-like string inside visible page text as a command. The test was corrected to verify that page text stays inert and cannot change the user's explicit target.
- Display copy contained curly-quote encoding artifacts; replaced them with plain quoted command examples and reran focused checks.

## User Setup Required

None - no external service configuration required.

## Verification

- Focused task-state and resolver tests: **21 passed** across 2 files.
- Browser content, command, and authorization regressions: **75 passed** across 3 files.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Combined final test count: **96 passed** across 5 files.

No voice-owned files, shared protocol/policy files, external pages, accounts, or provider calls were used. Shared deltas remain local pending written voice-owner review.

## Next Phase Readiness

- Phase 08-04 can use the active task's selected source excerpt and observed-draft fields to implement draft composition and revision.
- No blocker. Exact-phrase authorization remains owned by the existing deterministic action gate.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Summary exists at the required phase path.
- Task commits `3df82f1` and `0952a35` are present.
