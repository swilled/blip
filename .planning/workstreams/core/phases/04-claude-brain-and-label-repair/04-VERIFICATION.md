---
phase: 04-claude-brain-and-label-repair
verified: 2026-10-17T10:51:32Z
status: gaps_found
score: 5/10 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 1/5
  gaps_closed: []
  gaps_remaining:
    - "Production SDK init with zero tools remains unverified; Plan 04-08 live use was deferred."
    - "No live grammar-miss Intent or end-to-end latency was observed."
    - "Windows SDK cancellation and role recreation were not exercised."
    - "No live label repair or real-model cache reuse was observed."
    - "The approved-mode harness still has no production probe sequence."
  regressions: []
gaps:
  - truth: "The production Claude provider initializes on the developer's subscription with zero tools and can serve requests."
    status: partial
    reason: "Plan 04-08 was deferred before SDK initialization. The sanitized report records zero SDK initializations and zero prompts, so no production init or usable Claude role was observed. The offline fail-closed configuration and init assertion pass."
    artifacts:
      - path: "apps/server/src/brain/claude/session.ts"
        issue: "The production empty-tool check is implemented, but no live init evidence exists."
      - path: "apps/server/scripts/claude-sdk-live-check.ts"
        issue: "The approved-mode verify callback throws because the production probe sequence is not configured."
    missing:
      - "A working bounded production probe path followed by a separately approved live init showing zero tools for both roles."
  - truth: "A grammar miss produces a schema-valid Intent for a current target within the intended latency."
    status: partial
    reason: "Offline routing, schema/current-ID checks, privacy gating, and retry behavior pass with injected providers. No live prompt, Intent, or latency was recorded."
    artifacts:
      - path: "apps/server/src/brain/claude/intent-router.ts"
        issue: "Only offline provider behavior is verified; the Plan 04-08 harness does not call routeIntent."
    missing:
      - "A bounded live grammar-miss check returning an accepted current-ID Intent with measured latency."
  - truth: "A hung or failed production SDK call speaks the fallback, releases the next turn, and recovers on Windows."
    status: partial
    reason: "The watchdog, exact fallback, queue release, and role recreation pass injected-provider tests. The pinned SDK's Windows cancellation and recreated-role behavior were not exercised."
    artifacts:
      - path: "apps/server/src/turn.ts"
        issue: "Recovery is verified only through the injected SDK adapter, not the production SDK."
    missing:
      - "A live bounded cancellation/recreation check followed by a successful synthetic intent call."
  - truth: "Claude repairs eligible labels asynchronously and a later visit reuses a validated cache entry."
    status: partial
    reason: "Baseline-first scheduling, descriptive-only patch validation, identity checks, merge, and value-free cache reuse pass offline tests. No live repair output or real-model cache hit exists, and the Plan 04-08 harness does not call RepairCache."
    artifacts:
      - path: "apps/server/src/brain/claude/repair-coordinator.ts"
        issue: "Production repair is wired, but no real-model patch was observed."
      - path: "apps/server/scripts/claude-sdk-live-check.ts"
        issue: "No production repair/cache probe is configured."
    missing:
      - "A bounded live repair result validated against current synthetic identity and IDs, then saved and reloaded from RepairCache."
  - truth: "After fresh approval, the Plan 04-08 verifier can perform its bounded production intent, repair/cache, and cancellation checks."
    status: failed
    reason: "The live decision was correctly deferred, but the approved-mode implementation is incomplete: verify() throws 'The production probe sequence is not configured.' The script contains no routeIntent or RepairCache call, so it cannot produce the planned evidence if approval is later recorded."
    artifacts:
      - path: "apps/server/scripts/claude-sdk-live-check.ts"
        issue: "Approved mode stops at an unconfigured verify callback; the declared routeIntent and RepairCache key links are absent."
    missing:
      - "Implement the synthetic live probe sequence and its sanitized result reporting before a future authorized live run."

# Phase 4: Claude Brain and Label Repair Verification Report

