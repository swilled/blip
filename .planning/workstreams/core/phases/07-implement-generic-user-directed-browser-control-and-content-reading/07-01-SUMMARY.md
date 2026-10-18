---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-01
subsystem: protocol
tags: [zod, browser, websocket, content-bounds]

# Dependency graph
requires:
  - phase: 06-browser-control-contract-and-policy-proposal
    provides: browser-control boundaries, content limits, and the shared-review gate
provides:
  - Closed browser operation and typed result schemas
  - Server-to-extension browser.request and extension-to-server browser.result registrations
  - Documented content identity, authorization, and protocol review requirements
affects: [07-02, 07-03, extension, server, protocol-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Separate browser payloads from Snapshot, ActRequest, and Intent
    - Bind content and link references to capture ID, revision, tab, and canonical page URL

key-files:
  created:
    - packages/protocol/src/payloads-browser.ts
    - packages/protocol/test/browser-control.test.ts
  modified:
    - packages/protocol/src/index.ts
    - packages/protocol/src/messages.ts
    - packages/protocol/test/registry.test.ts
    - packages/protocol/test/message-examples.ts
    - PROTOCOL.md
    - packages/protocol/protocol.lock.json

key-decisions:
  - "Keep browser requests and results additive and separate from form snapshots, actions, and Intent."
  - "Keep exact operation-and-target phrase matching in deterministic authorization; a bare yes never authorizes browser actions."
  - "Treat the shared protocol change as local implementation pending written voice-owner review of the exact diff."

patterns-established:
  - "Bound visible content by Unicode code points, block count, and total size in the protocol schema."
  - "Expose link IDs, visible labels, and safe host hints without carrying href as navigation authority."

requirements-completed: []

# Metrics
duration: 5 min
completed: 2026-10-18
---

# Phase 07 Plan 01: Browser Protocol Messages Summary

**Closed Zod contracts for 12 browser operations, bounded page content, and role-validated browser messages with target-bound authorization IDs.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-18T05:24:40Z
- **Completed:** 2026-10-18T05:29:27Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added closed request/result schemas for location, capture, navigation, history, reload, search, tabs, link listing/opening, content reading, scrolling, and find.
- Enforced canonical URL and ID validation, one-use authorization IDs for gated navigation/search/link opening, and capture identity across tab, URL, and revision.
- Capped content at 20 blocks, 400 Unicode code points per block, and 4,000 total; link records expose only a stable ID, visible label, and safe host hint.
- Registered the messages with server/extension-only directions, added Intent regression coverage, documented the review boundary, and regenerated the protocol lock.

## Verification

- `npm test -- --run packages/protocol/test/browser-control.test.ts` — passed (34 tests).
- `npm test -- --run packages/protocol/test/registry.test.ts packages/protocol/test/protocol-md.test.ts packages/protocol/test/browser-control.test.ts` — passed (60 tests).
- `npm test -- --run packages/protocol/test/browser-control.test.ts packages/protocol/test/protocol-md.test.ts` after the authorization wording update — passed (39 tests).
- `npm run protocol:lock` — passed twice and generated 27 message types without a second-run diff.
- `npm run typecheck` — passed.

## Task Commits

1. **Task 1: Add closed browser operation and content result schemas** — `b34b204` (`feat`)
2. **Task 2: Register browser messages and document the review boundary** — `b81869c` (`feat`)
3. **Task 2 follow-up: State exact browser authorization requirements** — `74fb354` (`fix`)

**Plan metadata:** `502c69b` (`docs(07-01): complete browser protocol plan`)

## Files Created/Modified

- `packages/protocol/src/payloads-browser.ts` — typed operations, bounded results, and page identity validation.
- `packages/protocol/test/browser-control.test.ts` — operation, content-bound, URL, identifier, and result branch coverage.
- `packages/protocol/src/index.ts` — exports browser payload schemas.
- `packages/protocol/src/messages.ts` — registers browser messages and role permissions.
- `packages/protocol/test/message-examples.ts` — provides valid samples for registry parity.
- `packages/protocol/test/registry.test.ts` — verifies message directions and the no-confirm/no-approve Intent invariant.
- `PROTOCOL.md` — documents the additive browser contract and pending written voice-owner review.
- `packages/protocol/protocol.lock.json` — regenerated with 27 message types.

## Decisions Made

- Browser operations remain separate from the form Snapshot, ActRequest, and Intent contracts.
- The protocol carries an authorization ID reference only; deterministic code must bind a one-use grant to the exact operation and target after read-back and phrase matching.
- The shared protocol diff remains local until written voice-owner review of the exact diff; local implementation does not authorize merge or push.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added valid registry samples for browser messages**
- **Found during:** Task 2
- **Issue:** The registry parity fixture is keyed by every `MessageType`, so adding two registry entries without samples would fail the existing test and type check.
- **Fix:** Added a valid browser request and capture result sample.
- **Files modified:** `packages/protocol/test/message-examples.ts`
- **Verification:** Registry and message-table tests passed.
- **Committed in:** `b81869c`

**2. [Rule 2 - Missing Critical] Documented exact operation-and-target authorization**
- **Found during:** Task 2
- **Issue:** The schema's authorization ID alone did not state the required exact phrase and bare-yes invariant for browser actions.
- **Fix:** Documented read-back of the exact operation and target, one-use target-bound grants, extension revalidation, and rejection of bare “yes”.
- **Files modified:** `PROTOCOL.md`
- **Verification:** Browser contract and protocol-document tests passed.
- **Committed in:** `74fb354`

**Total deviations:** 2 auto-fixed (1 blocking registry fixture, 1 missing safety documentation). **Impact:** Both changes were needed for the existing parity check and the requested authorization invariant; no runtime or voice-owned code was added.

## Issues Encountered

- No implementation or verification failures.
- `roadmap update-plan-progress 07` reported success but left the Phase 7 progress at 0/0; updated the Phase 7 row and plan list to 1/6, with 07-01 checked complete.

## Authentication Gates

- None.

## Known Stubs

- None found in files created or modified by this plan.

## User Setup Required

None.

## Next Phase Readiness

- The protocol contract is ready for the next Phase 7 plan to consume locally. Runtime routing and browser dispatch remain outside this plan.
- Written voice-owner review of the exact shared protocol diff is still required before merge or push.

---
*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Summary and key created files exist.
- Task commits `b34b204`, `b81869c`, and `74fb354` exist in git history.
- Plan metadata commit `502c69b` exists in git history.
