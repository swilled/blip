---
phase: 04-claude-brain-and-label-repair
plan: 04-09
subsystem: verification
tags: [claude-agent-sdk, offline-check, intent-routing, repair-cache]

requires:
  - phase: 04-01..04-08
    provides: Tool-less provider lifecycle, page-aware intent routing, repair validation, and the existing approval gate
provides:
  - Fake-testable approved-mode synthetic intent, cancellation/recreation, and repair/cache sequence
  - Sanitized evidence with monotonic prompt counts, bounded dispatch, and deadline cancellation
affects: [Phase 04 verification, live SDK check]

tech-stack:
  added: []
  patterns: [Injected provider probes, per-run temporary cache, exact single-line approval]

key-files:
  created: [.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-09-SUMMARY.md]
  modified: [apps/server/scripts/claude-sdk-live-check.ts, apps/server/test/claude-sdk-live-check.test.ts]

key-decisions:
  - "Only one exact plan-specific approval marker is accepted; conflicting or duplicate marker lines remain blocked."
  - "All probes use synthetic page data and a temporary cache; live provider use remains behind the existing report gate."

patterns-established:
  - "A route-local dispatch guard prevents routeIntent retries from exceeding one prompt per timed synthetic route."
  - "Timeout and provider errors retain only bounded counters, booleans, stage, role, and elapsed time."

requirements-completed: []

duration: 11m
completed: 2026-10-17
---

# Phase 04 Plan 04-09 Summary

**The gated verifier now exercises synthetic intent validation, cancellation/recreation, and a temporary repair-cache round trip using sanitized evidence.**

## Performance

- **Duration:** 11m
- **Started:** 2026-10-17T10:59:00Z
- **Completed:** 2026-10-17T11:10:08Z
- **Tasks:** 2/2
- **Files modified:** 2 implementation/test files

## Accomplishments

- Added an exported, dependency-injected probe sequence with two grammar-miss routes through `routeIntent`, a bounded cancellation/recreation attempt, a current-ID recovery route, and validated repair-cache save/reload.
- Kept intent/repair prompt counts monotonic and capped, blocked invalid approval markers and post-tool recreation prompts, and sanitized all serialized evidence.
- Wired the gated CLI callback to use a temporary cache directory; offline mode returns before report reads or provider construction.
- Added a regression test using the actual deferred report text; it proves provider creation and prompt dispatch remain at zero.

## Task Commits

1. **Task 1: Specify and implement the fake-testable approved probe sequence** - `a32ad4d` (feat)
2. **Task 2: Wire the approved CLI callback without changing the live-use decision** - `feb687e` (fix)

## Files Created/Modified

- `apps/server/scripts/claude-sdk-live-check.ts` - Synthetic probe sequence, sanitized evidence, monotonic dispatch guards, deadline handling, exact approval gate, and temporary-cache CLI callback.
- `apps/server/test/claude-sdk-live-check.test.ts` - Fake-only coverage for the approved sequence, approval refusal, cancellation/recreation, cache validation, limits, timeout, and sanitized output.
- `deferred-items.md` - Records an intermittent out-of-scope CLI startup timeout seen when the plan's test command expands to the full server suite.

## Decisions Made

- The approval report must contain exactly one approval-key line, and that line must match the existing 04-08 marker byte-for-byte. The current deferred report remains blocked.
- Requirements BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 remain pending because this plan uses only injected fakes and synthetic data.
- The production callback creates and removes a temporary repair-cache directory for each approved run.

## Deviations from Plan

None - plan executed as written. The out-of-scope CLI test timeout is recorded in `deferred-items.md` and was not modified.

## Issues Encountered

- The prescribed npm test command expanded to all 28 server test files. The unrelated `test/cli.test.ts` startup case intermittently exceeded its 5-second timeout; the final run passed all 336 tests. No CLI code was changed.
- Initial typecheck exposed two local typing mismatches in the probe adapter; both were corrected before task completion.

## Verification

- `npx vitest run --project @blip/server apps/server/test/claude-sdk-live-check.test.ts` - passed, 12/12 tests.
- `npm test -- --project @blip/server -- apps/server/test/claude-sdk-live-check.test.ts` - passed, 336/336 tests.
- `npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900` - passed; returned `offline`, `not_started`, and zero prompts.
- `npm run typecheck` - passed.
- No `--live` command, production SDK initialization, credential/environment read, or model prompt was performed.
- `04-08-LIVE-CHECK.md` hash remains `E46E6A356A540D4F5EB9887489E67B6C41CAC9C5BA3EA6EF67C5E3512CCDB1B8`; it still records deferred approval, zero SDK initialization/prompts, and all four requirements pending.

## Known Stubs

None.

## Next Phase Readiness

- Offline verifier coverage is complete. Live SDK evidence remains blocked by the unchanged deferred report and requires a later fresh explicit approval.
- Keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending until permitted live evidence is collected and verified.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Verified both task commits `a32ad4d` and `feb687e` exist.
- Verified the implementation, tests, summary, and deferred-items file exist.
- Verified the 04-08 live-check report hash is unchanged and BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 remain pending.
