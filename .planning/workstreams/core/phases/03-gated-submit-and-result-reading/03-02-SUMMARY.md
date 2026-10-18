---
phase: 03-gated-submit-and-result-reading
plan: 03-02
subsystem: server
tags: [executor, voice-confirmation, one-use-grants, privacy, vitest]

# Dependency graph
requires:
  - phase: 03-01
    provides: Server-only grant store and fixed per-kind confirmation phrases
provides:
  - Fresh, ordered gated-action read-back with sensitive-value redaction
  - Voice-role completion, cooldown, phrase, expiry, and one-use dispatch enforcement
  - Deterministic routing for model request_action/click_safe without model authorization
affects: [03-04, 03-05, 03-06, gated-result-reading]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Injected clock and scheduler for deterministic cooldown and expiry checks
    - One Executor owns all gated read-back and dispatch paths
    - Payload-free structured gate audit records

key-files:
  created: []
  modified:
    - apps/server/src/act/gated.ts
    - apps/server/src/session/session.ts
    - apps/server/src/server.ts
    - apps/server/src/turn.ts
    - apps/server/test/gated-flow.test.ts
    - apps/server/test/grammar.test.ts
    - apps/server/test/security.test.ts
    - apps/server/test/act-path.test.ts

key-decisions:
  - "Arm only after the final read-back's matching uninterrupted speak.done and a complete one-second cooldown."
  - "Bind the grant to current page/action/field state, retain only sensitive presence, and consume before one dispatch."
  - "Treat model request_action and click_safe as requests to begin read-back; model answer text and grammar never authorize."

patterns-established:
  - "The same deterministic Executor handles model gated intents and voice-role confirmation."
  - "Every refusal clears the pending grant without retry; audit fields exclude page content and confirmation text."

requirements-completed: [GATE-05, GATE-08]

# Metrics
duration: 14min
completed: 2026-10-17
---

# Phase 3 Plan 02: Gated Executor and Voice Confirmation Summary

**Server gated actions now require a fresh ordered read-back, matching voice completion, a one-second cooldown, an exact fixed phrase, and one consumed grant before dispatch.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-17T06:16:12Z
- **Completed:** 2026-10-17T06:30:13Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added fresh DOM read-back in document order, including required-empty fields and sensitive-field presence only.
- Enforced matching uninterrupted `speak.done`, the 1,000 ms cooldown, exact fixed phrase matching, 30-second expiry, fresh binding recheck, and synchronous grant consumption before the sole gated dispatch.
- Routed `request_action` and gated `click_safe` to the same Executor; model approval-shaped text and arbitrary grammar phrases cannot dispatch an action.
- Added privacy assertions for audit output and retained the existing safe fill/focus behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gated Executor state and fresh read-back preparation** - `cfde2c0` (RED tests), `771e2e7` (feat)
2. **Task 2: Enforce speech completion, cooldown, and one-use dispatch** - `3f308eb` (feat)
3. **Task 3: Route every gated Intent through the same Executor** - `42a9bdd` (test)

**Plan metadata:** committed with this summary, STATE.md, and ROADMAP.md update.

## Files Created/Modified

- `apps/server/src/act/gated.ts` - Fresh read-back, pending confirmation lifecycle, fixed-phrase checks, grant consumption, single dispatch, and refusal/audit behavior.
- `apps/server/src/session/session.ts` - Per-session gated pending state and grant-store ownership; invalidates bindings on page/extension changes.
- `apps/server/src/server.ts` - Voice completion/cancellation wiring and deterministic timer seams for tests.
- `apps/server/src/turn.ts` - Routes gated intents and pending voice utterances through the Executor while preserving ungated writes.
- `apps/server/test/gated-flow.test.ts` - Read-back, barrier, grant, refusal, audit, click_safe, model-answer, and typed voice-path coverage.
- `apps/server/test/grammar.test.ts` - Asserts confirmation phrases and approval-like inputs are not local grammar commands.
- `apps/server/test/security.test.ts` - Wrong-role completion rejection and payload-free audit checks.
- `apps/server/test/act-path.test.ts` - Updates the request_action expectation to verify it begins ordinary read-back and does not directly dispatch.

## Decisions Made

- A model-produced gated intent requests ordinary read-back only; it cannot arm or consume a grant.
- Only the exact fixed phrase on the voice-role path can pass the pending confirmation matcher after the speech barrier.
- The grant is consumed before the hub request, and any refusal clears it without retry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Verification regression] Updated the stale request_action expectation in the existing act-path suite**
- **Found during:** Task 3 (Route every gated Intent through the same Executor)
- **Issue:** The prior test expected the Phase 1 `I can't do that yet` response and no pending confirmation, conflicting with this plan's requirement that `request_action` begin the gated read-back flow.
- **Fix:** Asserted that the fake model's gated `request_action` produces the read-back prompt, retains the pending target, and sends neither `confirm.armed` nor `act.request` before speech completion.
- **Files modified:** `apps/server/test/act-path.test.ts`
- **Verification:** The full act-path suite passes with the focused plan suites.
- **Committed in:** `42a9bdd`

**2. [Sequencing] Gated routing support was wired while Task 2 added voice confirmation handling**
- **Found during:** Task 3
- **Issue:** Voice-role confirmation needs to reach the Executor, so the turn routing foundation was included in Task 2's integrated change set.
- **Fix:** Task 3 added direct adversarial routing/grammar coverage and corrected stale Phase 1 comments without duplicating the already-correct routing implementation.
- **Files modified:** `apps/server/src/turn.ts`, `apps/server/test/gated-flow.test.ts`, `apps/server/test/grammar.test.ts`
- **Verification:** Focused suites and TypeScript check pass.
- **Committed in:** `3f308eb` (routing), `42a9bdd` (coverage/comments)

---

**Total deviations:** 2 (1 verification regression fix, 1 task sequencing adjustment)
**Impact on plan:** No protocol or dependency changes. The extra test update aligns the existing suite with the planned gated read-back behavior.

## Issues Encountered

- The fake extension intentionally refuses gated actions with `gate-required`; unit coverage verifies the server's one-dispatch success path, and server integration verifies this refusal clears state without retry.

## User Setup Required

None - no external configuration required.

## Next Phase Readiness

- Server preparation and confirmation boundaries are in place for later result-reading work.
- The fake extension remains fail-closed for gated actions until its separately planned gate support is implemented.

---
*Phase: 03-gated-submit-and-result-reading*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the expected phase path.
- All four task/test commits are present in git history.
