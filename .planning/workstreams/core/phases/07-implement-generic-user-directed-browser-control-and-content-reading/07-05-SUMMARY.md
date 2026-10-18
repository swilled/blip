---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-05
subsystem: browser-content
tags: [agy, privacy, browser, zod, vitest]

# Dependency graph
requires:
  - phase: 07-02
    provides: Bounded current-page browser content and capture identity.
  - phase: 07-03
    provides: Deterministic browser command routing and fail-closed actions.
  - phase: 07-04
    provides: Browser-control acceptance and current AGY lifecycle patterns.
provides:
  - Explicit summary and page-question projection over filtered, bounded visible text.
  - Lazy tool-less AGY content role with prose-only validated responses.
  - Capture-identity binding that discards stale model answers.
affects: [phase-07-browser-reading, phase-08-multi-step-web-reading]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy tool-less model role initialized only for explicit page-content requests.
    - Identity-bound local projection whose serialized prompt omits capture identifiers.

key-files:
  created:
    - apps/server/src/brain/agy/content-projection.ts
    - apps/server/src/brain/agy/content-projection.test.ts
  modified:
    - apps/server/src/brain/agy/privacy.ts
    - apps/server/src/brain/agy/provider.ts
    - apps/server/src/brain/agy/session.ts
    - apps/server/src/turn.ts
    - apps/server/src/browser/content.test.ts
    - apps/server/scripts/agy-cli-live-check.ts
    - apps/server/scripts/agy-hostile-live-check.ts

key-decisions:
  - "Keep the content role lazy and tool-less so local reads and unrelated commands never initialize or call it."
  - "Bind prose answers to the current capture identity locally while omitting identity and URL data from the model prompt."
  - "Keep bounded live-check content-role dispatch caps at zero; validate the role with synthetic injected tests."

patterns-established:
  - "Only explicit summary/page-question commands may project a bounded, sensitive-filtered current-page excerpt."
  - "Model content responses are validated prose only and are discarded if capture identity changes before delivery."

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-10-18
---

# Phase 07 Plan 05: Explicit Page Content Projection Summary

**Explicit page summaries and questions use a bounded, filtered excerpt through a lazy tool-less AGY role, with prose bound to the current capture.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-18T06:14:11Z
- **Completed:** 2026-10-18T06:22:42Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Added a local projection path limited to explicit summary and page-question requests, with visible-text, sensitive-shape, instruction, block-count, and code-point bounds.
- Added a separate lazy AGY content role with a strict prose-only output schema; the prompt receives no URL or capture identifiers, and output cannot request browser actions.
- Bound responses to capture identity and discard stale output. Direct reads and unrelated commands remain local with zero content-role calls.
- Updated bounded live-check counters and guards for the new role while keeping its bootstrap and dispatch caps at zero.
- Added injected-provider tests for explicit routing, privacy filtering, hostile prose, malformed output, and stale capture rejection. No production SDK calls were made.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit page-content question and summary projection** - `5bbb5d3` (feat)

**Plan metadata:** recorded in the follow-up docs commit.

## Files Created/Modified

- `apps/server/src/brain/agy/content-projection.ts` - Filters and bounds explicit page-content projections and serializes only safe text for the prompt.
- `apps/server/src/brain/agy/content-projection.test.ts` - Tests projection privacy, bounds, lazy tool-less role, and strict prose output.
- `apps/server/src/brain/agy/privacy.ts` - Exposes sensitive page-text shape detection for projection and answer checks.
- `apps/server/src/brain/agy/provider.ts` - Adds the strict prose-only content response contract.
- `apps/server/src/brain/agy/session.ts` - Adds lazy content role lifecycle and tool-less instructions.
- `apps/server/src/turn.ts` - Routes only explicit page-content requests and rejects sensitive or stale answers.
- `apps/server/src/browser/content.test.ts` - Exercises local reads, explicit questions, unrelated commands, and stale/hostile responses with injected fakes.
- `apps/server/scripts/agy-cli-live-check.ts` - Accounts for the added role and keeps content-role live caps at zero.
- `apps/server/scripts/agy-hostile-live-check.ts` - Rejects content-role dispatch in bounded hostile live checks.

## Decisions Made

- The content role stays lazy and tool-less; it is initialized only for explicit page summary/question requests.
- Capture identity remains local for stale-response checks and is omitted from the model prompt.
- Synthetic/injected tests cover the content role. Bounded live-check dispatch and bootstrap caps remain zero.
- Existing context-specific important-action phrase behavior and the bare-yes prohibition remain unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Updated live-check role counters and dispatch guards for the added content role**
- **Found during:** Task 1 (Add explicit page-content question and summary projection)
- **Issue:** Widening the AGY role type made bounded live-check role assumptions incomplete and would have allowed accidental content-role dispatch without an explicit zero-cap guard.
- **Fix:** Added content-role accounting and explicit zero bootstrap/prompt dispatch caps in both bounded checks.
- **Files modified:** `apps/server/scripts/agy-cli-live-check.ts`, `apps/server/scripts/agy-hostile-live-check.ts`
- **Verification:** Focused tests and TypeScript typecheck passed; no live provider calls were made.
- **Committed in:** `5bbb5d3`

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking issue)
**Impact on plan:** Required to preserve zero content-role live dispatch while keeping the added role type-safe; no change to the intended behavior.

## Issues Encountered

The first typecheck exposed missing role-count assumptions in bounded live checks. Those checks were updated to account for the role while keeping its live dispatch caps at zero; typecheck then passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 8 can build on the explicit, bounded page-reading path. Drafting, recipient resolution, and send behavior remain out of scope for this plan. Shared protocol and policy changes were not made.

## Self-Check: PASSED

- Summary file created at the required plan path.
- Task commit `5bbb5d3` exists.
- Focused tests: 2 files passed, 17 tests passed.
- `npm run typecheck` passed.
- `git diff --check` passed.

---
*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*
*Completed: 2026-10-18*
