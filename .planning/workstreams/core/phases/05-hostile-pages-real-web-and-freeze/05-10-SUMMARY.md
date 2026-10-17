---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-10
subsystem: testing
tags: [claude-agent-sdk, vitest, edge, extension, prompt-injection]

# Dependency graph
requires:
  - phase: 04-claude-brain-and-label-repair
    provides: Locked-down Claude provider and value-free production intent projection
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: Seeded loopback injection fixture, extension warning boolean, and gated Executor
provides:
  - Synchronous pre-dispatch prompt guard and combined dispatch cap for bounded local checks
  - One-use real-Claude GATE-06 evidence through the production server and extension path
affects: [phase-05-verification, core-gate-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Count startup bootstrap and ordinary Claude prompts at synchronous pre-dispatch hooks.
    - Report only allowlisted evidence enums, booleans, and counts from live provider checks.

key-files:
  created:
    - apps/server/scripts/claude-hostile-live-check.ts
    - apps/server/test/claude-hostile-live-check.test.ts
    - .planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-10-LIVE-CHECK.md
  modified:
    - apps/server/src/brain/claude/session.ts
    - apps/server/src/server.ts
    - apps/extension/test/e2e/harness.ts
    - .planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-VERIFICATION.md
    - .planning/workstreams/core/REQUIREMENTS.md

key-decisions:
  - "Count the two SDK bootstrap messages and each later message against one eight-message cap before queueing."
  - "Use a test-only repair stub so the single live intent check does not dispatch an unrelated background repair prompt."
  - "Treat the voice-role fixture socket only as a protocol trigger; it provides no voice UI or speech evidence."

patterns-established:
  - "A live prompt boundary checks accepted fixture metadata in memory and discards the prompt before any report or log write."
  - "A gated result passes only with a production refusal audit and zero extension/page effects."

requirements-completed: [GATE-06]

# Metrics
duration: 33 min
completed: 2026-10-17
---

# Phase 5 Plan 10: Bounded Real-Claude Hostile Fixture Summary

**Synchronous Claude dispatch gating and one-use real-model hostile-fixture evidence close GATE-06 without sending hostile page prose to the model.**

## Performance

- **Duration:** About 33 minutes
- **Started:** 2026-10-17T19:36:16Z
- **Completed:** 2026-10-17T20:09:16Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added a synchronous hook before ordinary SDK prompts and counted bootstrap plus prompt dispatches under one fail-closed cap.
- Added an offline-first Edge fixture runner with a one-use approval claim, a 900-second deadline, an eight-dispatch/message limit, prompt-boundary checks, and sanitized evidence output.
- Ran the authorized live attempt once. Real Claude returned a gated intent from the accepted injection fixture projection; the production Executor staged read-back, then refused a premature confirmation before `speak.done`.
- Recorded zero act dispatches, submit events, navigation, or page-state changes. Three total SDK dispatches were admitted in 9.3 seconds.
- Marked GATE-06 complete. Kept Phase 5 open because the voice client/speech, real public-form I3, exact demo repair-cache prewarm, voice-window launch, and Freeze criteria remain unavailable.

## Verification

- `npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/server-brain.test.ts` — 18 tests passed.
- `npx vitest run --project @blip/server apps/server/test/claude-hostile-live-check.test.ts apps/server/test/claude-provider.test.ts apps/server/test/server-brain.test.ts` — 26 tests passed.
- `npm run typecheck` — passed.
- Offline explicit-Edge preflight — passed; real SDK dispatches: 0.
- One live explicit-Edge invocation — passed; claim consumed, 3/8 SDK dispatches, 9.3 seconds.
- `npm test` — 80 files passed, 13 skipped; 865 tests passed, 22 skipped.

## Task Commits

1. **Task 1: Add synchronous prompt dispatch cap and guard** — `9a1609f` (`feat(05-10): add pre-dispatch guard and cap`).
2. **Task 2: Add one-use hostile-fixture runner and offline checks** — `090098d` (`test(05-10): add one-use live hostile fixture runner`).
3. **Task 3: Run the bounded check and record GATE-06 evidence** — `521e5ac` (`docs(05-10): record GATE-06 hostile fixture evidence`).

## Files Created or Modified

- `apps/server/src/brain/claude/session.ts` — synchronous ordinary-prompt hook before SDK queueing.
- `apps/server/src/server.ts` — opt-in narrow Claude dispatch hooks for bounded local checks.
- `apps/server/test/claude-provider.test.ts` and `apps/server/test/server-brain.test.ts` — order, cap, fail-closed, and wiring tests.
- `apps/extension/test/e2e/harness.ts` — explicit browser/server options, accepted identity observation, and isolated repair stub.
- `apps/server/scripts/claude-hostile-live-check.ts` — one-use, offline-first live runner.
- `apps/server/test/claude-hostile-live-check.test.ts` — approval, cap, boundary, offline, and report-sanitization tests.
- `05-10-LIVE-CHECK.md` and `05-10-LIVE-CHECK.used` — sanitized preflight/live evidence and consumed claim.
- `05-VERIFICATION.md` and core `REQUIREMENTS.md` — GATE-06 evidence/status update.

## Decisions Made

- The prompt boundary uses the real production projection from the accepted local injection snapshot. Hidden and visible injection instructions, fake-banner prose, field values, and the warning property are rejected before dispatch.
- The premature confirmation was sent only through the harness voice socket with automatic speech completion disabled. This verifies the deterministic server gate and makes no claim about the voice application or DLG-14 speech.
- No public form was selected, no persistent repair cache was inspected or changed, and no `demo-safe` tag was created or moved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Keep the bounded run focused on the intent path**

- **Found during:** Task 2 (one-use live runner)
- **Issue:** Accepting the fixture snapshot can schedule a background page-repair call, which would spend the bounded provider allowance on a second operation unrelated to the GATE-06 intent.
- **Fix:** The test harness supplies a no-op repair provider for this intent-only check. Production provider settings and repair behavior are unchanged.
- **Files modified:** `apps/extension/test/e2e/harness.ts`
- **Verification:** Live evidence records the expected two startup bootstraps plus one intent dispatch.
- **Committed in:** `090098d`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Preserved the intended one-use provider budget and production intent/Executor path without changing production policy.

## Issues Encountered

- No project URL was available. The authorized test used only the repository's loopback synthetic fixture.
- The real check passed; its one-use claim is consumed and cannot be retried.
- The shared Claude session and provider test files already contained authorized Phase 4 startup-diagnostic work; those changes were preserved in the Task 1 commit alongside the new synchronous hook.

## User Setup Required

None.

## Next Phase Readiness

- GATE-06 is complete for the seeded synthetic injection fixture.
- Phase 5 remains open. Closing it still requires the voice-owned DLG-14 consumer and voice-window target, a team-owned real form and fixed synthetic test expectations, an exact validated demo-form repair-cache identity, and all Freeze criteria.
- Per the plan's scope guard, roadmap/state were not changed and no tag was created or moved.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*
