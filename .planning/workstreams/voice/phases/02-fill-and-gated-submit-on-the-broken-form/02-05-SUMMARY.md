---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 05
subsystem: dialogue
tags: [reducer, submit, confirmation-gate, safety, tdd]
requires:
  - phase: 02-04
    provides: Tracked speech IDs, reducer state and events, and read/fill handling
provides:
  - Read-back and submit flow with arming only after correlated uninterrupted read-back completion
  - Fail-closed exact-phrase confirmation gate with tracked speech and cancel effects
  - Example and seeded invariant coverage for single-use gated redeem
affects: [02-06, packages/dialogue, voice-workstream]
tech-stack:
  added: []
  patterns:
    - Armed utterance handling runs before normal grammar and refuses by default.
    - Submit redemption requires an exact phrase, no outstanding speech, and the completed-speech quiet window.
    - Reducer speech and stop cancellation use tracked speak IDs.
key-files:
  created:
    - packages/dialogue/src/confirm.invariant.test.ts
  modified:
    - packages/dialogue/src/submit.ts
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/read-fill.ts
    - packages/dialogue/src/submit.test.ts
    - packages/dialogue/src/reduce.test.ts
key-decisions:
  - "Only the exact phrase supplied by confirm.armed can redeem; utterance alternatives are ignored."
  - "The reducer's stop behavior emits a tracked cancelSpeech effect; the runner speaks Stopped. with that same tracked ID."
  - "The randomized invariant task is test-only because Task 2 already implements the behavior it proves."
patterns-established:
  - "A read-back grant is armed only after its correlated, uninterrupted speak.done and an unchanged form digest."
  - "Every refusal returns a tracked prompt plus the blocked earcon; guarded modes never fall through to parseIntent."
requirements-completed: [DLG-08, DLG-09]
duration: 12min
completed: 2026-10-17
---

# Phase 02 Plan 05: Read-back and Gated Submit Summary

**The reducer now requires an uninterrupted form read-back and a distinct, exactly timed phrase before requesting gated submission.**

## Performance

- **Duration:** 12 minutes
- **Started:** 2026-10-17T01:20:17-04:00
- **Completed:** 2026-10-17T01:32:00-04:00
- **Tasks:** 3
- **Files modified:** 6 source and test files

## Accomplishments

- Added page-ordered read-back, required-field refusal, and correlated read-back completion before arming the gate.
- Added the armed-mode safety gate: exact utterance text only, closed-window refusal, cancel/edit behavior, tracked speech and stop effects, and no model routing in protected modes.
- Added a 28-phrase refusal table, boundary examples at 999 and 1000 ms, and 500 seeded walks of 60 events checking four invariants.

## Task Commits

Each task was committed atomically:

1. **Task 1: Read-back, submit request, and arming sequence** - RED `640b387`, GREEN `a032c21`.
2. **Task 2: Armed-mode utterance handling** - RED `353956b`, GREEN `91a23ff`.
3. **Task 3: Seeded random-walk invariant** - test GREEN `478114c`.

Task 1 and Task 2 RED evidence was accepted by GSD (`RED_EVIDENCE_OK`) before the implementation commits. Task 3 was deliberately test-only: Task 2 already satisfied the invariant, so a manufactured failure or production mutation would not have tested a real gap.

## Files Created/Modified

- `packages/dialogue/src/submit.ts` - Read-back, submit, arm, confirmation lifecycle, and fail-closed armed utterance gate.
- `packages/dialogue/src/reduce.ts` - Routes guarded modes before other grammar and keeps speech bookkeeping first.
- `packages/dialogue/src/read-fill.ts` - Exposes the established named-field edit path for armed-mode reuse.
- `packages/dialogue/src/submit.test.ts` - Submit-flow, refusal table, half-duplex, cancellation, editing, and replay coverage.
- `packages/dialogue/src/reduce.test.ts` - Updates the stale speak.done expectation to require outstanding-ID removal and lastDoneAt bookkeeping.
- `packages/dialogue/src/confirm.invariant.test.ts` - Named boundary examples and seeded safety invariant walk.

## Decisions Made

- Keep `armConfirm` as the effect discriminant and its action payload as `actionKind`, matching the Plan 02-04 interface.
- Keep the reducer stop operation effects-only: its tracked `cancelSpeech` ID is also the ID the runner uses for “Stopped.” and remains represented in `outstanding`.
- Reuse the existing fill/select/focus path for named edits while armed, after clearing the grant.

## Deviations from Plan

### Auto-fixed Issues

**1. Rule 1 - Test maintenance for required speech bookkeeping**
- **Found during:** Task 2 (armed-mode handling)
- **Issue:** An existing reducer test expected `speak.done` to be a no-op, but the required contract removes its tracked ID and updates `lastDoneAt` for every completed speech.
- **Fix:** Updated only the stale test assertion; production behavior and type contracts were unchanged.
- **Files modified:** `packages/dialogue/src/reduce.test.ts`
- **Verification:** Dialogue suite and typecheck passed.
- **Committed in:** `91a23ff`

**2. Plan acceptance-criterion placement ambiguity**
- **Found during:** Task 1 acceptance review
- **Issue:** Task 1 requires a single redeem construction in `submit.ts`, although Task 1's behavior does not add an armed redeem path.
- **Fix:** Deferred this structural check until Task 2 introduced the redeem branch; confirmed there is exactly one construction, without adding a dead path.
- **Files modified:** None beyond planned implementation.
- **Verification:** A direct source check found one redeem construction in `submit.ts`.
- **Committed in:** `91a23ff`

**3. Task 3 RED was inapplicable**
- **Found during:** Task 3 (invariant proof harness)
- **Issue:** Task 2 already enforces each condition tested by the invariant. A failing test would require weakening production behavior or adding a contrived case.
- **Fix:** Added the planned proof harness without changing production code or manufacturing RED evidence.
- **Files modified:** `packages/dialogue/src/confirm.invariant.test.ts`
- **Verification:** Exact invariant target passed all four tests, including 500 × 60 randomized steps.
- **Committed in:** `478114c`

---

**Total deviations:** 3 documented adjustments (one test-maintenance fix, one plan ambiguity, one approved test-only TDD exception).
**Impact on plan:** The specified behavior and all acceptance gates were completed without adding a dependency or expanding scope.

## Issues Encountered

- No package installation was needed. The stop behavior and Task 3 TDD exception were resolved against the established Plan 02-04 contract and the approved task boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-06 can connect the completed pure reducer to the hub and gate runner. The runner should preserve tracked speak IDs, voice-source confirmation checks, and the fail-closed redeem contract.

DLG-08 and DLG-09 remain Pending in the workstream requirements tracker because `requirements ready-ids` reports both blocked by the unfinished sibling Plan 02-06. The plan frontmatter lists both completed requirements as required by the summary contract; the shared tracker was not advanced before the integration plan. `state update-progress` also declined to rewrite the progress display because the phase is not complete; `state advance-plan` and `roadmap update-plan-progress` recorded the current plan position and 5/7 plan summaries.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*
