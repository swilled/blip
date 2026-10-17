---
phase: 01-spikes-and-push-to-talk-loop
plan: 11
subsystem: voice
tags: [i1-integration, handoffs, real-server, cutover]
requires: ["01-10"]
provides:
  - I1-HANDOFFS.md (HO-1..HO-7 with owner, file, status, verification, and cutover commands)
  - recorded I1 run of the unchanged voice window against core's real server
affects: []
key-files:
  created:
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/I1-HANDOFFS.md
key-decisions:
  - "Same voice window build works on the mock and real server with no code change (ws://127.0.0.1:7777/ws)."
  - "PowerShell blocks npm/npx .ps1 files, so the user ran the real server with `node --import tsx dev/mock-server/src/run-real.ts`."
requirements-completed: [DLG-01, VOX-01, VIS-01]
completed: 2026-10-16
---

# Phase 1 Plan 11: I1 hand-offs and real-server run Summary

Wrote the hand-off list for core and ran the unchanged voice window against core's real server in-process. The user confirmed it works.

## Tasks
1. I1-HANDOFFS.md (HO-1..HO-7, cutover section): 11c976f
2. I1 run against the real server (checkpoint:human-verify): resolved by the user, no code commit.

## I1 run: what is confirmed and by whom

Human-confirmed (user run of `node --import tsx dev/mock-server/src/run-real.ts`, core's real server in-process with the fake extension):
- Hold-to-talk works.
- Typed input works.
- The reply "Customer survey. 5 fields, 2 required, 2 actions." was received.
- The window stays on top.
- The user's words: "everything there works". They did not give step-by-step detail beyond this list.

Automated-only (earlier run):
- hello then welcome handshake.
- Frame order welcome, state, transcript, state, speak, state.
- Reply text identical to the dialogue reducer's output (parity test run-real.test.ts).

Not tested:
- NVDA has never been tested. Output route is agent-voice only.
- The Space-leak check (HO-1) was not described by the user; no leak was reported.
- http://localhost:7777 Origin behavior was not separately reported.

## Hand-offs still pending for Pranav
- HO-1 Space suppression in the form-tab content script (apps/extension does not exist yet; may be unnecessary, no leak reported).
- HO-3 core's launcher must call startPttHook + startPttSidecar (required under PTT_DELIVERY B); stub is `npm run real -w @blip/mock-server`.
- HO-6 GATE-08 server confirm guard (core Phase 3). Until then `GATE_08_PRESENT = false` forces barge-in to ptt-only.
- HO-7 scripts/dev.ts needs apps/voice/dist as a static root; stub is the voice runner.
- HO-2 edit is done (940d424) but Pranav's approval is pending. HO-4 and HO-5 need nothing from core.

## Deviations from Plan
- The cutover was run as `node --import tsx dev/mock-server/src/run-real.ts` rather than `npm run real`, because PowerShell blocks the npm .ps1 shim. Same runner.

## Known Stubs
None in voice code. The stubs in use are the dev runners listed under HO-3 and HO-7.

## Threat Flags
None. Only a doc was written; no core-owned files were edited.

## Verification
- I1-HANDOFFS.md automated check passed at 11c976f.
- I1 run: human-confirmed on the real server (in-process), NVDA untested.

## Self-Check: PASSED
