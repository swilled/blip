---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-03
subsystem: browser-control
tags: [chrome-extension, browser-api, zod, vitest, authorization]

# Dependency graph
requires:
  - phase: 07-01
    provides: Typed browser operation and result schemas
  - phase: 07-02
    provides: Core BrowserExecutor with tracked, one-use, exact-phrase authorization
provides:
  - Extension-owned dispatch for validated browser.request operations
  - Safe direct navigation, reload, tab listing/activation, and blank-tab creation
  - Fail-closed browser-default search through Chrome's configured provider
  - Active-page, navigation, activation, and removal invalidation
affects: [07-04, 07-05, 07-06, phase-08]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed websocket dispatch, live tab/page rechecks, one-use operation authorization]

key-files:
  created:
    - apps/extension/src/background/browser.ts
    - apps/extension/src/background/browser.test.ts
    - apps/extension/test/browser/permissions.test.ts
  modified:
    - apps/extension/src/background/socket.ts
    - apps/extension/src/background/tabs.ts
    - apps/extension/src/background/navigation.ts
    - apps/extension/vitest.config.ts
    - apps/extension/manifest.template.json
    - apps/extension/test/build.test.ts
    - packages/protocol/src/payloads-browser.ts
    - packages/protocol/test/browser-control.test.ts
    - PROTOCOL.md

key-decisions:
  - "Dispatch browser.request from the extension WebSocket router, where server requests arrive; keep content-script runtime messages separate."
  - "Refuse browser-default search unless the focused active tab still matches the authorized source, because CURRENT_TAB targets that tab."
  - "Refuse history movement when the next destination cannot be established; do not call goBack or goForward."
  - "Keep additive browser-result schema and manifest permission changes local pending written voice-owner review; do not push or merge them."

patterns-established:
  - "Browser operations consume their one-use authorization before page, permission, or API checks, and repeat requests fail closed."
  - "about:blank is tracked as a navigation target but remains restricted for content capture."

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-10-18
---

# Phase 7 Plan 3: Execute Authorized Browser Operations Summary

**Extension browser requests now use live-checked tab operations and exact-query Chrome default search, with history and stale-page actions refused safely.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-18T05:48:30Z
- **Completed:** 2026-10-18T05:57:43Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Routed validated `browser.request` messages through the extension WebSocket dispatcher and returned typed `browser.result` responses.
- Added explicit canonical HTTP(S) navigation, native reload, tab list/activation, and tracked `about:blank` tab creation with repeated live-tab/page checks.
- Added one-use operation authorization consumption, history refusal without back/forward API calls, and invalidation on navigation, SPA changes, activation, and removal.
- Added browser-default search through `chrome.search.query` using the exact query and `CURRENT_TAB`; missing permission/API, changed source, or API rejection produces a typed refusal with no URL fallback.
- Added the local `search` permission and documented that permission and browser protocol deltas need written voice-owner review before merge or push.

## Task Commits

1. **Task 1: Route browser requests through background tab operations** - `880e839` (`feat`)
2. **Task 1 follow-up: Consume authorization before dispatch checks** - `88c91e3` (`fix`)
3. **Task 2: Add configured-provider browser search with permission failure** - `cf231ed` (`feat`)

## Files Created/Modified

- `apps/extension/src/background/browser.ts` - Typed dispatch, live tab checks, direct navigation, reload, tabs, search, and fail-closed unsupported operations.
- `apps/extension/src/background/browser.test.ts` - Fake Chrome coverage for authorization, stale pages, blank tabs, history refusal, reload, search, and invalidation.
- `apps/extension/src/background/socket.ts` - WebSocket routing for `browser.request` and typed `browser.result` replies.
- `apps/extension/src/background/tabs.ts` and `navigation.ts` - Blank-tab target tracking and page/capture invalidation.
- `apps/extension/vitest.config.ts` - Includes the source-side browser test path specified by the plan.
- `apps/extension/manifest.template.json`, `apps/extension/test/browser/permissions.test.ts`, and `apps/extension/test/build.test.ts` - Search permission and manifest coverage.
- `packages/protocol/src/payloads-browser.ts`, `packages/protocol/test/browser-control.test.ts`, and `PROTOCOL.md` - Typed history/invalid-request refusals and pending-review documentation.

## Decisions Made

