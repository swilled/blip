---
phase: 04-nvda-mode-and-demo-safe
plan: 03
subsystem: demo-readiness
tags: [offline-fixtures, microsoft-forms, runbook, human-evidence]
requires:
  - phase: 03-full-command-set-with-real-claude
    provides: Team-owned Microsoft Form URL and Phase 3 field-identification report
  - phase: 04-nvda-mode-and-demo-safe
    provides: Exclusive output-mode control and session speech-rate commands
provides:
  - Self-contained offline practice copy of the team leave request form
  - Inventory of the public form, existing broken survey, and core-owned injection routes
  - User-led rehearsal runbook with truthful Phase 3 history and pending Phase 4 evidence fields
affects: [DEMO-03, DEMO-04, VOX-08, demo-safe-freeze]
actuals:
  tokens: 7074
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 257f563fb5577154031d1f4efe49525511709aa8
plan_head_after: 9b323c6b56063dbc074fa00cf199e1cec85d5516
tech-stack:
  added: []
  patterns:
    - Keep the public live form authoritative and disclose the offline practice copy before use
    - Record human rehearsal evidence only from direct observation; keep mock and physical results separate
key-files:
  created:
    - fixtures/forms/offline/public-form.html
    - fixtures/forms/offline/manifest.json
    - dev/mock-server/src/demo-runbook.test.ts
    - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-DEMO-RUNBOOK.md
  modified:
    - dev/mock-server/src/run-real.test.ts
    - .planning/workstreams/voice/REQUIREMENTS.md
key-decisions:
  - "The live Microsoft Form remains the only DEMO-03 authority; the local form is a disclosed practice fallback that sends nothing."
  - "VOX-08, DEMO-03, and DEMO-04 remain human-needed until their workstation, live-form, venue, recorder, and video checks are directly observed."
requirements-completed: []
coverage:
  - id: D1
    description: A clearly labeled offline form copy and local demo-site route inventory are served locally without remote assets or live submission.
    requirement: DEMO-04
    verification:
      - kind: integration
        ref: dev/mock-server/src/run-real.test.ts#serves the static root and local demo routes
        status: pass
      - kind: other
        ref: npm.cmd run typecheck
        status: pass
    human_judgment: false
  - id: D2
    description: The presenter runbook covers the live sequence, validation truthfulness, fallbacks, privacy, and explicit evidence fields.
    verification:
      - kind: unit
        ref: dev/mock-server/src/demo-runbook.test.ts#Phase 4 demo runbook
        status: pass
    human_judgment: true
    rationale: Live-form, NVDA, venue, recorder, and video steps require direct human observation and are intentionally pending.
  - id: D3
    description: Three consecutive live-form runs, NVDA speakId correlation, and physical fallback evidence are reviewed before freeze.
    requirement: DEMO-03
    verification: []
    human_judgment: true
    rationale: No Phase 4 live form, device, network, recorder, or video rehearsal was performed during this preparation.
duration: 9min
completed: 2026-10-18
status: complete
---

# Phase 4 Plan 03: Live-Form Rehearsal Preparation and Offline Fallbacks Summary

**A self-contained offline practice form, local route inventory, and truthful presenter runbook are ready; all live-form, NVDA, venue, recorder, video, and freeze evidence remains explicitly pending.**

## Performance

- **Duration:** 9 minutes
- **Started:** 2026-10-18T03:16:28Z
- **Completed:** 2026-10-18T03:25:17Z
- **Tasks:** 3
- **Files modified:** 8 including required Voice planning metadata

## Accomplishments

- Added a self-contained offline copy of the team leave request form. It is visibly labeled offline, includes the Phase 3 form fields, uses only local required-field checks, and has no form element, remote asset, live-form link, POST, or navigation action.
- Added a manifest for the live Microsoft Form and its offline copy, the existing local broken survey, and the existing core-owned injection fixture. Existing reset routes and ownership are preserved.
- Prepared the presenter runbook with the supplied team form URL, its fresh-page/clear reset guidance, the local synthetic reset command, the user-led negative validation and three-run sequence, and all D-08–D-16 fallback steps.
- Recorded the Phase 3 user report and kept its separate local I2 result (`Local submit observed. No data was sent.`) explicitly out of Phase 4 DEMO-03 evidence.
- Updated Voice requirements to keep VOX-08, DEMO-03, and DEMO-04 human-needed while their acceptance evidence is unobserved.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add local offline copies for the Phase 3 demo sites** - `1d1cebc` (feat)
2. **Task 2: Write the user-led demo and fallback runbook** - `a40b716` (docs)
3. **Task 3: Prepare startup and fallback paths while leaving rehearsal evidence pending** - `9b323c6` (docs)

