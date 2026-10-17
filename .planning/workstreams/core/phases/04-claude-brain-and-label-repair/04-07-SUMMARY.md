---
phase: 04-claude-brain-and-label-repair
plan: 04-07
subsystem: brain
tags: [label-repair, cache, privacy, vitest]

# Dependency graph
requires:
  - phase: 04-02
    provides: Separate Claude intent and repair roles with abort/recreate support
  - phase: 04-03
    provides: Bounded value-free page prompt projection
  - phase: 04-05
    provides: Resolved FormModel provenance for validated model labels
provides:
  - Strict descriptive repair patch parsing, identity checks, and narrow merge
  - Baseline-first asynchronous repair with stale snapshot rejection
  - Bounded atomic cache of validated value-free descriptive patches
affects: [PAGE-04, BRAIN-03, label-repair]

# Tech tracking
tech-stack:
  added: []
  patterns: [post-reply background repair, monotonic accepted-snapshot revision, hashed structural cache key]

key-files:
  created:
    - apps/server/src/brain/claude/repair-cache.ts
    - apps/server/src/brain/claude/repair-coordinator.ts
    - apps/server/src/brain/claude/repair-merge.ts
    - apps/server/src/brain/claude/repair-schema.ts
    - apps/server/test/repair-flow.test.ts
    - apps/server/test/repair-patch.test.ts
  modified:
    - apps/server/src/server.ts
    - apps/server/src/session/refresh.ts
    - apps/server/src/session/session.ts

key-decisions:
  - "Start repair only after the deterministic baseline turn has sent its reply and released the serialized turn queue."
  - "Reject completions after any newer accepted snapshot, even when its page identity, version, hash, and IDs happen to match."
  - "Store only strict descriptive patches under a SHA-256 key of normalized origin, pathname, and structural hash; query and fragment are omitted."

patterns-established:
  - "Provider output is validated against captured and current models, then merged onto current state without replacing policy or value fields."
  - "Cache reads are synchronous on accepted snapshots; cache hits are revalidated before merge, while misses schedule background work."
  - "Repair timeout aborts and recreates only the repair role; the intent role and turn queue remain independent."

requirements-completed: [PAGE-04, BRAIN-03]

# Metrics
duration: 9min
completed: 2026-10-17
---

# Phase 4 Plan 04-07: Background Label Repair Summary

**Deterministic labels now remain immediately usable while strict model descriptions repair asynchronously and return from a bounded structure-keyed cache.**

## Performance

- **Duration:** 9 min (approximate)
- **Started:** 2026-10-17T10:08:00Z (approximate)
- **Completed:** 2026-10-17T10:17:12Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a strict, bounded repair patch schema and merge that validates both captured and current field IDs, rejects duplicate/unknown IDs and policy/value fields, and assigns `model` provenance only when a label changes.
- Integrated a background coordinator after the first baseline answer. It discards stale results, keeps failures on the usable baseline, and times out only the repair role.
- Added a SHA-256-keyed cache that omits query and fragment, stores strict descriptive patches only, writes atomically, and evicts deterministically by age and filename within entry and byte bounds.
- Added fake-provider integration coverage for baseline ordering, queue release, delayed success, failure/timeout isolation, changed and replaced snapshots, cache hits, stale IDs, corruption, secrecy, and eviction.

## Task Commits

Each task has an atomic code/test commit; TDD test commits are listed separately where used:

1. **Task 1: Validate and merge strict descriptive repair patches** - `235ea2b` (test), `d529ba6` (feat)
2. **Task 2: Run repair after baseline speech and reject stale completion** - `512e6f5` (test), `e99de83` (feat)
3. **Task 3: Add value-free structural-hash repair cache and return-visit reuse** - `9f9d98d` (feat and cache tests)

**Plan metadata:** summary-only documentation commit follows self-check.

## Files Created/Modified

- `apps/server/src/brain/claude/repair-schema.ts` - strict patch schema and captured/current identity and ID validation.
- `apps/server/src/brain/claude/repair-merge.ts` - applies only title, label, group, and confidence changes to current state.
- `apps/server/src/brain/claude/repair-coordinator.ts` - schedules post-reply repair, enforces eligibility and current snapshot identity, handles timeout and cache reuse.
- `apps/server/src/brain/claude/repair-cache.ts` - atomically stores strict patches under normalized structural keys with deterministic bounds.
- `apps/server/src/server.ts` - injects a fake repair provider for tests or the isolated Claude repair role in production.
- `apps/server/src/session/refresh.ts` - notifies the coordinator after an accepted snapshot.
- `apps/server/src/session/session.ts` - tracks accepted snapshot revision and guards repair application.
- `apps/server/test/repair-patch.test.ts` - strict rejection and preservation tests.
- `apps/server/test/repair-flow.test.ts` - fake-provider integration and cache coverage.

## Decisions Made

- Keep repair work outside the serialized user turn queue. Initial repair starts only after the deterministic reply has been sent and `busy` is false.
- Use the existing value-free projection for provider input; raw form values and transcript text are not passed to the repair role or written to disk.
- Treat every accepted snapshot as a new generation for stale-result checks, including same-version replacement snapshots.
- Cache only validated strict patches. Cache keys are hashed and use URL origin, pathname, and structural hash without query or fragment.

## Deviations from Plan

No product or architectural deviations. For Task 3, cache tests and implementation were included in one commit rather than a separate red test commit; the complete cache test set passed before full-plan verification.

## Issues Encountered

- The first typecheck after adding integration coverage found test provider functions typed too broadly to expose Vitest mock assertions. Removing the unnecessary interface annotations retained structural compatibility and cleared typecheck.
- A newer accepted snapshot can reuse every visible identity field. Added a monotonic session snapshot revision so an older completion cannot apply to that replacement.

## Verification

- `npm exec vitest -- run apps/server/test/repair-flow.test.ts apps/server/test/repair-patch.test.ts` — 2 files, 11 tests passed.
- `npm run typecheck` — passed.
- `npm test` — 75 files passed, 12 skipped; 776 tests passed, 21 skipped.
- `npm exec vitest -- run apps/server/test/dev-script.test.ts` — 1 file, 7 tests passed, including the `--brain=fake` end-to-end flow.
- No live Claude calls or credential inspection; all repair behavior used injected fake providers and temporary cache directories.

## User Setup Required

None - no external service configuration was needed.

## Next Phase Readiness

- Plan 04-07 implementation and verification are complete; downstream plans can use the safe background repair and cache APIs.
- Shared Core `STATE.md` and `ROADMAP.md` were left to the orchestrator for reconciliation.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists and lists all nine plan files plus verification outcomes.
- Task commits `235ea2b`, `d529ba6`, `512e6f5`, `e99de83`, and `9f9d98d` are present in git history.
- Stub scan found no TODO, FIXME, coming-soon, or unavailable implementation; `PLACEHOLDER_LABEL` is the intentional eligibility matcher.
- Shared Core state and roadmap files were not staged or modified by this plan executor.
