---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 04
subsystem: dialogue
tags: [reducer, dictation, forms, tdd]
requires:
  - phase: 02-01
    provides: Broken survey page and six-field FormModel fixture
  - phase: 02-02
    provides: Spoken-text normalization, field and option resolution, and templates
provides:
  - Full dialogue state, event, and effect contracts with tracked speech identifiers
  - Batched form reading, required-field replies, and select/radio option picking
  - Guarded named and current-field fills with page-observed echoes and sensitive-field handoff
affects: [02-05, packages/dialogue, dev/mock-server]
tech-stack:
  added: []
  patterns:
    - Reducer speech is minted through speakEffect or cancelEffect, with every ID retained in outstanding.
    - Fill and select results echo only the observed page value and trigger a form refresh.
key-files:
  created:
    - packages/dialogue/src/state.ts
    - packages/dialogue/src/read-fill.ts
    - packages/dialogue/src/submit.ts
    - packages/dialogue/src/read.test.ts
    - packages/dialogue/src/fill.test.ts
  modified:
    - packages/dialogue/src/effects.ts
    - packages/dialogue/src/events.ts
    - packages/dialogue/src/index.ts
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/reduce.test.ts
    - dev/mock-server/src/server.ts
    - dev/mock-server/src/server.test.ts
    - dev/mock-server/src/run-real.test.ts
    - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-05-PLAN.md
    - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-PLAN.md
key-decisions:
  - "Every utterance uses a reducer-minted speakId; the runner's stop response is tracked through cancelEffect."
  - "The armConfirm effect keeps kind: armConfirm as its discriminant and names its ActionKind payload actionKind."
  - "Non-sensitive prior values are retained for later undo groundwork; sensitive fields never produce fill effects or stored values."
patterns-established:
  - "Local read, option, and fill grammar is resolved before parseIntent; unrecognized long input skips local grammar at 200 characters."
  - "An action result uses observedValue for speech and refreshes the form after success."
requirements-completed: [DLG-02, DLG-03, DLG-07]
coverage:
  - id: DLG-02
    description: "Read all six survey fields in page-ordered batches with continuation and required/optional labels."
    requirement: DLG-02
    verification:
      - kind: unit
        ref: "packages/dialogue/src/read.test.ts#reads exactly three fields and records the cursor and current field"
        status: pass
      - kind: unit
        ref: "packages/dialogue/src/read.test.ts#reads the final survey batch and offers non-placeholder options"
        status: pass
    human_judgment: false
  - id: DLG-07
    description: "Read non-placeholder choices and select by number or name using the option value."
    requirement: DLG-07
    verification:
      - kind: unit
        ref: "packages/dialogue/src/read.test.ts#dialogue read and option picks"
        status: pass
    human_judgment: false
  - id: DLG-03
    description: "Fill named and current fields with guarded dictation and echo only the value observed on the page."
    requirement: DLG-03
    verification:
      - kind: unit
        ref: "packages/dialogue/src/fill.test.ts#dialogue field fills and page-sourced echoes"
        status: pass
      - kind: command
        ref: "npm.cmd test -- packages/dialogue dev/mock-server"
        status: pass
      - kind: command
        ref: "npm.cmd run typecheck"
        status: pass
      - kind: static
        ref: "No production console calls; speak effects are constructed only in state.ts."
        status: pass
    human_judgment: false
actuals:
  tokens: 0
  tasks: 3
  commits: 7
duration: 18min
completed: 2026-10-17
status: complete
plan_head_before: fce9ce2e7cdac08f30fccc91b7901b8df76499e9
plan_head_after: 6c9a8bd3ae74f065ce94560d3d70acc1d55e8f47
---

# Phase 02 Plan 04: Reducer Read and Fill Summary

**The pure reducer now reads survey fields in batches, selects option values, and fills guarded fields using values observed on the page.**

## Performance

- **Duration:** 18 minutes
- **Started:** 2026-10-17T00:55:39-04:00
- **Completed:** 2026-10-17T01:12:37-04:00
- **Tasks:** 3
- **Files modified:** 13 implementation files, plus two downstream plan contracts

## Accomplishments

