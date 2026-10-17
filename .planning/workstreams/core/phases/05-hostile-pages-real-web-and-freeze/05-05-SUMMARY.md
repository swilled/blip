---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-05
subsystem: protocol
tags: [gate-07, zod, backwards-compatible]

# Dependency graph
requires:
  - phase: 05-hostile-pages-real-web-and-freeze
    provides: "Reported owner approval for exact warning fields"
provides:
  - "Optional warning-only booleans on Snapshot and voice StatePayload.page"
  - "Backward-compatibility and type-validation coverage for both payloads"
affects: [05-06, 05-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Add optional warning metadata without changing protocol version or action authority"

key-files:
  created: []
  modified:
    - packages/protocol/src/snapshot.ts
    - packages/protocol/src/payloads-voice.ts
    - packages/protocol/test/messages.test.ts
    - PROTOCOL.md

key-decisions:
  - "Add only Snapshot.untrustedInstructionDetected? and StatePayload.page.untrustedInstructionDetected? as optional booleans."
  - "Keep the warning signal prose-free and independent from action kinds, grants, confirmation, and permission."

patterns-established:
  - "Legacy peers may omit warning metadata; schema validation rejects non-boolean values when the field is present."

requirements-completed: []

# Metrics
duration: 8 min
completed: 2026-10-17
---

# Phase 5 Plan 05: Additive GATE-07 Protocol Signal Summary

**The approved warning-only boolean is now part of Snapshot and voice-facing page state with legacy compatibility.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-17
- **Completed:** 2026-10-17
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added the exact approved optional boolean to the `Snapshot` and `StatePayload.page` schemas.
- Added coverage for true, false, legacy omission, `page: null`, and invalid non-boolean values.
- Documented warning-only semantics and the privacy and authority boundaries in `PROTOCOL.md`.
- Regenerated the lock; its content remained unchanged because it inventories message types and enums, not object fields.

## Task Commits

1. **Task 1: Add optional warning booleans with backward-compatible schema tests** - `d284feb` (test), `68e7e97` (feat)
2. **Task 2: Lock and document the additive contract** - `fbcb2b8` (docs)

## Files Created/Modified

- `packages/protocol/src/snapshot.ts` - Accepts the optional Snapshot warning boolean.
- `packages/protocol/src/payloads-voice.ts` - Accepts the optional page-state warning boolean.
- `packages/protocol/test/messages.test.ts` - Verifies legacy, boolean, and invalid-type behavior.
- `PROTOCOL.md` - Describes the fields and their warning-only contract.

## Decisions Made

- Keep protocol version 1 and add no prose, URL, matched phrase, or action authority.
- Leave `GATE-07` pending because voice speech/UI delivery is not implemented in this core checkout.

## Deviations from Plan

None - the approved field shapes were implemented exactly.

**Total deviations:** 0 auto-fixed. **Impact:** 05-06 can carry only the accepted boolean through the core path.

## Issues Encountered

The generated `protocol.lock.json` was unchanged after regeneration because it does not encode payload object fields. Schema tests and the protocol documentation verify the additive field contract.

## User Setup Required

None.

## Verification

- `npx vitest run packages/protocol/test/messages.test.ts` - passed, 57 tests.
- `npm run protocol:lock` - completed; generated lock remained unchanged.
- `npx vitest run packages/protocol/test/protocol-lock.test.ts packages/protocol/test/messages.test.ts` - passed, 68 tests.
- `npm run typecheck` - passed.

## Next Phase Readiness

05-06 can attach the detector's boolean to extension snapshots and accepted voice state. GATE-07 speech/UI remains pending with the voice track.

---
*Phase: 05-hostile-pages-real-web-and-freeze*
*Completed: 2026-10-17*
