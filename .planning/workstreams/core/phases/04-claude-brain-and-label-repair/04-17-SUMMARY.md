---
phase: 04-claude-brain-and-label-repair
plan: 04-17
status: complete
date: 2026-10-17
---

# Phase 04-17 Summary

Added the finite Intent variant and required-key contract to the JSON-only prompt without sample IDs or values. Strict parsing, page identity, and privacy checks remained unchanged. The runner's original single-retry and dispatch caps remained in force.

## Live evidence

The 04-17 production check initialized intent and repair with empty tool lists and completed both warmups. The first grammar-miss returned a schema-valid Intent for a current synthetic ID in 1,621 ms. The cancellation probe was aborted; the intent role was recreated and again accepted zero tools; a recovery Intent passed schema/current-ID validation. The run then reached repair, where the returned patch failed local synthetic patch validation and was not cached. Seven of eight total dispatches were used. The one-use report is consumed; no model output or error text was retained.

## Verification

- Focused router/live-check tests: 2 files, 32 tests passed.
- Full suite before and after the live call: 79 files passed, 13 skipped; 855 tests passed, 22 skipped.
- `npm run typecheck` passed before and after the live call.
- Offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches before and after the live call.
- Historical 04-08 through 04-16 report hashes were unchanged. The 04-17 report hash is `1850185E591C95497D465E99C494B3FADAB39ED118C71766269F6CDB9A479974`; `.used` contains `consumed`.
- BRAIN-02 and BRAIN-03 are Complete from combined live and offline integration evidence. BRAIN-01 remains Pending because the credential source was not inspected. PAGE-04 remains Pending.

## Deviations from Plan

None.
