---
phase: 03-gated-submit-and-result-reading
plan: 03-06
subsystem: testing
tags: [chromium, edge, gated-submit, voice-role, browser-e2e, result-evidence]

# Dependency graph
requires:
  - phase: 03-02
    provides: Gated Executor and real refresh/action path
  - phase: 03-03
    provides: Persistent submit barriers and grant sequencing
  - phase: 03-04
    provides: Target-frame guard checks and one-use dispatch
  - phase: 03-05
    provides: Accepted-snapshot result interpretation and current validation errors
provides:
  - Fresh-page Chromium proof for native submit routes with matched unguarded baselines
  - Local booking form fixture with field and page validation evidence plus explicit confirmation
  - End-to-end voice-role proof of read-back, refusal, exact phrase, one-use submit, and page-evidence results
affects: [phase-03, gated-submit, browser-e2e, result-reading]

# Tech tracking
tech-stack:
  added: []
  patterns: [isolated browser profiles, matched no-extension event baselines, exact test-only fake request phrase]

key-files:
  created:
    - apps/extension/test/e2e/submit-method-guard.e2e.test.ts
    - apps/extension/test/e2e/gated-flow.e2e.test.ts
    - tools/test-pages/public/gated-form.html
    - tools/test-pages/public/submit-bypass.html
    - tools/test-pages/public/submit-sink.html
  modified:
    - apps/extension/test/e2e/harness.ts
    - apps/extension/src/background/submit-method-guard.ts
    - apps/server/src/brain/fake-brain.ts
    - apps/server/src/server.ts
    - apps/server/test/fake-brain.test.ts
    - .planning/workstreams/core/phases/03-gated-submit-and-result-reading/03-06-PLAN.md

key-decisions:
  - "Keep the persistent direct-submit guard at the window capture boundary with stopImmediatePropagation; establish valid native behavior in matched no-extension pages before checking guarded pages."
  - "The fake request-action trigger is opt-in and exact-phrase matched; omitting it preserves the prior static fake behavior."
  - "Treat only fresh page snapshot evidence as result proof; keep field errors labeled and ordered separately from page errors, and expose sensitive values only as presence."

patterns-established:
  - "Use unique harness browser profiles and terminate only the exact browser child spawned by the harness."
  - "Test browser input routes with CDP key and pointer events, then compare them to a no-extension baseline."

requirements-completed: [GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-08, RES-01, RES-02]

# Metrics
duration: 22 min
completed: 2026-10-17
---

# Phase 03 Plan 06: Fresh-Page Guard and Voice-Role Submit Summary

**A real Edge profile proves native submit paths are blocked before grants, while the voice-role flow validates single-use confirmation and reads labeled errors or the explicit GH-2048 page confirmation.**

## Performance

- **Duration:** About 22 minutes
- **Started:** 2026-10-17T02:59:32-04:00 (first Task 1 test commit)
- **Completed:** 2026-10-17T03:21:12-04:00 (verification complete)
- **Tasks:** 3/3
- **Files modified:** 11 code and plan artifacts

## Accomplishments

- A matched no-extension baseline proved `requestSubmit()`, real Enter, and a real CDP click on a div button each reached the window observer, form handler, and sink exactly once. In a fresh extension-enabled profile, direct `form.submit()` calls, `requestSubmit()`, Enter, and the div-button path produced no page submit observers, form handler calls, or sink navigation before any act or grant. The production window-capture guard and `stopImmediatePropagation` remain intact.
- Added a local booking form with stable labels and target order, a labeled `.edu` email error, a separate page error, and an explicit confirmation heading/status. The full real voice-role flow produced two authorized submit events: one invalid submit that reported the labeled email and page errors, and one valid retry that returned the explicit confirmation `GH-2048`.
- The flow rejected bare “yes,” an exact phrase before read-back speech completion/cooldown, and a phrase after field mutation. The changed field required a new read-back and phrase. “What went wrong” repeated the current errors. Sensitive card data was represented only as presence and did not appear in voice frames, act results, or logs.
- The exact fake request-action phrase is an optional test-only hook. Focused fake-brain tests verify the exact trigger, nonmatching utterance clarification, and preserved behavior when the phrase is omitted.

## Task Commits

1. **Task 1: Prove the no-grant submit barrier** — `6e501bf` (TDD red) and `8a1b997` (matched baseline and guarded proof).
2. **Task 2: Add the local result-evidence fixture** — `b616b1c`.
3. **Task 3: Verify the real voice-role gated flow** — `cd0572a`.
4. **Verification type fixes** — `0bd1303` (strict optional read-back checks and file-local Chrome ambient types).

Plan-review amendments were committed as `1ac9070` (align browser proof with the existing window guard) and `45db041` (scope the exact fake request phrase hook). The plan summary, requirements, state, roadmap, and deferred test-wrapper note are committed together as plan metadata.

## Browser Evidence

