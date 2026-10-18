---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 01
subsystem: demo
tags: [forms, html, fixtures, vitest]
requires: []
provides:
  - Self-hosted deliberately broken Customer survey form
  - Generated six-field survey FormModel fixture
affects: [voice-dialogue]
tech-stack:
  added: []
  patterns:
    - Voice-owned snapshots are validated and passed through the core baseline FormModel builder.
key-files:
  created:
    - fixtures/forms/broken.html
    - fixtures/forms/broken.snapshot.json
    - fixtures/forms/survey-form.model.json
    - scripts/gen-survey-form-model.ts
  modified:
    - dev/mock-server/src/broken-form.test.ts
key-decisions:
  - Preserve autocomplete="tel" on the phone field; use form-level autocomplete="off" and deterministic resets for restoration safety.
patterns-established:
  - Generated FormModel fixtures come from a validated raw Snapshot and buildBaselineFormModel.
requirements-completed: [DEMO-01]
coverage:
  - id: D1
    description: "Self-hosted broken survey form and generated six-field model for reducer tests"
    requirement: DEMO-01
    verification:
      - kind: unit
        ref: "dev/mock-server/src/broken-form.test.ts"
        status: pass
      - kind: other
        ref: "node --import tsx scripts/gen-survey-form-model.ts"
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-10-17
status: complete
commits: 2
plan_head_before: 18ebb67fbdafbddd128589a132abfa22d30c50d8
plan_head_after: 017a75b0837b90431b2298436ea1e329a740628f
---

# Phase 2 Plan 01: Broken Survey Form Summary

**Self-hosted broken Customer survey form with a generated six-field baseline model for dialogue tests**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-10-17T03:36:22Z
- **Completed:** 2026-10-17T03:44:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added an original survey page with the D-08 label and control breaks, color-only field errors, a page-level alert, a fail-closed decoy, and reset handling for fresh loads.
- Added a voice-owned raw snapshot and generator that validates it and uses `buildBaselineFormModel` to produce the six-field fixture.
- Extended the structural test to validate the page and generated model, including its select, radio group, required empty fields, and primary submit action.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the broken survey page and its structural test** - `d12e303` (`feat`)
2. **Task 2: Voice-owned snapshot and generated survey FormModel** - `017a75b` (`feat`)

The summary and sequential planning-state updates are committed together after the self-check.

## Files Created/Modified

- `fixtures/forms/broken.html` - Self-hosted intentionally inaccessible survey page with a client-only submit routine.
- `fixtures/forms/broken.snapshot.json` - Voice-owned snapshot describing six fields and two div actions.
- `fixtures/forms/survey-form.model.json` - Generated baseline FormModel fixture.
- `scripts/gen-survey-form-model.ts` - Snapshot validator and model generator using core's baseline builder.
- `dev/mock-server/src/broken-form.test.ts` - Structural and generated-model assertions.

## Decisions Made

- Kept the phone input's `autocomplete="tel"` so the snapshot preserves its phone hint. The form and other controls use `autocomplete="off"`; the page resets on `DOMContentLoaded`, `pageshow`, and a zero-delay timer.
- Kept the initial snapshot alert list empty because the page-level alert is hidden until required fields are missing.

## Deviations from Plan

### Resolved Plan Conflict

The plan requests `autocomplete="tel"` for the phone field and also says every control must use `autocomplete="off"`. HTML permits one `autocomplete` attribute per input. The phone keeps `tel`; the form uses `off`, other controls use `off`, and the three reset hooks clear restored values.

**Total deviations:** 1 resolved plan conflict.
**Impact on plan:** The phone hint remains available to the snapshot while form restoration is addressed by the explicit reset behavior.

## Issues Encountered

- PowerShell blocked the `npm.ps1` shim under the machine's execution policy. Running the equivalent `npm.cmd test -- dev/mock-server/src/broken-form.test.ts` command passed.
- `state.update-progress` withheld the body progress bar because GSD resolved the current phase scope as incomplete. `state.advance-plan` updated the plan position and completed-plan count, and the roadmap now records Phase 2 at 1/7.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The survey page and generated model are ready for the remaining Phase 2 dialogue plans. No blockers remain.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All five plan files and this summary exist.
- Both task commits are ancestors of HEAD.
- The plan ledger records two commits from `plan_head_before` through `plan_head_after`.
- No changes exist under `packages/protocol`, `apps/server`, or `tools`.
