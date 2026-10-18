---
phase: 02-real-page-read-and-fill
plan: 06
subsystem: policy
tags: [typescript, browser-safety, vitest, action-classification]

# Dependency graph
requires:
  - phase: 01-contract-and-walking-skeleton
    provides: Frozen ActionKind and FieldType contracts from @blip/protocol
provides:
  - Fail-closed action classification over visible text and link destination facts
  - Native field operation mapping and explicit unsupported-widget results
  - A zod-free @blip/policy/classify package entry point
affects: [phase-02-extension, phase-03-policy-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Type-only protocol imports keep the browser classifier free of runtime protocol dependencies
    - Unknown action shapes map to a gated submit kind with an explanatory reason

key-files:
  created:
    - packages/policy/src/classify.ts
    - packages/policy/test/classify.test.ts
    - packages/policy/test/ungated-parity.test.ts
  modified:
    - packages/policy/package.json
    - packages/policy/src/index.ts

key-decisions:
  - "Keep the ungated membership set local and verify it against every frozen protocol kind and junk strings."
  - "Only explicit safe button/link text can become click-safe after gated terms and URL origin checks pass."

patterns-established:
  - "Classification results include reasons, including fail-closed defaults."
  - "Unsupported fields retain the fill operation kind while setting unsupported=true for a refusal path."

requirements-completed: [PAGE-03]

# Metrics
duration: 2min
completed: 2026-10-16
---

# Phase 2 Plan 06: Deterministic Policy Classifiers Summary

**Browser-safe action and field classifiers now enforce gated text and link checks, explicit safe allowlists, and protocol parity.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-16T22:29:00-04:00
- **Completed:** 2026-10-16T22:31:10-04:00
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments

- Added deterministic action classification with pay/delete/send precedence, bounded normalized matching across text, href, and target, same-origin validation, and gated defaults.
- Added native field mapping for text-like inputs, textarea, select, radio groups, and checkboxes; unsupported widgets are identified explicitly.
- Added the `@blip/policy/classify` export and tests that compare the local ungated set to the frozen protocol contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement fail-closed action rules and tests for text, structure and links** - `04dda52` (TDD test), `d841329` (implementation)
2. **Task 2: Add field classification, zod-free export and protocol parity** - `48af7d1` (feat)

## Files Created/Modified

- `packages/policy/src/classify.ts` - Browser-safe action/field classifiers and local ungated set.
- `packages/policy/test/classify.test.ts` - Adversarial action classification cases.
- `packages/policy/test/ungated-parity.test.ts` - Field mapping, package entry point, and protocol parity checks.
- `packages/policy/package.json` - Exposes the classifier subpath.
- `packages/policy/src/index.ts` - Re-exports classifier helpers.

## Decisions Made

- Kept action kind membership local to avoid pulling protocol runtime dependencies into the browser classifier; a parity test detects drift.
- Allowed only explicit `type=button` controls or same-origin links with allowlisted text to classify as `click-safe`.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The initial TDD run failed as expected because `classify.ts` did not yet exist; the action table passed after implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The extension can import deterministic classifiers through `@blip/policy/classify` without adding a runtime zod import to that entry point.
- PAGE-03 is covered; extension integration can use the result kind and reason list directly.

## Self-Check: PASSED

- Summary file exists at the required phase path.
- Task commits `04dda52`, `d841329`, and `48af7d1` exist in git history.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*
