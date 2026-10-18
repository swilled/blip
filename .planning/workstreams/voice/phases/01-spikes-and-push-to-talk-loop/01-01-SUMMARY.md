---
phase: 01-spikes-and-push-to-talk-loop
plan: 01
subsystem: voice
tags: [m0-signoff, protocol-review, dialogue-types, ptt-delivery]
requires: []
provides:
  - M0-SIGNOFF.md (messages voice uses, requests R1-R3, hand-offs HO-1..HO-7, PTT_DELIVERY = B)
  - type-only Effect, DialogueState, DialogueContext (packages/dialogue/src/effects.ts)
  - type-only DialogueEvent (packages/dialogue/src/events.ts)
  - stale VOX-05 wording and research Open Questions fixed
affects: [01-09, 01-11]
key-files:
  created:
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/M0-SIGNOFF.md
    - packages/dialogue/src/effects.ts
    - packages/dialogue/src/events.ts
  modified:
    - .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-RESEARCH.md
    - .planning/REQUIREMENTS.md
    - .planning/workstreams/voice/ROADMAP.md
key-decisions:
  - "PTT_DELIVERY = B (voice-owned loopback sidecar on 127.0.0.1:7778, no protocol change), applied by the stub rule because Pranav did not answer. R1 ptt.hold stays on file as an optional later upgrade to A."
  - "Barge-in safety rests on core's GATE-08, not on voice; voice only owes speak.done for every speak (HO-6)."
requirements-completed: [DLG-01, VOX-05]
completed: 2026-10-16
---

# Phase 1 Plan 01: M0 sign-off Summary

Voice reviewed the frozen v1 protocol, recorded exactly what it uses, raised additive requests, and defined the dialogue Effect and DialogueEvent unions as types. **This plan completed on the stub rule, not on Pranav's approval.**

## Tasks
1. M0-SIGNOFF.md plus doc fixes (research Open Questions, VOX-05 in master REQUIREMENTS.md, voice ROADMAP criterion 4): 71721b2
2. Effect and DialogueEvent type-only unions: 19d4054
3. Sign-off exchange with Pranav (checkpoint:human-verify): resolved by the plan's own stub rule, no commit.

## Sign-off outcome (Task 3)

Pranav gave no answer. M0-SIGNOFF.md records "No answer from Pranav, proceeding on the stub" and sets PTT_DELIVERY = B, per the docs/WORK-SPLIT.md 30-minute rule. Facts at close-out:
- Branch voice/vox-05-barge-in has been pushed to GitHub so Pranav can review it.
- origin/main has had no new commits.
- `ptt.hold` is not in the protocol registry, so option A was not available.

Rows still awaiting Pranav (all PENDING in the M0-SIGNOFF.md table):
- R1 `ptt.hold` (protocol PR plus protocol.lock.json)
- R2 `heardDuringSpeech`
- R3 / GATE-08
- HO-1 through HO-7
- VOX-05 wording in the shared .planning/REQUIREMENTS.md (edited by voice, not yet approved)
- PTT_DELIVERY: B applied, Pranav still needs to be told.

Nothing here is approved by Pranav. If he later declines B or requests changes, this plan's decisions may need revisiting.

## Deviations from Plan
None. Task 3 followed the plan's documented no-answer path.

## Known Stubs
None. The type files are intentionally type-only.

## Threat Flags
None. No edits to packages/protocol or core-owned code. T-01-01 is mitigated only on paper until core ships GATE-08 (see HO-6).

## Verification
- Task 1 and Task 2 automated checks passed at their commits.
- Human sign-off: none (stub rule).

## Self-Check: PASSED
