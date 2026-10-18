---
phase: 03-gated-submit-and-result-reading
plan: 03-04
subsystem: extension
tags: [chrome-extension, submit-guard, gated-actions, browser-tests]

# Dependency graph
requires:
  - phase: 03-03
    provides: Persistent document-start event barrier and permanent MAIN-world direct-submit guard
provides:
  - Fail-closed gated dispatch with nonempty kind-matched grant and verified target-frame barrier
  - Content-side live gate validation and exact one-event submit allowance
  - Real-browser coverage for direct submit bypasses during an extension select act
affects: [03-gated-submit-and-result-reading, extension-actions, submit-guard]

# Tech tracking
tech-stack:
  added: []
  patterns: [frame-scoped guard preflight, exact form-and-submitter event allowance]

key-files:
  created: []
  modified:
    - apps/extension/src/background/acts.ts
    - apps/extension/src/content/act.ts
    - apps/extension/test/acts-sw.test.ts
    - apps/extension/test/act.test.ts
    - apps/extension/test/submit-guard.test.ts
    - apps/extension/test/e2e/select-autosubmit.e2e.test.ts
    - tools/test-pages/public/select-autosubmit.html
    - apps/extension/test/act-overlay.test.ts
    - apps/extension/test/content-install.test.ts
    - apps/server/test/walking-skeleton.test.ts

key-decisions:
  - "Require a nonempty, kind-matching server grant and verified guard in the exact target frame before forwarding gated clicks."
  - "Allow only one matching submit event synchronously during a valid gated submit-control click; keep both persistent barriers installed."

patterns-established:
  - "Recheck grant shape and live target kind independently in the service worker and content script."
  - "The one-event exception is bound to the clicked control's exact form and SubmitEvent.submitter, and expires when click dispatch returns."

requirements-completed: [GATE-01, GATE-02]

# Metrics
duration: 8min
completed: 2026-10-17
---

# Phase 3 Plan 4: Extension Gate and Submit Boundary Summary

**Gated extension acts now require a verified frame barrier and matching grant, with a one-event exact-form allowance and real-browser proof that ungated direct submits stay blocked.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-17T06:35:30Z
- **Completed:** 2026-10-17T06:43:18Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- The service worker now rejects missing, malformed, or mismatched gate data and verifies the MAIN-world method barrier in the exact resolved frame before forwarding an act.
- Content independently rechecks grant and live kind, requires the persistent event guard, and grants one synchronous submit event only for the exact associated form and clicked submitter.
- Unit, typecheck, build, root suite, and isolated real-browser tests cover gated reads, one-use event limits, and blocked `form.submit()` / `requestSubmit()` routes.

## Task Commits

Each planned task was committed atomically; TDD task commits contain separate test-first and implementation/fix commits:

1. **Task 1: Require a verified frame guard and a matching server gate before dispatch** - `e3a4dbc` (test), `ae1a655` (feat)
2. **Task 2: Enforce gate and exact one-submit scope inside the content act** - `7f85311` (test), `51e6d86` (feat)
3. **Task 3: Prove direct submit stays blocked during a real extension act** - `898755b` (test), `b47aa4e` (test/fixture)

Additional Rule 1 test fixes are listed under deviations. Plan metadata commit is recorded in the execution report.

## Files Created/Modified

- `apps/extension/src/background/acts.ts` - validates gate shape and verifies the resolved frame guard before dispatch.
- `apps/extension/src/content/act.ts` - rechecks grant and live kind and scopes the one-use allowance around a valid submit-control click.
- `apps/extension/test/acts-sw.test.ts` - covers gate/refusal shapes and target-frame verification.
- `apps/extension/test/act.test.ts` and `apps/extension/test/submit-guard.test.ts` - cover live validation, persistent default-deny behavior, and exact one-event consumption.
- `apps/extension/test/e2e/select-autosubmit.e2e.test.ts` and `tools/test-pages/public/select-autosubmit.html` - exercise real extension select action and attempted direct/event submission.
- `apps/extension/test/act-overlay.test.ts` and `apps/extension/test/content-install.test.ts` - initialize the persistent barrier in act fixtures.
- `apps/server/test/walking-skeleton.test.ts` - updates a stale refusal-text assertion to the current safe read-back while preserving no-act/no-armed checks.

