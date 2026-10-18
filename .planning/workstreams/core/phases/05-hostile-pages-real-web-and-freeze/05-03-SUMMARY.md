---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-03
subsystem: testing
tags: [edge, extension, e2e, gated-actions, injection]

# Dependency graph
requires:
  - phase: 03-gated-submit-and-result-reading
    provides: "Default-deny gated Executor, extension submit barriers, and sanitized audit records"
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: "Synthetic hostile-page fixture and loopback-only report sink from plan 05-01"
provides:
  - "GATE-06 real-browser evidence for hostile gated-submit routes"
  - "Opted-in Edge/Chrome attack matrix that requires an explicit BLIP_BROWSER selection"
affects: [phase-05, GATE-06, demo-freeze]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Match each guarded browser route against a fresh no-extension baseline on the local fixture"
    - "Require the test harness browser binary to equal the explicit BLIP_BROWSER selection"

key-files:
  created:
    - apps/extension/test/e2e/injection.e2e.test.ts
  modified: []

key-decisions:
  - "Keep the attack matrix loopback-only and use the harness-owned temporary browser profiles for every baseline and guarded run."
  - "Require BLIP_BROWSER for opted-in runs so browser auto-discovery cannot silently select an incompatible branded Chrome build."

patterns-established:
  - "A matched no-extension run proves the local form handler and report endpoint are active before asserting zero guarded effects."
  - "Gated server refusals are checked for sanitized metadata, with no extension act dispatch or successful audit outcome."

requirements-completed: [GATE-06]

# Metrics
duration: 7min
completed: 2026-10-17
---

# Phase 5 Plan 03: Real Browser Hostile Page Attack Matrix Summary

**An isolated Edge run proves the synthetic page's pay, Enter, direct-submit, requestSubmit, and lookalike routes have no effects without a confirmation grant.**

## Performance

- **Duration:** 7 minutes
- **Started:** 2026-10-17T16:30:00Z
- **Completed:** 2026-10-17T16:37:04Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added five no-extension baseline runs that prove the local submit observer and reporting sink respond to pointer click, Enter, `form.submit()`, `requestSubmit()`, and the lookalike submit button.
- Exercised the production extension and server on the same synthetic loopback fixture. The no-grant request generated one sanitized `gated action refused` audit record; the server dispatched no act.
- Verified that the guarded routes produce no fixture submit or sink reports, page navigation, page-state change, successful gated audit, or extension act result.
- Required `BLIP_BROWSER` for opted-in runs and asserted the harness used that exact binary. Edge used a fresh child profile per fixture; no existing browser profile was touched.

## Task Commits

1. **Task 1: Exercise direct and server-routed hostile actions in a real browser** - `9b6ac3c` (test)
2. **Task 2: Make the browser-test runtime explicit and safe** - `0eaf031` (test)

**Plan metadata:** this summary commit

## Files Created/Modified

- `apps/extension/test/e2e/injection.e2e.test.ts` - Matched no-extension baselines, extension-backed attack matrix, sanitized audit checks, and explicit browser selection.

## Decisions Made

- Used the harness's dedicated child profiles and local test-page server for all browser runs.
- Existing production guards already passed the attack matrix, so this plan required test coverage and no extension/server implementation change.

## Deviations from Plan

None - the plan executed as written.

## Issues Encountered

- The first opted-in run revealed that the action identifier includes its frame prefix (`f0e1`); the test was corrected to use the identifier returned by the real snapshot. The complete matrix then passed.

## Verification

- `BLIP_BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, `BLIP_E2E_BROWSER=1`; `npm run test --workspace @blip/extension -- test/e2e/injection.e2e.test.ts --no-file-parallelism` - passed, 1 test.
- `npm run typecheck --workspace @blip/extension` - passed.
- `git diff --check` - passed before the task commits.

## User Setup Required

None. The opted-in browser test requires `BLIP_BROWSER` to point to a compatible installed browser binary; the execution above used Edge.

## Next Phase Readiness

- GATE-06's real-browser evidence is complete.
- Phase 5 remains open for its other plans and external gates, including voice-owner protocol approval, a team-owned public form URL, a real voice client, and the pending Phase 4 live-provider criteria.

## Self-Check: PASSED

- Summary and E2E test files exist.
- Task commits `9b6ac3c` and `0eaf031` exist.
- The test file contains no known TODO, FIXME, or placeholder stubs.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*
