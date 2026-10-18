---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
plan: 08-05
subsystem: browser-control/confirmation
tags: [typescript, confirmation-gate, observed-draft, voice-source, task-binding]

# Dependency graph
requires:
  - phase: 08-03
    provides: identity-bound current page task and visible-item capture
  - phase: 08-04
    provides: DOM-observed draft, resolved recipient hash, and verified draft readback
provides:
  - exact context phrase and privacy-preserving one-use task/draft send binding
  - deterministic core gate for final observed-draft readback, voice-source redemption, and fresh result validation
affects: [08-06, page-task workflows, confirmation policy, voice protocol]

# Tech tracking
tech-stack:
  added: []
  patterns: [source-aware confirmation redemption, grant-bound observed draft hash, one-use page-task send]

key-files:
  created:
    - apps/server/src/act/draft-gate.test.ts
  modified:
    - apps/server/src/act/gated.ts
    - apps/server/src/act/grants.ts
    - apps/server/src/act/voice-gate-adapter.ts
    - apps/server/src/session/session.ts
    - apps/server/src/turn.ts
    - apps/server/src/voice/dialogue-runner.ts
    - apps/server/src/voice/gate-port.ts
    - apps/voice/public/voice-core.js
    - apps/voice/public/voice.js
    - packages/policy/src/confirmation.ts
    - packages/protocol/src/payloads-voice.ts
    - PROTOCOL.md

key-decisions:
  - "Only exact voice-source redemption with the active grant, readback, and utterance IDs can consume a page-task send grant."
  - "Keep source optional for legacy confirmation frames; core refuses missing source for task-bound sends while preserving existing generic gate behavior."
  - "Keep the new policy phrase vocabulary and protocol changes local pending written voice-owner review; do not push or merge."

patterns-established:
  - "Rebuild the live task binding before arming and consuming; compare full current form state plus draft and recipient hashes."
  - "Use the existing GatePort only after synchronously consuming the one-use task-bound grant."

requirements-completed: []

# Metrics
duration: 11m
completed: 2026-10-18
---

# Phase 08 Plan 08-05: Exact phrase and task-bound send gate Summary

**The deterministic gate now reads the exact DOM-observed draft and recipient, asks "send this email," and permits one existing GatePort click only after an uninterrupted readback, a one-second guard, voice-source proof, and full live binding checks.**

## Performance

- **Duration:** About 11 minutes
- **Started:** 2026-10-18T03:40:00-04:00
- **Completed:** 2026-10-18T03:51:18-04:00
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Added the fixed `email-message-send` phrase while retaining all existing action phrases. Grant fingerprints now cover the observed draft hash, recipient field/hash, source item and complete page identity, tab, send target/kind, tracked speak ID, and the existing safe form-state binding.
- Added an internal core-only draft-send command. Core resolves the unique current visible send action and checks the active task against the current identity-bound item, supported draft field, recipient value hash, tab, and page before reading anything back.
- The tracked prompt reads the recipient, full observed draft, and visible action label, then asks directly, `Can you say 'send this email'?`. Grant arming waits for uninterrupted tracked speech and the full one-second guard.
- Task-bound redemption requires source `voice`, exact phrase matching, and the matching grant, speak, and utterance IDs. Typed input, missing source, affirmations, wrong phrases, stale IDs, changed draft/recipient/source, and ambiguous targets all produce zero dispatch.
- Dispatch still goes through the existing GatePort after synchronous one-use grant consumption. A result is called confirmed only from a fresh validated page snapshot on the bound tab; missing or mismatched evidence is reported as unverified.
- Added the narrow optional confirmation-source field and source propagation through the voice client and core. Legacy frames without source remain valid for existing generic gates, while page-task sends fail closed without voice provenance.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add exact context phrase and task-bound grant fingerprint** - `54f8e16` (feat)
2. **Task 2: Gate send on final readback, exact voice phrase, and fresh result** - `5afd642` (feat)

**Plan metadata:** Summary, STATE.md, and ROADMAP.md are committed separately after self-check.

## Files Created/Modified

