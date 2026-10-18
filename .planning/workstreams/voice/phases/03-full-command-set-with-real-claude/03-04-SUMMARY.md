---
phase: 03-full-command-set-with-real-claude
plan: 04
subsystem: human-integration
tags: [uat, real-claude, public-form, injection-warning, connected-gate]
requires:
  - phase: 02-fill-and-gated-submit-on-the-broken-form
    provides: Connected HO-8 Gate/Executor I2 check with exact-phrase authorization
  - phase: 03-full-command-set-with-real-claude
    provides: Voice command set, live-page guidance, profile fill behavior, and warning-first handling
provides:
  - Recorded human I3 outcome against the live Microsoft Form and seeded injection page
  - Recorded separate I2 connected-gate precondition result
affects: [04-nvda-mode-and-demo-safe]
key-files:
  created:
    - packages/dialogue/src/sensitive.ts
  modified:
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/index.ts
    - apps/server/src/voice/dialogue-runner.ts
    - dev/mock-server/src/dialogue-runner.test.ts
actuals:
  tasks: 1
  commits: 3
completed: 2026-10-18
status: complete
---

# Phase 3 Plan 04: Live Integration and Safety Checkpoint Summary

**The blocking I3 checkpoint is complete, and its separate connected-gate I2 precondition passed.**

## Human I3 result

- Blip identified the team-owned Microsoft Form.
- With the form empty, Blip reported five required fields in page order across two responses: Employment type, Department, Leave type, Leave date, and Return date.
- Profile fill reported the form fields it skipped. No clear autocomplete profile matches were available, so no profile field was filled.
- On the seeded injection page, Blip warned first and then described the page. In a fresh repeat, the user confirmed no gate appeared.
- The user reported the remaining Phase 3 checks worked. Exact transcripts for each command and privacy sub-check were not recorded; this is retained as an evidence limitation rather than expanded into invented details.

## Security remediation

The Phase 3 security audits found paths where sensitive utterances could reach transcript frames or intent parsing, including short assignments, stale page context, punctuation variants, and protected dialogue modes. A shared classifier now makes the reducer and runner agree, fails closed when page or field context is unavailable, and permits sensitive-field handoff only when deterministic field resolution can safely focus that field. Runner tests confirm sensitive sentinels stay out of transcripts, speech, state, and intent requests. Focused dialogue/runner tests, the full suite (57 files / 805 tests), and typecheck passed.

## Separate I2 connected-gate precondition

The user confirmed that `yes` and the near-phrase `submit form` both left the BLOCKED prompt active with no submission. Exact `submit survey` submitted once. The local result was `Local submit observed. No data was sent.` This verifies the connected local synthetic flow and confirms the Plan 03-04 precondition; it does not indicate that external form data was sent.

## Verification

- The required human I3 checkpoint was approved and its observable outcomes are in `03-UAT.md`.
- The I2 result remains a separate Phase 2 check and is recorded in `02-VERIFICATION.md`.
- Current voice checkout regression gate: `npm.cmd test` passed (57 files / 805 tests), and `npm.cmd run typecheck` passed. Earlier integrated-checkout extension build and opt-in Edge E2Es also passed after the observer refresh fix; the long-idle reconnect E2E passed separately.
- The security audit remediation is included in this checkpoint closeout; no external data is sent by the local synthetic result page.

## Task commits

- **Redact overlong sensitive utterances from transcript frames** - `7d1edd1` (fix)
- **Fail closed when sensitive context is unknown and normalize separator variants** - `b006d3f` (fix)
- **Fail closed on short sensitive disclosures and protected dialogue modes** - `3bec412` (fix)

## Evidence limits

The user's broad approval covers the remaining Phase 3 run, but individual spell/change/undo and sensitive privacy results were not transcribed in this session. The public Microsoft Form had no clear profile autocomplete matches, so this run exercised the safe skip behavior rather than a positive profile fill. The local I2 result explicitly states that no data was sent.

## Next phase readiness

Phase 3's four plans are recorded complete. Phase 4 can proceed with NVDA mode and demo safety.
