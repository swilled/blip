---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-01
subsystem: testing
tags: [injection, loopback, policy, gated-actions]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: "Loopback test-page server and ownership of core test fixtures"
  - phase: 03-gated-submit-and-result-reading
    provides: "Default-deny gated Executor, confirmation flow, and sanitized audit logging"
provides:
  - "Synthetic hostile-page fixture with hidden injection text, fake verification claim, and two gated submit controls"
  - "Fixture-host assertions for same-origin inert reporting and absence of personal data"
  - "Server/policy regression evidence that verified page labels cannot authorize a gated action"
affects: [phase-05-browser-e2e, GATE-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Synthetic hostile pages send bounded, value-free reports only to the loopback fixture host"
    - "Visible verification claims remain page text and never influence deterministic action policy"

key-files:
  created:
    - tools/test-pages/public/injection.html
  modified:
    - tools/test-pages/test/serve.test.ts
    - apps/server/test/gated-flow.test.ts

key-decisions:
  - "The two hostile submit controls share the local inert submit sink; the active submit handler prevents navigation and reports only the synthetic submitter ID."
  - "Keep GATE-06 pending until the isolated real-browser hostile-page plans verify the full extension path."

patterns-established:
  - "Fixture assertions verify hostile content, destination origins, inert sink behavior, and no personal-data fields without relying on screenshots."
  - "Server refusal tests use the fake-brain seam and exact early-confirmation refusal while checking audit payload allowlists."

requirements-completed: [] # GATE-06 remains pending until real-browser end-to-end evidence is complete.

# Metrics
duration: 3m
completed: 2026-10-17
---

# Phase 5 Plan 05-01: Synthetic Hostile-Page Fixture Summary

**Added a loopback-only injection fixture with hidden AI-directed bait, a fake verified banner, and submit controls whose claims cannot bypass the gated Executor.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-17T16:25:10Z
- **Completed:** 2026-10-17T16:28:08Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Added `injection.html` with hidden instructions addressed to Blip/AI agents, a synthetic verified banner, visible `click #pay` text, a pay submit control, and a verified lookalike submit control.
- Kept both submit controls on a same-origin inert path. The active handler prevents default navigation and sends only the synthetic submitter ID through the existing bounded `blipReport` facility.
- Added fixture-host tests for the hostile bait, same-origin script/action destinations, local sink behavior, and the absence of user-data fields or realistic personal values.
- Added deterministic policy and server regressions showing verified labels remain gated, an early phrase cannot dispatch `act.request`, and refusal audit output excludes fixture prose.

## Task Commits

1. **Task 1 RED: add failing injection fixture assertions** — `f818fc5` (`test`)
2. **Task 1 GREEN: add synthetic hostile-page fixture** — `f292d80` (`feat`)
3. **Task 2: assert injection actions stay gated** — `ef2eadd` (`test`)
4. **Task 1 follow-up: require inert local sink** — `23d1dfa` (`test`)

## Verification

- `npx vitest run tools/test-pages/test/serve.test.ts` — passed, 10/10 tests.
- `npx vitest run apps/server/test/gated-flow.test.ts` — passed, 16/16 tests.
- `npx vitest run packages/policy/test/classify.test.ts` — passed, 24/24 tests.
- `npm run typecheck` — passed.

## Decisions Made

- The local form action points only to the existing same-origin inert `submit-sink.html`; the normal script path prevents navigation and reports locally.
- GATE-06 is not marked complete here. The fixture and deterministic refusals are in place, while the isolated browser/extension verification remains for later Phase 5 plans.

## Deviations from Plan

Task 2's regression passed on its first run because the Phase 3 Executor already refuses confirmation before the read-back and cooldown, and its audit logger already limits fields to sanitized metadata. No production gate change was needed; the new tests lock the existing behavior. The first fixture assertion was run red against the missing page, then passed after implementation.

## Known Stubs

- The fixture does not emulate a real browser extension or Claude model. This is intentional for this plan; isolated browser/extension coverage is reserved for Phase 5 plans 05-03 and 05-07.

## Next Phase Readiness

- The seeded local fixture is ready for the isolated browser test plan.
- GATE-06 remains pending until end-to-end evidence confirms the real extension blocks the seeded hostile actions.
- Phase 5 remains behind the still-open Phase 4 dependency; this plan does not close the phase or alter external-input requirements.

## Self-Check: PASSED

- The fixture, both modified test files, and this summary exist.
- All four task-related commits are present in git history.
- Focused tests and root typecheck passed.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Plan: 05-01*
*Completed: 2026-10-17*
