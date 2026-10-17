---
phase: 02-real-page-read-and-fill
plan: 16
subsystem: content-act
tags: [content-script, form-fill, privacy, submit-guard]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: DOM snapshots, stable target IDs, and sensitivity classification from plans 02-10, 02-12, and 02-15
provides:
  - Live-checked fill, select, checkbox/radio, focus, scroll, and click-refusal act path
  - Post-write sensitivity shape checks before any read-back
  - Scoped capture-phase submit suppression around every act
affects: [02-17, 02-20, content-script]

# Tech tracking
tech-stack:
  added: []
  patterns: [native value setters with bubbling input/change events, per-frame snapshot fingerprint baselines, reference-counted submit guard]

key-files:
  created:
    - apps/extension/src/content/act.ts
    - apps/extension/src/content/fill.ts
    - apps/extension/src/content/focus.ts
    - apps/extension/src/content/submit-guard.ts
    - apps/extension/test/act.test.ts
    - apps/extension/test/fill.test.ts
    - apps/extension/test/submit-guard.test.ts
  modified:
    - apps/extension/src/content/index.ts
    - apps/extension/src/content/snapshot.ts
    - apps/extension/test/content-install.test.ts

key-decisions:
  - "A live act must resolve and revalidate its target immediately before acting, including readonly/disabled state, sensitivity, snapshot fingerprint, and kind."
  - "After a write, classify the resulting shape before constructing any read-back; sensitive results return a null observedValue."
  - "Block submit events in capture phase for the full duration of each act, with reference counting for overlapping scopes."

patterns-established:
  - "Form writes use native prototype setters and input/change events; typing is never simulated with key or mouse events."
  - "Content acts are handled in the target frame against that frame's latest snapshot fingerprint."

requirements-completed: [ACT-01, ACT-02, ACT-04, PAGE-03]

# Metrics
duration: 8min
completed: 2026-10-16
---

# Phase 2 Plan 16: Live-Checked Content Acts Summary

**Content acts now revalidate live targets, suppress sensitive post-write read-back, and block form submission for the full act.**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-10-17T03:13:30Z
- **Completed:** 2026-10-17T03:21:26Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Implemented live-checked fill, select, checkbox/radio, focus, scroll, and default-deny click handling, including readonly-as-disabled checks and stale snapshot checks.
- Reclassified each resulting value before read-back; card-shaped values return `sensitive-field` with `observedValue: null`.
- Added a reference-counted capture-phase submit guard for the complete act scope, including synchronous select `onchange` submission.
- Routed content acts to the frame that owns the target and retained a per-frame fingerprint baseline for stale checks.

## Task Commits

1. **Task 1: Implement value writes and the live act safety order** - `17d099f` (feat)
2. **Task 2: Block submit events for every act and restore them safely** - `8b84526` (fix)
3. **Task 1 safety follow-up: Keep read-back behind shape checks** - `c5d2a31` (fix)

## Verification

- `npx vitest run test/fill.test.ts test/act.test.ts test/submit-guard.test.ts test/content-install.test.ts --config vitest.config.ts` — passed, 4 files and 20 tests.
- `npm run ext:typecheck` — passed after the parallel 02-11 source files were present.
- Root `npm run typecheck` was still failing on missing ambient `chrome` types in the concurrent 02-11 `background/dispatch.ts` and `background/tabs.ts` at summary time. Those paths are outside this plan; rerun after 02-11 resolves the issue.

## Files Created/Modified

- `apps/extension/src/content/act.ts` - Live target checks, act dispatch, post-write privacy checks, and result shaping.
- `apps/extension/src/content/fill.ts` - Native value writes and checkable/select operations without synthetic keyboard or mouse typing.
- `apps/extension/src/content/focus.ts` - Focus behavior and event synthesis where browser focus transitions omit events.
- `apps/extension/src/content/submit-guard.ts` - Per-document reference-counted capture-phase submit suppression.
- `apps/extension/src/content/index.ts` - Async act message handling and frame-qualified target dispatch.
- `apps/extension/src/content/snapshot.ts` - Per-frame latest snapshot fingerprint baseline.
- `apps/extension/test/act.test.ts` - Live act safety, stale/kind/sensitivity checks, and redacted post-write outcomes.
- `apps/extension/test/fill.test.ts` - Native setter, maxlength, event, select, and checkable behavior.
- `apps/extension/test/submit-guard.test.ts` - Submit suppression, nested scopes, cleanup, and select auto-submit regression.
- `apps/extension/test/content-install.test.ts` - Content message routing to the async act path.

## Decisions Made

- The content act listener and per-frame snapshot baseline were added as the minimum integration needed for live stale checks; background routing remains with the follow-up plan.
- A radio write reuses the already shape-classified result when reporting its outcome, preventing a second raw-value read after classification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added minimal content act dispatch and snapshot baseline plumbing**
- **Found during:** Task 1
- **Issue:** The planned act executor could not receive frame-local acts or compare against a latest snapshot fingerprint without minimal content listener and baseline integration.
- **Fix:** Added async act dispatch in `content/index.ts` and saved the per-frame snapshot fingerprint in `content/snapshot.ts`.
- **Files modified:** `apps/extension/src/content/index.ts`, `apps/extension/src/content/snapshot.ts`, `apps/extension/test/content-install.test.ts`
- **Verification:** Content install test and the full focused 20-test suite passed.
- **Committed in:** `17d099f`

**2. [Rule 1 - Bug] Prevented a second raw radio value read after sensitivity classification**
- **Found during:** Task 2 safety self-check
- **Issue:** The radio result path could re-read `.value` after shape classification.
- **Fix:** Build read-back from the classified `post.value`; focus acts also scroll the target into view before focusing it.
- **Files modified:** `apps/extension/src/content/act.ts`, `apps/extension/test/act.test.ts`
- **Verification:** Focused tests passed, including card-shaped select option redaction and checkbox/radio result behavior.
- **Committed in:** `c5d2a31`

---

**Total deviations:** 2 auto-fixed (1 missing integration, 1 privacy bug)
**Impact on plan:** Both changes are needed for frame-local stale validation and privacy-safe outcomes; no background routing was added.

## Issues Encountered

- The root typecheck exposed missing Chrome ambient types in concurrent 02-11 background files. The extension package typecheck passes; root typecheck must be rerun after the owning executor resolves its error.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The content act path is ready for 02-17 to connect service-worker routing and for 02-20 to validate the privacy boundary in a real browser. Root typecheck remains pending the 02-11 fix noted above.

## Self-Check: PASSED

- Summary file exists at the required plan path.
- Task commit hashes `17d099f`, `8b84526`, and `c5d2a31` are present in git history.
- No uncommitted files from the 02-16 ownership paths remain.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*
