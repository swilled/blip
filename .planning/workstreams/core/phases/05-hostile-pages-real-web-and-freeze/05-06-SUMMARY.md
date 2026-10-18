---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-06
subsystem: warning-integration
tags: [gate-07, extension, session-state, repl]

# Dependency graph
requires:
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: "Bounded detector and approved optional protocol signal"
provides:
  - "Boolean-only warning propagation from captured frames into accepted voice state"
  - "REPL warning marker with no detector prose"
affects: [05-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregate warning detection across captured frames using boolean OR"
    - "Include warning-state changes in the page mutation signature"

key-files:
  created:
    - apps/server/test/injection-warning.test.ts
  modified:
    - apps/extension/src/content/snapshot.ts
    - apps/extension/src/shared/messages.ts
    - apps/extension/src/background/frames.ts
    - apps/extension/src/shared/signature.ts
    - apps/extension/test/snapshot.test.ts
    - apps/extension/test/frames.test.ts
    - apps/extension/test/signature.test.ts
    - apps/server/src/session/session.ts
    - tools/repl/src/repl.ts
    - tools/repl/test/repl.test.ts

key-decisions:
  - "Serialize only true from the extension; the server normalizes an accepted false or omitted signal to false in current page state."
  - "Ignore detector exceptions while preserving normal snapshot capture and action behavior."
  - "Carry true from any successfully captured frame and refresh page state when the warning bit changes."

patterns-established:
  - "Warning metadata never enters FormModel, page prose, grants, confirmation, or spoken output."

requirements-completed: []

# Metrics
duration: 15 min
completed: 2026-10-17
---

# Phase 5 Plan 06: Accepted Warning-State Integration Summary

**The local detector now reaches voice-facing state as one accepted boolean, including child frames, without carrying matched page text.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-17
- **Completed:** 2026-10-17
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Attached the detector's `true` result to content-frame snapshots and treated detector exceptions as no warning.
- Propagated the warning from any captured frame and included it in change signatures so warning changes trigger refresh.
- Copied only an accepted snapshot's boolean into `StatePayload.page`; stale evidence cannot overwrite it and false/legacy evidence clears it.
- Added `injection-warning=<bool>` to REPL state output without echoing the hostile sentinel.
- Verified warning changes do not clear a pending gated action or its one-use grant.

## Task Commits

1. **Task 1: Attach only the detector boolean to extension snapshots** - `d400f2d` (test), `47ecce4` (feat), `d7e2535` (test), `05b95b1` (feat)
2. **Task 2: Carry accepted signal into state and REPL output** - `da8ee4e` (test), `f8d2ffb` (feat)

## Files Created/Modified

- Extension snapshot capture, shared frame message types, frame aggregation, and mutation signatures now carry the privacy-preserving warning bit.
- Extension tests cover hidden bait, detector failure, child-frame aggregation, and warning-sensitive change signatures.
- `apps/server/src/session/session.ts` and its tests cover accepted, stale, false, legacy, reset, and grant behavior.
- `tools/repl/src/repl.ts` and its tests expose the boolean without page prose.

## Decisions Made

- Keep action classification and gated-action authority independent of the warning.
- Normalize absent or false extension evidence to `false` only after a snapshot is accepted.
- Keep DLG-14 speech and UI with the voice track; this core plan proves data delivery only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extend the extension's shared frame snapshot type**
- **Found during:** Task 1 (attach detector result)
- **Issue:** `ContentSnapshot` was a `Pick` of protocol fields that omitted the newly approved warning boolean, so the typed frame path could not carry it.
- **Fix:** Added the approved optional property to the pick.
- **Files modified:** `apps/extension/src/shared/messages.ts`
- **Verification:** Extension snapshot tests and extension typecheck passed.
- **Committed in:** `47ecce4`.

**2. [Rule 2 - Missing Critical] Preserve warning signals across frames and mutations**
- **Found during:** Task 1 (frame-path review)
- **Issue:** The background merger retained only top-frame metadata, and page-change signatures ignored the warning bit; child-frame detections and detector-only changes would be silently lost.
- **Fix:** OR the warning booleans from captured frames and include the boolean in the internal change signature; add regression tests.
- **Files modified:** `apps/extension/src/background/frames.ts`, `apps/extension/src/shared/signature.ts`, `apps/extension/test/frames.test.ts`, `apps/extension/test/signature.test.ts`
- **Verification:** 26 extension tests passed and the extension typecheck passed.
- **Committed in:** `d7e2535`, `05b95b1`.

---

**Total deviations:** 2 auto-fixed (1 blocking type path, 1 missing critical propagation path). **Impact:** Both changes are required for the approved signal to reach state reliably across the extension's multi-frame capture and mutation flow.

## Issues Encountered

`@blip/repl` has no standalone `test` script. The REPL test was run through the repository's root Vitest command instead.

## User Setup Required

None.

## Verification

- `npm run test --workspace @blip/extension -- test/snapshot.test.ts` - passed, 6 tests.
- `npm run test --workspace @blip/extension -- test/frames.test.ts test/signature.test.ts` - passed, 26 tests.
- `npx vitest run apps/server/test/injection-warning.test.ts apps/server/test/refresh.test.ts` - passed, 12 tests.
- `npx vitest run tools/repl/test/repl.test.ts` - passed, 13 tests.
- `npm run typecheck --workspace @blip/extension` - passed.
- `npm run typecheck` - passed.

## Next Phase Readiness

05-07 can exercise warning state delivery and unchanged GATE-06 refusal together in the real-browser E2E path. GATE-07 speech/UI remains voice-owned and pending.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*
