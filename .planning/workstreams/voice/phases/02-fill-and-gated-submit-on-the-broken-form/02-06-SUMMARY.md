---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 06
subsystem: dialogue
tags: [voice, reducer, gate, websocket, mock-server, tdd]
requires:
  - phase: 02-05
    provides: Tracked reducer speech, read-back completion, and the exact-phrase confirmation window
provides:
  - A fail-closed voice GatePort stub with no redeem success branch
  - A serialized server effect runner wired into the real mock-server path
  - End-to-end verification of read, fill, observed-value echo, read-back gating, refusal, and no-click safety
  - HO-8 core integration handoff and optional HO-9 fixture request
affects: [02-07, apps/server, dev/mock-server, core-executor-integration]
actuals:
  tokens: 10837
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - One promise queue serializes voice reducer events and follow-up effects.
    - Voice speech and cancellation frames require reducer-minted tracked IDs.
    - Gated submission is delegated to GatePort, whose stub can only refuse.
key-files:
  created:
    - apps/server/src/voice/gate-port.ts
    - apps/server/src/voice/gate-port.test.ts
    - apps/server/src/voice/dialogue-runner.ts
    - dev/mock-server/src/dialogue-runner.test.ts
    - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md
    - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-task1-red-evidence.json
    - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-task3-red-evidence.json
  modified:
    - dev/mock-server/src/run-real.ts
    - dev/mock-server/src/run-real.test.ts
key-decisions:
  - "The development GatePort remains fail-closed until core's grant-bound Executor exists; the voice runner never emits click or gate-bearing ActRequest frames."
  - "Core integration is recorded as HO-8; the optional fake-extension snapshot override remains non-blocking as HO-9."
patterns-established:
  - "run-real injects voice-owned handlers into the existing server hub and keeps voice page fixtures under a dedicated static root."
  - "End-to-end tests advance fake time only after the runner has processed each speak.done event."
requirements-completed: [DLG-02, DLG-03, DLG-07, DLG-08, DLG-09, VIS-02]
coverage:
  - id: D1
    description: A fail-closed GatePort arms the stand-in phrase but always refuses redemption.
    requirement: DLG-09
    verification:
      - kind: unit
        ref: npm test -- apps/server/src/voice/gate-port.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: The serialized voice runner handles reducer effects, tracked speech, and only fill/select/focus extension actions.
    verification:
      - kind: integration
        ref: dev/mock-server/src/dialogue-runner.test.ts#reads, fills from observed page values, gates submission, and never sends a click
        status: pass
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
  - id: D3
    description: Read-back completion gates the confirmation prompt; bare yes and early exact phrases are refused, and the stub refuses a later exact phrase without submitting.
    requirement: DLG-08
    verification:
      - kind: e2e
        ref: npm test -- dev/mock-server
        status: pass
    human_judgment: false
  - id: D4
    description: HO-8 documents the core GatePort and Executor work, and HO-9 records the optional fixture override.
    verification:
      - kind: other
        ref: rg -n "HO-8|HO-9|survey|GatePort|speak.done|human_needed" .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md
        status: pass
    human_judgment: true
    rationale: Core owns the Executor and real gate; the handoff records a pending integration dependency rather than proving the cross-workstream submit path.
duration: 14min
completed: 2026-10-17
status: complete
---

# Phase 02 Plan 06: Dialogue Runner and Fail-Closed Gate Summary

**The real mock-server path now runs the reducer through a serialized, voice-owned effect runner while every development redemption still fails closed.**

## Performance

- **Duration:** 14 minutes
- **Started:** 2026-10-17T01:32:29-04:00
- **Completed:** 2026-10-17T01:46:24-04:00
- **Tasks:** 3
- **Files modified:** 10, including two accepted RED evidence records and this summary

## Accomplishments

- Added the GatePort contract and phrase stand-in; redeem has no success type and always returns `gate-not-connected`.
- Added one-queue reducer effect handling for voice utterances, tracked speech completion, controls, page changes, safe fill/select/focus acts, snapshots, and gate events.
- Wired the runner into `startReal`, served the forms fixture root, and verified read, fill, observed-value echo, required-field refusal, read-back-before-arm, blocked/refusal frames, and the post-window stub refusal over WebSocket.
- Recorded the pending core Executor/GatePort work in HO-8 and the optional snapshot override request in HO-9.

## Task Commits

Each task was committed atomically:

1. **Task 1: GatePort and fail-closed stub gate** - RED `7d4ae4c`, GREEN `512d971`.
2. **Task 2: Dialogue runner** - `db85a39`.
3. **Task 3: run-real wiring, integration tests, and handoff** - RED `8688672`, GREEN `0c4ad6a`.

**Plan metadata:** Summary, STATE.md, ROADMAP.md, and REQUIREMENTS.md are committed together after the task commits.

Both TDD RED records were accepted by GSD as `RED_EVIDENCE_OK` before their GREEN commits.

## Files Created/Modified

- `apps/server/src/voice/gate-port.ts` and `gate-port.test.ts` - Typed arm/clear/redeem contract and a stub with no success branch.
- `apps/server/src/voice/dialogue-runner.ts` - Serialized reducer effect dispatch, voice-only handling, tracked speech, bounded acts, and gate delegation.
- `dev/mock-server/src/run-real.ts` - Handler injection, default stub gate, test clock/action hook, FakeExtension handle, and fixture static root.
- `dev/mock-server/src/run-real.test.ts` - Preserved Phase 1 response parity and checked the forms static root.
- `dev/mock-server/src/dialogue-runner.test.ts` - WebSocket flow plus untracked-speech, role guard, and rejecting GatePort checks.
- `.planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md` - HO-8 core handoff and optional HO-9.
- `.planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-task1-red-evidence.json` and `02-06-task3-red-evidence.json` - Accepted TDD RED evidence.

## Decisions Made

- Keep the development gate incapable of submitting until core supplies a grant-bound Executor; exact-phrase success remains `human_needed` while HO-8 is pending.
- Keep the optional FakeExtension snapshot override separate from this plan; the integration tests derive expected fields from the existing five-field model and compare speech to the extension's actual observed value.

## Deviations from Plan

No scope deviation. `startReal` returns the FakeExtension test handle so the integration test can compare its received `observedValue` directly with the spoken echo, as required by the plan.

## Issues Encountered

- The first end-to-end timing attempt advanced the fake clock before the queued `speak.done` event had reached the reducer. The test helper now waits for the runner's state push after each completion before advancing time; the 1000 ms boundary checks and full target suite pass.
- No packages were installed and no core-owned paths were changed.

## User Setup Required

None - no external service configuration is required.

## Next Phase Readiness

Plan 02-06 is complete and Plan 02-07 is ready. The local runner proves the voice-side flow and fails closed; core's grant-bound GatePort and Executor remain pending in HO-8, so the real “only submit survey submits” criterion still needs that integration.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*
