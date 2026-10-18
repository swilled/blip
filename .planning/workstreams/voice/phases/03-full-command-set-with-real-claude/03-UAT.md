---
status: partial
phase: 03-full-command-set-with-real-claude
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md
started: 2026-10-17
updated: 2026-10-17
---

## Current Test

[retest the live Microsoft Form's required fields after reloading the rebuilt extension]

## Tests

### 1. Read the live Microsoft Form and check required fields
expected: Blip reads the current form and reports the required fields that remain.
result: partial — live retest in progress
reported: After the rebuilt extension was reloaded and the live form refreshed, Blip reported “6 required fields are empty” and began listing “2. Employment type Single choice,” “3. Department Single choice,” and “Other answer,” then offered to continue. On “continue,” it listed “5. Leave type Single choice,” “6. Leave date Date,” and “7. Return date Date.” This names all five required questions visible on the form, but it also counts the conditional “Other answer” box as a sixth required field and includes question-type metadata in labels, so the check remains partial pending the follow-up fix and retest.

### 2. Fill from my profile
expected: Blip fills eligible empty profile matches or reports which fields it skipped.
result: pending
reason: Re-test after the required-field check passes on the rebuilt extension. The current integrated server is running with `--brain=claude`; the previous fake-brain block no longer describes the active run.

### 3. Remaining Phase 3 checks
expected: The remaining tested Phase 3 behaviors match the plan's human I3 criteria.
result: pass
reported: User said, “ok everything else works fine”; individual results were not recorded separately.

## Summary

total: 3
passed: 1
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

The first live required-field check exposed an extension snapshot gap. Microsoft Forms places an accessible “Required to answer” marker in the question title while setting the field's `aria-required` to `false`; the previous extractor missed that marker. The first fix detects the real required questions, but the live form also exposes a conditional “Other answer” textbox inside a required radio question. The question-level marker was incorrectly inherited by that auxiliary textbox, and Microsoft Forms appends “Single choice” and “Date” metadata to accessible labels. A follow-up fix scopes the marker to the radio question and cleans those suffixes; reload that extension and repeat test 1 before passing it.

The separate Phase 2 connected-gate I2 run remains outside this UAT result and must be tracked independently.
