---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-07
subsystem: security-e2e
tags: [gate-06, gate-07, edge, hostile-page]

# Dependency graph
requires:
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: "Accepted warning boolean and existing no-grant hostile-page browser matrix"
provides:
  - "Real-browser evidence that accepted warning state precedes a subsequent action turn"
  - "Privacy assertions for state, transcript, prompt projection, model, audit, logs, and fixture reports"
  - "Retained GATE-06 no-grant refusal and zero-side-effect assertions"
affects: [05-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use the explicit Edge binary with harness-owned ephemeral profiles for opted-in browser tests"
    - "Label core warning delivery separately from voice-owned DLG-14 speech verification"

key-files:
  created: []
  modified:
    - apps/extension/test/e2e/injection.e2e.test.ts

key-decisions:
  - "A real-browser core E2E can prove boolean delivery but cannot claim DLG-14 speech without the voice-owned consumer."
  - "Keep the bait sentinel out of the wire snapshot, prompt projection, state, model observation, server logs, and test-page reports."

patterns-established:
  - "Wait for accepted warning state before a follow-up action request, then prove the ordinary GATE-06 refusal remains intact."

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-10-17
---

# Phase 5 Plan 07: Real-Browser Warning and Refusal Summary

**The Edge E2E observes the accepted boolean before the next action turn and retains the hostile-page no-grant refusal proof.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-17
- **Completed:** 2026-10-17
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added a harmless overview turn and required the voice state stream to carry `untrustedInstructionDetected: true` before the next action turn.
- Verified warning alone produces no `confirm.armed` or extension act dispatch.
- Checked the hidden bait sentinel is absent from the accepted snapshot, model prompt projection, state, transcripts/speech frames, FormModel observation, server logs, and page/sink reports.
- Preserved the GATE-06 audit refusal, no-submit events, no navigation, unchanged page state, and no successful gated audit.
- Recorded that DLG-14 speech verification remains voice-owned and pending.

## Task Commits

1. **Task 1: Assert accepted warning state and retain GATE-06 refusal coverage** - `bef1fd8` (test)
2. **Task 2: Record the voice-speech boundary accurately** - `31253b4` (test)

## Files Created/Modified

- `apps/extension/test/e2e/injection.e2e.test.ts` - Verifies the warning boolean, privacy boundary, and hostile-page refusal in one real-browser run.

## Decisions Made

- Keep the E2E result scoped to core boolean delivery. It does not simulate the voice UI or claim that DLG-14 is spoken.
- Continue to leave GATE-06 pending overall until Phase 4 provides successful applicable real-Claude evidence.

## Deviations from Plan

None - the planned single E2E file was extended without changing the hostile-page fixture or voice-owned code.

**Total deviations:** 0 auto-fixed. **Impact:** Core GATE-07 signal delivery is verified while external speech and live-provider gates remain explicit.

## Issues Encountered

None. The isolated Edge run completed successfully using the harness's unique repository-local profile and its own child process.

## User Setup Required

None.

## Verification

- `$env:BLIP_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; $env:BLIP_E2E_BROWSER='1'; npm run test --workspace @blip/extension -- test/e2e/injection.e2e.test.ts --no-file-parallelism` - passed, 1 test (run twice, including after the speech-boundary comment).
- `npm run typecheck --workspace @blip/extension` - passed.
- `npm test` - passed, 79 test files and 847 tests; 13 files and 22 tests skipped by existing opt-in gates.
- `npm run typecheck` - passed.
- `git diff --check` - passed.

## Next Phase Readiness

05-09 remains gated: Phase 4 has no successful applicable live-provider evidence; the team-owned public form and voice client target are absent; and no exact demo-form repair-cache identity is available. Do not create `demo-safe` or claim Phase 5 freeze.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*
