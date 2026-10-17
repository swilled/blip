---
phase: 04-claude-brain-and-label-repair
plan: 04-16
status: complete
date: 2026-10-17
---

# Phase 04-16 Summary

Added fixed local output-failure categories (`invalid_json`, `intent_schema_rejected`, `intent_shape_rejected`, and `repair_schema_rejected`) to the provider boundary. Error messages no longer contain free-form reasons. The Intent prompt now explicitly excludes prose/markdown and offers a schema-valid clarify fallback; all strict validators remain unchanged.

## Live evidence

The bounded 04-16 run initialized intent and repair roles with empty tool lists and completed both fixed warmups. Both calls on the first actual Intent route failed local schema validation after 3,398 ms, reported only as `intent_schema_rejected`. It dispatched two intent prompts, two bootstraps, and four total messages. It stopped before cancellation/recovery/repair/cache. The approval is consumed and `.used` remains. No credentials/auth state or environment values were inspected; no real page/user data or model output was retained.

## Verification

- Focused provider/router/live-check tests passed: 3 files, 45 tests.
- Full suite passed before and after the live call: 79 files passed, 13 skipped; 855 tests passed, 22 skipped.
- `npm run typecheck` passed before and after the live call.
- Offline CLI reported `status=offline`, `stage=not_started`, and zero prompt/bootstrap/dispatch counts before and after the call.
- Historical reports 04-08 through 04-15 retained preflight hashes; earlier claims remained unchanged. The 04-16 report hash after consumption is `3EC64D9F15E25C13A17620236A4384F465F69798A7F4514F47F0A94A838A1010` and its `.used` file contains `consumed`.

## Requirement status

BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 remain Pending. No valid Intent was accepted, and live cancellation/recovery/repair/cache evidence was not reached. The subscription-source criterion remains unverified.

## Deviations from Plan

None.
