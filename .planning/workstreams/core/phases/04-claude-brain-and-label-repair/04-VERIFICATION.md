---
phase: 04-claude-brain-and-label-repair
verified: 2026-10-17T11:15:06Z
status: gaps_found
score: 5/10 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/10
  gaps_closed:
    - "The approved-mode verifier stub is closed: synthetic intent routing, cancellation/recreation, recovery, repair validation, and cache reload now run through an injected provider and pass offline tests."
  gaps_remaining:
    - "The production streaming SDK has not been initialized in this follow-up, so zero-tool subscription startup remains unverified."
    - "No live grammar-miss Intent or production latency measurement exists."
    - "The pinned Windows SDK cancellation and role-recreation path remains untested against the production provider."
    - "No live repair output or real-model cache reuse has been observed."
  regressions: []
gaps:
  - truth: "The production Claude provider initializes on the developer subscription with zero tools for both roles."
    status: partial
    reason: "The 04-08 follow-up remains deferred with zero SDK initializations. The earlier startup()+outputFormat spike reported one init tool for each role; it does not establish the streaming provider's production behavior."
    artifacts:
      - path: "apps/server/src/brain/claude/session.ts"
        issue: "Fail-closed empty-tool configuration and refusal are covered offline, but the production streaming init has no live evidence."
    missing:
      - "A separately authorized production streaming initialization showing zero tools for both roles."
  - truth: "A grammar miss produces a schema-valid Intent for a current target within the intended latency."
    status: partial
    reason: "The route and synthetic current-ID checks pass with injected providers; no production prompt, Intent, or latency was recorded."
    artifacts:
      - path: "apps/server/src/brain/claude/intent-router.ts"
        issue: "Only offline provider behavior is verified."
    missing:
      - "A bounded live grammar-miss result with a current synthetic ID and measured latency."
  - truth: "A hung or failed production SDK call falls back, releases the next turn, and recovers on Windows."
    status: partial
    reason: "Watchdog and role recovery pass with injected providers. The production SDK's Windows cancellation and recreated-role behavior was not exercised."
    artifacts:
      - path: "apps/server/src/turn.ts"
        issue: "Recovery evidence uses the injected adapter, not the pinned production SDK."
    missing:
      - "A bounded production cancellation, role recreation, and recovery check."
  - truth: "Claude repairs eligible labels asynchronously and a later visit reuses a validated cache entry."
    status: partial
    reason: "Offline repair validation, cache persistence, and reload pass. The deferred report has no live repair output or real-model cache hit."
    artifacts:
      - path: "apps/server/src/brain/claude/repair-coordinator.ts"
        issue: "The production repair path is wired, but no real-model patch has been observed."
    missing:
      - "A bounded live repair patch validated against the synthetic identity and IDs, then saved and reloaded from RepairCache."
---

# Phase 4: Claude Brain and Label Repair Verification Report

**Phase Goal:** Real Claude, running locked down on the developer's own subscription, understands free-form requests and repairs a broken form's labels in the background, with no way to act on the page.

**Verified:** 2026-10-17T11:15:06Z
**Status:** gaps_found
**Re-verification:** Yes — after Plan 04-09 offline harness gap closure.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Claude runs on the developer subscription with isolated, tool-less roles and refuses startup if init reports tools. | PARTIAL | session.ts retains deny-all settings and the mandatory empty-init check; provider tests pass. The prior startup()+outputFormat spike reported one tool per role, and the 04-08 report records zero streaming SDK initializations. |
| 2 | A grammar miss yields a schema-valid Intent using only current page IDs, typically within about two seconds. | PARTIAL | routeIntent schema/current-ID checks pass with injected fake providers. No live prompt, result, or latency is recorded. |
| 3 | A hung or invalid Claude call speaks the fallback, releases the next turn, and recovers. | PARTIAL | Watchdog and recovery tests pass with an injected provider. The pinned SDK's Windows cancellation and recreation behavior is unverified. |
| 4 | Eligible labels are repaired asynchronously and a later visit reuses a validated cache entry. | PARTIAL | Fake-provider repair validation, cache write, and cache reload pass. No real-model repair or live cache hit exists. |
| 5 | The model cannot directly act on the page, and sensitive values are withheld from model input and read-back. | VERIFIED | Claude exposes only structured intent/repair operations; the deterministic executor owns actions. Privacy projection and extension post-write checks remain present. Regression tests for provider, projection, privacy, turn routing, and extension act behavior pass. |

**Phase truth score:** 1/5 fully verified.

