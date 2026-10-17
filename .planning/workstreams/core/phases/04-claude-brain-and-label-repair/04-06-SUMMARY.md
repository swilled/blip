---
phase: 04-claude-brain-and-label-repair
plan: 04-06
subsystem: brain
tags: [privacy, intent-routing, watchdog, vitest]

# Dependency graph
requires:
  - phase: 04-02
    provides: Isolated Claude provider roles with abort and recreation APIs
  - phase: 04-03
    provides: Immutable value-free prompt projection
  - phase: 04-04
    provides: Pre-provider secret checks and value-free handoff decisions
provides:
  - Grammar-first Claude intent routing with strict schema and current-page ID checks
  - Bounded intent retry, exact failure speech, and timed-out role recovery
  - Offline production-provider integration coverage through an injected SDK adapter
affects: [BRAIN-02, BRAIN-03, intent-routing]

# Tech tracking
tech-stack:
  added: []
  patterns: [fresh accepted snapshot projection, asynchronous provider role recovery, value-free sensitive transcript]

key-files:
  created:
    - apps/server/src/brain/claude/intent-router.ts
    - apps/server/test/intent-router.test.ts
    - apps/server/test/turn-brain.test.ts
  modified:
    - apps/server/src/brain/claude/privacy.ts
    - apps/server/src/server.ts
    - apps/server/src/turn.ts
    - apps/server/test/server-brain.test.ts

key-decisions:
  - "Keep recognized grammar commands and parsed field phrases local in Claude mode; only unmatched free-form text may reach the provider."
  - "Fetch a fresh accepted snapshot for unmatched Claude turns so projection and ID checks use the snapshot paired with the current FormModel."
  - "Use a 4-second provider watchdog; abort and recreate the intent role, speak the exact fallback immediately, and make subsequent provider turns await recovery."
  - "Redact secret-shaped utterances from transcripts as well as provider input, and reject sensitive-shaped model answer or fill values."

patterns-established:
  - "Claude receives only privacy-approved utterances plus the allowlisted, value-free page projection."
  - "Schema-invalid and semantically invalid output may retry once; provider errors and page-identity changes do not retry."
  - "Timed-out provider generations cannot return an Intent to the deterministic turn router."

requirements-completed: [BRAIN-02, BRAIN-03]

# Metrics
duration: 7min
completed: 2026-10-17
---

# Phase 4 Plan 04-06: Privacy-Gated Intent Routing Summary

**Unmatched requests now use a privacy-gated, value-free page projection and return only current-page Intents through the existing deterministic action path.**

## Performance

- **Duration:** 7 min (approximate)
- **Started:** 2026-10-17T08:28:00Z (approximate)
- **Completed:** 2026-10-17T08:35:03Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a grammar-first router that locally checks the existing Intent schema, rejects unknown keys and stale or ineligible field/action IDs, and permits one retry for invalid output only.
- Routed only privacy-approved unmatched text with a prompt projection from a freshly accepted snapshot; parsed field phrases stay local.
- Added a 4-second watchdog that releases the serialized turn, invalidates and recreates the intent role, speaks exactly `I couldn't understand that`, and ignores late results.
- Added offline server integration tests proving recovery and the next queued call through `createClaudeProvider` with an injected fake SDK adapter. Secret-shaped utterances are withheld from provider input and redacted in transcript output.

## Task Commits

1. **Task 1: Add grammar-first structured intent validation against current IDs** - `dc4c2d4` (test), `d01c915` (feat), `fc825a2` (additional privacy-output coverage)
2. **Task 2: Release the serialized turn on watchdog expiry and speak the exact fallback** - `c7363e9` (test), `e6bf598` (feat)

## Files Created/Modified