## Decisions Made

- A grant is not sufficient by itself: background and content each enforce matching gated kind, while background requires an unambiguous verified barrier in the exact target frame.
- The persistent event listener remains installed for the document lifetime. A valid gated submit-control click can allow one exact `SubmitEvent` only until synchronous click dispatch returns; direct `form.submit()` remains blocked by the permanent MAIN-world guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initialize the persistent guard in existing act harnesses and correct service-worker fixtures**
- **Found during:** Overall extension suite and typecheck
- **Issue:** Existing act-overlay/content-install tests invoked actions without simulating the document-start event barrier, and service-worker fixtures had invalid raw button data under current types.
- **Fix:** Installed the persistent test guard before those acts and corrected the button category/input type fixture.
- **Files modified:** `apps/extension/test/act-overlay.test.ts`, `apps/extension/test/content-install.test.ts`, `apps/extension/test/acts-sw.test.ts`
- **Verification:** Full extension directory passed (133 passed, 19 skipped); `npm run ext:typecheck` passed.
- **Committed in:** `edee4c6`

**2. [Rule 1 - Bug] Align walking-skeleton refusal text with the current safe read-back**
- **Found during:** Root `npm test`
- **Issue:** A Plan 03-02 test still expected the old refusal phrase after the response became a bounded read-back prompt.
- **Fix:** Expect the actual prompt containing “Page: Hotel booking.” and “To continue, say: submit booking.” while retaining assertions that no `act.request` is sent and `confirm.armed` is absent.
- **Files modified:** `apps/server/test/walking-skeleton.test.ts`
- **Verification:** Focused walking-skeleton test and root `npm test` passed.
- **Committed in:** `4c9bf2f`

---

**Total deviations:** 2 auto-fixed issues (Rule 1)
**Impact on plan:** Test harness setup and stale expectations were corrected to match the new default-deny behavior; no server behavior, protocol schema, package version, or architecture changed.

## Verification

- `npx vitest run apps/extension/test/acts-sw.test.ts` - 14 passed.
- `npx vitest run apps/extension/test/act.test.ts apps/extension/test/submit-guard.test.ts apps/extension/test/acts-sw.test.ts` - 35 passed.
- `npm run ext:typecheck` - passed.
- `npm run ext:build` - passed.
- `npx vitest run apps/extension/test` - 133 passed, 19 skipped.
- `npx vitest run apps/server/test/walking-skeleton.test.ts -t "a requested gated action reads back"` - 1 passed.
- `npx vitest run apps/extension/test/build.test.ts` from repository root - 3 passed.
- `npm test` - 65 files passed, 10 skipped; 704 tests passed, 19 skipped.
- `$env:BLIP_E2E_BROWSER='1'; npx vitest run apps/extension/test/e2e/select-autosubmit.e2e.test.ts --no-file-parallelism` - 1 passed in the isolated browser harness.

## Issues Encountered

`npm run ext:test` runs Vitest from the extension workspace, but `apps/extension/test/build.test.ts` resolves the manifest path from repository root and therefore looks under a duplicated `apps/extension/apps/extension` path. The full extension suite passes when invoked from the repository root. This pre-existing command-path mismatch is recorded in `deferred-items.md` and was not changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03-04's extension action boundary is implemented and verified. Plan 03-05 can build on the same persistent barriers and must continue to keep gate authorization within deterministic extension/server checks.

## Self-Check: PASSED

- Summary and all ten modified implementation/test/fixture files exist.
- All eight task and deviation commit hashes listed above are present in repository history.
- Only the core Phase 03 plan tracking and this plan's summary/deferred item are included in metadata staging.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*
