---
status: partial
phase: 03-full-command-set-with-real-claude
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md
started: 2026-10-17
updated: 2026-10-17
---

## Current Test

[test fill-from-profile behavior on the live Microsoft Form]

## Tests

### 1. Read the live Microsoft Form and check required fields
expected: Blip reads the current form and reports the required fields that remain.
result: pass
reported: The first ask "what's required?" returned a page summary ("Vacation and sick leave form. 8 fields, 5 required, 9 actions."). Using the supported phrase "which fields are required?" returned "5 required fields are empty: 2.Employment type, 3.Department, 5.Leave type. Say continue for more." On "continue," Blip replied "Still empty and required: 6.Leave date, 7.Return date." Together these are the five required fields, without the conditional Other answer or type suffixes.

### 2. Fill from my profile
expected: Blip fills eligible empty profile matches or reports which fields it skipped.
result: pending
reason: Run this check on the live Microsoft Form now that the required-fields check has passed. The integrated server is using the Claude brain.

### 3. Remaining Phase 3 checks
expected: The remaining tested Phase 3 behaviors match the plan's human I3 criteria.
result: pass
reported: User said, “ok everything else works fine”; individual results were not recorded separately.

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

The exact first phrasing, "what's required?", returned the page summary. The supported clearer phrase, "which fields are required?", produced the complete five-field list over two batches. The transcript for the first phrasing was not captured, so that voice-recognition discrepancy remains noted for follow-up.

The separate Phase 2 connected-gate I2 run remains outside this UAT result and must be tracked independently.