### Plan 04-08 Must-Haves

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Offline diagnosis preserves locked tool settings and does not contact Claude or inspect credentials. | VERIFIED | Offline CLI exits at not_started with zero prompts; source returns before report reads and provider creation. |
| 2 | Fresh exact approval is required before live initialization; the earlier spike approval cannot unlock it. | VERIFIED | Tests reject missing, stale, deferred, duplicate, and non-exact approval lines. The actual report remains deferred. |
| 3 | The production provider sends no prompt until both roles pass the zero-tool init check. | VERIFIED OFFLINE | session.ts fails closed on nonempty init; injected provider tests cover rejection and zero later prompts. No live init is claimed. |
| 4 | If the tool gate passes, bounded intent, cancellation/recreation, and repair/cache probes run without exposing provider output. | PARTIAL | Plan 04-09 closes the code gap: the approved CLI callback is wired through routeIntent, patch validation, and RepairCache; fake tests exercise sanitized evidence and bounded dispatch. The real provider path was not run, so production latency and Windows behavior remain unobserved. |
| 5 | Unexpected initial or recreated-role tools block later prompts, preserve counts, and leave requirements pending. | VERIFIED OFFLINE | Fake tests cover initial/recreated-role refusal, cumulative counts, and zero post-block prompts. The deferred report records zero init/prompts and all four requirements pending. |

### Plan 04-09 Gap-Closure Acceptance

All five new Plan 04-09 must-haves are VERIFIED offline:

- The injected approved-mode sequence runs two synthetic current-ID routes, a bounded cancellation/recreation and recovery path when cancellation is observed, and a validated repair/cache round trip.
- Tests use synthetic page data and fake providers; the production SDK is not imported or started by those tests.
- Missing, deferred, stale, duplicate, or non-exact approval lines return before provider creation and prompt dispatch.
- Counts stay cumulative; a recreated role that reports tools gets no recovery prompt; the overall deadline aborts and closes the provider.
- Serialized results whitelist sanitized counts, statuses, booleans, and elapsed time. The deferred 04-08 report is unchanged and the four requirements remain Pending.

This closes the prior harness implementation gap. It does not provide the missing production SDK evidence needed to satisfy Phase 4's goal.

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| apps/server/src/brain/claude/session.ts | Isolated role lifecycle and fail-closed init validation | VERIFIED OFFLINE | Substantive and wired into provider startup; tests cover options, init refusal, cleanup, and recreation. Live streaming initialization is unverified. |
| apps/server/src/brain/claude/provider.ts | Typed intent/repair calls and role lifecycle | VERIFIED OFFLINE | Wired from Claude server mode; offline tests exercise injected responses. No live model output passed through it. |
| apps/server/src/brain/claude/intent-router.ts, projection.ts, privacy.ts | Grammar-first privacy gate, bounded value-free projection, current-ID validation | VERIFIED OFFLINE | Connected to turn routing; fake-provider, privacy, schema, and current-ID regression suites pass. |
| apps/server/src/brain/claude/repair-schema.ts, repair-merge.ts, repair-coordinator.ts, repair-cache.ts | Validated descriptive patch, asynchronous merge, identity-bound cache | VERIFIED OFFLINE | Connected to accepted snapshots and baseline completion; fake-provider patch and cache behavior pass. Live repair remains unobserved. |
| apps/server/scripts/claude-sdk-live-check.ts | Offline-first, approval-gated production verifier | VERIFIED OFFLINE | The former unconfigured callback is replaced by the injected probe sequence. Production provider creation is dynamically imported only after the exact report gate. No live run occurred. |
| apps/server/test/claude-sdk-live-check.test.ts | Offline proof of approval, limits, probe behavior, and fail-closed handling | VERIFIED | 12 tests pass, covering routeIntent, cancellation/recreation, cache reload, prompt caps, timeout, output sanitization, and approval refusal. |
| .planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-08-LIVE-CHECK.md | Approval provenance and sanitized live/defer result | VERIFIED | Hash is unchanged: E46E6A356A540D4F5EB9887489E67B6C41CAC9C5BA3EA6EF67C5E3512CCDB1B8. It records defer, zero SDK initialization/prompts, and all four requirements Pending. |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| apps/server/src/server.ts | createClaudeProvider | --brain=claude startup selection | WIRED | Startup awaits provider creation; initialization failure prevents listener startup. |
| apps/server/src/turn.ts | routeIntent | Unmatched utterance path | WIRED | Grammar/local parsing and privacy checks precede model routing. |
| apps/server/src/session/refresh.ts | RepairCoordinator.accept | Accepted snapshot callback | WIRED | Only a current accepted snapshot becomes a repair candidate. |
| apps/server/src/server.ts | RepairCoordinator.schedulePending | After baseline turn/refresh | WIRED | Repair work is asynchronous relative to the baseline response. |
| apps/server/src/brain/claude/repair-coordinator.ts | repair-cache.ts | Validated load/save | WIRED | Cache hits are revalidated; only validated patches are saved. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/provider.ts | Dynamic createClaudeProvider import after exact approval | WIRED, LIVE UNVERIFIED | Main production callback is wired; no production initialization was attempted. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/intent-router.ts | Synthetic grammar misses through routeIntent | WIRED | Fake tests confirm schema/current-ID checks and one dispatch per route. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/repair-schema.ts and repair-cache.ts | Validate, save, reload, and revalidate synthetic patch | WIRED | Fake tests confirm the temporary cache round trip and stale patch rejection. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| intent-router.ts | projected page and parsed Intent | Accepted snapshot/FormModel, then provider response; schema and current-ID checks gate routing | Fake provider only in this re-verification | OFFLINE FLOWING; LIVE UNVERIFIED |
| repair-coordinator.ts | current model and repair patch | Accepted snapshot, deterministic baseline, provider patch, identity/ID validation | Fake provider and temporary cache in tests | OFFLINE FLOWING; LIVE UNVERIFIED |
| repair-cache.ts | value-free patch entry | Validated descriptive patch keyed by normalized URL and structure | Disk-backed temp-cache tests confirm save/load and revalidation | VERIFIED OFFLINE |