- `apps/server/src/brain/claude/intent-router.ts` - local routing guard, privacy gate, immutable projection prompt, strict Intent validation, semantic ID checks, and one bounded retry.
- `apps/server/test/intent-router.test.ts` - local bypass, schema and ID membership, sensitive-value, retry, privacy, and stale-page coverage.
- `apps/server/src/turn.ts` - current snapshot capture, local private handoff, watchdog and role recovery, exact failure speech, and transcript redaction.
- `apps/server/src/server.ts` - passes the initialized provider into turn handling and exposes an injectable watchdog scheduler for offline tests.
- `apps/server/src/brain/claude/privacy.ts` - shared value-free detection for sensitive transcripts.
- `apps/server/test/turn-brain.test.ts` - injected-adapter queue recovery, local routing, privacy, exact fallback, and late-result coverage.
- `apps/server/test/server-brain.test.ts` - updated the no-page behavior assertion after enabling the privacy-gated router.

## Decisions Made

- The session does not retain its source Snapshot, so unmatched Claude turns request and apply a fresh snapshot before projecting the page. This keeps the router tied to the exact accepted snapshot without changing shared session state.
- A sensitive utterance is withheld before provider invocation and its transcript is replaced with `private content withheld`; a unique private field may be focused for user typing, while ambiguous targets get a fixed clarification.
- The live SDK path was not started. All provider integration tests inject a scripted adapter, and no credentials were inspected. The D-01 SDK fallback remains provisional pending the separate live spike decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking integration] Passed the real provider through the server turn context**
- **Found during:** Task 2 (watchdog integration)
- **Issue:** The plan's `files_modified` list omitted `server.ts`, which still replaced the provider with a rejecting compatibility brain. The required production-provider recovery test could not pass through the actual server call path.
- **Fix:** Removed that compatibility wrapper and passed the initialized `ClaudeProvider` only in Claude mode; kept the fake brain path unchanged.
- **Files modified:** `apps/server/src/server.ts`, `apps/server/src/turn.ts`
- **Verification:** Full server suite passed using test adapters; no production SDK startup.
- **Committed in:** `e6bf598`

**2. [Rule 2 - Privacy] Redacted raw secret-shaped transcript text and guarded local field writes**
- **Found during:** Task 2 (privacy integration)
- **Issue:** The turn handler emitted raw unmatched utterances to the voice transcript before the provider privacy decision, and parsed field phrases could write a recognizable secret into an ordinary field.
- **Fix:** Redacted secret-shaped transcript content, applied the privacy decision before Claude-mode local field writes, and rejected sensitive-shaped values in model output. Updated the obsolete no-page server test expectation.
- **Files modified:** `apps/server/src/brain/claude/privacy.ts`, `apps/server/src/turn.ts`, `apps/server/test/turn-brain.test.ts`, `apps/server/test/server-brain.test.ts`, `apps/server/test/intent-router.test.ts`
- **Verification:** Sentinel tests assert no provider call, transcript echo, or speech echo; full server suite passed.
- **Committed in:** `fc825a2`, `c7363e9`, `e6bf598`

---

**Total deviations:** 2 auto-fixed (1 blocking integration, 1 privacy)
**Impact on plan:** Both were needed to connect the planned router to the active server path and preserve the existing sensitive-value boundary. No protocol or action-authority changes were made.

## Issues Encountered

- The initial router test fixture expected a focus handoff without including a unique password field; the fixture was corrected to model a current password target.
- A broad initial test invocation exposed the obsolete no-page server assertion. The final server test run passed after the assertion was updated.

## User Setup Required

None for offline testing. No live provider request or credential inspection was performed.

## Next Phase Readiness

- Plan 04-06 is complete and ready for verification.
- Plan 04-05 remains gated on voice-owner sign-off for its shared protocol changes; Plan 04-07 remains dependent on that work.
- D-01 remains provisional because no live SDK composition test was run.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Router, turn integration, both new test files, and the summary exist.
- Task commits `dc4c2d4`, `d01c915`, `fc825a2`, `c7363e9`, and `e6bf598` exist in git history.
- Stub scan found no TODO, FIXME, placeholder, or coming-soon implementation in files changed by this plan.
- Shared Core `STATE.md` and `ROADMAP.md` were not changed per the orchestrator's instruction.
