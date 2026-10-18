---
phase: 02-real-page-read-and-fill
plan: 12
subsystem: api
tags: [server, repl, field-actions, policy, testing]

# Dependency graph
requires:
  - phase: 02-02
    provides: Server turn and action foundations used by the REPL path
  - phase: 02-06
    provides: Existing form and field model consumed by phrase resolution
  - phase: 02-07
    provides: Shared snapshot refresh and fake-extension behavior
provides:
  - Deterministic bounded field phrase parsing and option resolution
  - Server-owned allowlisted field actions with DOM-observed replies
  - A REPL mode that leaves the extension connection open for a real browser
affects: [Phase 02 real-page REPL, server action path]

# Actuals
actuals:
  tokens: 12285
  tasks: 2
  commits: 5

# Tech tracking
tech-stack:
  added: ["@blip/policy workspace dependency"]
  patterns:
    - "Resolve exact labels first, then only unique prefix/contains matches."
    - "Derive expected action kinds from field types and speak only sanitized observed values."
    - "Refresh after attempted writes and retry stale snapshots once."

key-files:
  created: [apps/server/src/brain/phrases.ts, apps/server/src/act/ungated.ts]
  modified:
    - apps/server/package.json
    - package-lock.json
    - apps/server/src/reply.ts
    - apps/server/src/turn.ts
    - scripts/dev.ts
    - apps/server/test/phrases.test.ts
    - apps/server/test/act-path.test.ts
    - apps/server/test/dev-script.test.ts

key-decisions:
  - "Only deterministic set_fields and go_to_field requests enter the ungated executor; request_action remains refused."
  - "Sensitive fields receive focus only, and any post-write sensitive-field result triggers a refresh before a value-free reply."
  - "The REPL keeps running with --no-fake-extension while reserving the extension slot for the real browser."

patterns-established:
  - "Redact field values before adding field commands to transcripts or fake-brain input."
  - "Use ActResult.observedValue for spoken confirmations, sanitize controls, and clamp to 80 characters."

requirements-completed: [ACT-01, ACT-02, ACT-04]

coverage:
  - id: D1
    description: "The server parses bounded field phrases and emits only allowed fill, select, checkbox, and focus actions."
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "apps/server/test/phrases.test.ts"
        status: pass
      - kind: unit
        ref: "apps/server/test/act-path.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Select and checkbox values resolve safely; sensitive fields use focus-only handoff and stale snapshots retry once."
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "apps/server/test/act-path.test.ts"
        status: pass
      - kind: unit
        ref: "apps/server/test/phrases.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fill confirmations use sanitized DOM-observed values, with a post-write refresh before speaking."
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "apps/server/test/act-path.test.ts"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "The REPL starts without a fake extension and waits for the real extension connection."
    verification:
      - kind: unit
        ref: "apps/server/test/dev-script.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: not-recorded
completed: 2026-10-16
status: complete
---

# Phase 02 Plan 12: Real Page Read and Fill Summary

**Deterministic REPL field actions now drive the real extension and speak sanitized values read back from the DOM.**

## Performance

- **Duration:** Not recorded; execution continued from an earlier implementation and test pass.
- **Started:** Not recorded in this continuation.
- **Completed:** 2026-10-16
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added bounded phrase parsing and unique field/option resolution for fill, select, check/uncheck, focus, and go-to commands.
- Added server-owned action dispatch with field-type-derived expected kinds, post-act refresh, one stale-snapshot retry, and confirmations sourced from sanitized `observedValue`.
- Kept sensitive values out of transcript and fake-brain input; sensitive fields remain focus-only and post-write sensitive results refresh before a generic private-field response.
- Added `--no-fake-extension` to keep the typed REPL available while a real extension connects.

## Task Commits

1. **Task 1: Trace fill phrases through the ungated action path** - `f1f73c5` (`feat`)
2. **Task 2 RED: Cover field operations and real-extension mode** - `8ac50fd` (`test`)
3. **Task 2: Disambiguate operation test fixtures** - `cd29971` (`test`)
4. **Task 2 GREEN: Complete field operations and real-extension mode** - `7779f57` (`feat`)

The summary artifact is committed separately after these task commits.

## Files Created/Modified

- `apps/server/src/brain/phrases.ts` - Bounded phrase parsing, field and option resolution, and safe phrase rendering.
- `apps/server/src/act/ungated.ts` - Allowlisted field action execution, refresh handling, and stale-snapshot retry.
- `apps/server/src/reply.ts` - Sanitized, bounded confirmations based on DOM-observed values.
- `apps/server/src/turn.ts` - Routes only allowed deterministic phrases and redacts values from transcript/model input.
- `scripts/dev.ts` - Adds the real-extension REPL option.
- `apps/server/test/phrases.test.ts`, `apps/server/test/act-path.test.ts`, `apps/server/test/dev-script.test.ts` - Parser, safety, retry, read-back, and startup coverage.
- `apps/server/package.json`, `package-lock.json` - Adds the workspace policy dependency.

## Decisions Made

- Kept `request_action` priority and refusal behavior; only `set_fields` and `go_to_field` reach the executor.
- Derived `expectedKind` with `fieldKindForFieldType` instead of accepting model-provided action kinds.
- Used fixed, value-free replies for sensitive/error paths and DOM read-back for successful field confirmations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected trailing-space handling in bounded fill phrase parsing**
- **Found during:** Task 1
- **Issue:** The initial parser test exposed an input with trailing whitespace that did not follow the expected bounded parse path.
- **Fix:** Trimmed the bounded phrase before resolving the fill grammar.
- **Files modified:** `apps/server/src/brain/phrases.ts`
- **Verification:** Phrase and action-path tests passed.
- **Committed in:** `f1f73c5`

**2. [Rule 2 - Missing Critical] Prevented field values from reaching transcripts or fake-brain input**
- **Found during:** Task 2
- **Issue:** Field command text could include a value that must not be logged or sent to a model.
- **Fix:** Added safe phrase renderers and used them for transcript and fake-brain inputs; coverage checks that the value is absent.
- **Files modified:** `apps/server/src/brain/phrases.ts`, `apps/server/src/turn.ts`, `apps/server/test/act-path.test.ts`
- **Verification:** `apps/server/test/act-path.test.ts` passed.
- **Committed in:** `7779f57`

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical privacy protection)
**Impact on plan:** Both fixes support the planned parser and privacy invariants; no scope expansion.

## Issues Encountered

- The expanded phrase fixtures inherited fields with the same labels from their base model. The fixture now filters those duplicate labels before adding select and checkbox cases, keeping ambiguity tests intentional.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run apps/server` - passed: 16 files, 232 tests.
- `npm test` - passed: 36 files, 535 tests passed, 1 skipped.
- The plan's existing model and default-brain refusal coverage remained green in the server and root suites.

## Known Stubs

- The existing `--brain=claude` dev option remains unavailable and is covered by its existing error text. This is outside this plan; fake-brain mode and the real-extension flag work as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The typed REPL can now drive the extension action channel for permitted field operations and is ready for integration with the real extension.
- Existing refusal boundaries remain covered by the passing server and root suites.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Summary file exists at the planned path.
- Task commits `f1f73c5`, `8ac50fd`, `cd29971`, and `7779f57` are present in git history.
- Verification results above match the latest successful typecheck and test runs.
