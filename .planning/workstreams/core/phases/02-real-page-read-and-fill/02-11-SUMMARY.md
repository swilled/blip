---
phase: 02-real-page-read-and-fill
plan: 11
subsystem: extension-background
tags: [typescript, extension, snapshot, frames, vitest, chrome]

# Dependency graph
requires:
  - phase: 02-05
    provides: Extension service-worker lifecycle and wake-up paths
  - phase: 02-10
    provides: Frame-local snapshots with private IDs and exact element-cap truncation
  - phase: 02-14
    provides: Local cross-origin fixture pages for browser verification
provides:
  - Last-target-tab selection that preserves the active non-Blip page
  - Bounded frame fan-out, frame-qualified IDs, ordered aggregation, and schema validation
  - Structural per-tab snapshot versions that omit field values from signatures
  - Real cross-origin snapshot coverage through the unchanged baseline builder
affects: [PAGE-01, PAGE-03, PAGE-05, 02-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Browser API dependencies are wrapped behind narrow local interfaces so both extension and root TypeScript projects typecheck.
    - Frame results merge in top-frame-first, ascending-frame-id order and are validated at the background trust boundary.
    - Cross-origin frame reads use bounded waits, one all-frame injection retry, and one safe alert per visible unavailable frame.
key-files:
  created:
    - apps/extension/src/background/dispatch.ts
    - apps/extension/src/background/frames.ts
    - apps/extension/src/background/tabs.ts
    - apps/extension/src/background/ids.ts
    - apps/extension/src/background/versions.ts
    - apps/extension/test/frames.test.ts
    - apps/extension/test/ids.test.ts
    - apps/extension/test/versions.test.ts
    - apps/extension/test/convention-parity.test.ts
    - apps/extension/test/e2e/snapshot.e2e.test.ts
  modified:
    - apps/extension/src/background/index.ts
    - apps/extension/src/background/socket.ts
key-decisions:
  - "Keep frame requests bounded at 1.5 seconds by default, inject content once when responses are missing, then retry only missing frames once."
  - "Unknown iframe visibility defaults to visible, so an unavailable frame is represented by the safe fallback alert instead of being silently hidden."
  - "Use browser frame IDs for qualification and per-tab structural signatures for versions; signatures exclude values."
  - "Route snapshot requests from the actual WebSocket dispatch path because the existing request listener is private to socket.ts."
patterns-established:
  - "The background reconstructs frame IDs from browser-owned frame IDs and content-script private local IDs."
  - "Only the 250-element list cut or a per-frame wire-cap cut sets truncated; fallback alerts and metadata clipping do not."
requirements-completed: [PAGE-01, PAGE-03, PAGE-05]

# Metrics
duration: 20min
completed: 2026-10-17
---

# Phase 2 Plan 11: Ordered Frame Snapshot Routing Summary

**The extension now captures the selected non-Blip tab across available frames, returns an ordered schema-validated snapshot, and preserves value-free structural version history.**

## Performance

- **Duration:** Approximately 20 min
- **Started:** 2026-10-17T03:01:00Z (approximate)
- **Completed:** 2026-10-17T03:22:00Z
- **Tasks:** 2/2
- **Files modified:** 12

## Accomplishments

- Added last-target tab tracking and safe selection for HTTP(S) pages while excluding Blip's own loopback tabs.
- Added bounded frame discovery and capture, a single injection retry for missing frames, top-frame-first/ascending-frame ordering, frame-qualified IDs, and final `Snapshot.safeParse` validation.
- Preserved the 250-element wire cap semantics and emitted `Part of this page could not be read.` once for each visible unavailable iframe.
- Added per-tab version history based on structural signatures that exclude values, plus ID-format and action-policy parity tests.
- Proved the real cross-origin page snapshot reaches the unchanged baseline form builder and selects the fixture's “Message for this frame” field.

## Task Commits

1. **Task 1: Implement target tab, frame fan-out and ordered merge** - `8068e7d` (tests), `d648078` (implementation)
2. **Task 2: Add version/fingerprint history and prove the real snapshot pipeline** - `c96cab0` (tests), `9a66fa5` (implementation)

## Files Created/Modified

- `apps/extension/src/background/tabs.ts` - Selects the requested or most recently active non-Blip page and clears version state when tabs close.
- `apps/extension/src/background/dispatch.ts` - Connects snapshot requests to Chrome tab, scripting, and frame-tree APIs.
- `apps/extension/src/background/frames.ts` - Performs bounded fan-out/retry, deterministic merge, wire-cap handling, fallback alerts, and schema validation.
- `apps/extension/src/background/ids.ts` - Qualifies local element IDs with browser frame IDs and strictly parses the format.
- `apps/extension/src/background/versions.ts` - Tracks structural snapshot versions per tab without persisting values.
- `apps/extension/src/background/index.ts` - Registers target-tab tracking at worker startup.
- `apps/extension/src/background/socket.ts` - Delegates snapshot requests from its existing WebSocket dispatch function.
- `apps/extension/test/frames.test.ts` - Covers target selection, bounded capture, injection retry, ordering, fallback, cap/truncation, and validation.
- `apps/extension/test/ids.test.ts` - Covers qualified ID generation and strict parsing.
- `apps/extension/test/versions.test.ts` - Covers stable versions for unchanged structure and increments on structural changes.
- `apps/extension/test/convention-parity.test.ts` - Keeps action kinds aligned with the shared gated-action policy.
- `apps/extension/test/e2e/snapshot.e2e.test.ts` - Exercises a real cross-origin capture and unchanged baseline-builder path in an isolated headless browser profile.

## Decisions Made

- Frame visibility is inspected in each parent frame and matched to browser-owned child frame URLs. When visibility cannot be determined, it defaults to visible so unavailable content remains explicit.
- Each frame gets a 1.5-second request deadline by default; after one all-frame injection, only missing frames are retried once within the same bound.
- Snapshot versions change only when value-free structural signatures change. Tab removal forgets the associated version history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Keep browser API types compatible with root TypeScript checking**
- **Found during:** Task 1 (frame dispatch and tab selection)
- **Issue:** The root TypeScript project does not load the extension-only Chrome ambient declarations, so direct `chrome` references and inferred browser callback types failed root `npm run typecheck`.
- **Fix:** Kept Chrome API calls behind narrow local structural interfaces and accessed the extension API through a typed `globalThis` cast.
- **Files modified:** `apps/extension/src/background/dispatch.ts`, `apps/extension/src/background/tabs.ts`
- **Verification:** Root and extension typechecks passed.
- **Committed in:** `d648078`

**2. [Plan deviation - Required request routing] Delegate snapshot requests from the real socket dispatch path**
- **Found during:** Task 1 (request integration)
- **Issue:** The plan listed `index.ts` as the background entry point, but snapshot requests arrive in the existing private `dispatch()` function in `socket.ts`; without connecting that path, the new snapshot pipeline could not be reached.
- **Fix:** Added one import and a one-branch delegation for `snapshot.request`, keeping other socket behavior unchanged.
- **Files modified:** `apps/extension/src/background/socket.ts`
- **Verification:** Full test suite, extension smoke test, and real cross-origin snapshot E2E passed.
- **Committed in:** `d648078`

---

**Total deviations:** 2 (one blocking typecheck fix and one required request-routing integration). **Impact:** Both were needed for a usable, verifiable snapshot path; no protocol or server-baseline changes were made.

## Issues Encountered

- The initial E2E assertion expected the label `Message`, while the unchanged fixture and baseline builder return `Message for this frame`. Updated the assertion to match the actual fixture label; the real-browser E2E then passed.

## Verification

- `npm run typecheck` passed.
- `npm run ext:typecheck` passed.
- `npm test -- apps/extension/test/frames.test.ts apps/extension/test/ids.test.ts apps/extension/test/versions.test.ts apps/extension/test/convention-parity.test.ts apps/extension/test/e2e/snapshot.e2e.test.ts` passed: 4 files, 14 passed, 1 opt-in E2E skipped by default.
- `BLIP_E2E_BROWSER=1 npm test -- apps/extension/test/e2e/snapshot.e2e.test.ts` passed: 1 real cross-origin test. It used a unique child browser profile and stopped only its own browser child process.
- `npm test` passed: 55 files, 619 tests passed, 3 skipped.
- `npm run ext:build` and `npm run ext:smoke` passed; smoke confirmed the extension connected in an isolated headless Edge profile.
- `git diff --check` passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The extension now provides the merged frame-qualified snapshot and structural version history for downstream action handling.
- The real snapshot pipeline is validated against the existing cross-origin fixture and unchanged baseline builder.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All 12 planned/deviation source and test files and this summary exist.
- Task commits `8068e7d`, `d648078`, `c96cab0`, and `9a66fa5` exist in git history.
- `git diff --check` passed.