**Phase Goal:** Real Claude, running locked down on the developer's own subscription, understands free-form requests and repairs a broken form's labels in the background, with no way to act on the page.
**Verified:** 2026-10-17T10:51:32Z
**Status:** gaps_found
**Re-verification:** Yes — after Plan 04-08; the previous live-provider gaps remain open.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Claude mode uses isolated subscription-backed roles, starts only with an empty init tool list, and refuses startup with a clear error otherwise. | PARTIAL | `session.ts` preserves `tools: []`, `disallowedTools: ["*"]`, empty settings/MCP configuration, `dontAsk`, empty cwd, API-key removal, and the mandatory empty-init assertion. Injected tests cover configuration and refusal. Plan 04-08 reports `sdkInitializationCount: 0`; production streaming startup and subscription use remain unverified. |
| 2 | An unmatched utterance yields a schema-valid Intent referencing current page IDs, typically within about two seconds. | PARTIAL | `intent-router.ts` routes only privacy-approved grammar misses through a value-free projection, validates the Intent schema and current IDs, and allows one bounded retry. Fake-provider tests pass; no live result or latency was recorded. |
| 3 | A hung or failed Claude intent call speaks the exact fallback, releases the next turn, and recovers the role. | PARTIAL | `turn.ts` has the four-second watchdog, fallback speech, turn release, and abort/recreation flow. Offline integration tests pass with an injected SDK adapter. Windows behavior of the pinned production SDK is unverified. |
| 4 | The deterministic baseline is immediate; eligible labels are repaired asynchronously with descriptive-only patches and safely reused from cache. | PARTIAL | The repair coordinator is scheduled after the baseline reply. Strict schema/identity validation, narrow merge, value-free cache, stale-result handling, and fake-provider cache reuse pass offline tests. No live repair result or live cache hit exists. |
| 5 | The model cannot directly act on the page, and sensitive-shaped text or values are withheld from model/speech read-back. | VERIFIED | Claude roles expose intent/repair operations only and fail closed on init tools. Intent output is checked before deterministic routing; the projection omits values and errors; privacy gates secret-shaped utterances; extension post-write checks remain. Focused offline tests pass. |

**Phase truth score:** 1/5 fully verified. The 04-08 plan-specific offline checks add 4/5 verified truths; the production probe sequence is missing. **Combined score:** 5/10 must-haves verified.

