---
phase: 01-spikes-and-push-to-talk-loop
plan: 08
subsystem: voice
tags: [stt, ptt, barge-in, echo-filter, uiohook]
requires: ["01-02", "01-04", "01-06", "01-07"]
provides:
  - listening state and holdStart barge-in transition
  - config.ts with effectiveBargeInMode (forced ptt-only)
  - echo-filter (isStopPhrase, isEchoOfSpeech, heardDuringSpeech, mayArmDuringSpeech, isBargeInUtterance)
  - createStt one-start-per-press wrapper
  - startPttHook/stopPttHook wrapper
affects: [01-09, 01-10]
key-files:
  created:
    - apps/voice/src/config.ts
    - apps/voice/src/echo-filter.ts
    - apps/voice/src/echo-filter.test.ts
    - apps/voice/src/stt.ts
    - apps/voice/src/stt.test.ts
    - apps/server/src/voice/ptt-hook.ts
    - apps/server/src/voice/ptt-hook.test.ts
  modified:
    - apps/voice/src/state.ts
    - apps/voice/src/state.test.ts
key-decisions:
  - "BARGE_IN_MODE=ptt-only, GATE_08_PRESENT=false, PTT_DELIVERY=A (as in M0-SIGNOFF, still pending Pranav); effectiveBargeInMode takes optional params so the gate-present branch is testable"
  - "createStt takes canListen(); the caller composes it from STT_ENABLED_WHEN_UNFOCUSED and document.hasFocus()"
  - "An onend with no final or error reports a single didn't-catch error so the state can return to idle"
requirements-completed: [VOX-01, VOX-02, VOX-05, VOX-06]
completed: 2026-10-16
---

# Phase 1 Plan 08: Voice input building blocks Summary

Tested listening/barge-in state, echo filter, per-press STT wrapper and global PTT hook wrapper, ready for Plan 09 wiring.

## Tasks
1. Listening state, barge-in rules, echo filter, config: 8301fe9.
2. STT wrapper and PTT hook: see git log (feat(01-08) second commit).

## Verification
- `npx vitest run apps/voice apps/server/src/voice`: 8 files, 61/61 pass.
- `npm run typecheck -w @blip/voice`: clean. apps/server has no tsconfig or typecheck script, so ptt-hook.ts is covered only by vitest.
- ptt-hook.ts has no console use or file writes (checked by a test); only keycodes 29, 57, 3613 are interpreted.

## Deviations from Plan
- Tests and implementation were committed together per task (no separate RED commits), as in Plans 06 and 07.
- Plan test 8 numbering: all 8 state/echo behaviors are covered across state.test.ts and echo-filter.test.ts. heardDuringSpeech is a pure helper taking (isSpeaking, msSinceSpeechEnd).
- PTT_ROUTE is uiohook-hold, so no chrome.commands toggle note (HO-5) is needed beyond M0-SIGNOFF.

## Notes for Plan 09
- Wire holdStart(): if cancelSpeech, call tts.cancel() so speak.done interrupted:true goes out for each speak; then stt.press(). On hold end, stt.release(); onFinal -> state.transcriptDelivered() and send utterance (sttConfidence, alternatives); onError -> state.noTranscript().
- canListen = STT_ENABLED_WHEN_UNFOCUSED || document.hasFocus().
- SEND_HEARD_DURING_SPEECH is false until request R2 merges; PTT_DELIVERY stays A until Pranav answers.

## Known Stubs
None.

## Self-Check: PASSED
