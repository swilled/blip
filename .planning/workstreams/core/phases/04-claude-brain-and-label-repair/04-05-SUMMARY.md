---
phase: 04-claude-brain-and-label-repair
plan: 04-05
subsystem: protocol
tags: [zod, label-provenance, protocol-lock, baseline]

# Dependency graph
requires:
  - phase: 04-01
    provides: Existing shared protocol schemas and baseline label contract
provides:
  - Deterministic-only RawLabelSource for extension snapshot candidates and baseline ranking
  - Resolved LabelSource with model provenance for validated server repairs
  - Independent raw/resolved label source lists in protocol docs and generated lock
affects: [PAGE-04, form-model, label-repair]

# Tech tracking
tech-stack:
  added: []
  patterns: [narrow raw evidence types, additive resolved provenance, independently locked enum membership]

key-files:
  created: []
  modified:
    - packages/protocol/src/snapshot.ts
    - packages/protocol/src/form-model.ts
    - packages/protocol/test/form-model.test.ts
    - apps/server/src/baseline/label.ts
    - apps/server/test/baseline.test.ts
    - scripts/gen-lock.ts
    - packages/protocol/protocol.lock.json
    - packages/protocol/test/protocol-lock.test.ts
    - PROTOCOL.md

key-decisions:
  - "Raw extension label evidence and deterministic baseline ranking exclude model provenance; only resolved FormModel fields may use model after validated repair."
  - "Record the two source lists independently in the generated protocol lock without changing protocol version or unrelated frozen members."

patterns-established:
  - "Keep raw evidence enums narrower than resolved server-side provenance enums."
  - "Schema tests prove both runtime rejection of model on raw candidates and acceptance on resolved fields."

requirements-completed: [PAGE-04]

# Metrics
duration: 6min
completed: 2026-10-17
---

# Phase 4 Plan 04-05: Label Provenance Split Summary

**Raw extension candidates now use deterministic-only provenance, while validated server-resolved FormModel fields can record `model` provenance.**

## Performance

- **Duration:** 6 min (approximate)
- **Started:** 2026-10-17T10:00:00Z (approximate)
- **Completed:** 2026-10-17T10:06:00Z
- **Tasks:** 3 (including the approval checkpoint)
- **Files modified:** 9

## Accomplishments

- Recorded the checkpoint response before proceeding: the Core owner reported that the voice owner approved this exact raw/resolved split and authorized the Phase 4 continuation. The Core execution instruction authorized this plan to proceed.
- Added `RawLabelSource` for extension snapshots and typed baseline candidates, picked labels, and ranking against that narrow enum. Resolved `LabelSource` adds `model` and remains specific to FormModel fields and their confidence helper.
- Added schema and baseline regressions, generated independent source lists into `protocol.lock.json`, and documented the boundary without changing protocol version, messages, Intents, action kinds, dialogue states, or fixtures.

## Task Commits

1. **Task 1: Obtain both developers' sign-off before the protocol edit** - satisfied by the user-provided checkpoint response; coordination only, no code commit.
2. **Task 2: Split raw candidate sources from resolved model-sourced fields** - `d712be4` (feat), with type-correct runtime-invalid test fixture fix `db6a034`.
3. **Task 3: Document and lock the additive source distinction** - `f8a52b7` (docs).

**Plan metadata:** included in the final docs commit for this plan.

## Files Created/Modified

- `packages/protocol/src/snapshot.ts` - raw candidate schema now uses deterministic-only `RawLabelSource`.
- `packages/protocol/src/form-model.ts` - resolved fields use `LabelSource`, which adds `model`.
- `packages/protocol/test/form-model.test.ts` - proves all deterministic raw sources parse, raw `model` is rejected, and resolved `model` plus confidence are preserved.
- `apps/server/src/baseline/label.ts` - candidate ranking and selected baseline provenance are typed to `RawLabelSource`.
- `apps/server/test/baseline.test.ts` - proves baseline ranking preserves deterministic sources and never yields `model`.
- `scripts/gen-lock.ts` - writes raw and resolved source arrays separately.
- `packages/protocol/protocol.lock.json` - freezes both source lists independently.
- `packages/protocol/test/protocol-lock.test.ts` - verifies both lists and detects removals from either list.
- `PROTOCOL.md` - documents D-05 source provenance and lock coverage.

## Decisions Made

- Keep the wire snapshot's candidate provenance deterministic-only; the `model` source is available only after a server-side validated repair has produced a resolved field.
- Preserve the protocol version and all unrelated frozen contract members.
- Keep the existing M0 approval status separate; this checkpoint approves the Phase 4 label-source split and does not rewrite the earlier M0 sign-off record.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the runtime rejection fixture type-correct**
- **Found during:** Task 2 verification
- **Issue:** A raw candidate with literal source `model` is correctly rejected by TypeScript before it can reach the runtime schema test.
- **Fix:** Constructed the deliberately invalid parsed input as `unknown`, preserving compile-time narrowing while still exercising Zod rejection.
- **Files modified:** `packages/protocol/test/form-model.test.ts`
- **Verification:** Protocol tests and root typecheck passed.
- **Committed in:** `db6a034`

---

**Total deviations:** 1 auto-fixed (1 Rule 3)
**Impact on plan:** The fixture change was needed to verify runtime rejection without weakening the new static type boundary. No scope change.

## Issues Encountered

- The plan's server-project test command selected the full server project; its unrelated CLI suite reported two timeouts. Running the baseline file directly passed all 39 tests. The protocol project and root typecheck passed.

## User Setup Required

None for this protocol change.

## Next Phase Readiness

- Plan 04-07's dependency on 04-05 is satisfied; its work can proceed.
- PAGE-04 remains pending in Core traceability until Plan 04-07 delivers the background repair and cache flow.
- The separate live SDK spike remains under the Phase 4 owner checkpoint and was not run or changed by this plan.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Verification

- `npm test -- --project @blip/protocol` — 228 tests passed across 12 files.
- `npm exec vitest -- run apps/server/test/baseline.test.ts` — 39 tests passed.
- `npm run typecheck` — passed.
- The prescribed broader server-project invocation also surfaced 2 unrelated CLI timeout failures; these are documented above.

## Self-Check: PASSED

- Summary file exists at the planned path.
- Task commits `d712be4`, `db6a034`, and `f8a52b7` exist in git history.
- Stub scan found no TODO, FIXME, coming-soon, or placeholder implementation in plan files; placeholder matches are only the existing label source enum and its tests.
