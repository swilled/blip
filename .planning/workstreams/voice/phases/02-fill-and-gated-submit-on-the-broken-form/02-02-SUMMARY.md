---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 02
subsystem: dialogue
tags: [normalization, forms, confirmation, vitest]
requires: []
provides:
  - Pure spoken-text normalization helpers
  - Ordered form-field and option resolution with explicit ambiguity results
  - Exact, fail-closed confirmation phrase matching and gate timing
  - Sanitized form-reading, echo, read-back, and submission templates
affects: [voice-dialogue]
actuals:
  tokens: 11834
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - Pure dialogue helpers with table-driven Vitest behavior tests
    - Token-list matching for page labels and exact confirmation phrases
    - Sensitive field values are excluded from spoken templates
key-files:
  created:
    - packages/dialogue/src/normalize.ts
    - packages/dialogue/src/normalize.test.ts
    - packages/dialogue/src/fields.ts
    - packages/dialogue/src/fields.test.ts
    - packages/dialogue/src/confirm.ts
    - packages/dialogue/src/confirm.test.ts
    - packages/dialogue/src/templates.ts
    - packages/dialogue/src/templates.test.ts
  modified: []
key-decisions:
  - "Field labels are matched as normalized token sequences; equally plausible candidates return ambiguity instead of a guessed field."
  - "Confirmation accepts only the exact two-argument text and phrase match, with a 200-character guard and no affirmative alternatives."
  - "Echo and read-back use observed page values for non-sensitive fields and hide sensitive values."
patterns-established:
  - "Sanitize page labels, option labels, errors, and observed values before speaking them."
  - "Use fixed token parsing rather than constructing regular expressions from page text."
requirements-completed: [DLG-02, DLG-03, DLG-07, DLG-08, DLG-09]
coverage:
  - id: D1
    description: "Spoken email and number normalization, value cleaning, and TTS-friendly output"
    requirement: DLG-03
    verification:
      - kind: unit
        ref: "packages/dialogue/src/normalize.test.ts#spoken-text normalization"
        status: pass
    human_judgment: false
  - id: D2
    description: "Page-ordered field and option resolution, ambiguity reporting, and sensitive-safe form digest"
    requirement: DLG-03
    verification:
      - kind: unit
        ref: "packages/dialogue/src/fields.test.ts#form fields and option resolution"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exact confirmation and cancellation phrases with a one-second gate window"
    requirement: DLG-09
    verification:
      - kind: unit
        ref: "packages/dialogue/src/confirm.test.ts#fail-closed confirm phrase matching"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sanitized page-reading, value echo, full read-back, required-empty, and confirmation wording"
    requirement: DLG-02
    verification:
      - kind: unit
        ref: "packages/dialogue/src/templates.test.ts#spoken form templates"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sensitive values stay hidden across spoken templates"
    requirement: DLG-08
    verification:
      - kind: unit
        ref: "packages/dialogue/src/templates.test.ts#never includes a sensitive field value in any spoken template"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-10-17
status: complete
---

# Phase 02 Plan 02: Dialogue Helpers Summary

**Dependency-free dialogue helpers now normalize speech, resolve fields safely, enforce exact confirmation, and produce sanitized form read-back.**

## Performance

- **Duration:** 10 minutes
- **Started:** 2026-10-17T03:48:52Z
- **Completed:** 2026-10-17T03:58:58Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added pure normalization helpers for spoken email and number input, safe value cleaning, and speakable output.
- Added ordered field and option matching with unlabeled-field numbering, explicit ambiguity, and a digest that omits sensitive values.
- Added exact confirmation and cancellation matching, gate-window timing, and sanitized form-reading, echo, read-back, and refusal templates.
- Kept all reducer code unchanged; `packages/dialogue/src/reduce.ts` remains untouched.

## Task Commits

1. **Task 1: spoken-text normalizers** - RED `85c378a`, GREEN `837f61e`.
2. **Task 2: field resolver and confirm matcher** - RED `b64394c`, GREEN `b790697`.
3. **Task 3: spoken templates** - RED `e4789be`, GREEN `4f25681`.

Each RED record is persisted beside this summary as `02-02-task1-red.json`, `02-02-task2-fields-red.json`, `02-02-task2-confirm-red.json`, and `02-02-task3-red.json`. All four records returned `RED_EVIDENCE_OK` from the GSD classifier before their corresponding implementation commits.

## Files Created/Modified

- `packages/dialogue/src/normalize.ts` and `normalize.test.ts` - pure normalizers and table-driven behavior coverage.
- `packages/dialogue/src/fields.ts` and `fields.test.ts` - enabled-field ordering, safe spoken labels, option matching, field resolution, and digest behavior.
- `packages/dialogue/src/confirm.ts` and `confirm.test.ts` - exact phrase matching, cancellation phrases, and the gate window.
- `packages/dialogue/src/templates.ts` and `templates.test.ts` - sanitized batch reading, observed-value echo, full read-back, required-empty messaging, and confirmation wording.

## Decisions Made

- Field resolution compares fixed token lists and selects the longest unique match; ambiguity is returned rather than guessed.
- Confirmation compares exact normalized token sequences, strips only the allowed edge fillers, and has no “yes” or alternatives concept.
- Spoken echoes use the value observed on the page. Sensitive values remain hidden, including when a malformed test model contains a value despite the protocol refinement.

## Deviations from Plan

None - implementation stayed within the planned modules and behaviors. The TDD reporter reruns followed the required evidence workflow.

## Issues Encountered

- PowerShell blocked the `npm.ps1` shim under the machine's execution policy. The equivalent `npm.cmd` commands ran successfully.
- Vitest's nested TAP report for template tests contained a YAML diagnostic the GSD TAP parser rejected because of apostrophe escaping. The named target was rerun with the supported `tap-flat` reporter and filtered to that test; the unchanged assertion failed for the planned reason and the classifier returned `RED_EVIDENCE_OK`.
- `npm.cmd run typecheck` reports an existing error at `dev/mock-server/src/broken-form.test.ts:18` (`string | undefined` passed where `string` is required). That file is outside this plan and was not changed. The plan-level dialogue test suite passes.
- `requirements.ready-ids` reported `0/5` IDs ready because other plans in this phase also declare these requirements; the GSD shared-ID gate defers marking them complete until those plans have summaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The pure helper modules are ready for the reducer and voice-window plans to consume. The plan-level dialogue suite passes; the phase still has remaining plans.

## Self-Check: PASSED

- Task RED evidence files exist and each passes `check tdd-red-evidence` with `RED_EVIDENCE_OK`.
- Task verification passed: normalizers, fields plus confirm, and templates targeted suites are green.
- Plan verification passed: `npm.cmd test -- packages/dialogue` completed with 5 test files and 41 tests passing.
- Acceptance checks passed: 32 email-case table rows overall (including more than 20 email rows), no normalizer console calls or external imports, no `new RegExp` or logging in field/confirm helpers, exact two-argument `phraseMatches`, false-table size at least 25, required exact wording assertions, and sensitive marker coverage.
- The plan's eight source/test files are the only production files changed, and `packages/dialogue/src/reduce.ts` is unchanged.
- `check evaluation-scope --plan 02-02 --commits-only` resolved six reachable task commits on this branch.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*
