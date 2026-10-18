---
phase: 04-claude-brain-and-label-repair
plan: 04-01
subsystem: brain
tags: [claude-agent-sdk, structured-output, startup, offline-spike, subscription-gate]

# Dependency graph
requires:
  - phase: 03-gated-submit-and-result-reading
    provides: Deterministic action authority and tool-less model boundary
provides:
  - Exact Agent SDK pin at 0.3.302
  - Offline-by-default bounded spike for startup() and outputFormat
  - Factual live-use gate status and provisional D-01 fallback record
affects: [04-02, BRAIN-01, BRAIN-03]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/claude-agent-sdk@0.3.302"]
  patterns: ["Offline-by-default opt-in SDK probe", "Exact report-line checks before live calls"]

key-files:
  created:
    - apps/server/scripts/claude-sdk-spike.ts
  modified:
    - apps/server/package.json
    - package-lock.json
    - .planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-SDK-SPIKE.md

key-decisions:
  - "The response did not confirm an active eligible local subscription or authorize usage allocation, so no live request was made."
  - "Keep the D-01 streaming/Zod fallback provisional until the combined startup() and outputFormat path is measured live."

patterns-established:
  - "The default spike path exits before importing the Agent SDK; live mode requires both manually recorded approval lines."

requirements-completed: []

# Metrics
duration: 13m
completed: 2026-10-17
---

# Phase 4 Plan 1: SDK Spike Summary

**Exact-pinned Agent SDK with an offline-safe spike; the live lifecycle remains unmeasured because local use was not confirmed.**

## Performance

- **Duration:** 13m
- **Started:** 2026-10-17T07:58:12Z
- **Completed:** 2026-10-17T08:11:04Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added the exact `@anthropic-ai/claude-agent-sdk@0.3.302` dependency and Windows runtime to the lockfile.
- Added a time-bounded spike command whose default path stays offline and whose live path checks both recorded approval lines before importing the SDK.
- Reran the offline spike successfully. It exited before SDK import and made no provider request.
- Recorded the user's latest response accurately as not confirming an active eligible local subscription or usage allocation. No credentials were inspected and no Claude request was made.

## Task Commits

1. **Task 1: Approve the exact Agent SDK dependency** - `c5e05b0` (`docs(04): record SDK approval checkpoint`)
2. **Task 2: Confirm subscription availability and local-use terms** - not confirmed; no standalone file change. The outcome is recorded in the Task 3 report commit.
3. **Task 3: Install the approved pin and run the spike** - `46e76c8` (`chore(04-01): pin SDK and add gated offline spike`), followed by report update `27d90b7` (`docs(04-01): record unconfirmed live-use gate`)

## Files Created/Modified

- `apps/server/scripts/claude-sdk-spike.ts` - Bounded offline-by-default probe with an explicit two-line live-use gate.
- `apps/server/package.json` and `package-lock.json` - Exact SDK pin and Windows optional runtime.
- `.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-SDK-SPIKE.md` - Pin basis, unconfirmed live-use gate, offline result, and provisional lifecycle decision.

## Decisions Made

- Keep `ownerLiveUse: not confirmed`; the response “do what u think is best if this is a discuss phase, on the core track” does not establish subscription availability or authorize usage allocation.
- Keep the documented D-01 fallback (streaming session per role, JSON-only prompts, local `zod.safeParse`, one retry, and `tools: []`) provisional. The combined `startup()` + `outputFormat` path has not been measured.
- Leave BRAIN-01 and BRAIN-03 pending. This plan did not implement the provider or watchdog; those requirements remain for later Phase 4 plans.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected stale roadmap progress counters**
- **Found during:** Plan metadata update
- **Issue:** The roadmap helper reported one summary but did not update the Core roadmap counters because the phase uses `**Plans**:` instead of the heading format its matcher expects.
- **Fix:** Updated the Phase 4 plan count and progress row to 1/7 and In Progress.
- **Files modified:** `.planning/workstreams/core/ROADMAP.md`
- **Verification:** Confirmed both roadmap counters show 1/7 and the phase remains incomplete.
- **Committed in:** final plan metadata commit.

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking). **Impact:** Roadmap metadata only; no product scope changed.

The live leg remains unrun as explicitly allowed by the plan when Task 2 is not confirmed.

## Issues Encountered

No implementation issue. Live composition behavior, warm/cold timings, structured output reliability, and recovery remain unverified because the live-use gate was not confirmed.

## Deferred Live Evidence

The live leg remains closed. A future run requires explicit owner confirmation of an active eligible local subscription and permitted usage allocation. Until then, do not claim that `startup()` with `outputFormat` passed or that D-01's fallback was selected from live evidence.

## Requirements Status

BRAIN-01 and BRAIN-03 remain pending; this spike adds a prerequisite and offline guard, not the complete provider or watchdog behavior.

## Next Phase Readiness

The exact SDK pin and offline path are ready for provider implementation. The D-01 lifecycle choice is provisional, with the unrun live spike preserved as a follow-up checkpoint.

## Self-Check: PASSED

- Summary file exists at the expected phase path.
- Task commits `c5e05b0`, `46e76c8`, and `27d90b7` exist in repository history.
- Stub scan found no placeholder implementations in the plan's changed source and report files.

