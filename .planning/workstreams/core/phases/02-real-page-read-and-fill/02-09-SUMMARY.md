---
phase: 02-real-page-read-and-fill
plan: 09
subsystem: extension-content
tags: [typescript, dom, accessibility, privacy, vitest]

# Dependency graph
requires:
  - phase: 02-06
    provides: Frozen RawElement metadata and privacy contract
  - phase: 02-08
    provides: Bounded text and rendered-visibility helpers
provides:
  - Bounded label candidate extraction with nested-control exclusion
  - Required, visible error, sensitivity, safe-value and native-option helpers
affects: [02-10, snapshot-walk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Browser-safe DOM metadata helpers composed without protocol runtime imports
    - Sensitive value-shape classification before values are returned

key-files:
  created:
    - apps/extension/src/content/labels.ts
    - apps/extension/src/content/required.ts
    - apps/extension/src/content/errors.ts
    - apps/extension/src/content/sensitive.ts
    - apps/extension/src/content/options.ts
    - apps/extension/test/labels.test.ts
    - apps/extension/test/required-errors.test.ts
    - apps/extension/test/sensitive.test.ts
    - apps/extension/test/options.test.ts
  modified: []

key-decisions:
  - "Keep label candidates ordered by accessible-name precedence, bounded to eight unique 200-character entries."
  - "Classify Luhn-valid card and SSN-shaped values in plain text inputs before returning a value."
  - "Retain a selected select option when the 200-option cap would otherwise exclude it."

patterns-established:
  - "Use safeValueOf once when a snapshot needs sensitivity, hasValue and value together."
  - "Use isVisible for descriptions and validation errors so hidden page text is omitted."

requirements-completed: [PAGE-01, PAGE-03]

# Metrics
duration: 5min
completed: 2026-10-17
---

# Phase 02 Plan 09: Field Metadata Helpers Summary

**Bounded DOM metadata helpers now provide accessible-name candidates and validation state while withholding sensitive and hidden values.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-17T02:56:00Z (approximate)
- **Completed:** 2026-10-17T03:01:00Z
- **Tasks:** 2 completed
- **Files modified:** 9 created

## Accomplishments

- Added ordered, deduplicated label candidates for ARIA names, associated labels, fieldset legends, title, nearby text, placeholder and inferred names. Nested controls and options do not leak into parent label text.
- Added required-source precedence and visible validation metadata, clamping descriptions and errors to the protocol's 300-character limit.
- Added semantic sensitivity rules plus Luhn and SSN shape checks; `safeValueOf` withholds sensitive strings and avoids reading hidden inputs.
- Added native select option extraction capped at 200 entries while retaining an out-of-cap selected entry.
- Added 16 focused jsdom tests for labels, required/errors, sensitivity redaction and option bounds.

## Task Commits

1. **Task 1: Labels, required state and visible validation errors**
   - `356441e` test(02-09): add metadata helper behavior tests
   - `1afec16` feat(02-09): add bounded labels and validation metadata
2. **Task 2: Sensitivity classification and bounded option extraction**
   - `84e079b` test(02-09): add sensitivity and option extraction tests
   - `ecf5d15` feat(02-09): redact sensitive values and bound options

## Files Created

- `apps/extension/src/content/labels.ts` - Accessible label candidates with bounded text and nested-control exclusion.
- `apps/extension/src/content/required.ts` - Required state using attribute, ARIA, asterisk and none precedence.
- `apps/extension/src/content/errors.ts` - Visible described-by and validation error extraction.
- `apps/extension/src/content/sensitive.ts` - Sensitivity classification, Luhn/SSN detectors and safe value metadata.
- `apps/extension/src/content/options.ts` - Bounded native select option extraction.
- `apps/extension/test/labels.test.ts` - Label order, bounds and nested-control coverage.
- `apps/extension/test/required-errors.test.ts` - Required precedence and visible error coverage.
- `apps/extension/test/sensitive.test.ts` - Sensitive patterns, value-shape checks and hidden-value protection.
- `apps/extension/test/options.test.ts` - Option bounds and selected-entry retention coverage.

## Decisions Made

- Label candidates are returned in source precedence order, deduplicated case-insensitively, with at most eight candidates and 200 UTF-16 units each.
- `safeValueOf` is the combined API for consumers that need the sensitivity classification, presence bit and safe value together.
- Plain text fields are shape-checked for Luhn-valid card numbers and conventional SSN values; phone inputs are not shape-classified as card numbers.
- Option labels and values use 200-character bounds, and a selected option is retained within the 200-entry cap.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The required root `npm run typecheck` passed. An additional `npm run typecheck -w apps/extension` check currently fails in the out-of-scope `apps/extension/src/content/index.ts` because it is not a module; the new helper files produced no reported type errors. That entrypoint belongs to the parallel snapshot-walker work and was left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The 02-10 walker can compose `labelCandidatesOf`, `requiredStateOf`, `errorStateOf`, `safeValueOf`, `readValue` and `optionsOf` without importing protocol runtime code.
- Root typecheck and all four focused metadata suites pass. The extension-workspace check should be rerun after its content entrypoint is complete.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All nine planned source and test files and this summary exist.
- All four task commits are present in git history.
