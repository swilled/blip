---
phase: 03-gated-submit-and-result-reading
plan: 03-03
subsystem: extension
tags: [chrome-mv3, document-start, submit-guard, vitest]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: Per-frame content scripts, target identities, and existing act dispatch
provides:
  - Immutable MAIN-world no-op for HTMLFormElement.submit with exact-frame verification
  - Persistent isolated-world default-deny submit listener and one-use exact submit allowance
affects: [03-04, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Document-start MAIN-world and isolated-world guards are separate bundles in every matching frame
    - Extension-only isolated global registry shares persistent guard state with the later document-idle content bundle

key-files:
  created:
    - apps/extension/src/content/submit-method-guard-main.ts
    - apps/extension/src/background/submit-method-guard.ts
    - apps/extension/src/content/submit-guard-entry.ts
    - apps/extension/test/submit-method-guard.test.ts
  modified:
    - apps/extension/src/content/submit-guard.ts
    - apps/extension/build.ts
    - apps/extension/manifest.template.json
    - apps/extension/test/submit-guard.test.ts
    - apps/extension/test/build.test.ts

key-decisions:
  - "Keep the submit-method wrapper permanently immutable; later gated clicks never restore native submit behavior."
  - "Leave GATE-02 browser proof to Plan 03-06; this plan's unit and build checks do not claim real Chromium evidence."

patterns-established:
  - "A missing isolated-world guard state rejects content acts before they touch the page."
  - "A submit allowance matches one exact form and submitter, consumes before page listeners, and clears unused state on cleanup."

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-10-17
---

# Phase 03 Plan 03-03: Document-Start Submit Barriers Summary

**Two persistent document-start barriers block direct native submits and default-deny submit events, with a frame-scoped verifier and one-use exact-event allowance.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-17T06:10:00Z
- **Completed:** 2026-10-17T06:16:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added a standalone MAIN-world bundle that installs a non-writable, non-configurable `HTMLFormElement.prototype.submit` no-op before page scripts run. The wrapper never calls the browser's original method.
- Added a target-frame verifier that queries only the requested tab/frame in MAIN world and returns false for missing, malformed, ambiguous, or rejected results.
- Replaced act-scoped submit-event listener lifetimes with a persistent isolated-world capture guard. It denies submit events by default and exposes one exact form/submitter allowance with cleanup for later gated dispatch.
- Preserved the existing `content.js` document-idle timing and added both guard bundles at document start in every matching frame.

## Task Commits

Each TDD task has a failing-test commit followed by implementation; the verifier fix is listed separately.

1. **Task 1 RED:** `3d6cc0b` — tests for direct-submit blocking and exact-frame verification.
2. **Task 1 GREEN:** `e7f8fec` — immutable MAIN-world no-op, exact-frame verifier, and document-start build entry.
3. **Task 2 RED:** `70d5b17` — tests for default denial, exact one-use allowance, cleanup, and isolated entry timing.
4. **Verifier correction:** `56d52bd` — make the serialized probe self-contained and check the full immutable descriptor.
5. **Task 2 GREEN:** `3445390` — persistent isolated-world event barrier and one-use allowance API.

**Plan metadata:** this summary is committed separately with the Phase 03 state/roadmap progress update.

## Files Created/Modified

- `apps/extension/src/content/submit-method-guard-main.ts` — MAIN-world permanent submit no-op and sentinel.
- `apps/extension/src/background/submit-method-guard.ts` — fail-closed exact-frame verifier.
- `apps/extension/src/content/submit-guard.ts` — persistent default-deny listener, installed check, and one-use exact allowance.
- `apps/extension/src/content/submit-guard-entry.ts` — isolated document-start installer.
- `apps/extension/build.ts` and `apps/extension/manifest.template.json` — standalone bundles and per-frame document-start entries.
- `apps/extension/test/submit-method-guard.test.ts`, `apps/extension/test/submit-guard.test.ts`, and `apps/extension/test/build.test.ts` — method, event, verifier, and manifest coverage.

## Decisions Made

- Kept all submit protection in the extension. The page-world sentinel carries no arming or disarming API; the one-use authorization state exists only in the isolated extension world.
- Did not change dependency versions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the stale build test for both document-start entries**
- **Found during:** Task 1 verification
- **Issue:** The existing build test required exactly one content-script entry, so it rejected the required MAIN entry even though the Phase 2 `content.js` entry must remain at document idle.
- **Fix:** Updated `build.test.ts` to assert the two guard entries and the preserved document-idle entry, including frame and exclusion attributes.
- **Files modified:** `apps/extension/test/build.test.ts`
- **Verification:** Focused build test passed with the three expected entries.
- **Committed in:** `70d5b17` (Task 2 RED test commit)

**2. [Rule 1 - Bug] Made the serialized verifier probe self-contained**
- **Found during:** Final Task 1 review
- **Issue:** Chrome serializes `executeScript.func` without its module closure; the first probe referred to a module-level sentinel and would fail in the target frame, safely returning false every time.
- **Fix:** Inlined the expected sentinel in the probe and verified the immutable descriptor in the frame; added coverage that invokes the supplied probe.
- **Files modified:** `apps/extension/src/background/submit-method-guard.ts`, `apps/extension/test/submit-method-guard.test.ts`
- **Verification:** Focused guard tests passed.
- **Committed in:** `56d52bd`

---

**Total deviations:** 2 auto-fixed (2 Rule 1). **Impact:** Both fixes preserve the plan's fail-closed behavior and make its required build/probe checks meaningful.

## Verification

- `npx vitest run apps/extension/test/submit-method-guard.test.ts apps/extension/test/submit-guard.test.ts apps/extension/test/build.test.ts` — **passed, 14 tests**.
- `npm run ext:typecheck` — **passed**.
- `npm run ext:build` — **passed**; generated `submit-method-guard.js`, `submit-event-guard.js`, and the existing `content.js`.
- Inspected generated `manifest.json`: MAIN and ISOLATED guards use `document_start`, all frames, about-blank/origin fallback; `content.js` remains `document_idle`.

## Chromium Evidence and Frame Support

This plan did not launch a browser or collect real-Chromium evidence. Plan 03-06 owns the no-grant regression proof for direct `form.submit()`, the prototype call, `requestSubmit()`, and a real Enter path. GATE-02 is therefore not marked complete here.

The manifest targets matching HTTP(S) frames, including related about-blank/origin-fallback frames. Blip's loopback pages are excluded. Browser-internal or otherwise unscriptable frames are unsupported; the exact-frame verifier returns false when injection fails, no result arrives, or the result is ambiguous, so later acts must fail closed there.

## Issues Encountered

- Typecheck identified that generic `HTMLElement` has no `form` property. The allowance now accepts only associated button/input submitters and checks their exact `form` reference.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-04 can use `beginOneSubmitAllowance` around one gated click; acts already refuse to run if the early isolated guard state is absent.
- Plan 03-06 must still supply real-Chromium evidence before GATE-02 is claimed proven.

## Self-Check: PASSED

- All created key files listed in the frontmatter exist.
- All five task/fix commits listed above exist in git history.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*
