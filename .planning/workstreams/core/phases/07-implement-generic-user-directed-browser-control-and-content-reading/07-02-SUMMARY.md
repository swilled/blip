---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-02
subsystem: browser-control
tags: [typescript, browser-api, authorization, vitest, site-search]

# Dependency graph
requires:
  - phase: 07-01
    provides: Closed browser operation and result schemas plus bounded extension captures
provides:
  - Deterministic browser command routing and current link/tab selection
  - Tracked, exact-phrase, one-use browser authorization and a single validated dispatch Executor
  - Site search through a fresh FormModel and the existing gated submit path
affects: [07-03, 07-04, 07-05, 07-06, phase-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [core-owned browser authorization, typed BrowserExecutor dispatch, fresh FormModel site search]

key-files:
  created:
    - apps/server/src/browser/authorization.ts
    - apps/server/src/browser/authorization.test.ts
    - apps/server/src/browser/executor.ts
    - apps/server/src/browser/site-search.test.ts
  modified:
    - apps/server/src/browser/commands.ts
    - apps/server/src/browser/commands.test.ts
    - apps/server/src/session/session.ts
    - apps/server/src/turn.ts
    - apps/server/src/server.ts
    - packages/protocol/src/payloads-browser.ts
    - packages/protocol/test/browser-control.test.ts
    - .planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-02-PLAN.md

key-decisions:
  - "Bind browser authorization to its exact target, source page identity, and tracked read-back speakId; require the one-second guard and consume before dispatch."
  - "Site search fills the exact query through the existing field Executor, verifies the observed value, and arms the current submit action through VoiceGateAdapter."
  - "Add the minimal tabs.open-blank protocol variant omitted from Plan 07-01; keep this shared contract change local pending written voice-owner review."

patterns-established:
  - "Browser navigation, default search, and selected-link opens use operation-specific phrases and a one-use authorization separate from form grants."
  - "All extension browser operations pass through BrowserExecutor and validate both request and response payloads."

requirements-completed: []

# Metrics
duration: 14min
completed: 2026-10-18
---

# Phase 7 Plan 2: Bind Browser Actions to Tracked Authorization

**User-directed browser commands now use a core-owned, one-use authorization path, while site search reuses the existing verified form-submit gate.**

## Performance

- **Duration:** 14 minutes
- **Started:** 2026-10-18T05:33:10Z
- **Completed:** 2026-10-18T05:47:31Z
- **Tasks:** 2
- **Files modified:** 15 including planning metadata

## Accomplishments

- Added deterministic routing for current-page reads, links, destinations, searches, tabs, history, reload, scrolling, and find-on-page. Link and tab targets resolve from fresh extension captures.
- Added session-bound browser authorization with target and source-page bindings, tracked speech completion, a one-second guard, 30-second expiry, cancellation, invalidation, and consume-before-dispatch behavior.
- Routed all browser extension requests through a typed BrowserExecutor. Browser-default search and direct navigation require exact target phrases; bare affirmations and typed text cannot redeem them.
- Added typed `site-search` routing through a uniquely matched visible search field and submit action from a fresh FormModel. The exact query is filled and observed before the existing form gate is armed.
- Added the missing `tabs.open-blank` protocol variant and regression tests to support the phase’s new-tab workflow.

## Task Commits

1. **Task 1: Parse generic browser commands without model-chosen targets** - `377b389` (`feat`)
2. **Task 2: Bind browser authorization and dispatch to tracked current state** - `52186e1` (`feat`)

## Files Created/Modified

- `apps/server/src/browser/commands.ts` and `commands.test.ts` - Deterministic command parser and adversarial command coverage.
- `apps/server/src/browser/authorization.ts` and `authorization.test.ts` - Purpose-bound authorization store and lifecycle/refusal tests.
- `apps/server/src/browser/executor.ts` - Single typed browser request and response validation boundary.
- `apps/server/src/browser/site-search.test.ts` - Verifies exact fill/read-back precedes arming the current submit action.
- `apps/server/src/session/session.ts`, `apps/server/src/turn.ts`, and `apps/server/src/server.ts` - Session binding, routing, speech completion, and invalidation integration.
- `packages/protocol/src/payloads-browser.ts` and `packages/protocol/test/browser-control.test.ts` - Additive blank-tab operation contract and schema tests.
- `07-02-PLAN.md` - Records the protocol files added to this plan’s scope.

## Decisions Made

- Browser action authorization remains core-owned and separate from the form grant store. The voice socket’s matching completed read-back ID and the full guard are required before an exact phrase can redeem the operation.
- Site search does not use browser-default search APIs. It fills only a unique visible search field, checks the extension-observed value, then delegates submit read-back and authorization to the existing form gate.
- The open-blank operation is the smallest additive contract change needed for the stated new-tab workflow. The protocol lock generator was rerun; its output remained unchanged because it records message names and roles, not members of the browser operation union.

## Deviations from Plan

### Approved contract-gap fix

**1. Add `tabs.open-blank` omitted from Plan 07-01**
- **Found during:** Task 2
- **Issue:** Phase 7’s new-tab workflow could not be implemented with the existing `tabs` operation union.
- **Fix:** Added only the `open-blank` action variant and schema regression cases; regenerated the protocol lock (no lock diff because browser operation members are not represented in its current shape).
- **Files modified:** `packages/protocol/src/payloads-browser.ts`, `packages/protocol/test/browser-control.test.ts`
- **Verification:** Focused protocol tests passed (35 tests); full typecheck passed.
- **Committed in:** `52186e1` (part of Task 2 commit)
- **Review status:** Local only pending written voice-owner review.

**Total deviations:** 1 approved contract-gap fix.
**Impact on plan:** Required to support starting from a blank tab; no voice-owned code or form confirmation behavior changed.

## Issues Encountered

- The protocol lock generator does not capture browser operation members; it was run after the schema change and emitted no lock diff. The schema tests now cover the additive operation directly.
- Focused typecheck caught the parser’s new `null` fall-through typing and the protocol’s unexported tabs result type; both were corrected before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 07-03 can build on the parser, current capture/session binding, and Executor. The `tabs.open-blank` protocol extension remains local until the voice owner provides written review; no push or merge was performed.

## Verification

- `npm test -- --run apps/server/src/browser/authorization.test.ts apps/server/src/browser/site-search.test.ts apps/server/src/browser/commands.test.ts` — passed, 60 tests.
- `npm test -- --run packages/protocol/test/browser-control.test.ts` — passed, 35 tests.
- `npm run typecheck` — passed.
- `npm run protocol:lock` — completed; generated lock unchanged.
- `git diff --check` — passed.

## Self-Check: PASSED

- Task commits `377b389` and `52186e1` exist.
- Focused tests, protocol contract tests, typecheck, protocol lock generation, and whitespace checks passed.
- Voice-owned paths, `.claude/`, `apps/voice/DESIGN.md`, fixture forms, and unrelated phase marker files were not staged.

---
*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*
*Completed: 2026-10-18*
