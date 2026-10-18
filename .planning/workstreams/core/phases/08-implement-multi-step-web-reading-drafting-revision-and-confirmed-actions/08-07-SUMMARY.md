---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-07
subsystem: browser-control/dialogue-runner
tags: [dialogue-runner, page-tasks, confirmation-gate, loopback-integration]

# Dependency graph
requires:
  - phase: 08-03
    provides: bounded session task state and current-item selection
  - phase: 08-05
    provides: exact spoken phrase gate and source-bound draft grant
  - phase: 08-06
    provides: synthetic end-to-end page task flow and result verification
provides:
  - selective Phase 8 task and task-gate routing in the demo's dialogueRunner mode
  - server-level loopback coverage for success, denial, and lifecycle invalidation paths
affects: [demo, page-tasks, voice-confirmation, phase-08-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [selective-handler-composition, loopback-synthetic-extension, task-bound-lifecycle-cleanup]

key-files:
  created: []
  modified:
    - apps/server/src/server.ts
    - apps/server/test/dialogue-runner-server.test.ts

key-decisions:
  - "Keep ordinary reducer dialogue and non-task confirmation on the DialogueRunner handlers; route only recognized page tasks and task-bound grants to core."
  - "Pass the original task redeem payload to the existing server gate so typed and source-less attempts remain rejected by core."
  - "Perform task cleanup before runner lifecycle handling so reducer speech and page refresh behavior occurs once."
  - "Keep the exact phrase/policy and source vocabulary unchanged and local pending written voice-owner review."

patterns-established:
  - "Compose handlers selectively around startServer({ dialogueRunner: true }) instead of replacing the runner or adding a second gate."
  - "Use real loopback WebSocket clients with fake provider, snapshot, browser, and act responses for configured-server acceptance."

requirements-completed: []

# Metrics
duration: 19m
completed: 2026-10-18
---

# Phase 08 Plan 08-07: Configured Dialogue Runner Composition Summary

**The demo's configured DialogueRunner now sends explicit Phase 8 tasks and their exact spoken send redemption through the existing deterministic core path, with reducer lifecycle behavior retained for ordinary form dialogue.**

## Performance

- **Duration:** About 19 minutes
- **Started:** 2026-10-18T08:09:06Z
- **Completed:** 2026-10-18T08:28:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Selectively route recognized page-task utterances and pending task-bound `confirm.redeem` frames through the existing core turn and voice-gate handlers. The incoming source, grant ID, speak ID, and utterance ID reach the core unchanged.
- Keep normal form utterances and non-task confirmations on the original DialogueRunner handlers. Compose task readback, interruption, stop/repeat/cancel, PTT, settings, and page-change cleanup before reducer lifecycle work to avoid duplicate speech or refresh.
- Add a real loopback test that follows current-page capture, visible-item read, draft, revision, observed-value readback, exact phrase, one-use dispatch, and fresh page confirmation using only a fake tool-less provider and synthetic extension.
- Verify source-less/typed redemption, affirmations, wrong phrases, stale IDs, changed task/page/draft/recipient/action bindings, interrupted readback, stop/repeat/cancel/PTT, settings, page/tab change, voice disconnect/reconnect, and direct voice replacement produce zero send dispatch.
- Prove the gate reports an unverified outcome if the synthetic page does not return fresh confirmation after the single accepted click.

## Task Commits

1. **Task 1: Add the configured-runner server regression** - `c6e634d` (`test`)
2. **Task 2: Compose task routing, redemption, and lifecycle invalidation** - `d800236` (`feat`)

Plan metadata is committed with the final STATE/ROADMAP update and reported in the executor completion note.

## Files Created/Modified

- `apps/server/src/server.ts` - Selective handler composition for core page tasks, task-bound redemption, speech completion, and lifecycle cleanup.
- `apps/server/test/dialogue-runner-server.test.ts` - Synthetic loopback responder and acceptance/denial/invalidation coverage for the configured demo server.

## Decisions Made

- Route only explicit parsed page-task commands to core. The DialogueRunner remains the owner of ordinary form turns and non-task grants.
- Select the core redemption handler from the server's pending task binding, forwarding the original redemption payload so source, phrase, and correlation IDs are checked by the existing gate.
- Clear core task state before dispatching runner lifecycle handlers; retain one reducer stop/repeat speech and one page refresh.
- Keep source and phrase policy changes from earlier Phase 8 work local pending written voice-owner review; this plan changes neither shared protocol nor policy.

## Deviations from Plan

None - plan executed within the approved files and existing turn/gate paths.

## Issues Encountered

- The expected-red PowerShell check initially missed Vitest's stderr text. Capturing stderr with `2>&1` made the plan detector recognize the tagged `PHASE8_COMPOSITION_GAP` assertion; the reducer baseline remained green.
- A lifecycle test initially sent a second interruption after the same speech had already completed. The test now injects interruption before completion, preserving the production tracked-speech guard.

## Verification

- Expected-red composition test: **passed as expected** at the tagged pre-wiring assertion; reducer baseline: **1 passed**.
- Focused dialogue-runner, task acceptance, draft-gate, and page-content regressions: **4 files, 84 tests passed**.
- Dialogue-runner server suite: **30 tests passed**.
- Root `npm run typecheck`: passed.
- `npm run ext:typecheck`: passed.
- Full `npm test`: **133 files passed, 16 skipped; 1,509 tests passed, 28 skipped**.
- `git diff --check`: passed.
- No live AGY process, account, external site, credential, or real page data was used.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8's configured demo composition gap is closed with local synthetic evidence. The existing independent written voice-owner review for shared phrase/policy vocabulary remains pending; no shared policy/protocol/voice files changed in this plan.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Task commits `c6e634d` and `d800236` exist.
- Server and test files are present; user-owned untracked files remain unstaged and untouched.
