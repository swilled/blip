---
phase: 04-nvda-mode-and-demo-safe
plan: 01
subsystem: voice-output
tags: [nvda, speech-routing, accessibility, speakId]
requires:
  - phase: 03-full-command-set-with-real-claude
    provides: Tracked voice speech and the I3 public-form flow
provides:
  - Session-only exclusive output-mode control through the existing SettingsPayload
  - Safe return to agent voice when NVDA cannot report per-item completion
affects: [04-02-PLAN.md, 04-03-PLAN.md, VOX-08]
actuals:
  tokens: 700
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Cancel browser speech and report interrupted speakIds before sending a session output-mode setting
    - Keep NVDA routing unavailable when the controller exposes no completion signal
key-files:
  created:
    - apps/server/src/voice/nvda.test.ts
    - apps/voice/src/output-mode.ts
    - apps/voice/src/output-mode.test.ts
  modified:
    - apps/server/src/voice/nvda.ts
    - apps/voice/src/socket.ts
    - apps/voice/src/socket.test.ts
    - apps/voice/src/main.ts
    - apps/voice/index.html
    - apps/voice/src/styles.css
    - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-HANDOFFS.md
key-decisions:
  - "The installed NVDA Controller Client reports dispatch acceptance but has no safe speech-completion signal, so the hub remains on agent voice and never fabricates speak.done."
  - "The screen-reader option is disabled for the current window after the server reports that safe completion is unavailable; a new window starts in agent voice."
requirements-completed: []
coverage:
  - id: D1
    description: A keyboard-operable, session-only output control exposes Blip voice and screen-reader mode, with no both-speech choice.
    requirement: VOX-08
    verification:
      - kind: unit
        ref: apps/voice/src/output-mode.test.ts#session output mode
        status: pass
      - kind: integration
        ref: apps/voice/src/socket.test.ts#sends only the supported exclusive speech output settings
        status: pass
    human_judgment: true
    rationale: The native radio control has not been exercised with keyboard-only and assistive-technology use in a live browser.
  - id: D2
    description: An NVDA DLL dispatch result cannot clear a tracked speakId; unavailable safe completion preserves the agent-voice route.
    requirement: VOX-08
    verification:
      - kind: unit
        ref: apps/server/src/voice/nvda.test.ts#does not dispatch native speech or complete a speakId when no completion signal exists
        status: pass
      - kind: other
        ref: npm.cmd run typecheck
        status: pass
    human_judgment: true
    rationale: Audible NVDA completion, cancellation, and exactly-once speakId correlation require the real workstation check.
duration: 3min
completed: 2026-10-18
status: complete
---

# Phase 4 Plan 1: Exclusive NVDA Output Routing Summary

**A session-scoped, exclusive output control now requests screen-reader mode through the frozen settings contract and safely returns to tracked agent voice when NVDA completion cannot be verified.**

## Performance

- **Duration:** about 3 minutes
- **Started:** 2026-10-18T03:02:00Z
- **Completed:** 2026-10-18T03:05:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added a native labeled radio control for Blip voice and NVDA, defaulting to Blip voice each new window session.
- Mode switches cancel current browser speech before sending settings; a server fallback resets the control and disables NVDA for the rest of the session.
- Documented HO-10 as implemented for session routing and fail-safe fallback. The physical NVDA completion check remains human-needed.

## Task Commits

1. **Task 1: Trace one tracked speech item through the NVDA completion boundary** - `f5a335d`
2. **Task 2: Add an exclusive accessible output-mode toggle with safe fallback** - `718ffa6`

## Files Created/Modified

- `apps/server/src/voice/nvda.test.ts` - Proves a zero-valued DLL dispatch response cannot route speech or complete a tracked item without a completion signal.
- `apps/voice/src/output-mode.ts` and `apps/voice/src/output-mode.test.ts` - Session-only two-mode controller and ordering/fallback/reset coverage.
- `apps/voice/src/socket.ts` and `apps/voice/src/socket.test.ts` - Send the existing settings frame with only the two supported exclusive choices.
- `apps/voice/src/main.ts`, `apps/voice/index.html`, and `apps/voice/src/styles.css` - Accessible radio control and one-time server fallback state.
- `apps/server/src/voice/nvda.ts` - Clarifies that DLL return means dispatch accepted, not completion.
- `.planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-HANDOFFS.md` - Records the delivered HO-10 routing seam and the remaining device acceptance.

## Decisions Made

- The installed Controller Client exposes no safe completion or cancellation callback. The core hub therefore falls back before routing speech to NVDA; no native dispatch is treated as completed speech.
- VOX-08 remains uncompleted until a real NVDA run verifies audible completion and cancellation against exactly one matching speakId.

## Deviations from Plan

The plan's safe-completion branch is unavailable on this machine. The implementation follows its explicit fallback: retain agent voice, report NVDA unavailability, and leave real-device acceptance pending. No protocol change or package was added.

## Verification

- `npm.cmd test -- apps/server/src/voice/nvda.test.ts apps/voice/src/output-mode.test.ts apps/voice/src/socket.test.ts` - 3 files, 12 tests passed.
- `npm.cmd test -- apps/voice/src/output-mode.test.ts apps/voice/src/socket.test.ts` - 2 files, 11 tests passed.
- `npm.cmd run typecheck` - passed after each task.

## Issues Encountered

- The safe-resume query also found Core's separate `04-01` commits because both workstreams use the same plan IDs. Their changed files and Core summary confirmed they are unrelated to this Voice plan; no partial Voice Phase 4 work existed.

## Next Phase Readiness

- Plan 04-02 is ready to implement session-scoped faster/slower controls.
- Plan 04-03 remains dependent on 04-02 and still requires live-form, venue, recorder, video, and NVDA evidence from a human.

---
*Phase: 04-nvda-mode-and-demo-safe*
*Completed: 2026-10-18*
