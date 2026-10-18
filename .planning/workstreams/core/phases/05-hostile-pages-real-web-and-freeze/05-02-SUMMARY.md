---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-02
subsystem: extension-security
tags: [typescript, dom, injection-detection, bounded-scan]

# Dependency graph
requires: []
provides:
  - Bounded document text detector that returns only a boolean warning signal
  - Synthetic DOM tests for instruction cues, exclusions, and scan limits
affects: [05-04, gate-07-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bounded TreeWalker scan with local normalization and explicit sensitive-surface exclusions

key-files:
  created:
    - apps/extension/src/content/injection-signal.ts
    - apps/extension/test/injection-signal.test.ts
  modified: []

key-decisions:
  - "Keep detection as a local boolean with no protocol or voice-state field until the cross-track contract is approved."
  - "Inspect at most 500 text nodes, 20,000 total characters, and 1,000 characters per node."

patterns-established:
  - "Page warning detection examines bounded text nodes only; it never reads field values or stores matched text."

requirements-completed: []

# Metrics
duration: 2 min
completed: 2026-10-17
---

# Phase 5 Plan 02: Bounded Injection Signal Summary

**A deterministic extension helper detects direct instructions aimed at Blip or AI agents from a bounded, excluded-surface-safe text scan and returns only a boolean.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-17T16:29:00Z
- **Completed:** 2026-10-17T16:30:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a read-only TreeWalker detector capped at 500 text nodes, 20,000 inspected characters, and 1,000 characters per text node.
- Excluded form controls, editable regions, and script/style/template/noscript content while still detecting hidden page prose.
- Added 11 focused jsdom cases for positive cues, benign mentions, private surfaces, no value reads, no DOM mutation, boolean-only output, and all scan limits.

## Task Commits

1. **Task 1: Specify bounded cue detection with synthetic DOM cases** - `fa05bb6` (test)
2. **Task 2: Implement the bounded document text detector** - `cdbbe3b` (feat)

**Plan metadata:** Recorded in the summary commit below.

## Files Created/Modified

- `apps/extension/src/content/injection-signal.ts` - Browser-safe bounded text detector with boolean-only output.
- `apps/extension/test/injection-signal.test.ts` - Synthetic DOM coverage for cue detection, exclusions, and fixed work bounds.

## Decisions Made

- Keep the warning as local detector output; do not change `Snapshot`, protocol schemas, voice `StatePayload`, or voice-owned code in this plan.
- Treat the signal only as warning metadata. It cannot grant authority or change deterministic action classification.

## Deviations from Plan

None - plan executed as written.

**Total deviations:** 0. **Impact:** No scope change.

## Issues Encountered

The initial RED test run failed because the planned implementation module did not yet exist; the implementation resolved it, and the GREEN run passed.

## Verification

- `npm run test --workspace @blip/extension -- test/injection-signal.test.ts` - passed, 11 tests.
- `npm run typecheck --workspace @blip/extension` - passed.
- `git show --check fa05bb6` and `git show --check cdbbe3b` - passed.

## User Setup Required

None.

## Next Phase Readiness

The local detector is ready for later integration. GATE-07 remains pending because the approved cross-track signal contract and voice warning path are not part of this plan. No protocol or voice-owned files were changed.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the planned path.
- Task commits `fa05bb6` and `cdbbe3b` exist in git history.
