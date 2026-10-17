---
phase: 02-real-page-read-and-fill
plan: 03
subsystem: extension
tags: [chrome-mv3, edge, esbuild, websocket, browser-smoke]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: Approved extension workspace and exact esbuild dependency pin from plan 02-02
provides:
  - Pinned-key MV3 manifest and deterministic background/content IIFE build
  - Minimal service worker socket and idempotent content-script shell
  - Production-Origin browser connection tracer with Chrome/Edge discovery
affects: [02-real-page-read-and-fill extension plans, Phase 2 verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inject the frozen protocol public key and a validated loopback WebSocket URL at build time
    - Exercise extension Origin acceptance with a real browser in a unique dedicated profile

key-files:
  created:
    - apps/extension/manifest.template.json
    - apps/extension/build.ts
    - apps/extension/src/background/index.ts
    - apps/extension/src/background/socket.ts
    - apps/extension/src/content/index.ts
    - apps/extension/test/build.test.ts
    - apps/extension/test/e2e/harness.ts
    - apps/extension/test/e2e/connect.e2e.test.ts
    - scripts/browser.ts
    - scripts/ext-smoke.ts
  modified: []

key-decisions:
  - "Keep the manifest key sourced from @blip/protocol and reject test socket URLs outside explicit ws://127.0.0.1:<port>/ws endpoints."
  - "Use BLIP_BROWSER first, then Chrome, then Edge; run automated Edge checks in a unique .chrome-profile subdirectory."
  - "Keep snapshot and action handlers fail-closed until their later extension plans implement page dispatch."

patterns-established:
  - "Bundle MV3 entries as IIFEs with esbuild and emit a readable generated manifest."
  - "Treat the production-mode extension bind log as tracer readiness; do not add a health endpoint for the test."

requirements-completed: [PAGE-05]

# Metrics
duration: 8m
completed: 2026-10-17
---

# Phase 2 Plan 3: MV3 Build and Connection Tracer Summary

**A pinned-key MV3 extension shell builds reproducibly and binds to the production server from Edge 155 under the frozen extension Origin.**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-10-17T02:38:00Z
- **Completed:** 2026-10-17T02:45:51Z
- **Tasks:** 3/3
- **Files modified:** 10 planned files

## Accomplishments

- Added the hand-written MV3 manifest template with the pinned key, Chrome 116 minimum, requested permissions, related-frame injection flags, and exact 7777/5173 loopback exclusions.
- Built deterministic `background.js` and `content.js` IIFEs. The worker sends `hello`, waits for its matching `welcome`, maintains the socket, and returns typed not-ready responses until later plans implement dispatch. The content shell is idempotent and performs no page actions.
- Added browser discovery and a real-browser tracer. It launched Microsoft Edge 155.0.4283.45 from `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, loaded the extension in a unique `.chrome-profile\smoke-*` profile, and observed the production server bind for the pinned extension Origin.
- No packages were installed or added.

## Task Commits

1. **Task 1: Build the minimal MV3 manifest and deterministic bundles** - `2f7ba62` (`feat`)
2. **Task 2: Add the initial socket worker and content shell** - `5cd2003` (`feat`)
3. **Task 3: Prove the service worker binds under the production Origin** - `2b03da0` (`test`)

**Plan metadata:** The summary is committed separately; shared state and roadmap updates are left for the parent wave reconciliation.

## Files Created

- `apps/extension/manifest.template.json` - MV3 identity, permissions, frame injection, and loopback exclusions.
- `apps/extension/build.ts` - Key injection, safe WebSocket URL validation, and esbuild output.
- `apps/extension/src/background/index.ts` - Synchronous worker listeners and reconnect alarm.
- `apps/extension/src/background/socket.ts` - Hello/welcome-gated socket, keepalive, reconnect, and typed not-ready replies.
- `apps/extension/src/content/index.ts` - Idempotent inert content-script shell.
- `apps/extension/test/build.test.ts` - Manifest and loopback URL assertions.
- `apps/extension/test/e2e/harness.ts` - Production-mode server and isolated browser lifecycle.
- `apps/extension/test/e2e/connect.e2e.test.ts` - Browser discovery tests and opt-in browser connection test.
- `scripts/browser.ts` - `BLIP_BROWSER`, Chrome, then Edge resolution.
- `scripts/ext-smoke.ts` - Direct smoke-test entry point.

## Verification

- `npm run typecheck` - passed.
- `npm run ext:typecheck` - passed.
- `npx vitest run apps/extension/test/build.test.ts apps/extension/test/e2e/connect.e2e.test.ts` - 5 passed, 1 browser test skipped unless `BLIP_E2E_BROWSER=1`.
- `npm run ext:build` - passed; emitted the manifest and both bundles.
- `npx tsx scripts/ext-smoke.ts` - passed on Edge 155. The production server logged `connection bound` for role `extension`; because the server ran with `dev: false` and the pinned extension ID, this proves the accepted Origin was `chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp`.

The user's existing Edge window remained open (window process PID 10540). The harness used a separate profile and only signaled the child process it spawned; it did not run `taskkill` or terminate processes by image name.

## Decisions Made

- The tracer uses the production server's connection-bind log for readiness, as required by the plan.
- The browser test profile is a unique child directory under `.chrome-profile`, so the user's ordinary Edge profile is not reused.
- Only the smoke URL is configurable at build time, and it must use explicit `ws://127.0.0.1:<port>/ws` syntax.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept build tests independent from esbuild's Node runtime invariant**
- **Found during:** Task 1 (Build the minimal MV3 manifest and deterministic bundles)
- **Issue:** Importing `build.ts` in the extension's jsdom test environment loads esbuild, which rejects jsdom's `TextEncoder`/`Uint8Array` pairing before tests run.
- **Fix:** Test the browser-safe socket URL validator directly from the worker source while retaining build-time validation in `build.ts`.
- **Files modified:** `apps/extension/build.ts`, `apps/extension/test/build.test.ts`
- **Verification:** Build tests passed in jsdom; `npm run ext:build` passed in Node.
- **Committed in:** `2f7ba62`

**2. [Rule 3 - Blocking] Ran browser automation in Vitest's Node environment**
- **Found during:** Task 3 (Prove the service worker binds under the production Origin)
- **Issue:** The default jsdom environment cannot load the esbuild-backed harness and also supplies a non-file `import.meta.url` for the manifest test.
- **Fix:** Mark the browser E2E test as Node-environment and resolve the manifest fixture from the repository working directory.
- **Files modified:** `apps/extension/test/build.test.ts`, `apps/extension/test/e2e/connect.e2e.test.ts`
- **Verification:** The combined Vitest run passed (5 passed, 1 opt-in browser test skipped); the direct real-browser tracer passed.
- **Committed in:** `2f7ba62`, `2b03da0`

**3. [Rule 1 - Type Compatibility] Used environment-neutral timer handle types**
- **Found during:** Task 2 (Add the initial socket worker and content shell)
- **Issue:** Root TypeScript includes Node timer overloads while the extension compiler sees browser timer handles.
- **Fix:** Typed the timer handles as `ReturnType<typeof setTimeout>` and `ReturnType<typeof setInterval>`.
- **Files modified:** `apps/extension/src/background/socket.ts`
- **Verification:** Root and extension typechecks passed.
- **Committed in:** `5cd2003`

---

**Total deviations:** 3 automatic fixes (2 Rule 3, 1 Rule 1). No new dependencies or shared planning files were changed.

## Known Stubs

- `apps/extension/src/content/index.ts:5` - The content shell only marks itself installed; later extension plans add the DOM walker and observer.
- `apps/extension/src/background/socket.ts:65` - `snapshot.request` returns a typed not-ready result until snapshot capture is implemented.
- `apps/extension/src/background/socket.ts:76` - `act.request` returns a typed not-implemented result until action dispatch is implemented.
- `apps/extension/src/background/socket.ts:86` - Other server-to-extension frames are inert in this initial shell; later plans add their handlers.
- `apps/extension/src/background/index.ts:13` - Runtime messages receive a typed not-ready result until local dispatch is implemented.

These stubs are intentional outputs of this plan's minimal shell and do not block the build identity or production-Origin connection goal.

## Issues Encountered

- At execution time, the root `ext:smoke` alias was not yet present, so the browser tracer was run directly with `npx tsx scripts/ext-smoke.ts`. Plan 02-13 has since added the alias in commit `d523708`; it delegates to the same script, whose real-browser run already passed.
- The initial test runs exposed the jsdom/esbuild and timer-type issues documented above; final checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The extension now has a stable build identity and a real production-Origin socket connection path.
- Later extension plans can add snapshot capture, action dispatch, and content-script page observation to the existing shell.
- The teammate Chrome repeat remains scheduled before I1; local smoke used Edge because Chrome is absent on this machine.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All ten planned implementation files and this summary exist.
- Task commits `2f7ba62`, `5cd2003`, and `2b03da0` exist in git history.
