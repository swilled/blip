---
phase: 01-spikes-and-push-to-talk-loop
plan: 06
subsystem: voice
tags: [tts, state-machine, ui, accessibility]
requires: ["01-02", "01-04", "01-05"]
provides:
  - createVoiceState status machine
  - createTts speech queue with per-speakId completion
  - voice window markup, styles, ui-log rendering
affects: [01-07, 01-08]
key-files:
  created:
    - apps/voice/src/state.ts
    - apps/voice/src/state.test.ts
    - apps/voice/src/tts.ts
    - apps/voice/src/tts.test.ts
    - apps/voice/index.html
    - apps/voice/src/styles.css
    - apps/voice/src/ui-log.ts
key-decisions:
  - "Synth interface: speak(text,{onend,onerror}); onerror of any kind (incl. interrupted/canceled) counts as sentence completion (Spike B); a generation counter makes stale callbacks and timers no-ops, so cancel() reports each speakId exactly once"
  - "LAYOUT=pinned-popup used as is; LIVE_REGION=NOT RUN, so the UI-SPEC log live region is built as specified and is untested with NVDA"
requirements-completed: [VOX-04, VOX-05, VOX-06, VIS-01]
completed: 2026-10-16
---

# Phase 1 Plan 06: Status machine, speech queue, window markup Summary

Pure state and tts modules (16 tests, fake timers and fake synth) plus the UI-SPEC window markup, tokens and textContent-only log rendering.

## Tasks
1. State and tts: 54088b1. 6 state tests and 10 tts tests, covering all 10 plan behaviors.
2. Markup, styles, ui-log: see git log (feat(01-06) window markup commit). Automated markup checks pass; only font sizes 14/18/24/28 used; no innerHTML; no role="button".

`npx vitest run apps/voice`: 16/16 pass. `npx tsc --noEmit`: clean.

## Deviations from Plan
- Tests and implementation for Task 1 were committed together (single feat commit), not as separate RED and GREEN commits.
- ui-log setStatus also takes "listening" and the status section includes its shape and hint, ahead of Plan 08 wiring. The state machine itself still has only idle/thinking/speaking/offline.
- Spike fallbacks: LIVE_REGION NOT RUN, so no revised approach applied; the log live region follows 01-UI-SPEC.md and must be re-checked once NVDA is available.

## Notes for Plan 07
- index.html loads /src/main.ts, which does not exist yet (Plan 07 creates it).
- Start-gate activation must remove `inert` from #app, remove the gate, and focus #typed-input; listen in the window's own keydown, not global PTT.
- Caller must call tts.markReplied() on any server speak with category "filler" and on any reply, and ignore onDone with undefined speakId when sending speak.done.

## Known Stubs
None.

## Self-Check: PASSED
