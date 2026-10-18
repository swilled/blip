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
  Start with `npm.cmd run demo`. Confirm the voice window opens and keyboard/assistive-technology controls work. Use faster/slower by voice and buttons; the next speech should audibly use the bounded rate, without restarting current speech.
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

## Gaps

- Test the Faster/Slower voice shortcut on the Phase 4 page and record whether the launcher itself opens a visible voice window.

