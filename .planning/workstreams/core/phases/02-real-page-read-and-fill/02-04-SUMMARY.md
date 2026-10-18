---
phase: 02-real-page-read-and-fill
plan: 04
subsystem: infra
tags: [mv3, websocket, reconnect, vitest]

# Dependency graph
requires:
  - phase: 02-03
    provides: MV3 background shell and production-origin WebSocket connection
provides:
  - Injectable reconnect, replacement holdoff, and pong timeout policy
  - MV3 socket keepalive and reconnection lifecycle
  - Synchronous worker wake listeners and periodic recovery alarm
affects: [phase-02-extension, server-restart-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns: [injectable socket timing policy, idempotent ensureConnected wake path]

key-files:
  created:
    - apps/extension/src/background/socket-state.ts
    - apps/extension/test/socket-state.test.ts
    - apps/extension/test/background-listeners.test.ts
  modified:
    - apps/extension/src/background/socket.ts
    - apps/extension/src/background/index.ts

key-decisions:
  - "Use 500 ms to 10 s exponential backoff with 0.8–1.2 jitter, reset on open."
  - "Pause reconnects for 30 seconds after a replaced close and close peers missing pong for 10 seconds."
  - "Recreate the 30-second alarm on module load, install, and browser startup."

requirements-completed: [PAGE-05]

# Metrics
duration: 4m
completed: 2026-10-16
---

# Phase 2 Plan 4: Socket Reconnect and Worker Keepalive Summary

**MV3 socket recovery now uses deterministic jittered backoff, replacement holdoff, pong deadlines, and a recurring worker wake alarm.**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-10-17T02:51:00Z
- **Completed:** 2026-10-17T02:54:54Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added clock/random-injectable socket policy with capped exponential backoff, reset on open, a 30-second replacement delay, and a 10-second pong deadline.
- Integrated periodic pings, dead-peer closure, stale-close protection, and reconnect scheduling into the background socket.
- Registered worker wake listeners synchronously and refresh the 30-second alarm at module load, install, and browser startup.
- Added deterministic policy tests and listener lifecycle tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the pure reconnect and dead-peer policy** - `2beb081` (test), `8518b98` (feat)
2. **Task 2: Keep the service-worker socket alive and register listeners synchronously** - `9e2fa94` (test), `ae87595` (feat)

## Files Created/Modified

- `apps/extension/src/background/socket-state.ts` - Injectable reconnect and peer-liveness policy.
- `apps/extension/src/background/socket.ts` - Backoff, replacement delay, ping/pong timeout, and typed pre-welcome request failures.
- `apps/extension/src/background/index.ts` - Synchronous startup/install/alarm listeners with alarm recreation.
- `apps/extension/test/socket-state.test.ts` - Deterministic backoff, reset, replacement, and pong tests.
- `apps/extension/test/background-listeners.test.ts` - Module-load, startup, install, and alarm wake tests.

## Decisions Made

- Kept timing policy independent of browser APIs so reconnect and liveness behavior can be tested with an injected clock and random source.
- Used the protocol's `CLOSE_CODES.replaced` code to distinguish a replacement close from an ordinary server restart.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ignore stale socket close events**
- **Found during:** Task 2 (Keep the service-worker socket alive and register listeners synchronously)
- **Issue:** A late close event from an older socket could clear keepalive state belonging to a newer socket.
- **Fix:** Only the currently-owned socket can clear shared timers/state or schedule another reconnect.
- **Files modified:** `apps/extension/src/background/socket.ts`
- **Verification:** `npm run typecheck`, listener tests, and `npm run ext:smoke` passed.
- **Committed in:** `ae87595`

**2. [Rule 2 - Missing Critical] Recreate the periodic alarm on browser startup**
- **Found during:** Task 2 (Keep the service-worker socket alive and register listeners synchronously)
- **Issue:** Startup reconnected the socket but did not ensure the terminated-worker recovery alarm existed.
- **Fix:** Recreate the 30-second alarm on startup as well as install and module evaluation.
- **Files modified:** `apps/extension/src/background/index.ts`, `apps/extension/test/background-listeners.test.ts`
- **Verification:** Startup listener test confirms alarm recreation; the complete plan verification passed.
- **Committed in:** `ae87595`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes protect the requested reconnect and worker recovery behavior.

## Verification

- `npx vitest run apps/extension/test/socket-state.test.ts` - passed (4 tests)
- `npm run typecheck` - passed
- `npx vitest run apps/extension/test/background-listeners.test.ts` - passed (3 tests)
- `npm run ext:smoke` - passed; Edge 155 connected with the pinned extension Origin.
- Temporary Edge restart smoke harness (removed after execution) - passed; observed a second production extension bind after closing and restarting the server on the same port.

## Issues Encountered

- The initial listener test exposed that browser startup reconnected without recreating the alarm; the startup path was updated and retested.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `apps/extension/src/background/index.ts:20` - Runtime messages return `not-ready` until later extension dispatch work is implemented.
- `apps/extension/src/background/socket.ts:67` - Snapshot requests return a correlated `not-ready` response until snapshot capture is implemented.
- `apps/extension/src/background/socket.ts:78` - Act requests return a correlated `not-implemented` response until action dispatch is implemented.

These are intentional interim responses required by the background shell; they do not prevent this plan's socket lifecycle goal.

## Next Phase Readiness

- Socket recovery policy and the MV3 worker wake path are ready for later extension dispatch work.
- The 40-second server-restart and two-minute idle checks remain part of the longer manual verification checklist.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Summary file exists.
- All four task commits exist in git history.
