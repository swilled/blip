---
phase: 01-spikes-and-push-to-talk-loop
plan: 04
subsystem: spikes
tags: [spikes, decisions, stt, tts, ptt, barge-in]
requires: [01-03]
provides: [01-SPIKE-DECISIONS.md with named keys for Plans 06-10]
affects: [06, 07, 08, 09, 10]
key-files:
  created:
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-SPIKE-DECISIONS.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/A-web-speech.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/B-speech-synthesis.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/C1-nvda-dll.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/C2-live-region.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/D-ptt.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/E-pin.md
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/F-echo-barge-in.md
decisions:
  - "BARGE_IN_MODE=ptt-only (echo is real on this hardware)"
  - "PTT_ROUTE=uiohook-hold; LAYOUT=pinned-popup; PIN_METHOD=koffi SetWindowPos exact title"
  - "NVDA_ROUTE=agent-voice-only until NVDA is available"
completed: 2026-10-16
---

# Phase 1 Plan 04: Spike notes and decisions Summary

Seven spike notes and a named-key decisions file, written from the human run and the automated runs, with unconfirmed items kept explicit.

## Confirmed
- B speechSynthesis works (local David voice, onend fires; interrupted utterances fire onerror, not onend).
- D global hold works with real and injected keys; no space leak observed.
- Echo is real: the open mic recognized Blip's own phrase with the user silent, so BARGE_IN_MODE=ptt-only.
- Separate Chrome app window layout is viable for speech output and recognition.

## Unconfirmed / open
- A: unfocused recognition worked only in the automated run; covered case inconclusive; human hold test was too short (aborted).
- E: human run failed before the fix in 2763ee1 (substring title match); automated decoy test passes; human re-check pending.
- C1, C2: NOT RUN (no NVDA).
- F: "stop" recognition during speech and headset case not tested.

## Deviations from Plan
- Tasks 1 and 2 (checkpoints) were completed beforehand by the user and orchestrator; this plan only did Task 3.
- STATE.md was not updated here per orchestrator instruction (do not touch STATE.md/ROADMAP.md). Its "Pending, Phase 1 spikes" line should be pointed at 01-SPIKE-DECISIONS.md by the orchestrator.
- Raw logs are gitignored; only summarized evidence is committed. No recognized user speech is included.

## Self-Check: PASSED
