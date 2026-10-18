---
phase: 02-real-page-read-and-fill
plan: 08
subsystem: extension-content
tags: [typescript, browser, dom, signatures, privacy]

# Dependency graph
requires:
  - phase: 02-03
    provides: MV3 extension build and browser-safe content entry point
  - phase: 02-06
    provides: Frozen snapshot protocol and field metadata contract
provides:
  - Deterministic value-free structural hashes and page-change signatures
  - Type-only content/service-worker message contracts
  - Private DOM element identity, metadata fingerprints, bounded text and visibility predicates
affects: [02-09, 02-10, 02-11, 02-16, 02-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Synchronous FNV-1a signatures over explicit metadata tuples, excluding control values
    - Private WeakMap/WeakRef identity tables with page-visible IDs used only as debug stamps
    - Rendered visibility independent of viewport intersection; one disabled predicate includes readonly text controls

key-files:
  created:
    - apps/extension/src/shared/messages.ts
    - apps/extension/src/shared/hash.ts
    - apps/extension/src/shared/signature.ts
    - apps/extension/src/content/ids.ts
    - apps/extension/src/content/text.ts
    - apps/extension/src/content/fingerprint.ts
    - apps/extension/src/content/visibility.ts
    - apps/extension/test/signature.test.ts
    - apps/extension/test/visibility.test.ts
  modified: []

key-decisions:
  - "Current values, value presence, checked state and selected options are excluded from change signatures; option membership and labels remain structural."
  - "The data-blip-id attribute is a debug stamp only; element resolution always uses the content script's private registry."

patterns-established:
  - "Content-to-service-worker contracts import protocol types with `import type`, avoiding protocol runtime code in browser bundles."
  - "Text cleanup enforces both Unicode code-point and UTF-16 limits after whitespace normalization."

requirements-completed: [PAGE-01, PAGE-03]

# Metrics
duration: 3min
completed: 2026-10-17
---

# Phase 02 Plan 08: Content Structural Helpers Summary

**Browser-safe structural signatures now track page metadata without hashing private values, and content helpers provide decoy-resistant identity and shared rendered/disabled checks.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-17T02:52:00Z
- **Completed:** 2026-10-17T02:55:14Z
- **Tasks:** 2 completed
- **Files modified:** 9 created

## Accomplishments

- Added deterministic synchronous hashing, a contract structural hash, and a separate change signature that includes visibility, disabled/required/invalid state, errors, options, headings and alerts while excluding entered and selected values.
- Added type-only content/service-worker message contracts, plus ID/fingerprint helpers that resolve elements from private tables instead of trusting page-stamped attributes.
- Added normalized dual-bound text cleanup, rendered visibility checks that retain below-fold controls, and a shared disabled predicate that treats readonly inputs and textareas as disabled.
- Added focused signature and jsdom visibility/identity tests.

## Task Commits

1. **Task 1: Add browser-safe messages and structural hash/signature helpers**
   - `abc3d14` test(02-08): add failing tests for structural signatures
   - `74db038` feat(02-08): add browser-safe structural helpers
2. **Task 2: Add private IDs, bounded text, fingerprints and rendered visibility**
   - `3cc50bd` test(02-08): add failing tests for content identity and visibility
   - `1a0dba8` feat(02-08): add private content identity and visibility helpers

## Files Created

- `apps/extension/src/shared/messages.ts` - Type-only request, response and event contracts between content scripts and the service worker.
- `apps/extension/src/shared/hash.ts` - Synchronous browser-safe string hash.
- `apps/extension/src/shared/signature.ts` - Structural and change-signature helpers with explicit value exclusions.
- `apps/extension/src/content/ids.ts` - Private weak-reference identity registry with safe continuity for replacement nodes.
- `apps/extension/src/content/text.ts` - Whitespace cleanup with code-point and UTF-16 bounds.
- `apps/extension/src/content/fingerprint.ts` - Stable metadata fingerprint that excludes values.
- `apps/extension/src/content/visibility.ts` - Rendered visibility and shared disabled/readonly predicates.
- `apps/extension/test/signature.test.ts` - Structural and change-signature tests.
- `apps/extension/test/visibility.test.ts` - Identity, text bounds, visibility and disabled-state tests.

## Decisions Made

- Excluded `value`, `hasValue`, `checked` and option `selected` from change signatures; retained option membership and labels so structural option changes are detected.
- Treated `data-blip-id` as a debug stamp only and made the private registry the sole authority for ID resolution.

## Deviations from Plan

None - plan executed as written.

**Total deviations:** 0. **Impact:** No scope changes.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run apps/extension/test/signature.test.ts apps/extension/test/visibility.test.ts` - passed (2 files, 17 tests).

## Issues Encountered

The two initial TDD runs failed because the planned helper modules did not exist yet; both failures were resolved by their corresponding implementation commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The helpers are available for label and snapshot extraction, frame aggregation, live-action checks and mutation observation. No blockers found.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

All nine planned source/test files and this summary exist. The four task commits are present in git history. The planned typecheck and focused test suites passed; no stub markers were found in the plan-owned implementation files.