- Core remains responsible for matching the exact user-requested target/action phrase; the extension accepts only the resulting operation-specific one-use authorization ID. A bare “yes” does not authorize navigation or search.
- `CURRENT_TAB` may affect the active tab in the focused window, so search is refused unless the live active tab matches the source tab and URL.
- The extension WebSocket router in `socket.ts` is the actual server-to-extension request boundary; `index.ts` handles internal runtime messages and is not used for server requests.
- Add `unsupported-destination-check`, `invalid-request`, and an `unknown` result operation to the local shared result schema so history and malformed requests can be refused with typed results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Routed requests through the actual WebSocket handler**
- **Found during:** Task 1
- **Issue:** The plan named `background/index.ts`, but that module handles internal Chrome runtime messages; server frames are dispatched by `background/socket.ts`.
- **Fix:** Registered `browser.request` on the existing WebSocket dispatch path and returned correlated `browser.result` frames there.
- **Files modified:** `apps/extension/src/background/socket.ts`
- **Verification:** Focused fake Chrome tests and extension build passed.
- **Committed in:** `880e839`

**2. [Rule 3 - Blocking] Enabled the planned source-side test path**
- **Found during:** Task 1
- **Issue:** Vitest only included `test/**`, so the plan's `src/background/browser.test.ts` command found zero tests.
- **Fix:** Added only `src/**/*.test.ts` and `src/**/*.spec.ts` to the extension test include patterns.
- **Files modified:** `apps/extension/vitest.config.ts`
- **Verification:** The exact planned command ran 12 browser tests successfully.
- **Committed in:** `880e839`

**3. [Rule 3 - Blocking] Added the missing permission test and fixed its manifest path**
- **Found during:** Task 2
- **Issue:** The planned `test/browser/permissions.test.ts` file did not exist, and the existing manifest test resolved paths from the repository root even when Vitest ran in the extension workspace.
- **Fix:** Added the focused permission test and resolved both test paths relative to their test files.
- **Files modified:** `apps/extension/test/browser/permissions.test.ts`, `apps/extension/test/build.test.ts`
- **Verification:** Both permission and manifest build tests passed.
- **Committed in:** `cf231ed`

**4. [Rule 2 - Missing critical typed refusal] Added closed result codes for history and malformed requests**
- **Found during:** Task 1
- **Issue:** The existing result schema had no `unsupported-destination-check` error or typed operation name for an invalid discriminant.
- **Fix:** Added `unsupported-destination-check`, `invalid-request`, and `unknown` to the additive browser result schema and its tests.
- **Files modified:** `packages/protocol/src/payloads-browser.ts`, `packages/protocol/test/browser-control.test.ts`
- **Verification:** Protocol browser-control tests passed.
- **Committed in:** `880e839`
- **Review status:** Local only pending written voice-owner review; no push or merge.

---

**Total deviations:** 4 auto-fixed (3 Rule 3, 1 Rule 2)
**Impact on plan:** Adjustments were needed to connect the real request path, run the plan's tests, and express fail-closed results in the typed contract. The plan's navigation, tab, search, and refusal requirements are covered.

## Known Stubs

- `open-link`, `capture`, `list-links`, `read-content`, `scroll`, and `find` return a typed `unavailable` result because this plan does not yet provide extension-owned visible-link/content captures. They remain fail-closed until a later Phase 7 plan supplies those captures; they do not perform a raw URL or DOM dispatch.

## Issues Encountered

- The first focused test invocation returned success with zero tests because the plan's source-side test file was outside Vitest's include globs; the include list was corrected and the prescribed command then ran the suite.
- The existing manifest test used a root-relative path that failed under workspace execution; path resolution now starts from each test file.

## User Setup Required

None. The manifest's `search` permission is a local delta pending written voice-owner review before merge or push.

## Next Phase Readiness

- The extension owns validated tab/navigation/search requests and checks active source identity before browser API dispatch.
- The shared browser-result additions and `search` manifest permission are committed locally and still require written voice-owner review before promotion.
- Visible link/content capture operations remain unavailable until a later Phase 7 plan provides the extension-side capture data.

---
*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Summary file exists at the planned phase path.
- Task commits `880e839`, `88c91e3`, and `cf231ed` are present in git history.
- Focused extension tests, protocol tests, extension typecheck, and extension build passed before summary creation.