No UI-rendering artifact is part of this phase. Dynamic server paths were traced through the fake provider and local validation logic; no live SDK data flowed through them.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Approved-mode synthetic harness | npx vitest run --project @blip/server apps/server/test/claude-sdk-live-check.test.ts | 1 file, 12 tests passed | PASS |
| Full repository test suite | npm test | 76 files passed, 12 skipped; 790 tests passed, 21 skipped | PASS |
| Offline live-check gate | npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900 | status offline, stage not_started, 0 SDK initialization and 0 prompts | PASS |
| Provider, routing, repair, watchdog, projection, and privacy regressions | npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/intent-router.test.ts apps/server/test/repair-flow.test.ts apps/server/test/turn-brain.test.ts apps/server/test/brain-projection.test.ts apps/server/test/brain-privacy.test.ts | 6 files, 40 tests passed | PASS |
| Extension action and protocol regressions | npx vitest run apps/extension/test/act.test.ts packages/protocol/test/form-model.test.ts packages/protocol/test/protocol-lock.test.ts | 3 files, 40 tests passed | PASS |
| Workspace TypeScript | npm run typecheck | Exit 0 | PASS |
| Live production initialization, prompts, latency, Windows cancellation, and real repair | Not run; 04-08 live-use decision remains deferred | Report records zero SDK initialization and zero prompts | GAP |

No live SDK or provider call was made, and no credentials or environment values were inspected.

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| BRAIN-01 | 04-01, 04-02, 04-08 | Isolated subscription provider; refuses unexpected init tools | BLOCKED / PENDING | Offline configuration and refusal pass. The follow-up report records zero streaming initializations. |
| BRAIN-02 | 04-03, 04-04, 04-06, 04-08 | Free-form requests become structured current-page Intents | BLOCKED / PENDING | Offline grammar/privacy/schema/current-ID path passes. No live Intent or latency exists. |
| BRAIN-03 | 04-01, 04-02, 04-06, 04-07, 04-08 | Prewarm and recover from failed/hung calls with spoken fallback | BLOCKED / PENDING | Watchdog and fake-adapter recovery pass; production SDK cancellation/recreation is unverified. |
| PAGE-04 | 04-03, 04-05, 04-07, 04-08 | Background label repair and structural cache | BLOCKED / PENDING | Offline repair/cache behavior passes; no live patch or real-model cache hit exists. |

All Phase 4 requirements declared by plans are represented above; no orphaned Phase 4 requirement was found. REQUIREMENTS.md still lists all four as Pending. This is consistent with the evidence.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| apps/server/scripts/claude-sdk-live-check.ts | — | None of the previous unconfigured verifier stub remains; approved mode calls runApprovedProbeSequence | — | The Plan 04-09 harness gap is closed. |
| apps/server/src/brain/claude/repair-coordinator.ts | 19 | PLACEHOLDER_LABEL classifier for generic field labels | Info | Eligibility matcher for generic labels, not a placeholder implementation. |

## Human Verification Required

### 1. Production Agent SDK integration

**Test:** Only after fresh, separate authorization is recorded in the existing report, run its bounded check using synthetic data.
**Expected:** Both production streaming roles initialize with zero tools; current-ID Intents and latency are recorded; cancellation/recreation recovers; a validated repair patch reloads from cache.
**Why human:** This consumes the developer subscription and exercises the external SDK plus Windows process behavior. The current report explicitly defers that use.

### 2. End-to-end repair and recovery behavior

**Test:** In a later authorized integrated demo, observe the broken test form through baseline response, background repair, a return visit, and a failure/recovery turn.
**Expected:** Baseline response is not delayed, repaired descriptions do not alter policy/value data, cached labels are reused, and fallback speech is clear.
**Why human:** Real provider integration and spoken/user-facing behavior cannot be established by synthetic offline tests.

## Gaps Summary

Plan 04-09 successfully closes the approved-mode harness stub. The verifier now runs synthetic grammar misses through routeIntent, validates current IDs and a repair patch, exercises cancellation/recreation under injected conditions, saves and reloads through RepairCache, enforces prompt/deadline caps, and serializes only sanitized evidence. The focused test suite, related regression suites, offline CLI path, and typecheck pass.

Phase 4's goal remains unmet because the live streaming SDK check is still deferred. The 04-08 report is unchanged and records zero initialization and prompts; the earlier startup()+outputFormat spike reported a tool for each role. There is no live Intent, Windows SDK recovery result, repair output, or real-model cache hit. Keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 Pending. The roadmap and state now show all nine plans complete while Phase 4 remains in progress pending live evidence.

---

_Verified: 2026-10-17T11:15:06Z_
_Verifier: GSD phase verifier_
