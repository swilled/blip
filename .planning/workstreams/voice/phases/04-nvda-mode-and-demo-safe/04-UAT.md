---
status: partial
phase: 04-nvda-mode-and-demo-safe
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
started: 2026-10-18T03:42:15Z
updated: 2026-10-18T03:42:15Z
---

## Current Test

number: 1
name: Demo startup and audible rate controls
expected: |
  Start with `npm.cmd run demo`. Confirm the voice window opens and both the on-screen hold button and Right Ctrl + Space can start speech recognition. Use faster/slower by voice and buttons; compare the next utterance at 0.5× and 2.0× without restarting current speech.
awaiting: user response

## Tests

### 1. Demo startup and audible rate controls
expected: The expected voice window opens; controls are operable; faster/slower change the audible agent-voice rate for the session.
result: pending

### 2. NVDA completion/cancellation or D-16 fallback
expected: On the demo workstation, verify one matching `speakId` completion/cancellation per NVDA item without overlapping Blip speech. If that cannot be established safely, record team acceptance of the runbook's D-16 fallback: agent voice for the main demo and NVDA only for the opening hook. The fallback does not establish VOX-08 NVDA support.
result: pending

### 3. Live Microsoft Form validation and three consecutive runs
expected: Follow `04-DEMO-RUNBOOK.md` using fictional values only. Observe a missing-required-field validation without a success claim, then complete three fresh/reset runs with the distinct spoken phrase. Blip must report only page-observed results; any failure or interruption resets the consecutive count.
result: pending

### 4. Fallback rehearsal
expected: Rehearse one clear STT miss and the typed command path, exactly one hotspot attempt, offline disclosure before using the local practice page, and a short recorder test that is reopened and reviewed.
result: pending

### 5. Three-minute video and freeze review
expected: Record and review an uninterrupted local three-minute walkthrough with fictional data only, outside the repository; conduct the freeze review and record reviewer acceptance before creating any `demo-safe` tag.
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Observations

- Test 1 is still pending. The first visible page was the legacy `Talk to Blip` interface from `apps/voice/public`; the updated launcher now builds and serves the Phase 4 client from `apps/voice/dist`. After restarting, the user confirmed both Phase 4 control groups were visible. Clicking Faster and then Slower produced audible confirmations, with Slower clearly slower. The “Press Space to start Blip” screen disappeared after activation. The initial voice-command attempt was inconclusive because the legacy page was active; retest the voice shortcut and record whether the launcher opens a visible window automatically.
- The live demo server currently listening on port 7777 was launched at 12:13 a.m., before the PTT launcher fix committed at 12:20 a.m. The reported post-restart shortcut failure therefore did not exercise that fix. The demo now waits for the PTT sidecar, reports whether the global hook started, and includes an on-screen hold-to-talk control that starts speech recognition from a direct user gesture. If the browser does not expose SpeechRecognition, Blip now reports that visibly instead of throwing from the hold action.
- Speech-rate controls now change in 0.2 steps from 0.5× through 2.0× and show the current value. The earlier spoken confirmation check only confirmed the control labels; the new range still needs a live comparison using the same phrase at both ends.
- The reported short hold and voice-output failure exposed two further code paths: a single key-up ended the chord, recognition could close before the hold ended, and the speech watchdog used a rate-independent duration. The chord now remains active until both keys are released, speech recognition remains continuous for the press, and the watchdog scales its allowance by the utterance rate. These fixes still need live confirmation.

## Gaps

- On the updated page, the user could not speak through the shortcut and reported no perceptible slowdown at the minimum rate. The live process predates the PTT wiring fix, so voice input remains a live UAT issue until the updated demo is restarted and tested. The wider rate range also remains a live UAT issue until a spoken phrase is compared at both ends.

- Restart the updated demo, verify the hold button and voice shortcut reach speech recognition, compare the same phrase at 0.5× and 2.0×, and record whether the launcher itself opens a visible voice window.

