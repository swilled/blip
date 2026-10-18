---
phase: 04-nvda-mode-and-demo-safe
plan: 02
subsystem: voice-output
tags: [speech-synthesis, session-rate, accessibility, vitest]
requires:
  - phase: 04-nvda-mode-and-demo-safe
    provides: Session-scoped output-mode control from Plan 04-01
provides:
  - Bounded session-local Blip speech rate adjustment from 0.8 through 1.5
  - Rate capture at browser utterance start, preserving active and queued speech
  - Exact faster/slower handling for voice and typed input, plus accessible rate buttons
affects: [04-03-PLAN.md, VOX-07]
actuals:
  tokens: 3088
  tasks: 3
  commits: 7
commits: 7
plan_head_before: 0d820fb919d575ecb9c68dc79e897b11e7949312
plan_head_after: 50290735e747120b88ce06a296a107a650beab49
tech-stack:
  added: []
  patterns:
    - Keep speech-rate state in the active voice window and read it when each browser utterance starts
    - Intercept exact local voice commands before dispatch or barge-in cancellation
key-files:
  created:
    - apps/voice/src/speech-rate.ts
    - apps/voice/src/speech-rate.test.ts
    - apps/voice/src/speech-rate-command.test.ts
  modified:
    - apps/voice/src/tts.ts
    - apps/voice/src/tts.test.ts
    - apps/voice/src/main.ts
    - apps/voice/src/talk-controller.ts
    - apps/voice/index.html
    - apps/voice/src/styles.css
key-decisions:
  - "Rate changes update only the current Blip voice session; the browser captures the value when each utterance starts."
  - "Exact voice commands are intercepted before barge-in cancellation so changing rate leaves active speech running."
requirements-completed: [VOX-07]
coverage:
  - id: D1
    description: Exact faster and slower commands and native buttons adjust Blip speech rate in bounded 0.1 steps, with queued acknowledgements and no NVDA rate change.
    requirement: VOX-07
    verification:
      - kind: unit
        ref: apps/voice/src/speech-rate.test.ts#session speech rate
        status: pass
      - kind: unit
        ref: apps/voice/src/tts.test.ts#captures rate when each utterance starts without restarting active speech
        status: pass
      - kind: unit
        ref: apps/voice/src/speech-rate-command.test.ts#speech rate command parsing
        status: pass
      - kind: other
        ref: npm.cmd run typecheck
        status: pass
    human_judgment: true
    rationale: Keyboard and pointer use of the controls and spoken output on a live NVDA workstation have not been manually exercised.
duration: 10min
completed: 2026-10-18
status: complete
---

# Phase 4 Plan 2: Session Speech Rate Summary

**Blip now supports session-local faster and slower controls with bounded one-tenth steps, browser utterance rate capture, and queued acknowledgements that leave active speech and NVDA settings untouched.**

## Performance

- **Duration:** about 10 minutes
- **Started:** 2026-10-18T03:05:00Z (estimated from the first execution command)
- **Completed:** 2026-10-18T03:15:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a pure rate helper that starts each session at 1.0, rounds changes to one decimal place, clamps to 0.8–1.5, and reports repeated boundary attempts.
- The speech queue reads the rate when each browser utterance starts. A rate change does not cancel active speech, and an acknowledgement waits in the existing queue.
- Exact normalized faster/slower commands work for voice and typed input. Labeled native buttons provide keyboard and pointer controls while preserving the existing output-mode control and visible focus styling.

## Task Commits

Each TDD task has a failing-test checkpoint followed by its implementation commit:

1. **Task 1: Define bounded session speech-rate behavior** — `e359e93` (RED), `9976f25` (GREEN)
2. **Task 2: Apply session rate at the next queued speech item** — `81c2b3a` (RED), `33fe2f0` (GREEN)
3. **Task 3: Wire faster/slower commands and controls** — `e6f54d9` (RED), `29fa296` (GREEN), `5029073` (status wording correction)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `apps/voice/src/speech-rate.ts` — session-local rate initialization, bounded adjustment, and exact command parsing.
- `apps/voice/src/speech-rate.test.ts` — default, increment, rounding, boundary, and session-local tests.
- `apps/voice/src/tts.ts` — reads the rate as each queued browser utterance starts.
- `apps/voice/src/tts.test.ts` — proves active utterance rate is retained, the queued item sees the new rate, and no cancellation occurs.
- `apps/voice/src/speech-rate-command.test.ts` — exact matching, normal-path pass-through, and no barge-in cancellation for a spoken rate command.
- `apps/voice/src/main.ts` — wires the session rate into browser synthesis, local voice/typed commands, acknowledgements, and controls.
- `apps/voice/src/talk-controller.ts` — adds a local-command hook before server dispatch and before speech cancellation.
- `apps/voice/index.html` and `apps/voice/src/styles.css` — add labeled Slower/Faster buttons with visible focus treatment.

## Decisions Made

- Keep agent-voice rate in memory for the current window session and apply it only when a browser utterance starts.
- Keep the existing exclusive output-mode control unchanged. Rate commands do not invoke or modify NVDA settings.

## Deviations from Plan

### Auto-added Missing Critical Functionality

**1. [Rule 2 - Missing Critical Functionality] Intercept voice rate commands before barge-in cancellation**
- **Found during:** Task 3 (Wire faster and slower commands to the session rate)
- **Issue:** The existing talk controller canceled active speech before dispatching a barge-in transcript, which would make a spoken rate command interrupt the very speech it must preserve.
- **Fix:** Added an optional local-command hook and invoke it before ordinary dispatch and before barge-in cancellation.
- **Files modified:** `apps/voice/src/talk-controller.ts`, `apps/voice/src/speech-rate-command.test.ts`
- **Verification:** The command regression test confirms a spoken faster command neither reaches the server nor cancels active speech.
- **Committed in:** `29fa296`

**Total deviations:** 1 auto-added functionality adjustment.
**Impact on plan:** Required to satisfy the active-speech preservation behavior; no dependencies were added.

## TDD Gate Compliance

- Task 1 RED evidence: the target default-rate assertion ran and failed because the temporary helper returned `0` instead of `1.0`; the test report passed `gsd_run check tdd-red-evidence` before implementation.
- Task 2 RED evidence: the target queue-rate assertion ran and failed because no rate was passed to the synthesizer; the report passed the evidence classifier before implementation.
- Task 3 RED evidence: exact normalized command assertions ran and failed because the temporary parser returned `null`; the report passed the evidence classifier before implementation.
- GREEN verification passed for all three focused test files and the root TypeScript check.

## Issues Encountered

- Vitest TAP output included reporter diagnostics that the evidence parser rejected, so RED runs used Vitest's JUnit reporter and the unchanged XML report. Each target assertion was machine-classified as valid RED before implementation.

## User Setup Required

None.

## Next Phase Readiness

VOX-07 is implemented and automated checks pass. The controls still need keyboard/pointer review in a live browser; no live NVDA acceptance is claimed.

---
*Phase: 04-nvda-mode-and-demo-safe*
*Completed: 2026-10-18*

## Self-Check: PASSED

All nine implementation files and this summary exist, and all seven task commits are ancestors of the current HEAD.
