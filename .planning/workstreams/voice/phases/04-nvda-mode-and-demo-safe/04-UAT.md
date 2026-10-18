---
status: partial
phase: 04-nvda-mode-and-demo-safe
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
started: 2026-10-18T03:42:15Z
updated: 2026-10-18T07:13:46Z
---

## Current Test

number: 3
name: Live Microsoft Form validation and three consecutive runs
expected: |
  On the live form, leave one required field empty and confirm Blip reports page-observed validation without claiming success. Then complete three fresh runs with fictional values, readback, and the distinct phrase. Report observed confirmation text only; do not infer submission from the phrase acknowledgement.
awaiting: user-led live form result

## Tests

### 1. Demo startup, microphone, and audible rate controls
expected: The expected voice window opens; the hold-to-talk microphone works; faster/slower change Blip's spoken rate for the session.
result: PASS by user report, 2026-10-18. The user said microphone input and speed changes work. The exact number of holds and measured rate timings were not retained.

### 2. NVDA completion/cancellation or D-16 fallback
expected: On the demo workstation, verify one matching speakId completion/cancellation per NVDA item without overlapping Blip speech. If that cannot be established safely, record team acceptance of the runbook's D-16 fallback: agent voice for the main demo and NVDA only for the opening hook. This does not establish VOX-08 NVDA support.
result: D-16 FALLBACK ACCEPTED under the user's standing direction to choose the recommended path: use Blip agent voice for the main demo and NVDA only for the opening hook. This records the demo fallback decision; it does not prove NVDA completion/cancellation or complete VOX-08.

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
passed: 2
issues: 0
pending: 3
skipped: 0
blocked: 0

## Observations

- The user's current-build report confirms microphone input and faster/slower operation at a functional level. No diagnostic trace, per-route hold counts, or three-rate timing measurements were captured, so those details are not claimed.
- The Microsoft Forms required-field repair was tested on the restarted updated demo build. The five expected required labels matched and optional questions were excluded. The public form was not submitted.
- The earlier Phase 2 local exact-phrase test remains separate evidence: the user reported that negative phrases stayed blocked and exact `submit survey` submitted once. It is not evidence for a live Microsoft Forms submission.
- The current extension fix only adds bounded question-level required-marker extraction. It does not change the submit gate.
- D-16 is the selected demo path because the current adapter deliberately fails closed without a safe NVDA completion signal. Use Blip agent voice for the main demo and reserve NVDA for an opening hook; do not claim VOX-08 works.

## Gaps

- The original Phase 4 acceptance is still open: NVDA exact completion or D-16 disposition, live-form negative validation plus three consecutive submissions, fallback/hotspot/recorder rehearsal, and video/freeze review.
- No `demo-safe` tag or Phase 4 completion claim is supported yet.
