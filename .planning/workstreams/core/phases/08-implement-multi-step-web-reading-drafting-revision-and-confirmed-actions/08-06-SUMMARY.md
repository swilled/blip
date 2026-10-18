---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 06
subsystem: browser
tags: [browser-tasks, deterministic-routing, synthetic-acceptance, exact-phrase]
requires:
  - phase: 08-01
    provides: bounded identity-bound visible item capture
  - phase: 08-02
    provides: live extension read-item validation
  - phase: 08-03
    provides: session-scoped page-task state and selection
  - phase: 08-04
    provides: observed draft writes and revision
  - phase: 08-05
    provides: exact phrase and one-use draft-bound gate
provides:
  - end-to-end core routing for explicit item read, summary, question, draft, revision, and gated send requests
  - generic local synthetic page-task fixture with page-owned one-time result evidence
  - acceptance tests for ambiguity, privacy, observed draft values, exact spoken redemption, and post-action confirmation
affects: [phase-08, browser-tasks, acceptance]
tech-stack:
  added: []
  patterns: [explicit-item-command-grammar, synthetic-provider-and-extension-fakes, deterministic-test-clock]
key-files:
  created:
    - apps/server/src/browser/task-acceptance.test.ts
    - tools/test-pages/public/browser-task.html
    - tools/test-pages/test/browser-task.test.ts
  modified:
    - apps/server/src/turn.ts
    - apps/server/src/browser/tasks.ts
    - apps/server/src/browser/tasks.test.ts
    - apps/extension/src/background/read-item.integration.test.ts
key-decisions:
  - "Restrict the new parser to explicit latest/item/ordinal forms so Phase 7 whole-page and block-selection commands keep their existing route."
  - "Recipient and text-field selectors come from explicit user words and deterministic live-page matching; ambiguity asks the user to clarify."
  - "The existing exact spoken phrase gate remains separate from task state; typed input and general affirmations never authorize dispatch."
  - "Freeze the synthetic integration test page clock while retaining the production capture timeout and real extension dispatcher path."
patterns-established:
  - "Page-task targets are resolved only from the current identity-bound visible-item capture, then re-read by the extension before use."
  - "Model output proposes prose only; recipient, field, send phrase, grant, and execution authority remain in core."
  - "Success is spoken only after a fresh synthetic page result confirms the single dispatch."
requirements-completed: []
duration: 6min
completed: 2026-10-18
---

# Phase 8 Plan 06: Synthetic End-to-End Workflow Summary

**Core routes explicit current-item reading, filtered summaries, and observed-value drafting through one synthetic workflow that sends only after the exact spoken phrase and verifies a fresh page result.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-18T08:00:00Z
- **Completed:** 2026-10-18T08:05:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Wired explicit page-task requests to current capture selection, bounded content projection, draft/revision coordinators, and the existing gated action path.
- Added a local generic notice-board fixture with unique/tied/undated recency cases, inert hidden hostile text, a native draft form, and a one-time page-owned confirmation. The fixture test executes its local submit handler in jsdom.
- Added fake-only acceptance coverage for direct reads, summary, draft/revision observation, selector ambiguity, exact phrase binding, affirmations/typed/wrong/early/stale attempts, one-use dispatch, and fresh page confirmation.
- Stabilized the Phase 8 extension read-item integration harness under parallel test load by fixing its page clock; production timeout and real dispatcher behavior remain unchanged.

## Task Commits

1. **Task 1: Route explicit page-task commands through the core workflow** - `2367b1f` (`feat`)
2. **Task 2: Complete the generic local task fixture** - `5e0b5e9` (`test`)
3. **Task 3: Prove workflow privacy, binding, invalidation, and no-dispatch behavior** - `1a040a2` (`test`)

Additional plan deviation commit: `ed8b5f2` (`test(08-06): stabilize synthetic capture timing`).

## Files Created/Modified