- **Browser:** `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, launched only by the harness with unique isolated profiles.
- **Native baseline:** Three event-producing routes reached the fixture sink once each; each produced one window-capture event and one form-handler event. The div route also reported one click.
- **Fresh guarded page:** Five no-grant routes were checked (two direct method calls, `requestSubmit`, Enter, and div-button click). The div click and its `requestSubmit` attempt were visible, while all five routes produced zero page submit events, form-handler calls, sink reports, or extension act requests.
- **Voice flow:** Two actual submit events occurred, both after valid authorization: the first yielded the labeled email error plus separate page error, and the second yielded a fresh snapshot with the `Booking confirmed` heading and `Confirmation number GH-2048` status. Refusal paths produced no submit.
- **Unsupported target-frame gaps:** None observed in the exercised local fixtures.

## Verification

- Browser E2Es, `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e --no-file-parallelism`: **12 files passed, 1 optional long test skipped; 22 tests passed, 1 skipped**. The skip was then run separately with `BLIP_E2E_BROWSER=1 BLIP_E2E_LONG=1`: **1/1 passed in 162.68 seconds**.
- Full root suite, `npm test`: **66 files passed, 12 skipped; 721 tests passed, 21 skipped**.
- Full extension suite from repository root, `npx vitest run apps/extension/test --no-file-parallelism`: **28 files passed, 12 browser-gated files skipped; 133 tests passed, 21 skipped**.
- `npm run pages:build`: passed. `npx vitest run apps/extension/test/build.test.ts`: **1 file, 3 tests passed**.
- `npm run ext:build`: passed.
- `npm run ext:typecheck`: passed.
- `npm run typecheck`: passed after adding the local Chrome type reference noted below.
- Focused gated-flow E2E after the strict-null and type-only changes: **1/1 passed**.
- Focused fake-brain tests: **5 passed**.

## Files Created/Modified

- `apps/extension/test/e2e/submit-method-guard.e2e.test.ts` — matched native behavior and pre-grant barrier proof.
- `apps/extension/test/e2e/gated-flow.e2e.test.ts` — real voice-role success, error, refusal, retry, and privacy assertions.
- `apps/extension/test/e2e/harness.ts` — isolated no-extension mode, CDP Enter/click helpers, and narrow fake-brain options.
- `tools/test-pages/public/gated-form.html`, `submit-bypass.html`, and `submit-sink.html` — local result and submit guard fixtures.
- `apps/server/src/brain/fake-brain.ts`, `apps/server/src/server.ts`, and `apps/server/test/fake-brain.test.ts` — optional exact-phrase request-action test hook.
- `apps/extension/src/background/submit-method-guard.ts` — file-local Chrome ambient type reference for root typechecking; runtime behavior is unchanged.
- `03-06-PLAN.md` — reviewed amendments to preserve the production guard and authorize the exact-phrase fake hook.

## Decisions Made

- Kept the production direct-submit interception at `document.defaultView` in the window capture phase; the matched baseline proves the page routes are valid, and the guarded run proves no page observers or navigation fire.
- Kept the fake trigger narrow: the phrase must match exactly, other model-routed utterances clarify, and omitting the option preserves static test behavior.
- Used current page evidence for errors and confirmation; no title, navigation, or `act.result` alone is treated as success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added strict runtime guards for optional read-back speech assertions**
- **Found during:** Task 3 verification with extension typecheck.
- **Issue:** TypeScript correctly reported that `find()` could return `undefined` even after a Vitest `toBeDefined()` assertion.
- **Fix:** Added explicit failure checks before reading the optional result text.
- **Files modified:** `apps/extension/test/e2e/gated-flow.e2e.test.ts`.
- **Verification:** Focused gated-flow E2E and `npm run ext:typecheck` passed.
- **Committed in:** `0bd1303`.

**2. [Rule 1 - Bug] Added a module-local Chrome type reference for root typechecking**
- **Found during:** Root `npm run typecheck` verification.
- **Issue:** The root tsconfig reaches the extension guard through `ext-smoke` without Chrome ambient declarations, producing `TS2304: Cannot find name 'chrome'`.
- **Fix:** Added `/// <reference types="chrome" />` to the guard module; no runtime or security behavior changed.
- **Files modified:** `apps/extension/src/background/submit-method-guard.ts`.
- **Verification:** Both root and extension typechecks passed.
- **Committed in:** `0bd1303`.

---

**Total deviations:** 2 auto-fixed (Rule 1).
**Impact on plan:** Both fixes were narrowly scoped verification blockers; no protocol or runtime gate behavior changed.

## Issues Encountered

- The initial `npm run ext:test` workspace invocation failed because `apps/extension/test/build.test.ts` assumes repository-root `process.cwd()`, while npm runs the workspace script from `apps/extension`. The complete extension suite passed from repository root, and the build test also passed there. The wrapper/path assumption is recorded in `deferred-items.md`; no test code was changed.
- The optional long idle/outage E2E was skipped in the first browser matrix because it requires `BLIP_E2E_LONG=1`; it was subsequently run and passed.

## User Setup Required

None — tests use the local fixture server and isolated harness browser profiles.

## Next Phase Readiness

Phase 3’s local I2 submit and result-reading flow is demonstrated end to end. Phase 4 can add the real brain while retaining deterministic grant enforcement and snapshot-based result evidence. The only deferred item is the extension workspace test-wrapper cwd assumption; all extension tests passed via the root invocation.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the plan output path.
- Task and plan-review commits `6e501bf`, `8a1b997`, `b616b1c`, `cd0572a`, `0bd1303`, `1ac9070`, and `45db041` exist in git history.
