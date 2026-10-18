---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-01
subsystem: browser-control
tags: [browser-content, zod, extension, session-state, identity-binding]

# Dependency graph
requires:
  - phase: 07-implement-generic-user-directed-browser-control-and-content-reading
    provides: Bounded page capture, accepted page identities, and same-origin click-safe link behavior
provides:
  - Optional bounded semantic item records and identity-bound read-item protocol contract
  - Generic visible article/list-item capture with conservative visible date evidence
  - Session storage that accepts item records only from current matching captures
affects: [08-02-live-item-read, 08-03-item-resolution, phase-08-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns: [capture-local DOM references, strict visible-time corroboration, identity-filtered session captures]

key-files:
  created: []
  modified:
    - packages/protocol/src/payloads-browser.ts
    - packages/protocol/test/browser-control.test.ts
    - apps/extension/src/content/browser-content.ts
    - apps/extension/src/content/browser-content.test.ts
    - apps/server/src/browser/commands.ts
    - apps/server/src/browser/executor.ts
    - apps/server/src/browser/content.test.ts
    - apps/server/src/browser/acceptance.test.ts
    - apps/server/src/session/session.ts
    - PROTOCOL.md

key-decisions:
  - "Keep the item list optional so legacy browser captures remain valid."
  - "Treat missing, malformed, or inconsistent visible time evidence as unknown recency."
  - "Keep the protocol delta local and pending written voice-owner review before merge or push."

patterns-established:
  - "Visible item capture: keep only bounded generic article/list-item text and document-local element references."
  - "Capture continuity: carry item IDs forward only when capture ID, revision, tab, and canonical page URL all match."

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-10-18
---

# Phase 08 Plan 08-01: Bounded Visible Item Capture Summary

**Generic visible item capture now exposes bounded article/list-item records with conservative date evidence and exact page identity binding.**

## Performance

- **Duration:** Approximately 6 min
- **Started:** 2026-10-18T07:04:24Z
- **Completed:** 2026-10-18T07:10:47Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added optional, identity-bound `BrowserContentItem` records and the closed `read-item` request/result schema. Legacy capture responses without items remain valid; records are limited to 20 items, 400 code points each, and 4,000 total.
- Captured generic visible top-level `article` and `role=listitem` candidates with capture-local IDs and document references. Only visible semantic `time` evidence whose displayed strict ISO-8601 value agrees with its `datetime` contributes a date; all other evidence stays unknown.
- Stored accepted items in the server's active capture state, filtering out stale identities and ignoring item arrays from non-capture results. Documented the local protocol delta and retained the existing same-origin, click-safe link rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define bounded generic visible-item contracts** - `a790f6c` (`feat`)
2. **Task 2: Capture semantic visible items in the extension and unit tests** - `d5179e1` (`feat`)
3. **Task 3: Store and validate current item captures in core** - `ebbf7bb` (`feat`)

**Plan metadata:** Summary and workstream state/roadmap are recorded in the plan metadata commit.

## Files Created/Modified

- `packages/protocol/src/payloads-browser.ts` - Optional bounded item capture and identity-bound `read-item` schemas.
- `packages/protocol/test/browser-control.test.ts` - Item bounds, malformed dates, identity mismatch, and legacy compatibility coverage.
- `apps/extension/src/content/browser-content.ts` - Generic visible item extraction, strict date corroboration, and capture-local references.
- `apps/extension/src/content/browser-content.test.ts` - Semantic dates, tied/missing/malformed evidence, nested/hidden exclusion, and bounds.
- `apps/server/src/browser/commands.ts` - Item records in the active `BrowserCapture` type.
- `apps/server/src/browser/executor.ts` - Accept item records only from capture results and preserve them across exact-identity results.
- `apps/server/src/browser/content.test.ts` - Capture retention, identity invalidation, and rejection of mismatched item records.
- `apps/server/src/browser/acceptance.test.ts` - Fail-closed fake response for `read-item` until the next plan implements routing.
- `apps/server/src/session/session.ts` - Filter stored references against the exact accepted identity.
- `PROTOCOL.md` - Bounded item contract, local review status, and unchanged link restriction.

The protocol lock generator ran successfully and made no file change; the lock currently records message permissions and does not serialize browser operation schemas.

## Decisions Made

- Kept `items` optional so old peers and captures continue to validate.
- Produced recency only from visible semantic `time` elements whose displayed value and `datetime` parse as the same strict ISO-8601 instant.
- Kept raw item text in the active in-memory Session only; no logging or persistence was added.
- Marked the shared protocol addition as local pending written voice-owner review; it must remain unmerged and unpushed until that review is recorded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept the exhaustive browser acceptance fake closed for `read-item`**
- **Found during:** Task 3 (Store and validate current item captures in core)
- **Issue:** Adding the new closed operation exposed a missing branch in the browser acceptance fixture and blocked typecheck.
- **Fix:** Added a deterministic `unavailable` result for `read-item`; the fixture does not implement routing ahead of plan 08-02.
- **Files modified:** `apps/server/src/browser/acceptance.test.ts`
- **Verification:** Focused server/protocol tests and `npm run typecheck` passed.
- **Committed in:** `ebbf7bb` (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** The small fixture update was necessary to keep the test adapter type-safe; no routing scope was pulled forward.

## Issues Encountered

The root typecheck initially caught the missing fake `read-item` branch, which was fixed as described above. All final focused checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 08-02 can implement live `read-item` revalidation against the stored capture-local reference. The shared protocol changes remain local pending written voice-owner review, and link opening remains same-origin plus click-safe.

## Self-Check: PASSED

- Summary and all 10 listed modified files exist.
- Task commits `a790f6c`, `d5179e1`, and `ebbf7bb` exist in git history.
- Final focused tests and typecheck passed.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*
