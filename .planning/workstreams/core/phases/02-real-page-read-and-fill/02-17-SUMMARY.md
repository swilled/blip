---
phase: 02-real-page-read-and-fill
plan: 17
subsystem: extension-background
tags: [typescript, chrome-extension, acts, frames, privacy, browser-tests]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: Frame-qualified snapshots and structural versions from 02-11, plus live-checked content acts and submit suppression from 02-16.
provides:
  - Live service-worker ActRequest routing to the owning frame, followed by a fresh sanitized snapshot version.
  - Real-browser coverage for React read-back, sensitive-shape redaction, same/cross-origin frames, shadow roots, and select submit behavior.
affects: [02-20, extension-act-routing, page-privacy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Validate frame-qualified targets against a fresh merged snapshot before dispatching to that browser frame.
    - Recheck action results for sensitive shapes and recapture after every attempted act before returning to the server.
    - Use a unique browser profile per real-browser fixture and stop only the process owned by that harness.

key-files:
  created:
    - apps/extension/src/background/acts.ts
    - apps/extension/test/e2e/frames-shadow.e2e.test.ts
    - apps/extension/test/e2e/react-fill.e2e.test.ts
    - apps/extension/test/e2e/select-autosubmit.e2e.test.ts
  modified:
    - apps/extension/src/background/dispatch.ts
    - apps/extension/src/background/frames.ts
    - apps/extension/src/background/socket.ts
    - apps/extension/src/content/index.ts
    - apps/extension/src/content/submit-guard.ts
    - apps/extension/test/acts-sw.test.ts
    - apps/extension/test/e2e/harness.ts
    - apps/extension/test/submit-guard.test.ts

key-decisions:
  - "The background validates the parsed frame ID against the fresh snapshot; content derives the qualified target frame when tabs.sendMessage does not provide a frameId."
  - "A card-shaped observed value is returned as sensitive-field with a null observation, and the post-act snapshot is refreshed and sanitized before reply."
  - "Submit suppression uses window capture so an earlier page document-capture listener cannot observe an implicit submit; the listener is removed after the final act scope exits."
  - "The cross-origin fixture is readable and fillable under current extension host permissions; the one-alert fallback remains for unavailable visible frames."

patterns-established:
  - "All live ActRequests enter through the socket dispatcher and travel to the content handler in the target frame."
  - "Post-cleanup ordinary submission is tested by a fixture-only page-side DevTools evaluation; product actions never use CDP."

requirements-completed: [ACT-01, ACT-02, ACT-04, PAGE-03]

# Metrics
duration: approximately 15min
completed: 2026-10-16
---

# Phase 2 Plan 17: Live Frame Act Routing Summary

**The service worker now routes live actions to the owning frame, refreshes sanitized snapshots, and proves sensitive-value and implicit-submit protections in real browser pages.**

## Performance

- **Duration:** Approximately 15 minutes
- **Started:** 2026-10-16T23:18:00-04:00 (approximate)
- **Completed:** 2026-10-16T23:32:00-04:00 (approximate)
- **Tasks:** 2/2
- **Files modified:** 12

## Accomplishments

- Connected the socket dispatcher to a background ActRequest router that checks the current tab, frame-qualified target, expected snapshot version, and then sends the action to the owning frame.
- Refreshed after action results, including stale responses, and returned only a newly versioned snapshot result. The background boundary also strips Luhn/SSN-shaped read-back values and sanitizes merged frame snapshots.
- Added real-browser regressions for controlled React state, post-write card-shaped values, same-origin and cross-origin frames, open shadow roots, and native select auto-submit behavior.
- Confirmed a page document-capture listener cannot observe the implicit submit; normal `requestSubmit()` works after act cleanup.
- Added isolated fixture browser instrumentation for the post-cleanup submit assertion. The test harness uses DevTools only to call the fixture page's ordinary `requestSubmit()`; all extension acts use the real socket, service worker, and content-frame route.

## Task Commits

1. **Task 1: Route actions to the target frame and refresh sanitized snapshots** - `c82bd41` (tests), `d8f8658` (test adapter typing), `a668397` (implementation), `e921651` (stale-response refresh coverage).
2. **Task 2: Prove form behavior, privacy and cross-frame outcomes in the browser** - `b622a72` (frame identity and submit capture fixes), `52afe87` (browser regressions).

## Files Created/Modified

- `apps/extension/src/background/acts.ts` - Validates and routes frame-qualified ActRequests, sanitizes results, and refreshes the snapshot version.
- `apps/extension/src/background/dispatch.ts` - Sends acts to the selected browser frame through the frame adapter.
- `apps/extension/src/background/frames.ts` - Detects sensitive value shapes again at the background boundary and removes unsafe frame snapshot values.
- `apps/extension/src/background/socket.ts` - Delegates live ActRequests to the new background router.
- `apps/extension/src/content/index.ts` - Preserves target frame identity when the background message sender has no frame ID.
- `apps/extension/src/content/submit-guard.ts` - Blocks submit at window capture and restores the prior behavior during cleanup.
- `apps/extension/test/acts-sw.test.ts` - Covers correct frame dispatch, stale versions/responses, refreshed versions, and value redaction.
- `apps/extension/test/submit-guard.test.ts` - Proves document-capture observers see no submit during act and see normal submission afterward.
- `apps/extension/test/e2e/harness.ts` - Starts production-mode services and Edge with a unique child profile, plus fixture reports and page-side test control.
- `apps/extension/test/e2e/react-fill.e2e.test.ts` - Tests React state read-back and post-write card-shape refusal.
- `apps/extension/test/e2e/frames-shadow.e2e.test.ts` - Tests same-origin, cross-origin, and open shadow-root fills.
- `apps/extension/test/e2e/select-autosubmit.e2e.test.ts` - Tests implicit submit suppression and post-cleanup ordinary submission.

## Decisions Made

- The background remains authoritative for frame ownership: it parses the target ID and confirms that frame ID exists in the fresh merged snapshot before dispatch.
- The extension rechecks action output shape after each write, returns a null observation for sensitive-field outcomes, and refreshes before replying.
- Cross-origin frame field fill passed in the real browser (frame 7, `f7e1`) with no fallback alert.
- The submit guard must be at window capture because the fixture's page document-capture listener is installed earlier than the content guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking integration] Connected the real socket path to the act router**
- **Found during:** Task 1
- **Issue:** The plan omitted `socket.ts`, but without that dispatch branch the server's `act.request` messages could never reach the new router.
- **Fix:** Added the minimal socket import and act-request delegation.
- **Files modified:** `apps/extension/src/background/socket.ts`
- **Verification:** Service-worker unit tests, real-browser E2E tests, and extension smoke all passed.
- **Committed in:** `a668397`

**2. [Rule 1 - Frame routing bug] Preserve the target frame when the sender frame ID is absent**
- **Found during:** Task 2 browser verification
- **Issue:** `tabs.sendMessage` reports the background as sender, so `sender.frameId` was absent and the content listener defaulted a qualified iframe target to frame 0.
- **Fix:** Derive the frame ID from the strictly qualified target ID; the background still checks that frame against the fresh snapshot before sending.
- **Files modified:** `apps/extension/src/content/index.ts`
- **Verification:** Same-origin, cross-origin, and shadow browser actions passed.
- **Committed in:** `b622a72`

**3. [Rule 2 - Missing critical safety] Move submit suppression to window capture**
- **Found during:** Task 2 browser verification
- **Issue:** A page document-capture listener registered earlier could observe the implicit submit before a document-level content guard.
- **Fix:** Register the scoped blocker on `window` capture, retain reference counting, and remove it during cleanup. Added a regression observer and a post-cleanup submit assertion.
- **Files modified:** `apps/extension/src/content/submit-guard.ts`, `apps/extension/test/submit-guard.test.ts`
- **Verification:** Focused unit and select auto-submit browser tests passed.
- **Committed in:** `b622a72`

**Total deviations:** 3 auto-fixed (one required routing integration, one frame-routing correction, one safety-boundary correction). **Impact:** These changes connect the planned path and close issues exposed by browser verification; product action transport remains content-script based.

## Verification

- `npm run typecheck` - passed.
- `npm run ext:typecheck` - passed.
- `npx vitest run apps/extension/test/acts-sw.test.ts apps/extension/test/submit-guard.test.ts` - passed, 2 files / 8 tests after stale-response coverage was added.
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/frames-shadow.e2e.test.ts apps/extension/test/e2e/select-autosubmit.e2e.test.ts apps/extension/test/e2e/react-fill.e2e.test.ts --no-file-parallelism` - passed, 3 files / 5 real-browser tests.
- `npm run pages:build` - passed.
- `npm run ext:smoke` - passed; the extension connected in a dedicated headless Edge profile.
- `git diff --check` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Live server actions now traverse the full background-to-frame path and are covered by unit and production-mode browser tests. The cross-origin fixture succeeds under current host permissions, so the unavailable-frame fallback was not exercised in this run.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- All 12 implementation/test files listed above and this summary exist.
- Task commits `c82bd41`, `d8f8658`, `a668397`, `e921651`, `b622a72`, and `52afe87` exist in git history.
- `git diff --check` passed. The stub scan found no TODO/FIXME or placeholder implementation; “not available” matches are error messages only.