- `apps/server/src/turn.ts` - Routes explicit item tasks through the deterministic task service, content role, observed draft coordinators, and existing gate.
- `apps/server/src/browser/tasks.ts` - Adds explicit user-supplied recipient/field selectors and send-request parsing; keeps generic page and block commands out of the new parser.
- `apps/server/src/browser/tasks.test.ts` - Covers explicit selectors and Phase 7 command separation.
- `apps/server/src/browser/task-acceptance.test.ts` - Exercises the full synthetic task and confirmation lifecycle with fakes.
- `tools/test-pages/public/browser-task.html` - Hosts wholly synthetic visible items and one local send sink.
- `tools/test-pages/test/browser-task.test.ts` - Verifies local-only fixture behavior, one-time submit, and visible result evidence.
- `apps/extension/src/background/read-item.integration.test.ts` - Uses a deterministic page clock in its synthetic full-dispatcher test.

## Decisions Made

- New page-task selectors use `latest`, `item <visible text>`, or an ordinal. Whole-page reads, summaries, and heading/paragraph selections stay on the Phase 7 route.
- The user must state visible recipient and text-field selectors for drafting. Core resolves both against live current form data and clarifies on no match or ambiguity.
- Exact `send this email` remains a direct, context-specific spoken phrase after tracked read-back and the one-second guard; no affirmative response or task state substitutes for it.
- Shared protocol/policy phrase vocabulary changes from earlier Phase 8 work remain local pending written voice-owner review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved legacy Phase 7 page and block routing**
- **Found during:** Task 3 (workflow acceptance)
- **Issue:** The initial broad `read …` and `summarize …` item grammar intercepted `read the page`, `summarize this page`, and paragraph-selection commands; ten existing page-content privacy tests failed.
- **Fix:** Narrowed the new grammar to explicit `latest`, `item …`, and ordinal selectors and added parser regression tests.
- **Files modified:** `apps/server/src/browser/tasks.ts`, `apps/server/src/browser/tasks.test.ts`, `apps/server/src/browser/task-acceptance.test.ts`
- **Verification:** Existing page-content tests and 08-06 focused workflow tests pass (46 tests across four files).
- **Committed in:** `2367b1f`

**2. [Rule 3 - Blocking] Made the synthetic extension capture test deterministic under parallel load**
- **Found during:** Task 3 (full verification)
- **Issue:** The Phase 8 read-item integration test intermittently exceeded the production capture time budget under the full parallel suite and returned `ok: false`.
- **Fix:** Freeze `document.defaultView.performance.now()` only in the test harness; production capture timing and the real dispatcher path are unchanged.
- **Files modified:** `apps/extension/src/background/read-item.integration.test.ts`
- **Verification:** Default parallel extension suite passes (181 passed, 28 skipped); full repository suite passes (1,483 passed, 28 skipped).
- **Committed in:** `ed8b5f2`

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking test-harness issue)
**Impact on plan:** Required to preserve the existing Phase 7 route and make the Phase 8 synthetic full-path test stable; no production timeout or authorization semantics changed.

## Verification

- Focused task, existing page-content regression, acceptance, and fixture tests: **4 files, 46 passed**.
- Full repository `npm test`: **133 files passed, 16 skipped; 1,483 tests passed, 28 skipped**.
- `npm run typecheck`: passed.
- `npm run ext:typecheck`: passed.
- `npm run ext:test`: **33 files passed, 16 skipped; 181 tests passed, 28 skipped**.
- `npm run ext:build`: passed.
- `npm run pages:build`: passed.
- `git diff --check`: passed.
- No live provider/account/site calls or private page data were used.

## Issues Encountered

- The first full run exposed the parser overlap and a parallel-load timeout in the existing synthetic read-item integration test; both were fixed and all required suites passed on rerun.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 implementation plans are complete with synthetic coverage for bounded item capture through exact phrase gated dispatch and page-confirmed outcome.
- Keep prior shared protocol/policy deltas local until written voice-owner review. No voice-owned files were changed.

## Self-Check: PASSED

- This summary exists at the required phase path.
- Task commits `2367b1f`, `5e0b5e9`, `ed8b5f2`, and `1a040a2` are present in git history.
- Phase 8 plan checklist and progress row both report 6/6 complete.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*
