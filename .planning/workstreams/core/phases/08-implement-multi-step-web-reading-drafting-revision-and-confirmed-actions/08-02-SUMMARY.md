---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-02
subsystem: browser-control
tags: [extension, BrowserExecutor, jsdom, identity-binding, live-dom]

# Dependency graph
requires:
  - phase: 08-01
    provides: Bounded visible items and capture-local DOM references bound to BrowserPageIdentity
provides:
  - Typed read-item requests and responses on the existing content message channel
  - Live DOM revalidation through the extension background dispatcher
  - Server acceptance and active-capture update only for exact current item results
  - Synthetic end-to-end BrowserExecutor to content handler route coverage
affects: [08-03-item-resolution, phase-08-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed identity-bound content routing, live DOM text/date equality checks, fake browser API integration]

key-files:
  created:
    - apps/extension/src/background/read-item.integration.test.ts
  modified:
    - apps/extension/src/shared/messages.ts
    - apps/extension/src/content/browser-content.ts
    - apps/extension/src/content/browser-content.test.ts
    - apps/extension/src/background/browser.ts
    - apps/extension/src/background/browser.test.ts
    - apps/server/src/browser/executor.ts
    - apps/server/src/browser/content.test.ts

key-decisions:
  - "Keep read-item on the existing browser-content message channel and top-frame handler, carrying the exact capture identity and item ID."
  - "Accept a successful result only when the current session tab, captured item, request and operation IDs, page identity, frame, text, and date all match."

patterns-established:
  - "Content reads revalidate the retained element's connection, visibility, semantic eligibility, bounded text, and date evidence before returning data."
  - "The background checks the live tab and canonical page URL both before and after content dispatch; core rechecks its active capture after the hub response."

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-10-18
---

# Phase 08 Plan 08-02: Full Identity-Bound Item Read Summary

**Typed `read-item` requests now travel from the server executor through the extension to a live DOM revalidation result, with stale content rejected at each boundary.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-18T07:10:50Z
- **Completed:** 2026-10-18T07:16:19Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added typed `read-item` request and result members to the existing content message union; `content/index.ts` continues to use its single `browser-content` listener.
- Revalidated the captured element's connection, visibility, semantic eligibility, bounded text, date evidence, capture identity, and top-frame identity before returning any item data.
- Routed reads through the extension's current-tab checks before and after content dispatch, then validated the response against the current server session tab and capture before updating its active item record.
- Added synthetic tests spanning the real BrowserExecutor, background dispatcher, typed content handler, and jsdom document. Changed item content and changed pages produce typed failures with no usable text.
- Kept the existing same-origin and click-safe link policy unchanged; no protocol package, voice-owned files, external provider, or real browser/account was used.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the typed content message and live read-item handler** - `dd4523f` (`feat`)
2. **Task 2: Route read-item through extension background and server BrowserExecutor** - `9aebcbf` (`feat`)
3. **Task 2 verification coverage: Reject mismatched operation results** - `0e30524` (`test`)

**Plan metadata:** Summary and workstream state/roadmap are recorded in the metadata commit.

## Files Created/Modified

- `apps/extension/src/shared/messages.ts` - Typed item request and result on the existing content channel.
- `apps/extension/src/content/browser-content.ts` - Live item validation against capture-local element, text, date, and identity.
- `apps/extension/src/content/browser-content.test.ts` - Live read, changed text/date, hidden/disconnected element, stale identity, wrong frame, and unknown ID cases.
- `apps/extension/src/background/browser.ts` - Current-page checks, content dispatch, and identity/item response validation.
- `apps/extension/src/background/browser.test.ts` - Routing, response identity, and before/after live-page check regressions.
- `apps/extension/src/background/read-item.integration.test.ts` - Synthetic full route through BrowserExecutor, dispatcher, handler, and DOM.
- `apps/server/src/browser/executor.ts` - Current session tab/capture/result checks and validated active item update.
- `apps/server/src/browser/content.test.ts` - Server rejection cases for mismatched request, operation, item, text/date, capture, and tab state.

## Decisions Made

- Reused the existing typed browser-content message channel and handler rather than creating a parallel message path.
- Required the returned text/date to equal the server's captured item after the extension's live DOM check. This keeps changed or mismatched values from being accepted as current content.
- Kept successful item reads limited to the top frame and exact current page/capture identity.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

- `apps/extension/src/background/browser.ts:487` retains the pre-existing generic unsupported-operation fallback. It is outside the `read-item` route and does not prevent this plan's goal.

## Issues Encountered

- The first focused verification run found an overly broad identity assertion in the integration test and a TypeScript narrowing issue in background response validation. Both were corrected before the final verification run.

## User Setup Required

None - deterministic synthetic DOM and fake browser APIs were used.

## Next Phase Readiness

Plan 08-03 can resolve user-directed items from the active capture and invoke the now-complete live read path. Shared protocol review status and the narrower visible-link policy remain unchanged.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*

## Self-Check: PASSED

- All eight implementation files and this summary exist.
- Task commits `dd4523f`, `9aebcbf`, and `0e30524` exist in git history.
