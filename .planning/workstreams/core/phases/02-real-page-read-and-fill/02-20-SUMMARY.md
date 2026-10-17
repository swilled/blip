---
phase: 02-real-page-read-and-fill
plan: 20
subsystem: testing
tags: [chrome-mv3, browser-e2e, voice-path, privacy, reconnect]

requires:
  - phase: 02-17
    provides: Frame-qualified safe acts and submit suppression
  - phase: 02-18
    provides: Mutation refresh and action overlay
  - phase: 02-19
    provides: Navigation and structural page-change refresh
provides:
  - Real-browser voice-role I1 and post-write privacy evidence
  - Page evidence matrix for vanilla and React forms
  - Long idle and outage reconnect E2E coverage
  - Phase 2 developer runbook and M1-M18 manual checklist
affects: [phase-02-verification, I1]

tech-stack:
  added: []
  patterns: [unique child browser profiles, page-side evidence reports, in-memory privacy assertions]

key-files:
  created:
    - apps/extension/test/e2e/idle.e2e.test.ts
    - apps/extension/test/e2e/matrix-pages.e2e.test.ts
    - apps/extension/test/e2e/matrix-vanilla.e2e.test.ts
    - apps/extension/README.md
  modified:
    - apps/extension/test/e2e/voice-path.e2e.test.ts

key-decisions:
  - "Keep the roughly 8k-token model prompt trim in Phase 4; Phase 2 wire truncation is only caused by the 250-element cap."
  - "Keep M1-M18 pending until the user records visible-browser results, browser versions, and M17 mode."
  - "Browser tests own and close only their uniquely spawned child process and profile."

requirements-completed: []

duration: resumed execution; total plan duration not tracked
completed: 2026-10-17
---

# Phase 2 Plan 20: Browser Evidence and Manual Checkpoint

**Automated browser evidence and the developer runbook are ready. The blocking visible-browser checkpoint remains open for M1-M18 and I1 sign-off.**

## Tasks

- **Task 1: voice-role I1 and privacy boundary** - complete.
- **Task 2: page evidence matrix, idle test, and runbook** - complete.
- **Task 3: visible browser checklist and I1 sign-off** - pending user verification.

## Accomplishments

- Extended the real-browser voice path to cover page description, text and select fill, maxlength read-back, and sensitive-field focus/write behavior.
- Asserted that a card-shaped number typed into an ordinary name field is redacted after writing from the ActResult, refreshed page/session state, spoken/error frames, last-spoken value, and captured server logs. The password sentinel remains covered.
- Added vanilla and React page-side evidence matrices for accessible metadata, readonly refusal, sensitive-value redaction, native field actions, gated actions, validation, no-submit behavior, frames, shadow DOM, CSP, freshness, and the 250-element wire cap.
- Added an opt-in long browser test. It verified one extension connection through 75 seconds idle, then reconnect after a 40-second server outage.
- Added [the extension runbook and manual checklist](../../../../../apps/extension/README.md), including browser selection, build commands, known unsupported widgets, and M1-M18.

## Commits

1. `0a2e398` - trace voice path privacy boundary.
2. `d01bd69` - strengthen voice path privacy assertions.
3. `a011a40` - complete page evidence matrix.
4. Summary and runbook commit recorded below.

## Verification

- `npm run typecheck` - passed.
- `npm run ext:typecheck` - passed.
- `npm test` - passed: 61 files, 638 tests passed, 19 skipped.
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e --no-file-parallelism` - passed: 10 files and 20 tests passed; the opt-in long test was skipped in this run.
- `BLIP_E2E_BROWSER=1 BLIP_E2E_LONG=1 npx vitest run apps/extension/test/e2e/idle.e2e.test.ts --no-file-parallelism` - passed: 1 test in 120.78 seconds.
- `npm run ext:build` - passed.
- `npm run pages:build` - passed.
- `npm run ext:smoke` - passed and observed the production extension origin bind in Edge.
- `git diff --check` - passed.

Automated E2E runs used unique child profiles and did not close or alter the user's existing Edge window.

## Human Verification Required

The README checklist remains entirely **Pending**. The local machine resolves Edge 155.0.4283.45; Chrome was absent from the searched locations. A person must run the visible developer flow, record M1-M18 with browser/version and M17 mode, and have a teammate repeat the connection/fill checks on Chrome for M18. Do not mark this plan, I1, or Phase 2 complete before that checkpoint is reported.

## Next Step

Complete the manual checklist in `apps/extension/README.md`, then report the browser/version, each row's status, and whether M17 used the real voice UI or REPL. Include the teammate Chrome version/result for M18. Record any failing rows before final Phase 2 reconciliation.

---
*Phase: 02-real-page-read-and-fill*
*Plan: 20 of 20*
*Completed: automated tasks only; human checkpoint pending*
