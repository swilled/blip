---
phase: 03-gated-submit-and-result-reading
plan: 03-01
subsystem: policy
tags: [confirmation, grants, sha256, vitest]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: FormModel with ordered fields, current values, and sensitive-field presence
provides:
  - Browser-safe fixed confirmation phrases and exact matcher for gated action kinds
  - Server-only synchronous grant store with 30-second expiry and one-use binding checks
affects: [03-02-gated-executor, phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Browser-safe confirmation contract exported at package root and its own subpath
    - Server-only node:crypto fingerprints encode sensitive presence without sensitive values

key-files:
  created:
    - packages/policy/src/confirmation.ts
    - packages/policy/test/confirmation.test.ts
    - apps/server/src/act/grants.ts
    - apps/server/test/grants.test.ts
  modified:
    - packages/policy/src/index.ts
    - packages/policy/package.json

key-decisions:
  - "Confirmation phrases are fixed by gated action kind and normalize only case, whitespace, and terminal punctuation."
  - "Grant fingerprints bind target, kind, exact URL, snapshot version, and document-ordered field state while omitting sensitive values."

patterns-established:
  - "Confirmation matching is exact and independent of page labels or model output."
  - "Grant consumption deletes the pending record synchronously before checking expiry or live binding."

requirements-completed: [GATE-03, GATE-04, GATE-05]

# Metrics
duration: 6 min
completed: 2026-10-17
---

# Phase 03 Plan 03-01: Confirmation Phrases and One-Use Grants Summary

**Fixed per-kind spoken phrases and a privacy-preserving SHA-256 grant store now provide the deterministic base for gated action execution.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-17T06:03:53Z
- **Completed:** 2026-10-17T06:10:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added the five fixed confirmation phrases with exact matching after case folding, whitespace collapse, and terminal punctuation removal.
- Added a server-only grant store bound to target, gated kind, exact URL, snapshot version, and field values/presence in document order.
- Ensured sensitive fields contribute presence only; grant state stores only an opaque identifier, a SHA-256 fingerprint, and expiry.

## Task Commits

Each task was committed atomically, with test-first and implementation commits:

1. **Task 1: Fixed per-kind confirmation phrase matcher** - `cd409a2` (test), `d98e4af` (feat)
2. **Task 2: Atomic one-use grant binding** - `dd4364e` (test), `b6d10ad` (feat)

## Files Created/Modified

- `packages/policy/src/confirmation.ts` - fixed phrase table and browser-safe exact matcher.
- `packages/policy/test/confirmation.test.ts` - positive normalization and negative near-match coverage.
- `packages/policy/src/index.ts` - root export for the confirmation helpers.
- `packages/policy/package.json` - confirmation package subpath export; dependency versions unchanged.
- `apps/server/src/act/grants.ts` - expiring, synchronous, privacy-preserving one-use grant store.
- `apps/server/test/grants.test.ts` - TTL, one-use, binding, ordering, and sensitive-value checks.

## Decisions Made

- Keep confirmation language in a fixed per-kind table, independent of page content and model output.
- Hash only sensitive-field presence while hashing non-sensitive field values and all field ordering.

## Verification

- `npx vitest run packages/policy/test/confirmation.test.ts` - passed, 15 tests.
- `npx vitest run apps/server/test/grants.test.ts` - passed, 13 tests.
- `npx vitest run packages/policy/test/confirmation.test.ts apps/server/test/grants.test.ts` - passed, 28 tests.
- `npx tsc -p tsconfig.json --noEmit` - passed.
- Confirmed `packages/policy/src` has no `node:crypto` import.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

The GSD roadmap updater did not match the zero-padded phase argument or this roadmap's `**Plans**:` detail formatting. I reran it with phase `3`, then changed only Phase 3's detail line to `1/6 plans executed`; the progress row now shows `1/6` and `In Progress`. The initial RED runs failed because the package subpath and grant module did not yet exist; both focused suites passed after implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The phrase helper and grant API are ready for Plan 03-02's deterministic gated Executor. No blockers found.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All six planned code/test files and this summary exist.
- All four Task 1 and Task 2 commits are present in git history.
