---
phase: 02-real-page-read-and-fill
plan: 05
subsystem: extension-runtime
tags: [chrome-mv3, content-script, reconnect, vitest]

# Dependency graph
requires:
  - phase: 02-03
    provides: MV3 extension build, pinned identity, and real-browser connection harness
  - phase: 02-04
    provides: Existing extension content and background runtime foundation
provides:
  - Best-effort all-frame content-shell injection into existing HTTP(S) tabs on install/update
  - Idempotent content ping listener restricted to this extension's sender
  - Correlated typed failures while snapshot/action dispatch is not ready
  - Real-browser proof of reconnect after a same-port server restart
affects: [02-real-page-read-and-fill, extension-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.allSettled isolates best-effort tab injection failures
    - Protocol replies preserve request correlation with replyTo
key-files:
  created:
    - apps/extension/src/background/inject.ts
    - apps/extension/test/content-install.test.ts
    - apps/extension/test/browser.test.ts
    - apps/extension/test/e2e/reconnect.e2e.test.ts
  modified:
    - apps/extension/src/background/index.ts
    - apps/extension/src/content/index.ts
    - apps/extension/test/background-listeners.test.ts
key-decisions:
  - "Exclude Blip's localhost pages on ports 7777 and 5173 from install-time injection."
  - "Represent the current action-dispatch fallback with the frozen ActResult exception code and a not-implemented detail, preserving replyTo."
  - "Mark the content entrypoint as a TypeScript module; esbuild erases the marker and still emits the classic IIFE bundle."
patterns-established:
  - "Content-shell injection is guarded by an isolated-world marker so updates do not duplicate listeners."
  - "Browser E2E uses a unique child profile under .chrome-profile and terminates only its spawned browser process."
requirements-completed: [PAGE-05]

# Metrics
duration: 5min
completed: 2026-10-17
---

# Phase 2 Plan 5: Install and Restart Recovery Summary

**The extension reinjects its idempotent content shell into existing pages, replies to early requests with correlated failures, and reconnects after a live same-port server restart.**

## Performance

- **Duration:** 5 minutes
- **Started:** 2026-10-17T02:57:00Z
- **Completed:** 2026-10-17T03:02:03Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Added best-effort all-frame `content.js` injection for existing HTTP(S) tabs on extension install/update. Blip localhost pages and browser pages are skipped; failures in individual tabs do not interrupt other injections.
- Made repeated content-shell installation inert and added a ping response only for messages sent by this extension.
- Returned protocol-shaped `snapshot.result` and `act.result` failures with the request's `replyTo` when runtime dispatch is not ready.
- Added a real-browser restart test that closes and restarts the local server on the same port, then observes the extension reconnect without refreshing the page.

## Task Commits

1. **Task 1: Reinjection and idempotent content installation** - `d74a97c` (test), `ced2143` (feat)
2. **Task 2: Typed early replies and real-browser restart smoke** - `26b11fd` (test), `b2c789c` (feat)
3. **Extension workspace typecheck fix** - `3242964` (fix)

## Files Created/Modified

- `apps/extension/src/background/inject.ts` - Filters existing tabs and injects the content script in all frames with per-tab failure isolation.
- `apps/extension/src/background/index.ts` - Starts reinjection on install and returns typed early failures with correlation IDs.
- `apps/extension/src/content/index.ts` - Installs a single extension-only ping listener per isolated world.
- `apps/extension/test/content-install.test.ts` - Covers filtering, all-frame injection, failure isolation, and idempotence.
- `apps/extension/test/background-listeners.test.ts` - Covers install reinjection and correlated typed replies.
- `apps/extension/test/browser.test.ts` - Covers browser override and Chrome/Edge selection.
- `apps/extension/test/e2e/reconnect.e2e.test.ts` - Verifies recovery through a real browser after a same-port restart.

## Verification

- `npm run typecheck` - passed.
- `npx vitest run apps/extension/test/content-install.test.ts` - passed (3 tests).
- `npx vitest run apps/extension/test/background-listeners.test.ts apps/extension/test/browser.test.ts apps/extension/test/e2e/reconnect.e2e.test.ts` - passed (6 tests; the opt-in browser test was skipped in this default run).
- `npm run ext:typecheck` - passed after marking the content entrypoint as a TypeScript module.
- `npm run ext:build` - passed; verified `dist/content.js` contains no module export and remains a classic bundle.
- Focused extension tests after the typecheck fix - passed (9 tests; opt-in browser test skipped).
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/reconnect.e2e.test.ts` - passed in Microsoft Edge using a unique `.chrome-profile/reconnect-*` profile; the extension reconnected after the server restarted on the same port.
- `npm run ext:smoke` - passed; the pinned extension origin `chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp` bound to the local server.

## Decisions Made

- Injection skips localhost ports 7777 and 5173, where Blip's server and development page run.
- `ActResult.error` is a frozen enum without a `not-implemented` member, so early action failures use its `exception` value and carry `not-implemented` in `detail`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Implemented the restart browser lifecycle inside the listed reconnect test**
- **Found during:** Task 2 (typed early replies and real-browser restart smoke)
- **Issue:** The existing connection harness shuts down after its first successful bind and cannot exercise a server restart; its harness file is outside this plan's modified-file list.
- **Fix:** Added the restart lifecycle to `reconnect.e2e.test.ts`, reusing `scripts/browser.ts` browser selection and the existing extension build flow. It creates a unique child profile and closes only the browser process it spawned.
- **Files modified:** `apps/extension/test/e2e/reconnect.e2e.test.ts`
- **Verification:** Opt-in real-browser restart test passed; `npm run ext:smoke` also passed.
- **Committed in:** `b2c789c`

**2. [Rule 3 - Blocking] Marked the content entrypoint as a TypeScript module for workspace checks**
- **Found during:** Final extension workspace typecheck
- **Issue:** TypeScript reported TS2306 because the content entrypoint had no imports/exports, so the test could not dynamically import it.
- **Fix:** Added an erased `export {}` module marker; esbuild still emits the content script as a classic IIFE.
- **Files modified:** `apps/extension/src/content/index.ts`
- **Verification:** `npm run ext:typecheck`, focused extension tests, and `npm run ext:build` passed; the built content bundle contains no module export.
- **Committed in:** `3242964`

**Total deviations:** 2 auto-fixed (Rule 3)
**Impact on plan:** Both fixes support the planned recovery proof without changing the runtime contract or adding a new dependency.

## Issues Encountered

- No runtime or browser issues. Both isolated browser runs cleaned up their unique profile directories and owned child processes.

## User Setup Required

None.

## Next Phase Readiness

The install/update recovery path and early correlated failures are ready for later snapshot and action dispatch modules to replace the typed fallback behavior.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the requested phase path.
- All five task and validation-fix commits are present in git history.
