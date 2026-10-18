---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-08
subsystem: infra
tags: [edge, demo, websocket, vitest]

# Dependency graph
requires:
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: "The extension, fake-brain server, and local hostile-page fixture used by the demo launcher."
provides:
  - "A one-command fake-brain demo in the repo-local Edge profile."
  - "A real Edge smoke pass that waits for the unpacked extension to connect."
  - "Profile detection that recognizes Edge's Secure Preferences record."
affects: [PROT-03, 05-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rebuild the demo bundle only when its embedded loopback WebSocket URL is stale."
    - "Check Chromium Preferences and Edge Secure Preferences within the dedicated profile."

key-files:
  created:
    - .planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-08-SUMMARY.md
  modified:
    - scripts/demo.ts
    - scripts/demo.test.ts
    - package.json
    - docs/demo.md

key-decisions:
  - "Keep the demo extension load one-time and profile-local; never pass --load-extension to branded Chrome."
  - "Rebuild when dist/background.js does not target the demo's fixed port 7777, preventing a prior E2E build from pinning a stale ephemeral port."
  - "Recognize Edge extension registration in Secure Preferences while preserving Chromium Preferences and installed-directory checks."

patterns-established:
  - "A smoke pass requires both the dedicated-profile extension record and the server's real extension connection."
  - "The demo launcher reports success only after the extension role binds to the loopback hub."

requirements-completed: []

# Metrics
duration: 28min
completed: 2026-10-17
---

# Phase 5 Plan 08: Isolated Local Demo Summary

**The fake-brain demo now detects Edge's unpacked install, repairs stale demo bundles, and passes a real extension-connected smoke in its dedicated profile.**

## Performance

- **Duration:** 28 minutes
- **Started:** 2026-10-17T17:41:14Z
- **Completed:** 2026-10-17T18:09:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Enabled Developer mode and loaded `apps/extension/dist` only in `.chrome-profile/demo`.
- Updated the launcher to recognize unpacked extension records in Edge's `Default/Secure Preferences` as well as Chromium's `Default/Preferences`.
- Made the launcher rebuild its extension bundle when it contains a stale socket URL from a previous E2E run.
- Ran `npm run demo -- --brain=fake --smoke` on Edge. The server logged `connection bound` for the extension and the launcher printed `BLIP_DEMO_SMOKE=PASS extension-connected=true profile=dedicated`.

## Task Commits

1. **Task 1: Implement the isolated demo orchestrator and root command** - `a94ccf9`, `815740f`, `ba78466`
2. **Task 2: Document one-time setup and run the isolated fake demo smoke** - `7e2a0e7`, `3e27c89`

**Plan metadata:** this summary and state update

## Files Created/Modified

- `scripts/demo.ts` - Validates the dedicated-profile extension record and rebuilds stale demo bundles against port 7777.
- `scripts/demo.test.ts` - Covers Edge's secure profile preference record.
- `package.json` - Adds the root demo entry point and test discovery from the original plan.
- `docs/demo.md` - Documents setup, the fake demo, and the optional voice target from the original plan.

## Decisions Made

- Kept extension installation confined to the dedicated demo profile.
- Kept `PROT-03` open because the voice client/window is not present in this checkout.

## Deviations from Plan

### Auto-fixed Issues

**1. Edge profile detection omitted Secure Preferences**
- **Found during:** Task 2 smoke verification.
- **Issue:** Edge stored the unpacked extension record in `Default/Secure Preferences`, so the launcher reported the installed extension as missing.
- **Fix:** Check both Chromium preference files and add a regression test.
- **Files modified:** `scripts/demo.ts`, `scripts/demo.test.ts`.
- **Verification:** `npx vitest run scripts/demo.test.ts` passed; real Edge smoke passed.
- **Committed in:** `ba78466`.

**2. Existing E2E output embedded an obsolete ephemeral socket port**
- **Found during:** Task 2 smoke verification.
- **Issue:** `dist/background.js` targeted port 52346 while the demo server listened on 7777; the launcher skipped rebuilding because `manifest.json` already existed.
- **Fix:** Rebuild the extension when the bundle does not contain the demo's fixed WebSocket URL, then reload the unpacked extension from its directory.
- **Files modified:** `scripts/demo.ts`.
- **Verification:** Confirmed the refreshed Edge service worker connected to port 7777; the final smoke printed the pass marker.
- **Committed in:** `ba78466`.

---

**Total deviations:** 2 auto-fixed (2 blocking correctness issues)
**Impact on plan:** Both fixes were required for the planned Edge smoke to exercise the current extension and correctly detect its installation.

## Issues Encountered

- The Windows folder picker initially returned a stale `Desktop\\stats` selection. I closed the stale picker and selected the exact `apps/extension/dist` directory in the dedicated profile.
- An earlier smoke timed out until the stale extension bundle was reloaded from Edge's extension card. The final launcher smoke passed after that one-time refresh.

## Verification

- `npx vitest run scripts/demo.test.ts` - passed, 15 tests.
- `npm run typecheck` - passed.
- `npm test` - passed, 78 files and 828 tests; 13 files and 22 tests skipped by their existing opt-in gates.
- `$env:BLIP_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm run demo -- --brain=fake --smoke` - passed; server observed the extension connection and the dedicated Edge profile was cleaned up afterward.

## User Setup Required

None for the local fake-brain smoke. A voice client target remains unavailable and is not simulated.

## Next Phase Readiness

- Local Phase 5 demo smoke is complete.
- Plan 05-04 must stop at the direct voice-owner sign-off checkpoint for the exact warning fields. Plans 05-05 through 05-07 remain gated on that approval.
- Phase 4 still lacks successful live-provider evidence; Phase 5 real-Claude, real-site, voice-window, and freeze criteria remain pending.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary artifact exists and matches the completed 05-08 work.
- Task commits `a94ccf9`, `815740f`, `ba78466`, `7e2a0e7`, and `3e27c89` exist.
- The final smoke marker was emitted after the server logged the extension connection.
