---
phase: 01-spikes-and-push-to-talk-loop
plan: 09
subsystem: voice
tags: [ptt, talk-controller, sidecar, barge-in]
requires: ["01-07", "01-08"]
provides:
  - talk controller (hold, recognition, interruption, barge-in sequencing)
  - ptt-sidecar (127.0.0.1:7778) and window hold-client (PTT_DELIVERY B)
  - mock runner starts the global hook and sidecar
affects: [01-10]
key-files:
  created:
    - apps/voice/src/talk-controller.ts
    - apps/voice/src/talk-controller.test.ts
    - apps/voice/src/hold-client.ts
    - apps/voice/src/hold-client.test.ts
    - apps/server/src/voice/ptt-sidecar.ts
    - apps/server/src/voice/ptt-sidecar.test.ts
  modified:
    - apps/voice/src/main.ts
    - apps/voice/src/config.ts
    - dev/mock-server/src/main.ts
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/M0-SIGNOFF.md
key-decisions:
  - "PTT_DELIVERY = B: Pranav gave no answer and ptt.hold is not in origin/main packages/protocol/src, so the WORK-SPLIT stub rule applied. Sign-off row and config.ts both set to B; HO-3 stays required under B."
  - "Barge-in stays forced to ptt-only (GATE_08_PRESENT=false)."
  - "main.ts only calls state.speechDone() when status is still speaking, so a cancel triggered by a new hold does not overwrite listening."
requirements-completed: [VOX-01, VOX-02, VOX-05, VOX-06]
completed: 2026-10-16
---

# Phase 1 Plan 09: Voice input wiring Summary

Global Right Ctrl + Space hold now reaches the window over a voice-owned loopback sidecar and drives a tested controller that listens, interrupts speech, and sends voice utterances with confidence and alternatives.

## Tasks
1. Talk controller with 11 tests (incl. live caption test 10): 625a93e
2. Sidecar, hold-client, main.ts wiring, mock runner hook, M0-SIGNOFF and config to B: 4343b25

## Deviations from Plan
- [Orchestrator decision] M0-SIGNOFF said A; switched to B per stub rule (no packages/protocol change). Branch A files (mock `ptt.hold` test) skipped.
- [Rule 1] Guarded `state.speechDone()` in main.ts on status speaking (see decisions).
- Sidecar exposes a `listening` promise and optional `port`/`allowedOrigin` for tests; the mock runner passes its actual port as the allowed origin (7777 by default).

## Known Stubs
None. heardDuringSpeech stays unsent (SEND_HEARD_DURING_SPEECH=false).

## Threat Flags
None beyond the plan's register (sidecar mitigations T-01-10 implemented and tested).

## Verification
- `npx vitest run apps/voice apps/server/src/voice dev/mock-server packages/dialogue`: 13 files, 103 tests pass
- `npm run typecheck` and `npm run build -w @blip/voice`: pass

## Self-Check: PASSED
