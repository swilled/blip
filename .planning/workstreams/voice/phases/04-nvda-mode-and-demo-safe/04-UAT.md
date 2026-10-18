---
status: partial
phase: 04-nvda-mode-and-demo-safe
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
started: 2026-10-18T03:42:15Z
updated: 2026-10-18T07:02:40Z
---

## Current Test

number: 2
name: NVDA completion/cancellation or D-16 fallback
expected: |
  On the demo workstation, verify one matching speakId completion/cancellation per NVDA item without overlapping Blip speech. If the safe completion signal cannot be established, record team acceptance of the documented D-16 fallback: agent voice for the main demo and NVDA only for the opening hook. The fallback does not establish VOX-08 NVDA support.
awaiting: user/device result

## Tests

### 1. Demo startup, microphone, and audible rate controls
expected: The expected voice window opens; the hold-to-talk microphone works; faster/slower change Blip's spoken rate for the session.
result: PASS by user report, 2026-10-18. The user said microphone input and speed changes work. The exact number of holds and measured rate timings were not retained.

### 2. NVDA completion/cancellation or D-16 fallback
expected: On the demo workstation, verify one matching speakId completion/cancellation per NVDA item without overlapping Blip speech. If that cannot be established safely, record team acceptance of the runbook's D-16 fallback: agent voice for the main demo and NVDA only for the opening hook. This does not establish VOX-08 NVDA support.
result: PENDING.

### 3. Live Microsoft Form validation and three consecutive runs
expected: Follow `04-DEMO-RUNBOOK.md` using fictional values only. Observe a missing-required-field validation without a success claim, then complete three fresh/reset runs with the distinct spoken phrase. Blip must report only page-observed results; any failure or interruption resets the consecutive count.
result: PARTIAL. On updated build `67114f9-dirty-2026-10-18T07:00:58.786Z`, the user confirmed Blip listed exactly Employment type, Department, Leave type, Leave date, and Return date as required, excluding optional questions. No public-form submission was attempted. The negative-validation and three-run acceptance remains pending.

### 4. Fallback rehearsal
expected: Rehearse one clear STT miss and the typed command path, exactly one hotspot attempt, offline disclosure before using the local practice page, and a short recorder test that is reopened and reviewed.
result: PENDING.

### 5. Three-minute video and freeze review
expected: Record and review an uninterrupted local three-minute walkthrough with fictional data only, outside the repository; conduct the freeze review and record reviewer acceptance before creating any `demo-safe` tag.
result: PENDING.

## Summary

total: 5
passed: 1
issues: 0
pending: 4
skipped: 0
blocked: 0

## Observations

- The user's current-build report confirms microphone input and faster/slower operation at a functional level. No diagnostic trace, per-route hold counts, or three-rate timing measurements were captured, so those details are not claimed.
- The Microsoft Forms required-field repair was tested on the restarted updated demo build. The five expected required labels matched and optional questions were excluded. The public form was not submitted.
- The earlier Phase 2 local exact-phrase test remains separate evidence: the user reported that negative phrases stayed blocked and exact `submit survey` submitted once. It is not evidence for a live Microsoft Forms submission.
- The current extension fix only adds bounded question-level required-marker extraction. It does not change the submit gate.

## Gaps

- The original Phase 4 acceptance is still open: NVDA exact completion or D-16 disposition, live-form negative validation plus three consecutive submissions, fallback/hotspot/recorder rehearsal, and video/freeze review.
- No `demo-safe` tag or Phase 4 completion claim is supported yet.
