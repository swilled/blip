---
phase: 03-full-command-set-with-real-claude
plan: 01
subsystem: dialogue
tags: [typescript, reducer, spelling, privacy, vitest]
requires:
  - phase: 02-fill-and-gated-submit-on-the-broken-form
    provides: Pure dialogue reducer, typed fill/focus/speak effects, page-observed action results
provides:
  - Deterministic spelling of current page-observed non-sensitive field values
  - Named field changes confirmed with safe before and observed after values
  - Sensitive-field focus handoff with presence-only confirmation and transcript redaction
affects: [03-02, 03-03, 03-04, dialogue-runner]
actuals:
  tokens: 5363
  tasks: 3
  commits: 3
plan_head_before: a78b6c2978dfcd067b0a47da67dda30eb502803b
plan_head_after: 5132756526e1811e609a03fe22b988a42d637a6f
tech-stack:
  added: []
  patterns:
    - Deterministic grammar handlers resolve against the current FormModel before parseIntent
    - Change confirmations use act.result observations and retain only safe prior values
key-files:
  created: []
  modified:
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/read-fill.ts
    - packages/dialogue/src/templates.ts
    - packages/dialogue/src/state.ts
    - packages/dialogue/src/read.test.ts
    - apps/server/src/voice/dialogue-runner.ts
    - dev/mock-server/src/dialogue-runner.test.ts
key-decisions:
  - "Spell only non-sensitive values from the current FormModel, naming punctuation between characters."
  - "Confirm a named change from the prior safe value and act.result.observedValue, never from the requested value."
  - "Redact utterances that trigger sensitive-field focus before sending transcript frames."
patterns-established:
  - "Sensitive values stay out of state, speech, transcript frames, and parseIntent; sensitive handoff uses focus plus hasValue only."
requirements-completed: [DLG-04, DLG-06, DLG-12]
coverage:
  - id: D1
    description: "Spell a non-sensitive field value character by character with named punctuation from the current page snapshot."
    requirement: DLG-04
    verification:
      - kind: unit
        ref: packages/dialogue/src/read.test.ts#spells each page-observed email character and names punctuation
        status: pass
      - kind: integration
        ref: dev/mock-server/src/dialogue-runner.test.ts#reads, fills from observed page values, gates submission, and never sends a click
        status: pass
    human_judgment: false
  - id: D2
    description: "Change a named field and report its safe previous value and the value observed after the page write."
    requirement: DLG-06
    verification:
      - kind: unit
        ref: packages/dialogue/src/read.test.ts#changes a named field and confirms its prior and page-observed values
        status: pass
      - kind: unit
        ref: packages/dialogue/src/read.test.ts#does not claim or echo a requested value after a failed change
        status: pass
    human_judgment: false
  - id: D3
    description: "Keep password and card entry user-controlled, confirm presence only, and withhold sensitive dictation from emitted data."
    requirement: DLG-12
    verification:
      - kind: unit
        ref: packages/dialogue/src/read.test.ts#hands sensitive fields to the user and confirms presence without retaining or speaking the value
        status: pass
      - kind: integration
        ref: dev/mock-server/src/dialogue-runner.test.ts#withholds sensitive dictation from transcript, speech, reducer state, and intent parsing
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-10-17
status: complete
---

# Phase 3 Plan 1: Spell, Change, and Sensitive Handoff Summary

**The dialogue reducer spells page-observed values, confirms named changes from observed results, and keeps sensitive entry presence-only.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-17T19:00:00Z
- **Completed:** 2026-10-17T19:08:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added deterministic spelling for non-sensitive values, with letters and digits spoken separately and punctuation named.
- Added named change commands whose confirmation uses the safe previous value and the page-observed result.
- Kept sensitive fields on the focus-and-type path, confirmed only whether they are populated, and redacted sensitive dictation from server transcript frames.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer: spell a page-observed field value through the runner** - `f1a3db9` (feat)
2. **Task 2: Change a named field and report the page-observed transition** - `8d576df` (feat)
3. **Task 3: Keep sensitive fields user-entered and presence-only** - `5132756` (fix)

## Files Created/Modified

- `packages/dialogue/src/reduce.ts` - Routes spell and change commands before intent parsing and prevents overlong sensitive commands from reaching the model.
- `packages/dialogue/src/read-fill.ts` - Resolves spelling/change commands, uses observed action results, and provides presence-only sensitive confirmation.
- `packages/dialogue/src/templates.ts` - Renders per-character spelling and truthful before/after change confirmations.
- `packages/dialogue/src/state.ts` - Carries the safe previous value while a named change is pending.
- `packages/dialogue/src/read.test.ts` - Covers spelling, ambiguity, observed changes, failures, and sensitive sentinels.
- `apps/server/src/voice/dialogue-runner.ts` - Redacts sensitive handoff utterances in transcript frames.
- `dev/mock-server/src/dialogue-runner.test.ts` - Verifies tracked spelling speech and sensitive-data isolation through the runner.

## Decisions Made

- Spelling reads only the current non-sensitive FormModel value; punctuation becomes a spoken name separated by pauses.
- A change is successful only when the page returns a non-empty observed value. The response does not use the dictated value as proof.
- Sensitive handoff utterances are replaced with a fixed transcript marker before the server emits them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Redacted sensitive handoff utterances before transcript emission**
- **Found during:** Task 3 (Keep sensitive fields user-entered and presence-only)
- **Issue:** The reducer kept sensitive values out of state and speech, but the runner emitted every raw utterance in a transcript frame before dispatching effects.
- **Fix:** Replaced utterance text with a fixed withholding marker when the reducer routes to a sensitive field focus effect; overlong utterances mentioning a sensitive field are also kept out of `parseIntent`.
- **Files modified:** `apps/server/src/voice/dialogue-runner.ts`, `packages/dialogue/src/reduce.ts`, `packages/dialogue/src/read-fill.ts`
- **Verification:** Secret-sentinel assertions pass for transcript frames, speech, reducer state, and the model-intent callback; targeted tests and typecheck pass.
- **Committed in:** `5132756`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required to satisfy the planned sensitive-data boundary; no new dependencies or core-owned changes.

## Issues Encountered

- The mock page's observed email differed from the requested text. The runner assertion was changed to derive expected spelling from the returned observation, preserving the page-observed-value criterion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Voice-owned spelling, change, and sensitive-entry behaviors are covered by automated reducer and runner tests.
- The separate Phase 2 I2 human run is recorded as completed in Phase 2 verification; successful production submission remains dependent on core's Gate/Executor handoff.
- Plan 03-02 can proceed with profile fill and undo behavior.

---
*Phase: 03-full-command-set-with-real-claude*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the requested phase path.
- Task commits `f1a3db9`, `8d576df`, and `5132756` are ancestors of the current HEAD.
- The task commit ledger measures 3 commits from `plan_head_before` to `plan_head_after`.