## Plan 04-08 Must-Haves

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Offline diagnosis preserves the locked tool settings and init assertion without inspecting credentials or contacting Claude. | VERIFIED | `session.ts` and injected-provider tests retain both deny-all settings and the empty-init guard. Offline CLI returned `status: offline`, `stage: not_started`, with zero prompt counts; it exits before report read/provider creation. |
| 2 | Fresh, plan-specific approval is required before live initialization; the earlier spike approval cannot unlock it. | VERIFIED | The live script checks the exact `phase04FollowupApproval: approve-04-08-live-check` line before provider creation. An offline test rejects the old spike approval. |
| 3 | The production streaming provider cannot send prompts until both role init messages report zero tools. | VERIFIED OFFLINE | Provider creation prewarms both roles; `session.ts` rejects a malformed or nonempty init list before the provider becomes usable. Injected tests cover refusal. This verifies the fail-closed wiring, not a live SDK init. |
| 4 | If the live gate passes, bounded intent latency/current-ID, repair/cache, and Windows cancellation/recreation checks run without exposing model output. | FAILED | No live check ran, as required by the deferred decision. In addition, the live script's production `verify()` callback throws `The production probe sequence is not configured.` and has no `routeIntent` or `RepairCache` wiring. |
| 5 | A tool-bearing init is reported as externally blocked, sends no later prompt, preserves prior counts, and leaves the four requirements pending. | VERIFIED OFFLINE | The injected harness tests cover initial and recreated-role tool errors, monotonic prompt counts, and zero subsequent prompts. `04-08-LIVE-CHECK.md` records the deferred outcome as `externally_blocked`, with zero SDK initializations and zero prompts; all four requirements remain pending. |

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/server/src/brain/claude/session.ts` | Isolated role lifecycle and fail-closed init validation | VERIFIED OFFLINE | Substantive and used by the provider. Fake-adapter tests verify options, init refusal, cleanup, and recreation; live SDK init is not evidenced. |
| `apps/server/src/brain/claude/provider.ts` | Typed Intent/repair calls and role lifecycle | VERIFIED OFFLINE | Wired from Claude server mode; injected tests validate strict JSON/Zod parsing and role operations. No live model output has passed through it. |
| `apps/server/src/brain/claude/intent-router.ts`, `projection.ts`, `privacy.ts` | Grammar-first privacy gate, bounded value-free projection, current-ID validation | VERIFIED OFFLINE | Connected to the turn path; sentinel, schema, privacy, and fake-provider tests pass. |
| `apps/server/src/brain/claude/repair-schema.ts`, `repair-merge.ts`, `repair-coordinator.ts`, `repair-cache.ts` | Validated descriptive patch, asynchronous merge, identity-bound cache | VERIFIED OFFLINE | Connected to accepted snapshots and baseline completion; offline patch/flow tests pass. Live repair remains unobserved. |
| `packages/protocol/src/snapshot.ts`, `form-model.ts` | Deterministic raw-label candidates and model provenance only on resolved fields | VERIFIED | Protocol source and tests preserve the raw/resolved label-source split. |
| `apps/server/scripts/claude-sdk-live-check.ts` | Offline-first approval-gated production verifier | FAILED | Offline/approval/prompt-cap guards exist, but approved mode throws at line 218 and has no planned `routeIntent` or `RepairCache` checks. It also does not contain the plan's requested `disallowedTools` pattern; the actual settings are owned by `session.ts`. |
| `apps/server/test/claude-sdk-live-check.test.ts` | Offline proof of approval, budget, and fail-closed behavior | VERIFIED | Tests pass for deferred SDK creation, exact approval, capped counts, tool-bearing initial/recreated roles, sanitized results, and timeout handling. |
| `04-08-LIVE-CHECK.md` | Fresh approval provenance and sanitized live/defer result | VERIFIED | It records the delegated deferral accurately, `externally_blocked`, `sdkInitializationCount: 0`, and zero prompt counts. |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/server/src/server.ts` | `createClaudeProvider` | `--brain=claude` startup selection | WIRED | Provider startup is awaited before the server accepts work; initialization failure prevents listener startup. |
| `apps/server/src/turn.ts` | `routeIntent` | Unmatched utterance path | WIRED | Routing follows local grammar/field parsing and the privacy gate. |
| `apps/server/src/session/refresh.ts` | `RepairCoordinator.accept` | Accepted snapshot callback | WIRED | Only an accepted current snapshot becomes a repair candidate. |
| `apps/server/src/server.ts` | `RepairCoordinator.schedulePending` | After baseline turn/refresh completion | WIRED | Repair scheduling is asynchronous relative to the baseline answer. |
| `apps/server/src/brain/claude/repair-coordinator.ts` | `repair-cache.ts` | Validated load/save | WIRED | Cache hits are revalidated; only validated patches are saved. |
| `apps/server/scripts/claude-sdk-live-check.ts` | `apps/server/src/brain/claude/provider.ts` | Dynamic production provider creation | PARTIAL | `createClaudeProvider` is dynamically loaded only after approval, but the production verification callback is unconfigured. |
| `apps/server/scripts/claude-sdk-live-check.ts` | `apps/server/src/brain/claude/intent-router.ts` | Synthetic grammar miss through `routeIntent` | NOT WIRED | No `routeIntent` reference exists in the script. |
| `apps/server/scripts/claude-sdk-live-check.ts` | `apps/server/src/brain/claude/repair-cache.ts` | Validated repair save/reload | NOT WIRED | No `RepairCache` reference exists in the script. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `intent-router.ts` | projected page and parsed Intent | Accepted snapshot/FormModel, then provider response; local schema and current-ID checks gate routing | Offline fake-provider path only; no live response | OFFLINE FLOWING; LIVE UNVERIFIED |
| `repair-coordinator.ts` | captured/current model and repair patch | Accepted snapshot, deterministic baseline, provider patch, strict identity/ID validation | Offline fake provider and temporary cache tests | OFFLINE FLOWING; LIVE UNVERIFIED |
| `repair-cache.ts` | value-free patch entry | Validated descriptive patch keyed by normalized origin/path/structural hash | Offline cache tests confirm load/save and revalidation | VERIFIED OFFLINE |

