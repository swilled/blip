---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-04
subsystem: browser-control/drafting
tags: [typescript, agy, page-content, draft-revision, observed-readback]

# Dependency graph
requires:
  - phase: 08-01
    provides: bounded visible page items with capture identity and date evidence
  - phase: 08-02
    provides: live identity-bound page reading and extension revalidation
  - phase: 08-03
    provides: per-session page-task state and deterministic current-item selection
provides:
  - explicit filtered draft and revision projections for the lazy tool-less content role
  - deterministic page draft composition and same-field revision with verified DOM readback
affects: [08-05, 08-06, page-task workflows, exact-phrase action gate]

# Tech tracking
tech-stack:
  added: []
  patterns: [model prose is proposal-only, current recipient and field stay core-bound, ActResult and accepted snapshot must agree]

key-files:
  created:
    - apps/server/src/browser/drafting.ts
    - apps/server/src/browser/drafting.test.ts
  modified:
    - apps/server/src/brain/agy/content-projection.ts
    - apps/server/src/brain/agy/content-projection.test.ts
    - apps/server/src/brain/agy/provider.ts
    - apps/server/src/brain/agy/session.ts
    - apps/server/src/act/ungated.ts

key-decisions:
  - "Keep the content provider lazy, tool-less, and limited to proposed prose; field, recipient, task, action, and confirmation authority remain in deterministic core."
  - "A draft is current only when ActResult observedValue exactly matches the accepted post-write FormModel value for the same bound field and page task."
  - "Leave the existing exact context-specific phrase gate separate; this plan neither models nor accepts a bare yes as authorization."

patterns-established:
  - "Capture the task source, target field, recipient value hash, and previous observed draft before awaiting prose generation; revalidate each before writing."
  - "Draft and revision writes use only the existing typed act.request fill path and return the refreshed DOM-observed value."

requirements-completed: []

# Metrics
duration: 12m
completed: 2026-10-18
---

# Phase 08 Plan 08-04: Draft composition and revision Summary

**A lazy tool-less prose provider now proposes bounded draft text, while deterministic core binds the current recipient and supported field, writes through the existing fill path, and reads back only a matching DOM-observed value.**

## Performance

- **Duration:** About 12 minutes
- **Started:** 2026-10-18T07:26:00Z
- **Completed:** 2026-10-18T07:38:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added explicit draft and revision projection requests with the selected filtered excerpt, bounded user instruction, and for revision only the current observed draft. Page URL, item/capture identity, recipient binding, target field, action, and confirmation phrase remain local.
- Kept content generation lazy and tool-less. Provider output is schema-checked bounded prose and rejected if it contains sensitive-shaped text or page-action instructions.
- Added deterministic composition and same-field revision over `Session.activePageTask`. The core resolves a unique visible text field and a unique current recipient/target binding, storing only a hash for the latter.
- Revalidated the page capture, task source, recipient hash, target field, and previous observed draft across provider calls. Compose/revise perform no send or click.
- Read back a draft only when the successful ActResult observation equals the accepted refreshed FormModel value for the same supported field. Proposals are never retained or presented as current draft text.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit draft and revision content projections** - `8a1be4d` (feat)
2. **Task 2: Write and revise through the existing observed-field path** - `1963ad7` (feat)

**Plan metadata:** summary, core STATE.md, and ROADMAP.md are committed together after the task commits.

## Files Created/Modified

- `apps/server/src/brain/agy/content-projection.ts` - bounded draft/revision request types, privacy filtering, and prompt serialization.
- `apps/server/src/brain/agy/content-projection.test.ts` - projection privacy, rejection, and provider-role behavior coverage.
- `apps/server/src/brain/agy/provider.ts` - schema-validated bounded draft prose response.
- `apps/server/src/brain/agy/session.ts` - lazy no-tools content role instructions for proposal-only prose.
- `apps/server/src/browser/drafting.ts` - deterministic target resolution, compose/revise flow, binding checks, fill, and observed readback.
- `apps/server/src/browser/drafting.test.ts` - fake-provider and fake-extension coverage for ambiguity, stale state, revision, and observation mismatch.
- `apps/server/src/act/ungated.ts` - narrow observed text-field helper using the existing typed fill request and refreshed snapshot.

## Decisions Made

- The model receives only the bounded selected excerpt and explicit request, plus the actual observed draft when the user asks for a revision. It cannot choose a field, recipient, action, confirmation phrase, grant, or Executor operation.
- Recipient/target selection comes from one unique current non-sensitive FormModel value. The task retains only its field ID and SHA-256 value hash.
- Draft/revision state remains separate from authorization. The existing exact context-specific phrase gate remains the only authorization source; a bare “yes” or other affirmation is insufficient.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Expose observed fill result for verified draft readback**
- **Found during:** Task 2 (Write and revise through the existing observed-field path)
- **Issue:** The existing `executeUngated` response exposes only a speech reply and hides the successful `ActResult.observedValue`, so the plan could not safely compare the extension observation with the accepted post-write FormModel snapshot before readback.
- **Fix:** Added a narrow helper in the existing act module. It permits only a supported non-sensitive text/textarea fill, uses the existing `act.request`/`sendAct` path, and returns a value only when the refreshed same-field snapshot exactly agrees with ActResult. It adds no action service, click, send, or submit capability.
- **Files modified:** `apps/server/src/act/ungated.ts`, `apps/server/src/browser/drafting.ts`, `apps/server/src/browser/drafting.test.ts`
- **Verification:** Fake tests cover missing ActResult observations and disagreement with the accepted refreshed snapshot; typecheck and focused tests pass.
- **Committed in:** `1963ad7`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** The helper supplies the observation needed by the planned existing fill/readback flow and remains restricted to deterministic safe text-field writes.

## Issues Encountered

- A first race-check implementation compared the pre-write draft value after the write and therefore rejected a successful update. The helper now performs only its field/page and post-write snapshot verification; the coordinator separately revalidates task, recipient, source, and prior-draft bindings before dispatch and before retaining the result.

## Verification

- Focused drafting, projection, task-state, and resolver tests: **43 passed** across 4 files.
- Browser content, command, authorization, and acceptance regressions: **92 passed** across 4 files.
- Combined focused and regression tests: **135 passed** across 8 files.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Stub-pattern scan across changed source and test files: no matches.

No live AGY, provider calls, real accounts/pages, external sites, voice-owned files, or shared protocol/policy files were used. Existing exact-phrase authorization policy remains local and unchanged.

## Next Phase Readiness

- Draft composition and revision are available as deterministic functions over the active page task; the next plan can integrate them into user command routing while preserving the separate exact-phrase gate.
- No blocker. Shared protocol/policy deltas remain local pending written voice-owner review.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Task commits `8a1be4d` and `1963ad7` exist.
- Source and test files listed above are present.
