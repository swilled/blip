---
phase: 01-spikes-and-push-to-talk-loop
plan: 07
subsystem: voice
tags: [websocket, protocol-client, tts-bridge, earcons, vite]
requires: ["01-05", "01-06"]
provides:
  - createSocket protocol client (hello/welcome, reconnect, typed senders)
  - createSpeakBridge (speak -> tts, tts done -> speak.done)
  - earcons and main.ts window wiring, Vite build served by the mock server
affects: [01-08, 01-09, 01-10]
key-files:
  created:
    - apps/voice/src/socket.ts
    - apps/voice/src/socket.test.ts
    - apps/voice/src/speak-bridge.ts
    - apps/voice/src/speak-bridge.test.ts
    - apps/voice/src/earcons.ts
    - apps/voice/src/main.ts
    - apps/voice/vite.config.ts
key-decisions:
  - "Bridge exposes onTtsDone as the tts onDone sink; undefined speakId (local filler) is ignored"
  - "main.ts commits one log exchange when all outstanding server speaks finish; interrupted ones mark the reply (interrupted)"
  - "On socket close the window calls tts.cancel() so pending speaks are reported and not left speaking"
requirements-completed: [VOX-03, VOX-04, VOX-06, VIS-01]
completed: 2026-10-16
---

# Phase 1 Plan 07: Protocol client, speak bridge, window wiring Summary

The window now speaks the frozen protocol (hello first, connected only after welcome), acknowledges every server speak with exactly one speak.done (completed or interrupted), and builds with Vite for the mock server to serve.

## Tasks
1. Socket and speak bridge (tests included): 715021e. 12 new tests (7 socket, 5 bridge).
2. Earcons, main wiring, vite config: see git log (feat(01-07) earcons commit).

## Verification
- `npx vitest run apps/voice dev/mock-server`: 41/41 pass.
- `npm run typecheck -w @blip/voice`: clean.
- `npm run build -w @blip/voice`: OK, apps/voice/dist/index.html produced (dist is gitignored).
- Mock server started on a spare port; GET / contains "Press Space to start Blip".
- No innerHTML in apps/voice/src; isTrusted check present in the gate handler.

## Deviations from Plan
- Tests and implementation for Task 1 were committed together (no separate RED commit), as in Plan 06.
- Bridge test 10 drives a real createTts with a fake synth, so the three-interrupted-dones behavior is checked end to end.
- Not exercised: the browser end-to-end typed round trip (needs a human or browser; Plan 10 spot check). Voice list selection prefers a local Microsoft English voice.

## Known Stubs
None. transcript, confirm.armed, confirm.cleared are intentionally ignored in Phase 1 (banner slot empty).

## Self-Check: PASSED