- `packages/policy/src/confirmation.ts` and `packages/policy/test/confirmation.test.ts` - fixed context phrase and strict normalized matching tests; existing phrases remain unchanged.
- `apps/server/src/act/grants.ts`, `apps/server/test/grants.test.ts`, and `apps/server/src/session/session.ts` - hash-only task binding inputs, grant fingerprint coverage, and lifecycle cleanup.
- `apps/server/src/act/gated.ts` and `apps/server/src/act/draft-gate.test.ts` - final readback, source- and ID-bound redemption, existing GatePort dispatch, invalidation, and fresh result verification.
- `apps/server/src/act/voice-gate-adapter.ts`, `apps/server/src/turn.ts`, `apps/server/src/voice/dialogue-runner.ts`, and `apps/server/src/voice/gate-port.ts` - propagate optional source metadata and reject task sends without voice provenance.
- `apps/voice/public/voice-core.js`, `apps/voice/public/voice.js`, and `apps/voice/test/voice-core.test.js` - transmit typed versus recognized voice source on the existing redemption path.
- `packages/protocol/src/payloads-voice.ts`, `packages/protocol/test/message-examples.ts`, `packages/protocol/test/messages.test.ts`, and `PROTOCOL.md` - document and validate the optional redemption source field.
- `apps/server/test/gated-flow.test.ts`, `apps/server/test/dialogue-core-gate-port.test.ts`, `apps/server/src/voice/gate-port.test.ts`, and `dev/mock-server/src/dialogue-runner.test.ts` - update source-aware regression coverage without changing existing submit phrase behavior.

## Decisions Made

- Typed input cannot redeem a page-task send, including when it carries the exact phrase. The direct utterance path preserves its source; new voice-client redeem frames carry source; missing source remains accepted only for backward-compatible generic gates.
- The deterministic core chooses the task, recipient, visible action, exact phrase, and Executor operation. No provider or page content can supply authority.
- Source metadata does not rely on PTT timing. The send remains reachable only through the exact phrase with source `voice`, tracked readback, cooldown, and live binding checks.
- Shared phrase-policy and protocol changes stay local pending written voice-owner review; this work was not pushed or merged.

## Deviations from Plan

### User-approved scoped source wiring

The plan marked voice and protocol files read-only, but the user clarified that the core cannot distinguish typed from spoken exact phrases because the existing redemption payload omitted source. The user then approved the narrow source-wiring change. Added an optional `source` field, passed existing typed/voice provenance through the voice client, and required `source === "voice"` for task-bound sends in core. This does not infer source from PTT timing or change ordinary submit semantics. The shared policy vocabulary addition and protocol change remain local pending written voice-owner review.

**Files modified:** `packages/protocol/src/payloads-voice.ts`, `apps/voice/public/voice-core.js`, `apps/voice/public/voice.js`, `apps/server/src/act/voice-gate-adapter.ts`, `apps/server/src/turn.ts`, `apps/server/src/voice/dialogue-runner.ts`, `apps/server/src/voice/gate-port.ts`, `PROTOCOL.md`, and focused tests.

**Verification:** Typed and legacy missing-source paths were tested through the gate/adapter and ordinary utterance route; all reported zero dispatch.

---

**Total deviations:** 1 user-approved scoped deviation.
**Impact on plan:** Required source provenance is carried through the existing client-to-core boundary. No new action service, send capability, model authority, external call, or link-policy change was introduced.

## Issues Encountered

- Revalidation initially rejected a grant after it had been associated with the active task. The live binding check now requires the matching associated grant at redemption, while requiring no associated grant before arming.
- No live AGY, provider, account, or external page was used. All new gate coverage uses synthetic snapshots and a fake Hub/GatePort boundary.

## Verification

- Focused gate, policy, protocol, voice, browser-authorization, result, and legacy gate regressions: **247 passed** across 14 files.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- `npm run protocol:lock`: passed; the direction-only lock needed no change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The internal `draft-send` command is ready for the next plan to route after verified draft/revision readback.
- The phrase vocabulary and protocol source changes remain local pending written voice-owner review. No blocker prevents Phase 08 Plan 08-06 work.

---
*Phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Task commits `54f8e16` and `5afd642` exist.
- Summary and all listed implementation/test files are present.
- User-owned untracked files remain unmodified and unstaged.
