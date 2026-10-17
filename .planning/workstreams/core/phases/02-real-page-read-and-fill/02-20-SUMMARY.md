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
  - "Record manual Edge observations and a local Chrome-for-Testing run as distinct browser evidence; the user's self-test request authorized agent-run verification."
  - "Browser tests own and close only their uniquely spawned child process and profile."
  - "The opt-in idle test matches the manual two-minute idle interval before testing outage reconnect."

requirements-completed: [PAGE-01, PAGE-03, PAGE-05, ACT-01, ACT-02, ACT-03, ACT-04]

duration: resumed execution; total plan duration not tracked
completed: 2026-10-17
---

# Phase 2 Plan 20: Browser Evidence and Manual Checkpoint

**The browser matrix and M1-M18 checks are complete. The core I1 describe/fill path passed through the REPL; the shared voice UI sign-off remains with the voice track.**

## Tasks

- **Task 1: voice-role I1 and privacy boundary** - complete.
- **Task 2: page evidence matrix, idle test, and runbook** - complete.
- **Task 3: visible browser checklist and core I1 sign-off** - complete through the user's requested agent-run verification.

## Accomplishments

- Extended the real-browser voice path to cover page description, text and select fill, maxlength read-back, and sensitive-field focus/write behavior.
- Asserted that a card-shaped number typed into an ordinary name field is redacted after writing from the ActResult, refreshed page/session state, spoken/error frames, last-spoken value, and captured server logs. The password sentinel remains covered.
- Added vanilla and React page-side evidence matrices for accessible metadata, readonly refusal, sensitive-value redaction, native field actions, gated actions, validation, no-submit behavior, frames, shadow DOM, CSP, freshness, and the 250-element wire cap.
- Added an opt-in long browser test that holds one extension connection through the manual two-minute idle interval, then verifies reconnect after a 40-second server outage.
- Added [the extension runbook and manual checklist](../../../../../apps/extension/README.md), including browser selection, build commands, known unsupported widgets, and M1-M18.
- Completed M1-M17 in visible Edge 155.0.4283.45 and ran M18 in Google Chrome for Testing 151.0.7922.34. The original teammate repeat was replaced by the user's request that the agent run all checks; this is a Chrome-for-Testing build, not a teammate's installed stable Chrome.

## Commits

1. `0a2e398` - trace voice path privacy boundary.
2. `d01bd69` - strengthen voice path privacy assertions.
3. `a011a40` - complete page evidence matrix.
4. Browser checkpoint evidence and UAT closeout recorded in this summary.

## Verification

- `npm run typecheck` - passed.
- `npm run ext:typecheck` - passed.
- `npm test` - passed: 61 files, 638 tests passed, 19 skipped.
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e --no-file-parallelism` - passed in Google Chrome for Testing 151.0.7922.34: 10 files and 20 tests passed; the opt-in long test was skipped in this run.
- `BLIP_E2E_BROWSER=1 BLIP_E2E_LONG=1 npx vitest run apps/extension/test/e2e/idle.e2e.test.ts --no-file-parallelism` - passed: one connection held across two minutes idle, followed by reconnect after the 40-second outage; 166.19 seconds total.
- `npm run ext:build` - passed.
- `npm run pages:build` - passed.
- `npm run ext:smoke` - passed and observed the production extension origin bind in Edge.
- `git diff --check` - passed.

The parallel browser-enabled suite hit startup timeouts under concurrent browser load; rerunning the browser E2E files serially passed. E2E runs used unique child profiles. The separate Chrome-for-Testing version-check window was closed; the user's Edge window was not touched.

## Checklist Evidence Map

Evidence map for the completed browser checklist:

| Manual row | Automated evidence |
| --- | --- |
| M1 | `npm run ext:smoke` observed the production extension origin bind in Edge; extension load itself used the isolated E2E profile. |
| M2 | Visible REPL focus and React controlled-value/blur-validation checks passed. |
| M3 | Maxlength read-back in `voice-path.e2e.test.ts`. |
| M4 | Text/select/radio/checkbox writes and no-op/refusal checks in `matrix-vanilla.e2e.test.ts`. |
| M5 | Implicit Enter and native select submit barriers in `matrix-pages.e2e.test.ts`. |
| M6-M7 | Delayed reveal and SPA navigation freshness in `changes.e2e.test.ts`. |
| M8 | Same-port restart in `reconnect.e2e.test.ts`; long outage reconnect in `idle.e2e.test.ts`. |
| M9 | Two-minute bound-connection check in `idle.e2e.test.ts`. |
| M10 | Visible service-worker reload kept the same page/timeOrigin/value and post-reload fill worked. |
| M11 | Same-origin and cross-origin frame fills passed in the visible Edge run and browser E2E. |
| M12 | Visible strict-CSP fixture showed the cyan border and dark outline; screenshot captured. |
| M13 | Gated action refusal and unchanged page reports in `matrix-vanilla.e2e.test.ts`. |
| M14 | Sensitive-field read/write privacy assertions in `voice-path.e2e.test.ts` and `react-fill.e2e.test.ts`. |
| M15 | 250-element wire cap and `truncated` semantics in `matrix-vanilla.e2e.test.ts`. |
| M16 | With the local Blip `/healthz` tab active as a voice-page stand-in, the REPL still described the form tab; Core has no voice UI. |
| M17 | Visible REPL and live Edge extension described the form and spoke the DOM read-back. |
| M18 | Google Chrome for Testing 151.0.7922.34 passed the production-origin bind and voice-role describe/fill/read-back E2E checks. |

## Verification Scope and Remaining Dependency

The requested browser verification is complete: M1-M17 were observed in the visible Edge profile and M18 ran against Google Chrome for Testing 151.0.7922.34. This is not an independent teammate run or a stable Chrome installation. The real shared voice UI is not in the Core repository, so its sign-off remains with the voice track; Core's REPL path passed.

## Next Step

Run phase-level verification and transition Phase 2 to complete. Keep the shared voice UI milestone sign-off separate from the Core REPL result.

---
*Phase: 02-real-page-read-and-fill*
*Plan: 20 of 20*
*Completed: automated tests and requested browser verification*