- Added the full dialogue state, event, and effect contract, including required tracked speech IDs and a no-op submit seam for Plan 02-05.
- Added three-field reading, continuation, stop/repeat/required grammar, and select/radio choice handling that submits option values rather than labels.
- Added named and current-field dictation with command/confidence/length guards, previous-value bookkeeping, sensitive-field focus handoff, page-observed echoes, and refresh-on-success.
- Updated the mock server and reducer call sites to use the new state and effect contracts.

## Task Commits

1. **Task 1: State, Effect and Event contracts plus call-site updates** - RED `a0fb70f`, GREEN `c3ed3b9`.
2. **Task 2: Read the form in batches and pick options** - RED `458c9a5`, GREEN `e99e5ad`.
3. **Task 3: Dictation fills with page-sourced echo** - RED `196626a`, GREEN `6c9a8bd`.

**Plan contract alignment:** `13b307a` updated Plans 02-05 and 02-06 for required speak IDs and the `actionKind` payload name.

Each RED phase was recorded and accepted by `check tdd-red-evidence` before its production implementation.

## Files Created/Modified

- `packages/dialogue/src/state.ts` - Complete state plus tracked speak and cancel effect helpers.
- `packages/dialogue/src/read-fill.ts` - Read/option/fill grammar and action-result handling.
- `packages/dialogue/src/submit.ts` - Submit-flow seam for Plan 02-05.
- `packages/dialogue/src/read.test.ts` and `fill.test.ts` - Exact read, option, fill, safety, and echo contracts.
- `packages/dialogue/src/effects.ts`, `events.ts`, `index.ts`, `reduce.ts`, and `reduce.test.ts` - Reducer contracts, dispatch, and call-site tests.
- `dev/mock-server/src/server.ts`, `server.test.ts`, and `run-real.test.ts` - Tracked speech IDs and explicit effect handling.
- Plans 02-05 and 02-06 - Aligned downstream speech and confirmation effect contracts.

## Decisions Made

- Keep `armConfirm` as the effect discriminant and call its `ActionKind` payload `actionKind`, since one object cannot carry two distinct `kind` properties.
- Keep every spoken line behind `speakEffect` or `cancelEffect`, so each utterance receives an ID for half-duplex and confirmation-window tracking.
- Use only `act.result.observedValue` for fill/select echoes and map observed choice values back to page labels.

## Deviations from Plan

**1. Narrow plan-contract clarification:** The effect union specified both `kind: "armConfirm"` and `kind: ActionKind` on one object, an impossible duplicate property contract. Kept the discriminant as `kind: "armConfirm"`, named the payload `actionKind`, and aligned Plans 02-05 and 02-06. The downstream contract docs are committed in `13b307a`.

**2. Downstream ID contract alignment:** Plans 02-05 and 02-06 had stale optional/nextSpeakId wording. Updated them to require the tracked `speakId` used by every speech effect; the one-second guard wording was left unchanged.

---

**Total deviations:** 2 narrow documentation adjustments.
**Impact on plan:** No architecture or phase scope changed; follow-on plans now match the implemented effect contract.

## Issues Encountered

- The first RED evidence record produced a TAP report with a multiline object diff that the GSD parser rejected. The test was narrowed to a direct effect-kind assertion; the same behavior test remained and GSD then accepted the genuine assertion failure as `RED_EVIDENCE_OK`.
- No packages were installed and no existing user/orchestrator artifacts were staged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-05 can now implement read-back and gated submit against the complete reducer state/effect/event contracts. All read, choice, fill, and page-observed echo tests pass.

## Self-Check: PASSED

- `npm.cmd test -- packages/dialogue dev/mock-server` passed (11 files, 104 tests).
- `npm.cmd run typecheck` passed.
- `packages/dialogue/src/fill.test.ts` confirms sensitive targets emit no fill effect; exact echo tests use observed values and map select values to labels.
- Production checks found no `console.` calls, and all `kind: "speak"` construction remains in `state.ts`.
- Acceptance checks confirm the redeem effect, zero stale `{ lastSpoken: null }` test literals, and “Stopped.” only under `cancelSpeech` in the mock server.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*