**Plan metadata:** `6754fc5` (docs: complete plan).

## Files Created/Modified

- `fixtures/forms/offline/public-form.html` - Local-only practice page; clicking its button reports local required fields and states no response was sent.
- `fixtures/forms/offline/manifest.json` - Inventory of the live form and all three local demo-site routes with reset notes.
- `dev/mock-server/src/run-real.test.ts` - Verifies the local page and manifest routes are served and the offline page has no remote assets or live submission path; also exercises the existing injection route using the core-owned test-page host.
- `.planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-DEMO-RUNBOOK.md` - Timed user-led sequence, fallbacks, startup/reset paths, historical Phase 3 report, and human evidence ledger.
- `dev/mock-server/src/demo-runbook.test.ts` - Checks the locked fallback coverage and ensures pending Phase 4 checks are not recorded as passed.
- `.planning/workstreams/voice/REQUIREMENTS.md` - Marks remaining physical checks as human-needed without checking them complete.
- `.planning/workstreams/voice/STATE.md` and `.planning/workstreams/voice/ROADMAP.md` - Updated by the GSD state and plan-progress handlers.

## Decisions Made

- The supplied Microsoft Form is the sole live DEMO-03 target. The offline page is disclosed practice material and cannot substitute for public-form evidence.
- The Phase 3 local synthetic I2 result is retained as historical context only; it is not a Phase 4 live result or spoken confirmation.
- No demo-safe tag is created until the live and physical acceptance evidence is reviewed by a human.

## Deviations from Plan

None - task 3's documentary preparation was completed as specified, with all physical rehearsal evidence left pending.

## Verification

- `npm.cmd test -- dev/mock-server/src/run-real.test.ts` - passed during Task 1 (1 file, 5 tests).
- `npm.cmd test -- dev/mock-server/src/demo-runbook.test.ts` - passed during Task 2 (1 file, 2 tests).
- `npm.cmd test -- dev/mock-server/src/run-real.test.ts dev/mock-server/src/demo-runbook.test.ts` - final combined run passed (2 files, 7 tests).
- `npm.cmd run typecheck` - passed at each task verification and after the final combined run.
- `git diff --check` - passed before the final task commit.

## Issues Encountered

- A new runbook assertion initially used case-sensitive wording that did not match the document. The assertion was aligned with the authored wording, and the focused test passed. No product-code deviation was needed.
- The GSD `state.update-progress` handler reported `phase scope is unscoped, not complete` and left the progress bar unchanged. The state, current plan, task metric, decision, and session continuity were updated successfully; the roadmap remains `In Progress` because Phase 4 human acceptance is still pending.

## User Setup Required

None for the local assets. A human presenter still needs to perform and document the live form, NVDA, STT, hotspot, recorder, video, and freeze checks in the runbook.

## Human Evidence Still Pending

- One live-form negative validation attempt, then three consecutive successful live runs with the same fictional values and page-observed results.
- Audible NVDA completion and cancellation with exactly one matching `speakId` per item; until then follow D-16's agent-voice main-demo fallback and keep VOX-08 human-needed.
- One clear STT miss with typed-input fallback, exactly one phone-hotspot attempt, and explicit disclosure before using local copies.
- Recorder test and uninterrupted three-minute local video using fictional data only.
- Human review of the above before any `demo-safe` tag is created.

## Next Phase Readiness

All three Voice Phase 4 plans are implemented. The phase remains open for the human acceptance items listed above; DEMO-03, DEMO-04, and VOX-08 remain incomplete until those checks are directly observed and reviewed.

---
*Phase: 04-nvda-mode-and-demo-safe*
*Completed: 2026-10-18*

## Self-Check: PASSED

All planned artifacts, the summary, Voice state/roadmap/requirements, and the three task commits exist on the current branch.
