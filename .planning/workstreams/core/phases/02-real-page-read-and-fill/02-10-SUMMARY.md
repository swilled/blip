---
phase: 02-real-page-read-and-fill
plan: 10
subsystem: extension-content
tags: [typescript, dom, snapshot, privacy, vitest]

# Dependency graph
requires:
  - phase: 02-05
    provides: Content-script installation shell and extension restart coverage
  - phase: 02-09
    provides: Label, required, error, sensitivity, option, and visibility helpers
  - phase: 02-14
    provides: Local fixture pages for later real-page verification
provides:
  - DOM discovery for native controls, actions, radio groups, and shadow roots
  - Private element-ID resolution and fail-closed action classification
  - Per-frame snapshot data with exact 250-element truncation semantics
affects: [02-11, PAGE-01, PAGE-03, PAGE-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Content-script protocol imports remain type-only; runtime validation belongs at background aggregation
    - Values are redacted before serialization and structural hashes exclude field values

key-files:
  created:
    - apps/extension/src/content/walk.ts
    - apps/extension/src/content/snapshot.ts
    - apps/extension/test/walk.test.ts
    - apps/extension/test/snapshot.test.ts
  modified:
    - apps/extension/src/content/index.ts

key-decisions:
  - "Keep action IDs in the private registry; the page-visible data-blip-id attribute is only a debug stamp."
  - "Prioritize fields over actions only when selecting the 250 wire elements, preserving each group’s document order."
  - "Use the 250-element cut as the sole reason for truncated=true; heading, alert, option, and time-budget clipping do not set it."

patterns-established:
  - "Classify actions from live href and target facts, then serialize only origin plus pathname for href."
  - "Run value-shape sensitivity checks before placing ordinary text input values in a snapshot."

requirements-completed: [PAGE-01, PAGE-03, PAGE-05]

# Metrics
duration: 9min
completed: 2026-10-17
---

# Phase 2 Plan 10: DOM Walk and Per-Frame Snapshot Summary

**Content scripts now discover privacy-safe fields and fail-closed actions, and build bounded frame snapshots with wire-cap-only truncation.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-17T03:04:00Z (approximate)
- **Completed:** 2026-10-17T03:12:37Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Added composed-tree traversal for native fields, one element per radio group, explicit custom widgets, actions, open shadow roots, and Chrome-exposed closed shadow roots.
- Reused bounded metadata helpers for labels, required state, validation errors, sensitivity, options, visibility, and readonly-as-disabled behavior. Hidden inputs are excluded without reading their values.
- Added private element-ID resolution and live action classification. The classifier sees the raw href and target; outgoing link hrefs omit query strings and fragments.
- Added per-frame snapshot metadata, content-script snapshot replies, and independent caps for 250 elements, 40 headings, 20 alerts, and 200 options.
- Snapshot tests validate the assembled shape against the frozen `Snapshot` schema and prove that only an element-list cut sets `truncated`.

## Task Commits

1. **Task 1: Implement the content-script walk across document and shadow roots** - `0017008` (TDD tests), `aa95485` (implementation), `6b61d4a` (security and live-link facts follow-up)
2. **Task 2: Capture a per-frame snapshot with exact wire truncation semantics** - `8e7ae4f` (implementation and verification refinements; TDD tests started in `0017008`)

## Files Created/Modified

- `apps/extension/src/content/walk.ts` - DOM discovery, action facts/classification, radio grouping, private IDs, and safe field metadata.
- `apps/extension/src/content/snapshot.ts` - Bounded per-frame snapshot metadata and element selection.
- `apps/extension/src/content/index.ts` - Replies to frame snapshot requests and announces content readiness.
- `apps/extension/test/walk.test.ts` - Control/action discovery, shadow roots, readonly, hidden values, classifier facts, and private ID coverage.
- `apps/extension/test/snapshot.test.ts` - Schema compatibility, caps, field priority, and truncation rules.

## Decisions Made

- Snapshot data is built from type-checked protocol shapes in the content script. The tests run the frozen runtime schema validator; runtime validation stays at background aggregation so the page content script does not bundle Zod.
- The walker shares a 100 ms default budget between element discovery and metadata collection. Any time-budget clipping leaves `truncated` false.
- Private IDs resolve through an isolated-world weak registry. The DOM attribute is never trusted for resolution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Avoid reading values from unsupported and file controls**
- **Found during:** Task 1 (content-script walk)
- **Issue:** Unsupported widgets and file inputs may expose opaque or sensitive strings through page-defined value properties; those values are not needed for the snapshot.
- **Fix:** Skip value reads for unsupported controls and file inputs, and report only file-presence metadata for file inputs.
- **Files modified:** `apps/extension/src/content/walk.ts`
- **Verification:** Focused walker tests, full extension test suite, root typecheck, and extension build passed.
- **Committed in:** `6b61d4a`

---

**Total deviations:** 1 auto-fixed (1 missing critical safety guard). **Impact:** Prevents unsupported control values and file paths from entering extension snapshot memory; planned outputs and interfaces remain unchanged.

## Verification

- `npm run typecheck` passed.
- `npm test -- apps/extension/test/walk.test.ts apps/extension/test/snapshot.test.ts` passed: 2 files, 7 tests.
- `npm test -- apps/extension/test` passed: 14 files, 58 passed, 2 skipped.
- `npm run ext:build` passed; output bundle sizes were 807.0 KB for the background and 39.7 KB for the content script.
- `git diff --check` passed before the snapshot task commit.

## Issues Encountered

- `npm run ext:test` from the extension workspace fails before tests run because `apps/extension/test/build.test.ts` resolves `apps/extension/manifest.template.json` relative to `process.cwd()`, which is already `apps/extension`. The same extension suite passes when invoked from the repository root with `npm test -- apps/extension/test`; this existing test path assumption was left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-11 can fan out snapshot requests to frames, rewrite frame IDs, merge per-frame elements, and validate the final frozen `Snapshot` in the service worker.
- The content script returns frame-local element IDs and frame ID 0; the background aggregation plan owns frame qualification and merged snapshot metadata.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

- The four source/test files and this summary exist.
- Task commits `0017008`, `aa95485`, `6b61d4a`, and `8e7ae4f` exist in git history.
