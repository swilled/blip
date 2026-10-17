---
phase: 03-full-command-set-with-real-claude
plan: 03
subsystem: dialogue
tags: [voice, protocol, dialogue-reducer, injection-warning]

# Dependency graph
requires:
  - phase: 02-fill-and-gated-submit-on-the-broken-form
    provides: Current snapshot, observed-value, and deterministic confirmation patterns
provides:
  - Current-snapshot orientation and ordered required-field batches
  - Evidence-based guessed-label disclosures across snapshot changes
  - Warning-first handling of the approved warning-only GATE-07 boolean
affects: [Phase 3 I3 integration, Phase 4 voice integration]

# Actuals
actuals:
  tokens: 4300
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional warning-only protocol booleans cross into voice context without page text or action authority"
    - "Static trust warning is emitted before page responses and deduplicated by tab and snapshot version"

key-files:
  created:
    - packages/protocol/fixtures/gate-07.snapshot.json
  modified:
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/templates.ts
    - apps/server/src/voice/dialogue-runner.ts
    - apps/server/src/session/session.ts
    - packages/protocol/src/snapshot.ts
    - packages/protocol/src/payloads-voice.ts

key-decisions:
  - "Consume only the agreed optional Snapshot.untrustedInstructionDetected and StatePayload.page.untrustedInstructionDetected booleans; leave scanning and gate authority core-owned."
  - "Use a fixed warning and deduplicate it by the flagged tab and snapshot version; never pass page text into warning or confirmation matching."

patterns-established:
  - "Page-change handling refreshes the snapshot before reducing the changed-page event so trust warnings can precede page responses."
  - "Required fields remain count-first, page-ordered, and batched in groups of three."

requirements-completed: [DLG-10, DLG-11, DLG-14]
coverage:
  - id: D1
    description: "Orientation and required-field answers use only the current snapshot, mask values, and page-order missing fields in batches of three."
    requirement: DLG-10
    verification:
      - kind: unit
        ref: packages/dialogue/src/read.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "Guessed labels disclose only supplied evidence and repeat disclosure when the snapshot changes."
    requirement: DLG-14
    verification:
      - kind: unit
        ref: packages/dialogue/src/read.test.ts and packages/dialogue/src/fill.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "A flagged page produces a fixed warning before page responses, projects the approved boolean, and cannot arm the confirmation gate."
    requirement: DLG-11
    verification:
      - kind: integration
        ref: dev/mock-server/src/dialogue-runner.test.ts#projects the approved GATE-07 bit and warns before page responses on entry and changed snapshots
        status: pass
      - kind: unit
        ref: packages/protocol/test/snapshot.test.ts, packages/protocol/test/messages.test.ts, and packages/protocol/test/fixtures.test.ts
        status: pass
    human_judgment: false

# Metrics
duration: 24min
completed: 2026-10-17
status: complete
---

# Phase 3 Plan 3: Current-page guidance and trust warning summary

**Snapshot-grounded orientation, honest label disclosures, and warning-first handling of the agreed GATE-07 flag**

## Performance

- **Duration:** 24 min
- **Started:** 2026-10-17T15:31:41-04:00
- **Completed:** 2026-10-17T15:55:00-04:00
- **Tasks:** 3
- **Files modified:** 22 implementation and test files

## Accomplishments
- Added current-page orientation and count-first required-field reporting with ordered batches of three.
- Disclosed uncertain labels from approved field provenance and explicit evidence, with re-disclosure after snapshot changes.
- Wired the approved GATE-07 boolean through the existing snapshot-to-page projection and made a fixed warning precede responses on flagged pages. The warning contains no page text and cannot arm or redeem the confirmation gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer: answer orientation and required fields from the current snapshot** - `34652d7` (feat)
2. **Task 2: Disclose guessed labels from provenance and explicit evidence** - `997fad4` (feat)
3. **Task 3: Preempt page responses with the core injection warning** - `1bb419f` (feat)

**Plan metadata:** `22d9541` (docs: complete plan)

## Files Created/Modified
- `packages/dialogue/src/read-fill.ts` - required-field pacing and snapshot-safe reads.
- `packages/dialogue/src/reduce.ts` - orientation, label disclosure, and warning-first reducer behavior.
- `packages/dialogue/src/templates.ts` - deterministic guidance and warning language.
- `packages/dialogue/src/state.ts` - required-list and disclosure state.
- `apps/server/src/voice/dialogue-runner.ts` - fresh page snapshot and warning signal mapping.
- `apps/server/src/session/session.ts` - optional warning-bit projection into voice page state.
- `packages/protocol/src/snapshot.ts` and `packages/protocol/src/payloads-voice.ts` - approved optional contract fields.
- `packages/protocol/fixtures/gate-07.snapshot.json` - minimal synthetic flagged snapshot.
- `PROTOCOL.md` - warning-only contract documentation.
- Dialogue, protocol, and mock-server tests - coverage for snapshot freshness, evidence, projection, ordering, and gate isolation.

## Decisions Made

- The shared core contract supplied for this run uses `Snapshot.untrustedInstructionDetected?: boolean` and `StatePayload.page.untrustedInstructionDetected?: boolean`. This checkout predated those fields and the older plan text named a different `FormModel` location. Updated the plan and synchronized only those exact optional fields plus the existing projection; no detector, policy, Executor, or gate behavior was added.
- Kept the warning static and warning-only. Page content remains data and never enters the confirmation path.

## Deviations from Plan

- Corrected the stale plan precondition and allowed the exact approved optional protocol fields and projection to be synchronized locally. The approved contract shape supersedes the old `FormModel` location; no core-owned detection or gate behavior was implemented.
- **Impact:** Required to integrate against the uploaded contract; the warning remains informational and action authority remains with core.

## Verification

- `npm.cmd test` — passed, 57 files and 799 tests.
- `npm.cmd run typecheck` — passed.
- `git diff --check` — passed.

## Issues Encountered

- Adding truthful guessed-label speech exposed unacknowledged speech frames in an existing runner integration test. Updated that test to complete all queued speech frames; the full suite passes.

## User Setup Required

None for this plan.

## Next Phase Readiness

Plans 03-01 through 03-03 are recorded complete. Plan 03-04 is a blocking human I3 checkpoint and must wait until its preconditions are met: Phase 2 I2 passes, HO-8's core Gate/Executor and tracked-speech handoff lands, core BRAIN/PAGE/GATE integration is available, and the team-owned public form is ready. The supplied core update says Phase 5 remains open and no public-form URL is available, so I3 is not claimed or recorded as passed. The separate Phase 2 submit-gate criterion remains `human_needed`.

---
*Phase: 03-full-command-set-with-real-claude*
*Completed: 2026-10-17*
