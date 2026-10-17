---
phase: 04-claude-brain-and-label-repair
plan: 04-18
status: complete
date: 2026-10-17
---

# Phase 04-18 Summary

Aligned the synthetic repair probe with the production `RepairCoordinator` contract. It now sends the value-free projected page and exact synthetic eligible id, while keeping repair restricted to descriptive label/group/confidence fields. The live report records only allowlisted repair status and failure categories. Tests verify the page-value sentinel never enters the repair prompt or report.

## Live evidence

The production SDK check completed at 2026-10-17T19:21Z in 20,514 ms, using 7 of 8 dispatches. Both roles initialized with empty tool lists and completed prewarm. Both Intent routes passed strict schema and current-synthetic-id checks; the first took 1,292 ms. Cancellation, zero-tool intent-role recreation, and a valid recovery Intent succeeded. The real-model synthetic repair patch passed `validateRepairPatch`; RepairCache saved, reloaded, and revalidated the exact patch. The one-use report and `.used` claim are consumed.

## Verification

- Focused live-check tests: 21 passed.
- Preflight and postflight full suite: 79 files passed, 13 skipped; 856 tests passed, 22 skipped.
- Preflight and postflight `npm run typecheck` passed.
- Preflight and postflight offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches.
- Historical reports 04-08 through 04-17 retain their recorded hashes. Claims for 04-11 through 04-17 remain consumed. Earlier reports 04-08 and 04-10 use legacy in-report approval markers and have no sibling `.used` file; their report hashes are unchanged.
- 04-18 report SHA-256: `208E8662EDC5B0A75FD75345AA556712BBA2ED6D5322E93DCC50898CB060508D`; its `.used` claim contains `consumed`.
- No model output, error text, credential/auth values, environment values, real page data, or user data were inspected or retained.

## Requirements

- BRAIN-01 is supported by the local SDK source configuration (API-key override removed; settings, connectors, memory, and tools disabled), successful zero-tool initialization for both roles, and the user's authorization to use the local subscription allowance. Credential values and local auth state were not inspected.
- BRAIN-02 and BRAIN-03 remain Complete based on live Intent/recovery/cancellation behavior and offline watchdog/queue tests.
- PAGE-04 is Complete: the live patch passed strict validation and the real-model cache round trip succeeded; existing integration tests cover asynchronous merge and later cache reuse.

## Deviations

None. The single 04-18 live invocation stayed under its time and dispatch caps.