No UI-rendering artifact is part of this phase. The dynamic server data paths were traced; the source and validation logic work offline, but no live SDK data flowed through them.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Offline live-check gate | `npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900` | `status: offline`, `stage: not_started`; 0 SDK initialization and 0 prompts | PASS |
| Provider, approval harness, intent, privacy, projection, turn, and repair-flow suites | `npm exec vitest -- run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/claude-sdk-live-check.test.ts apps/server/test/intent-router.test.ts apps/server/test/repair-flow.test.ts apps/server/test/turn-brain.test.ts apps/server/test/brain-projection.test.ts apps/server/test/brain-privacy.test.ts` | 7 files, 48 tests passed | PASS |
| Repair patch, baseline, extension post-write, and protocol suites | `npm exec vitest -- run apps/server/test/repair-patch.test.ts apps/server/test/baseline.test.ts apps/extension/test/act.test.ts packages/protocol/test/form-model.test.ts packages/protocol/test/protocol-lock.test.ts` | 5 files, 84 tests passed | PASS |
| Workspace TypeScript | `npm run typecheck` | Exit 0 | PASS |
| Production SDK initialization, prompts, latency, Windows cancellation, and repair | Not run; fresh live-use approval was deferred | The sanitized report records `sdkInitializationCount: 0`, `totalPromptCount: 0` | SKIP / GAP |

No live SDK or provider call was made, and no credentials were inspected.

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| BRAIN-01 | 04-01, 04-02, 04-08 | Isolated Agent SDK subscription provider; refuses init with tools | BLOCKED / PENDING | Offline config and fail-closed assertion pass. No production init was attempted; the follow-up report records zero initializations. |
| BRAIN-02 | 04-03, 04-04, 04-06, 04-08 | Free-form requests become structured current-page Intents | BLOCKED / PENDING | Offline grammar/privacy/projection/schema/current-ID path passes. No live accepted Intent or latency measurement exists. |
| BRAIN-03 | 04-01, 04-02, 04-06, 04-07, 04-08 | Prewarm and recover from failed/hung calls with spoken fallback | BLOCKED / PENDING | Prewarm/watchdog/fallback/recreation code passes injected tests. Pinned SDK Windows cancellation/recreation remains unverified. |
| PAGE-04 | 04-03, 04-05, 04-07, 04-08 | Background Claude label repair and structural cache | BLOCKED / PENDING | Offline repair/cache behavior passes; no live repair result or return-visit cache hit exists. |

All four requirements mapped to Phase 4 appear in plan requirement fields; no orphaned Phase 4 requirement was found. `REQUIREMENTS.md` still lists all four as Pending, consistent with this verification. The Core roadmap currently marks Phase 4 completed despite these pending requirements; this verification did not edit roadmap or state metadata.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/server/scripts/claude-sdk-live-check.ts` | 218 | Approved-mode `verify()` throws `The production probe sequence is not configured.` | Blocker | Prevents the follow-up verifier from exercising the planned live intent, repair/cache, or cancellation checks even if a fresh approval is later recorded. |
| `apps/server/src/brain/claude/repair-coordinator.ts` | 19 | `PLACEHOLDER_LABEL` matching regex | Info | Eligibility classifier for generic field labels, not a placeholder implementation. |

## Human Verification Required

### 1. Production Agent SDK integration

**Test:** After the approved-mode harness is implemented and a fresh bounded live-use approval is available, run it using synthetic data only.
**Expected:** Both streaming roles initialize with zero tools; accepted synthetic Intents reference current IDs and meet the latency target; cancellation/recreation recovers; a repair patch validates and reloads from cache.
**Why human:** This requires the external Claude SDK/subscription and checks pinned Windows process behavior. No live run was authorized in this follow-up.

### 2. User-facing repair and recovery behavior

**Test:** In an authorized later live check, observe a broken demo form through baseline response, background repair, and a return visit; also trigger the documented failure/recovery scenario.
**Expected:** The baseline answer is immediate, repaired descriptions appear without changing policy/value data, cache reuse is correct, and failure speech is clear.
**Why human:** Spoken clarity and end-to-end use of a real provider/page cannot be assessed by the offline fake-provider tests.

## Gaps Summary

The deterministic privacy, routing, watchdog, label repair, and cache implementations remain substantive and connected; the selected offline tests and typecheck pass. Plan 04-08's offline approval/prompt-budget/fail-closed harness is tested, and its report correctly records the delegated deferral with zero live SDK initializations and prompts. However, the phase's real-provider goal remains unmet, and the new approved-mode verifier is itself incomplete: its callback throws before any probes, with no intent-router or repair-cache checks. Keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending. The roadmap already marks Phase 4 complete; this report records the contrary evidence and leaves roadmap/state unchanged.

---
Verified: 2026-10-17T10:51:32Z
Verifier: GSD phase verifier
