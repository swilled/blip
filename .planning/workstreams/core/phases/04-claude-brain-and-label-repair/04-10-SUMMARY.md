---
phase: 04-claude-brain-and-label-repair
plan: 04-10
subsystem: verification
tags: [claude-agent-sdk, startup-gate, synthetic-bootstrap, bounded-live-check]

requires:
  - phase: 04-01..04-09
    provides: Isolated Claude role sessions, intent and repair validation, and the approved synthetic verification harness
provides:
  - Fixed role-shaped JSON bootstraps with schema validation before role readiness
  - Synchronous bootstrap accounting with per-role and total dispatch caps
  - Sanitized evidence from the one authorized 04-10 live attempt
affects: [Phase 04 verification, Phase 05 planning]

tech-stack:
  added: []
  patterns: [Synthetic startup bootstrap, pre-dispatch accounting callback, fail-closed role readiness]

key-files:
  created: [.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-10-LIVE-CHECK.md]
  modified: [apps/server/src/brain/claude/session.ts, apps/server/scripts/claude-sdk-live-check.ts, .planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-VERIFICATION.md, .planning/workstreams/core/ROADMAP.md, .planning/workstreams/core/STATE.md]

key-decisions:
  - "Only fixed synthetic Intent and repair operations may precede successful empty-tool checks; validated bootstrap outputs are discarded."
  - "A single initialization failure consumes the live approval; no retry is made, and all four live-dependent requirements remain pending."

patterns-established:
  - "Bootstrap counts increment synchronously before the SDK call is queued and share the overall structured-dispatch ceiling."
  - "A role is unavailable for normal calls until its init tool list and terminal synthetic bootstrap output both validate."

requirements-completed: []

duration: "continued from prior executor; exact duration unavailable"
completed: 2026-10-17
---

# Phase 04 Plan 04-10 Summary

**Claude startup now gates role readiness on a counted synthetic bootstrap, while the one approved live attempt stopped safely at initialization.**

## Performance

- **Duration:** Continued from the prior executor session; exact elapsed time was not tracked.
- **Started:** Not recorded; this plan execution continued from an earlier worker session.
- **Completed:** 2026-10-17
- **Tasks:** 3/3
- **Files modified:** 12 implementation, test, report, verification, state, roadmap, and summary files.

## Accomplishments

- Added role-specific fixed JSON bootstrap messages and strict Intent/repair validation, including required membership of the synthetic `bootstrap-field` ID. Bootstrap results are discarded, and normal calls wait for successful startup checks.
- Added synchronous per-role bootstrap accounting before SDK dispatch, caps of two intent bootstraps and one repair bootstrap, and the combined eight-dispatch ceiling. The live-check harness reports sanitized counts only.
- Ran the single authorized live command once. It failed during initialization after 6,454 ms with one intent bootstrap dispatch; no repair bootstrap, ordinary probes, role result, or tool count was observed. The approval is consumed; there was no retry.
- Kept BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending and Phase 4 open. The historical 04-08 report was not modified.

## Task Commits

1. **Task 1: Make role initialization observable without weakening the tool gate** — `4a0b3c2` (feat)
2. **Task 2: Add a separately approved eight-dispatch live-check gate** — `0bc51d7` (feat)
3. **Task 3: Run one bounded synthetic check and record evidence-backed status** — documentation and metadata commit follows.

Additional authorized test-only correction:

- `49824ee` makes a sensitive-output assertion deterministic by excluding random `actId` text from the card-sentinel substring check while continuing to assert sensitive values are absent from response payload fields.

## Files Created/Modified

- `apps/server/src/brain/claude/session.ts` — Fixed bootstrap inputs, strict role-specific result validation, readiness gating, cap enforcement, and synchronous pre-dispatch callback.
- `apps/server/test/claude-provider.test.ts`, `apps/server/test/server-brain.test.ts`, `apps/server/test/turn-brain.test.ts` — Bootstrap ordering, validation, discard, cap, cancellation, and adapter coverage.
- `apps/server/scripts/claude-sdk-live-check.ts` — Exact 04-10 approval marker and bounded bootstrap/ordinary/total dispatch counters.
- `apps/server/test/claude-sdk-live-check.test.ts` — Offline proof of approval, counters, caps, and sanitized reporting.
- `tools/fake-extension/test/fake-extension.test.ts` — Deterministic assertion fix for a random UUID/sentinel collision.
- `04-10-LIVE-CHECK.md` — Consumed approval provenance and sanitized failed result.
- `04-VERIFICATION.md`, `STATE.md`, and `ROADMAP.md` — Verification, progress, and execution status. `REQUIREMENTS.md` remains unchanged with all four Phase 4 requirements pending.

## Decisions Made

- A role cannot handle normal provider work until both its empty init tool list and terminal synthetic bootstrap output pass validation.
- The one failed live initialization consumes the bounded approval; the SDK is not called again under this plan.
- No requirements are marked complete because the live run produced no role results or probes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the fake-extension sensitive-output assertion deterministic**
- **Found during:** Task 3 full offline suite gate.
- **Issue:** An untouched test searched the entire serialized response for a short card-number sentinel; a random UUID in `actId` could coincidentally contain the same substring, causing a false failure.
- **Fix:** Restrict the sensitive-value assertion to response payload/value fields and avoid comparing random act IDs, without weakening the assertion that sensitive values are absent.
- **Files modified:** `tools/fake-extension/test/fake-extension.test.ts`.
- **Verification:** Targeted fake-extension suite passed 21/21; full repository suite passed after the correction.
- **Committed in:** `49824ee`.

---

**Total deviations:** 1 auto-fixed (blocking test false positive).
**Impact on plan:** The test-only correction was needed to reach the required offline suite gate; it does not weaken redaction behavior.

## Issues Encountered

- The one live attempt stopped at initialization after one synthetic intent bootstrap. No detailed SDK/provider error was recorded, so the cause remains unknown. Per plan, no retry was made.
- The existing owner-abort cleanup race fix was preserved and its regression coverage remains in the provider suite.

## User Setup Required

None. The live approval is consumed; another production SDK invocation requires fresh authorization.

## Verification

- Focused provider/live-check/server/turn tests — passed, 4 files / 34 tests.
- Targeted fake-extension suite — passed, 21/21 tests.
- Pre-live full suite — passed, 76 files passed, 12 skipped; 797 tests passed, 21 skipped.
- Pre-live `npm run typecheck` — passed.
- Offline live-check command — passed; returned offline with zero dispatches.
- One live invocation — failed at initialization after 6,454 ms; bootstrap counts intent 1/2 and repair 0/1, ordinary probes 0/5, total dispatches 1/8. No retry.
- Post-live `npm test` — passed, 76 files passed, 12 skipped; 797 tests passed, 21 skipped.
- Post-live `npm run typecheck` — passed.
- 04-08 report — no worktree diff; historical timeout and approval record preserved.

## Next Phase Readiness

The Phase 4 implementation and offline gates are complete, but Phase 4 remains open because the production integration criteria are unproven. BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 remain pending. Phase 5 work can be planned, but its live-Claude success criterion depends on resolving the provider initialization gap.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Verified task commits `4a0b3c2`, `0bc51d7`, and deviation commit `49824ee` exist.
- Verified implementation, tests, report, verification file, and summary exist.
- Verified all four Phase 4 requirements remain pending and the 04-08 live-check report has no diff.
