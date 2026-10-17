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
  - "The opt-in idle test matches the manual two-minute idle interval before testing outage reconnect."

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
- Added an opt-in long browser test that holds one extension connection through the manual two-minute idle interval, then verifies reconnect after a 40-second server outage.
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
- `BLIP_E2E_BROWSER=1 BLIP_E2E_LONG=1 npx vitest run apps/extension/test/e2e/idle.e2e.test.ts --no-file-parallelism` - passed: one connection held across two minutes idle, followed by reconnect after the 40-second outage; 166.19 seconds total.
- `npm run ext:build` - passed.
- `npm run pages:build` - passed.
- `npm run ext:smoke` - passed and observed the production extension origin bind in Edge.
- `git diff --check` - passed.

Automated E2E runs used unique child profiles and did not close or alter the user's existing Edge window.

## Checklist Evidence Map

These are automated results; they do not change the M1-M18 manual status rows.

| Manual row | Automated evidence |
| --- | --- |
| M1 | `npm run ext:smoke` observed the production extension origin bind in Edge; extension load itself used the isolated E2E profile. |
| M2 | React controlled-value and blur-validation assertions in `matrix-pages.e2e.test.ts`; OS focus behavior still needs a visible check. |
| M3 | Maxlength read-back in `voice-path.e2e.test.ts`. |
| M4 | Text/select/radio/checkbox writes and no-op/refusal checks in `matrix-vanilla.e2e.test.ts`. |
| M5 | Implicit Enter and native select submit barriers in `matrix-pages.e2e.test.ts`. |
| M6-M7 | Delayed reveal and SPA navigation freshness in `changes.e2e.test.ts`. |
| M8 | Same-port restart in `reconnect.e2e.test.ts`; long outage reconnect in `idle.e2e.test.ts`. |
| M9 | Two-minute bound-connection check in `idle.e2e.test.ts`. |
| M10 | Visible extension reload with the page left open was not checked. |
| M11 | Cross-origin snapshot plus same/cross-origin frame actions in `snapshot.e2e.test.ts` and `frames-shadow.e2e.test.ts`. |
| M12 | Overlay behavior has unit coverage; the visible strict-CSP outline was not checked in a browser UI. |
| M13 | Gated action refusal and unchanged page reports in `matrix-vanilla.e2e.test.ts`. |
| M14 | Sensitive-field read/write privacy assertions in `voice-path.e2e.test.ts` and `react-fill.e2e.test.ts`. |
| M15 | 250-element wire cap and `truncated` semantics in `matrix-vanilla.e2e.test.ts`. |
| M16 | Focused-window target selection has unit coverage in `changes.test.ts`; the visible two-tab voice/form interaction was not checked. |
| M17 | Real extension plus voice-role read/fill trace in `voice-path.e2e.test.ts`; it does not use a physical microphone or visible voice UI. |
| M18 | Not run: Chrome is absent locally and the teammate repeat requires their Chrome environment. |

The computer-use connector reported `apps: []` and `browsers: []`; attempts to create an Edge or in-app browser tab returned “Browser is not available.” The visible-only rows remain pending for that reason.

## Human Verification Required

The README checklist remains entirely **Pending**. The local machine resolves Edge 155.0.4283.45; Chrome was absent from the searched locations. The current computer-use connector cannot access any browser surface. The visible-only checks still need a controllable browser session, and M18 requires the teammate's Chrome environment. Do not mark this plan, I1, or Phase 2 complete before those checks are reported.

## Next Step

Complete the manual checklist in `apps/extension/README.md`, then report the browser/version, each row's status, and whether M17 used the real voice UI or REPL. Include the teammate Chrome version/result for M18. Record any failing rows before final Phase 2 reconciliation.

---
*Phase: 02-real-page-read-and-fill*
*Plan: 20 of 20*
*Completed: automated tasks only; human checkpoint pending*
