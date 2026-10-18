---
phase: 04-claude-brain-and-label-repair
plan: 04-03
subsystem: brain
tags: [privacy, prompt-projection, token-budget, vitest]

requires:
  - phase: 02-real-page-read-and-fill
    provides: accepted snapshots and deterministic baseline FormModel
  - phase: 04-01
    provides: SDK spike status and the provisional D-01 fallback decision
provides:
  - Immutable, value-free model prompt projection with stable IDs and routing metadata
  - Prompt-only trimming and conservative serialized-input token estimate
affects: [04-02, 04-04, 04-05, intent, label-repair]

tech-stack:
  added: []
  patterns: [compact model-bound JSON, conservative UTF-8 byte estimate, projection-only trimming]

key-files:
  created:
    - apps/server/src/brain/claude/projection.ts
    - apps/server/test/brain-projection.test.ts
  modified: []

key-decisions:
  - "Use compact JSON keys plus an explicit prompt guide to keep repeated metadata within the local budget."
  - "Exclude describedBy hints because they can mix safe format guidance with value-echoing validation errors."
  - "Estimate from the exact prompt guide plus serialized projection at two UTF-8 bytes per estimated token; no live usage calibration was available."

patterns-established:
  - "Only project allowlisted metadata from the accepted Snapshot and matching FormModel; do not pass through model objects."
  - "Measure and trim only the new model input; never mutate or trim the wire Snapshot or Session model."

requirements-completed: [BRAIN-02, PAGE-04]

duration: 4min
completed: 2026-10-17
---

# Phase 4 Plan 04-03: Sanitized Prompt Projection Summary

**An immutable model context that preserves current IDs and routing types while excluding field values and fitting the approximate prompt budget.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-17T08:12:00Z
- **Completed:** 2026-10-17T08:16:06Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a value-free projection containing page title/headings, field and action IDs, field types, required/sensitivity state, action kinds, and safe option labels.
- Excluded current values, option values, presence flags, errors, and ambiguous `aria-describedby` hints; validated using sentinels and immutable-input checks.
- Added deterministic prompt-only trimming that drops headings, option details, groups, and secondary field metadata before shortening labels; required IDs, types, and action kinds remain.
- Added a serialized-input estimate and helper that includes the compact-key guide in the 8,000-token budget calculation.

## Task Commits

1. **Task 1: Add failing tests for sanitized prompt projection** - `14d34fb` (`test`)
2. **Task 1: Implement bounded value-free prompt projection** - `a2787cb` (`feat`)

## Files Created/Modified

- `apps/server/src/brain/claude/projection.ts` - allowlisted, compact model input, budget estimator, and deterministic trim.
- `apps/server/test/brain-projection.test.ts` - metadata, privacy, immutability, snapshot matching, and large-page tests.

## Decisions Made

- Compact keys (`v/h/x/p/f/a`) reduce repeated JSON overhead; `PROMPT_PROJECTION_GUIDE` and `serializeProjectionForPrompt` define the exact format for provider prompts.
- `Field.hint` is omitted entirely because `aria-describedby` can combine format hints with validation text that may echo entered values.
- The local bound uses UTF-8 bytes divided by two and is explicitly approximate. The live SDK leg and its usage-token measurements remain unavailable, so this is not claimed as usage-calibrated.
- D-01 remains provisional; this plan makes no SDK/provider call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Privacy] Excluded ambiguous field hints from model context**
- **Found during:** Task 1 (sanitized projection)
- **Issue:** The baseline `hint` is sourced from `aria-describedby`, which may combine a safe format hint with a validation message echoing entered data.
- **Fix:** Exclude all hints alongside error payloads; keep labels, field types, required state, groups, and safe option labels.
- **Files modified:** `apps/server/src/brain/claude/projection.ts`, `apps/server/test/brain-projection.test.ts`
- **Verification:** `DESCRIPTION_SENTINEL` is absent from serialized projection.
- **Committed in:** `a2787cb`

**Total deviations:** 1 auto-fixed (privacy)
**Impact on plan:** Preserves D-07 value privacy; models lose optional formatting hints, while IDs and deterministic routing metadata remain available.

## Verification

- `npx vitest run --project @blip/server apps/server/test/brain-projection.test.ts` — passed, 4 tests.
- `npm run typecheck` — currently reports errors in concurrent Phase 4 provider/session work (`provider.ts`, `session.ts`, and `scripts/dev.ts`); no diagnostics point to this plan's files. The orchestrator was notified to re-run after those edits settle.
- No live Claude request, credential access, or network/provider import was used.

## Issues Encountered

The full repository typecheck was blocked by unrelated in-progress provider/session diagnostics in the shared worktree. They were left for the owning executor and reported to the orchestrator.

## User Setup Required

None.

## Next Phase Readiness

Provider implementations can use `projectPageForPrompt`, `serializeProjectionForPrompt`, and `estimateProjectionTokens` for a bounded input. The serializer's compact-key guide must accompany the JSON. D-01 remains provisional pending an authorized live spike; this projection path has offline coverage.

## Self-Check: PASSED

- Summary and both plan files exist.
- TDD commits `14d34fb` and `a2787cb` are present in git history.
- Stub-pattern scan found no TODO, FIXME, placeholder, or empty-value stubs in the created source and test files.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*
