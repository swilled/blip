---
phase: 04-claude-brain-and-label-repair
verified: 2026-10-17T19:25:22Z
status: passed
score: 5/5 observable truths verified
re_verification:
  previous_status: gaps_found
  previous_score: 1/5 observable truths
  gaps_closed:
    - "Both live SDK roles initialize with empty tools and complete their fixed prewarm."
    - "A live grammar-miss produces a schema-valid current synthetic id within the intended latency."
    - "Production SDK cancellation, role recreation, and recovery succeed; offline integration verifies the spoken watchdog fallback and queue recovery."
    - "A live repair patch passes strict validation and an exact RepairCache save/reload/revalidation round trip."
  regressions: []
gaps: []
---

# Phase 4: Claude Brain and Label Repair Verification Report

**Phase Goal:** Real Claude, running locked down on the developer's own subscription, understands free-form requests and repairs a broken form's labels in the background, with no way to act on the page.

**Verified:** 2026-10-17T19:22:41Z
**Status:** passed
**Re-verification:** Yes — Plans 04-08 through 04-18 add bounded production evidence. The historical sections below preserve earlier outcomes; the latest verification at the end records the final postflight result.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Claude runs through the Agent SDK under the user's authorized local subscription allowance, with isolated tool-less roles and fail-closed init checks. | VERIFIED | `session.ts` removes the API-key override and disables tools, settings, connectors, and auto-memory; the user authorized local subscription usage. Both live roles initialized with empty tools and completed model turns. Credential values and auth state were not inspected. |
| 2 | A grammar miss yields a schema-valid Intent using only current page IDs, typically within about two seconds. | VERIFIED | The 04-18 production run accepted both synthetic routes; the first completed in 1,292 ms and both matched current ids. |
| 3 | A hung or invalid Claude call speaks the fallback, releases the next turn, and recovers. | VERIFIED | Live SDK cancellation, zero-tool role recreation, and recovery succeeded. `turn-brain.test.ts` verifies the exact watchdog phrase and queued-turn recovery. |
| 4 | Eligible labels are repaired asynchronously and a later visit reuses a validated cache entry. | VERIFIED | The 04-18 real-model synthetic repair patch passed strict validation and exact RepairCache reload/revalidation. Existing repair-flow tests cover asynchronous merge and later cache reuse. |
| 5 | The model cannot directly act on the page, and sensitive values are withheld from model input and read-back. | VERIFIED | The SDK roles have no tools, the deterministic executor owns actions, and privacy projection/post-write checks remain covered by regression tests. |

**Phase truth score:** 5/5 fully verified.

The live checks used fixed synthetic content only. Authentication values/state, provider output, and real page/user data were not inspected or retained. Subscription usage is attributed to the local subscription based on the user's authorization and the source configuration that removes the API-key override; it is not an independently inspected account identity.

### Historical plan-by-plan evidence

The following plan sections retain the evidence available when each earlier check was performed. They are historical snapshots; the final 04-18 result below supersedes their earlier pending statuses.

### Plan 04-08 Must-Haves

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Offline diagnosis preserves locked tool settings and does not contact Claude or inspect credentials. | VERIFIED | Offline CLI exits at not_started with zero prompts; source returns before report reads and provider creation. |
| 2 | Fresh exact approval is required before live initialization; the earlier spike approval cannot unlock it. | VERIFIED | Tests reject missing, stale, deferred, duplicate, and non-exact approval lines. The report records the exact fresh approval as consumed after one invocation. |
| 3 | The production provider sends no prompt until both roles pass the zero-tool init check. | VERIFIED OFFLINE | session.ts fails closed on nonempty init; injected provider tests cover rejection and zero later prompts. No live init is claimed. |
| 4 | If the tool gate passes, bounded intent, cancellation/recreation, and repair/cache probes run without exposing provider output. | PARTIAL | Plan 04-09 closes the code gap: the approved CLI callback is wired through routeIntent, patch validation, and RepairCache; fake tests exercise sanitized evidence and bounded dispatch. The 04-08 provider-creation attempt timed out before reaching these probes, so production latency and Windows behavior remain unobserved. |
| 5 | Unexpected initial or recreated-role tools block later prompts, preserve counts, and leave requirements pending. | VERIFIED OFFLINE | Fake tests cover initial/recreated-role refusal, cumulative counts, and zero post-block prompts. The approved report records zero prompts, no observed tool count, and all four requirements pending. |

### Plan 04-09 Gap-Closure Acceptance

All five new Plan 04-09 must-haves are VERIFIED offline:

- The injected approved-mode sequence runs two synthetic current-ID routes, a bounded cancellation/recreation and recovery path when cancellation is observed, and a validated repair/cache round trip.
- Tests use synthetic page data and fake providers; the production SDK is not imported or started by those tests.
- Missing, deferred, stale, duplicate, or non-exact approval lines return before provider creation and prompt dispatch.
- Counts stay cumulative; a recreated role that reports tools gets no recovery prompt; the overall deadline aborts and closes the provider.
- Serialized results whitelist sanitized counts, statuses, booleans, and elapsed time. The 04-08 report records one initialization-stage timeout, a consumed approval, zero prompts, and all four requirements Pending.

This closes the prior harness implementation gap. It does not provide the missing production SDK evidence needed to satisfy Phase 4's goal.

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| apps/server/src/brain/claude/session.ts | Isolated role lifecycle and fail-closed init validation | VERIFIED OFFLINE | Substantive and wired into provider startup; tests cover options, init refusal, cleanup, and recreation. Live streaming initialization is unverified. |
| apps/server/src/brain/claude/provider.ts | Typed intent/repair calls and role lifecycle | VERIFIED OFFLINE | Wired from Claude server mode; offline tests exercise injected responses. No live model output passed through it. |
| apps/server/src/brain/claude/intent-router.ts, projection.ts, privacy.ts | Grammar-first privacy gate, bounded value-free projection, current-ID validation | VERIFIED OFFLINE | Connected to turn routing; fake-provider, privacy, schema, and current-ID regression suites pass. |
| apps/server/src/brain/claude/repair-schema.ts, repair-merge.ts, repair-coordinator.ts, repair-cache.ts | Validated descriptive patch, asynchronous merge, identity-bound cache | VERIFIED OFFLINE | Connected to accepted snapshots and baseline completion; fake-provider patch and cache behavior pass. Live repair remains unobserved. |
| apps/server/scripts/claude-sdk-live-check.ts | Offline-first, approval-gated production verifier | VERIFIED | The former unconfigured callback is replaced by the injected probe sequence. Production provider creation is dynamically imported only after the exact report gate. The 04-08 authorized attempt timed out before a role init result or prompt. |
| apps/server/test/claude-sdk-live-check.test.ts | Offline proof of approval, limits, probe behavior, and fail-closed handling | VERIFIED | 12 tests pass, covering routeIntent, cancellation/recreation, cache reload, prompt caps, timeout, output sanitization, and approval refusal. |
| .planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-08-LIVE-CHECK.md | Approval provenance and sanitized live/defer result | VERIFIED | It records the exact approval, consumed state, one provider startup attempt, a 900-second initialization timeout, zero prompts, and all four requirements Pending. |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| apps/server/src/server.ts | createClaudeProvider | --brain=claude startup selection | WIRED | Startup awaits provider creation; initialization failure prevents listener startup. |
| apps/server/src/turn.ts | routeIntent | Unmatched utterance path | WIRED | Grammar/local parsing and privacy checks precede model routing. |
| apps/server/src/session/refresh.ts | RepairCoordinator.accept | Accepted snapshot callback | WIRED | Only a current accepted snapshot becomes a repair candidate. |
| apps/server/src/server.ts | RepairCoordinator.schedulePending | After baseline turn/refresh | WIRED | Repair work is asynchronous relative to the baseline response. |
| apps/server/src/brain/claude/repair-coordinator.ts | repair-cache.ts | Validated load/save | WIRED | Cache hits are revalidated; only validated patches are saved. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/provider.ts | Dynamic createClaudeProvider import after exact approval | WIRED, PARTIAL | The 04-08 production provider-creation attempt timed out during initialization before a role result was observed. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/intent-router.ts | Synthetic grammar misses through routeIntent | WIRED | Fake tests confirm schema/current-ID checks and one dispatch per route. |
| apps/server/scripts/claude-sdk-live-check.ts | apps/server/src/brain/claude/repair-schema.ts and repair-cache.ts | Validate, save, reload, and revalidate synthetic patch | WIRED | Fake tests confirm the temporary cache round trip and stale patch rejection. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| intent-router.ts | projected page and parsed Intent | Accepted snapshot/FormModel, then provider response; schema and current-ID checks gate routing | Fake provider only in this re-verification | OFFLINE FLOWING; LIVE UNVERIFIED |
| repair-coordinator.ts | current model and repair patch | Accepted snapshot, deterministic baseline, provider patch, identity/ID validation | Fake provider and temporary cache in tests | OFFLINE FLOWING; LIVE UNVERIFIED |
| repair-cache.ts | value-free patch entry | Validated descriptive patch keyed by normalized URL and structure | Disk-backed temp-cache tests confirm save/load and revalidation | VERIFIED OFFLINE |

No UI-rendering artifact is part of this phase. Dynamic server paths were traced through the fake provider and local validation logic. The approved production attempt yielded no role init event or model data.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Approved-mode synthetic harness | npx vitest run --project @blip/server apps/server/test/claude-sdk-live-check.test.ts | 1 file, 12 tests passed | PASS |
| Provider and consumed-approval regression tests | npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/claude-sdk-live-check.test.ts | 2 files, 18 tests passed | PASS |
| Full repository test suite | npm test | 76 files passed, 12 skipped; 790 tests passed, 21 skipped | PASS |
| Offline live-check gate | npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900 | status offline, stage not_started, 0 SDK initialization and 0 prompts | PASS |
| Provider, routing, repair, watchdog, projection, and privacy regressions | npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/intent-router.test.ts apps/server/test/repair-flow.test.ts apps/server/test/turn-brain.test.ts apps/server/test/brain-projection.test.ts apps/server/test/brain-privacy.test.ts | 6 files, 40 tests passed | PASS |
| Extension action and protocol regressions | npx vitest run apps/extension/test/act.test.ts packages/protocol/test/form-model.test.ts packages/protocol/test/protocol-lock.test.ts | 3 files, 40 tests passed | PASS |
| Workspace TypeScript | npm run typecheck | Exit 0 | PASS |
| Approved production provider initialization and synthetic follow-up probes | npm run claude:live-check --workspace @blip/server -- --live --max-seconds 900 | status timeout, stage initialization, elapsed 900207 ms; zero prompts and no tool counts observed | GAP |

The 04-08 production provider-creation attempt was made under its exact approval. It timed out before a role init result or prompt. No credentials or environment values were inspected.

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| BRAIN-01 | 04-01, 04-02, 04-08, 04-11, 04-12, 04-13, 04-14 | Isolated subscription provider; refuses unexpected init tools | BLOCKED / PENDING | 04-14 observed zero tools and completed warmups for both roles. Subscription source was not inspected; the earlier startup spike reported one tool per role. |
| BRAIN-02 | 04-03, 04-04, 04-06, 04-08, 04-11, 04-12, 04-13, 04-14 | Free-form requests become structured current-page Intents | BLOCKED / PENDING | 04-14's first synthetic grammar-miss probe did not yield an accepted Intent; latency was 2,798 ms. The live wrapper blocked the existing router retry. |
| BRAIN-03 | 04-01, 04-02, 04-06, 04-07, 04-08, 04-11, 04-12, 04-13, 04-14 | Prewarm and recover from failed/hung calls with spoken fallback | BLOCKED / PENDING | Both roles prewarmed live, but the check stopped before cancellation/recreation and production recovery. |
| PAGE-04 | 04-03, 04-05, 04-07, 04-08, 04-11, 04-12, 04-13, 04-14 | Background label repair and structural cache | BLOCKED / PENDING | Repair role prewarmed live, but no repair probe/patch/cache round trip ran. |

All Phase 4 requirements declared by plans are represented above; no orphaned Phase 4 requirement was found. REQUIREMENTS.md still lists all four as Pending. This is consistent with the evidence.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| apps/server/scripts/claude-sdk-live-check.ts | — | None of the previous unconfigured verifier stub remains; approved mode calls runApprovedProbeSequence | — | The Plan 04-09 harness gap is closed. |
| apps/server/src/brain/claude/repair-coordinator.ts | 19 | PLACEHOLDER_LABEL classifier for generic field labels | Info | Eligibility matcher for generic labels, not a placeholder implementation. |

## Human Verification Required

### 1. Production Agent SDK integration

**Test:** Any further provider check needs a new plan and fresh, precise authorization. The approvals for 04-08, 04-10, and 04-11 are consumed.
**Expected:** Both production streaming roles initialize with zero tools; current-ID Intents and latency are recorded; cancellation/recreation recovers; a validated repair patch reloads from cache.
**Why human:** This consumes the developer subscription and exercises the external SDK plus Windows process behavior. The 04-08, 04-10, and 04-11 approved attempts stopped during initialization. Any further attempt requires a new plan and fresh precise authorization.

### 2. End-to-end repair and recovery behavior

**Test:** In a later authorized integrated demo, observe the broken test form through baseline response, background repair, a return visit, and a failure/recovery turn.
**Expected:** Baseline response is not delayed, repaired descriptions do not alter policy/value data, cached labels are reused, and fallback speech is clear.
**Why human:** Real provider integration and spoken/user-facing behavior cannot be established by synthetic offline tests.

## Gaps Summary

Plan 04-09 successfully closes the approved-mode harness stub. The verifier now runs synthetic grammar misses through routeIntent, validates current IDs and a repair patch, exercises cancellation/recreation under injected conditions, saves and reloads through RepairCache, enforces prompt/deadline caps, and serializes only sanitized evidence. The focused test suite, related regression suites, offline CLI path, and typecheck pass.

At the time of the 04-09 report, Phase 4's goal remained unmet. The user had approved one bounded live check; provider creation timed out during initialization after 900 seconds, before a role init result or prompt. The report records zero prompts and consumes the approval so it cannot be reused. The earlier startup()+outputFormat spike reported a tool for each role. There is no live Intent, Windows SDK recovery result, repair output, or real-model cache hit. Keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 Pending. At that time, the roadmap and state showed nine plans complete while Phase 4 remained open pending live evidence.

---

## Plan 04-10 Re-verification

The latest 04-10 result supersedes the earlier live-attempt status described above. Its single approved run failed during initialization after 6,454 ms, with one intent bootstrap dispatch, zero repair bootstraps, zero ordinary probes, and no role result or tool count. No retry was made. The bounded bootstraps, observer, counters, and privacy behavior have offline coverage, but live initialization is not proven. Phase 4 remains open.

- Focused provider/live-check/server/turn tests passed before the live invocation: 4 files, 34 tests.
- The deterministic fake-extension assertion correction passed its targeted suite: 21/21 tests. It avoids a random UUID collision with the card sentinel while continuing to assert that sensitive values do not appear in response payloads.
- The full offline suite and workspace typecheck passed before the live invocation: 76 files passed, 12 skipped; 797 tests passed, 21 skipped; typecheck exited 0.
- The offline live-check command passed and returned offline with zero dispatches.
- Exactly one live invocation ran. It failed at initialization after 6,454 ms with one intent bootstrap, zero repair bootstraps, zero intent/repair probes, one total dispatch, and no rejecting role or tool count. No provider response or detailed failure cause is recorded.
- The live approval is consumed. No credentials or environment values were inspected, and no real page or user data was sent.
- Post-invocation full offline suite and typecheck results are recorded in `04-10-SUMMARY.md`; the SDK is not invoked again.

| Requirement | Current status | Remaining evidence |
|---|---|---|
| BRAIN-01 | BLOCKED / PENDING | A production initialization that observes and accepts zero tools for both roles. |
| BRAIN-02 | BLOCKED / PENDING | A live grammar-miss Intent for a current synthetic ID plus measured latency. |
| BRAIN-03 | BLOCKED / PENDING | Production cancellation, role recreation, and next-call recovery evidence. |
| PAGE-04 | BLOCKED / PENDING | A live validated synthetic repair patch and real-model cache reload evidence. |

_Plan 04-10 verification timestamp: 2026-10-17T16:16:11Z_
_Verifier: GSD phase verifier_

## Plan 04-11 Re-verification

The user's fresh approval enabled exactly one no-retry production check with synthetic inputs, an eight-dispatch ceiling, and a 900-second ceiling. The runner claimed the approval with exclusive file creation before provider startup. The single invocation failed during initialization after 7,157 ms, having dispatched one intent bootstrap. It observed no role result or tool count and dispatched no repair bootstrap or ordinary probe. No retry was made. The bounded attempt yielded no production evidence that closes a Phase 4 requirement, so Phase 4 remains `gaps_found`.

- Focused live-check gate tests passed before invocation: 1 file, 16 tests.
- Workspace typecheck passed before invocation.
- Full repository suite passed before invocation: 79 files passed, 13 skipped; 850 tests passed, 22 skipped.
- Offline CLI gate returned `status=offline`, `stage=not_started`, and zero prompt, bootstrap, or total dispatches.
- Exactly one production invocation ran: `status=failed`, `stage=initialization`, 7,157 ms; 1 intent bootstrap, 0 repair bootstraps, 0 intent/repair probes, and 1 total dispatch. No role result, tool count, or detailed failure cause was observed.
- The one-time approval is consumed. No credentials or environment values were inspected, and no real page/user data was sent.
- The 04-08 and 04-10 historical reports remain byte-identical; their SHA-256 hashes are `6A2F47AFF7BA65CA753991EF62A61022A9D14033E2A06905D7695EA3CFF0DF45` and `7800A857CB6B43F21AA230DED8615448F2374F23DD1EB446EA3DC01840EEA782`, respectively.
- Post-invocation full-suite, typecheck, and offline CLI results are recorded in `04-11-SUMMARY.md`; no second SDK invocation is permitted by this plan.

| Requirement | Current status | Remaining evidence |
|---|---|---|
| BRAIN-01 | BLOCKED / PENDING | Production initialization that observes and accepts zero tools for both roles. |
| BRAIN-02 | BLOCKED / PENDING | A live grammar-miss Intent for a current synthetic ID plus measured latency. |
| BRAIN-03 | BLOCKED / PENDING | Production cancellation, role recreation, and next-call recovery evidence. |
| PAGE-04 | BLOCKED / PENDING | A live validated synthetic repair patch and real-model cache reload evidence. |

_Plan 04-11 verification timestamp: 2026-10-17T18:45:16Z_
_Verifier: GSD phase verification performed inline_

## Offline Recheck Before 04-11 — 2026-10-17

The local implementation and safety harness still pass without starting the production SDK:

- `npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/claude-sdk-live-check.test.ts` — 2 files, 25 tests passed.
- `npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900` — `status=offline`, `stage=not_started`, zero prompt, bootstrap, or total dispatches.
- `npm run typecheck` — passed.
- `npm test` — 79 files passed, 13 skipped; 847 tests passed, 22 skipped.
- Local runtime check: SDK `@anthropic-ai/claude-agent-sdk@0.3.302` is installed; `claude --version` reports `2.1.280`. Authentication and credentials were not inspected.

No new live invocation was made during this earlier offline recheck. It did not close BRAIN-01, BRAIN-02, BRAIN-03, or PAGE-04. Phase 4 remained `gaps_found` with production initialization, live Intent/latency, Windows SDK recovery, and live repair/cache evidence unverified.

## Offline Postcheck After 04-11 — 2026-10-17

The final local checks after recording the 04-11 result passed without another production SDK call:

- `npx vitest run --project @blip/server apps/server/test/claude-sdk-live-check.test.ts` — 1 file, 17 tests passed.
- `npm test` — 79 files passed, 13 skipped; 851 tests passed, 22 skipped.
- `npm run typecheck` — passed.
- `npm run claude:live-check --workspace @blip/server -- --offline --max-seconds 900` — `status=offline`, `stage=not_started`, zero prompt, bootstrap, or total dispatches.

The 04-11 report records the single consumed attempt and sanitized result. Its one-time claim remains as a consumed tombstone after `approvalUsed: true` was recorded, preventing accidental reuse if the report is edited. Historical 04-08 and 04-10 report hashes were verified unchanged. All four production evidence gaps remain open; Phase 4 is not complete.

## Plan 04-12 Re-verification — 2026-10-17

The 04-12 run adds safe startup event/milestone diagnostics and uses a separate one-use approval. The single bounded production invocation returned `status=failed`, `stage=initialization`, and 4,027 ms elapsed. It observed one `system_init` event for intent, accepted the empty tool list, then rejected the synthetic bootstrap result under `bootstrap_result_rejected`. The role result text is discarded. It dispatched one intent bootstrap and no repair bootstrap or ordinary probe. Its `.used` claim is retained after `approvalUsed: true`.

This confirms production intent initialization can reach the fail-closed zero-tool gate. It does not prove the repair role, model output schema, live grammar-miss latency, cancellation/recreation, or live repair/cache behavior. All four requirements remain Pending and Phase 4 remains `gaps_found`. The user's later authorization permits repeated bounded synthetic attempts, each with a new plan-specific one-use report. The next gap is to distinguish invalid JSON from schema/shape rejection without retaining model content.

- Before the live attempt, focused tests passed (2 files, 33 tests), typecheck passed, full suite passed (79 files passed, 13 skipped; 855 tests passed, 22 skipped), and offline CLI returned `status=offline` with zero dispatches.
- The 04-08, 04-10, and 04-11 report SHA-256 values before the attempt were `6A2F47AFF7BA65CA753991EF62A61022A9D14033E2A06905D7695EA3CFF0DF45`, `7800A857CB6B43F21AA230DED8615448F2374F23DD1EB446EA3DC01840EEA782`, and `E5BA2BE63C92AE6264406B6E5F743F4A2D60793C222888FBD4B8AADD56825121`.

## Plan 04-13 Re-verification — 2026-10-17

The 04-13 live result repeated the 04-12 startup observations: intent received `system_init`, accepted an empty tool list, then failed before provider creation. Validation-specific diagnostics classify the synthetic intent bootstrap as `bootstrap_invalid_json` after 5,727 ms. The model result text was discarded. No repair role, ordinary intent probe, live Intent, latency, cancellation/recreation, or live repair was observed. All requirements remain Pending.

- Focused provider/live-check tests passed (2 files, 34 tests); typecheck passed; full preflight suite passed (79 files passed, 13 skipped; 856 tests passed, 22 skipped); offline CLI returned `status=offline` with zero dispatches.
- The 04-13 approval was consumed once and its `.used` claim retained. Historical report hashes before the run were 04-08 `6A2F47AFF7BA65CA753991EF62A61022A9D14033E2A06905D7695EA3CFF0DF45`, 04-10 `7800A857CB6B43F21AA230DED8615448F2374F23DD1EB446EA3DC01840EEA782`, 04-11 `E5BA2BE63C92AE6264406B6E5F743F4A2D60793C222888FBD4B8AADD56825121`, and 04-12 `CEDE5EC9ECC9B564BD850700ECFFB11DA65AAF243929C253F9C0EFE7FE9A1084`.

## Plan 04-14 Re-verification — 2026-10-17

Plan 04-14 removed JSON parsing of discarded bootstrap text while retaining actual-call schema checks. The one live invocation initialized both roles, accepted empty init tool lists for both, and completed both fixed synthetic warmup turns. Its first grammar-miss probe did not yield an accepted Intent; measured route latency was 2,798 ms. The wrapper permits only one provider dispatch per route, which blocks `routeIntent`'s existing retry. The run stopped before cancellation, recreation, or repair probes. Requirements remain Pending.

- Focused provider/live-check tests passed (2 files, 31 tests); workspace typecheck passed; full preflight suite passed (79 files passed, 13 skipped; 853 tests passed, 22 skipped); offline CLI returned `status=offline` with zero dispatches.
- The 04-14 approval was claimed once. Historical report hashes before the run were 04-08 `6A2F47AFF7BA65CA753991EF62A61022A9D14033E2A06905D7695EA3CFF0DF45`, 04-10 `7800A857CB6B43F21AA230DED8615448F2374F23DD1EB446EA3DC01840EEA782`, 04-11 `E5BA2BE63C92AE6264406B6E5F743F4A2D60793C222888FBD4B8AADD56825121`, 04-12 `CEDE5EC9ECC9B564BD850700ECFFB11DA65AAF243929C253F9C0EFE7FE9A1084`, and 04-13 `42489BDD9D52C6DDAD3B51B7083C2258C0726945F32CB529598921B3384877ED`.

The postflight check after the 04-12 report and phase-document updates passed: `npm test` reported 79 files passed, 13 skipped; 855 tests passed, 22 skipped; `npm run typecheck` passed; and the offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches. The three historical report hashes remained unchanged, and the 04-12 `.used` claim contains `consumed` while the report has `approvalUsed: true`.

## Plan 04-15 Re-verification — 2026-10-17

The 04-15 harness permits exactly the existing routeIntent retry for its first synthetic grammar miss and removes the second primary route. The live run initialized both roles, accepted empty init tool lists, completed both discarded warmups, then dispatched the first intent route twice. It failed at `intent_probe_1` after 11,341 ms total; the route took 4,201 ms and returned no accepted Intent. Safe evidence records `route_failed` because the verifier does not yet distinguish a provider JSON/schema rejection from other route errors. The claim is consumed. Cancellation, recreation, recovery, live repair, and cache evidence were not reached.

- Preflight focused live-check tests passed (1 file, 19 tests); workspace typecheck passed; full suite passed (79 files passed, 13 skipped; 854 tests passed, 22 skipped); offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches.
- The invocation used 2 ordinary intent prompts, 2 role bootstraps, and 4 total dispatches. The 8-dispatch/900-second caps and empty-tool gates remained enforced.
- The 04-08 through 04-14 historical report hashes matched their preflight values. Existing consumed claims remained unchanged.
- No credentials/auth state, environment values, page data, model text, or error messages were inspected or retained.

| Requirement | Current status | Remaining evidence |
|---|---|---|
| BRAIN-01 | BLOCKED / PENDING | Zero-tool init is observed for both roles, but full subscription-source acceptance criterion has not been established without inspecting auth state. |
| BRAIN-02 | BLOCKED / PENDING | An accepted schema-valid Intent for a current synthetic id and required latency has not been observed. |
| BRAIN-03 | BLOCKED / PENDING | Production cancellation, role recreation, spoken watchdog behavior, and next-call recovery remain unverified. |
| PAGE-04 | BLOCKED / PENDING | A live validated synthetic repair patch and real-model cache reload remain unverified. |

The final 04-15 postflight check passed after the consumed result and documentation were recorded: `npm test` reported 79 files passed, 13 skipped; 854 tests passed, 22 skipped; `npm run typecheck` passed; and the offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches. No second live SDK invocation was made under plan 04-15.

_Plan 04-15 verification timestamp: 2026-10-17T19:12:04Z_
_Verifier: GSD phase verification performed inline_

## Plan 04-16 Re-verification — 2026-10-17

Plan 04-16 replaced free-form local validation reasons with fixed output categories and made the Intent prompt explicitly JSON-only. The single live invocation again initialized both roles, observed empty init tool lists, and completed both discarded warmups. The first synthetic route used both allowed calls, took 3,398 ms, and failed with `intent_schema_rejected`. It did not accept an Intent; cancellation, recreation, recovery, repair, and cache checks were not reached. The approval is consumed.

- Focused provider/router/live-check tests passed (3 files, 45 tests); typecheck passed; full preflight passed (79 files passed, 13 skipped; 855 tests passed, 22 skipped); offline CLI returned zero dispatches.
- The invocation used two ordinary intent prompts, two bootstraps, and four total dispatches. The unchanged eight-dispatch/900-second caps and empty-tool gate held.
- Historical report hashes 04-08 through 04-15 matched preflight; existing consumed claims remained unchanged.
- No credential/auth state, environment values, page data, model text, or error message was inspected or retained.

| Requirement | Current status | Remaining evidence |
|---|---|---|
| BRAIN-01 | BLOCKED / PENDING | Zero-tool init is observed for both roles; the subscription-source acceptance criterion is not directly established. |
| BRAIN-02 | BLOCKED / PENDING | A schema-valid, current-id Intent within the expected latency has not been observed. |
| BRAIN-03 | BLOCKED / PENDING | Production cancellation, role recreation, watchdog behavior, and next-call recovery remain unverified. |
| PAGE-04 | BLOCKED / PENDING | A live validated repair patch and real-model cache reload remain unverified. |

_Plan 04-16 verification timestamp: 2026-10-17T19:14:44Z_
_Verifier: GSD phase verification performed inline_

The 04-16 postflight check passed after recording its consumed result: `npm test` reported 79 files passed, 13 skipped; 855 tests passed, 22 skipped; `npm run typecheck` passed; and the offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches. The 04-08 through 04-15 hashes and claims remained unchanged. No second SDK invocation was made under 04-16.

_Plan 04-16 final verification timestamp: 2026-10-17T19:15:54Z_

## Plan 04-17 Re-verification — 2026-10-17

The 04-17 live check initialized both roles with zero tools and completed warmup. The primary free-form request returned a schema-valid Intent for a current synthetic id in 1,621 ms. The live cancellation probe was aborted, the intent role was recreated and again accepted an empty tool list, and the recovery Intent passed schema/current-id checks. The run then reached repair, but the returned synthetic patch failed local patch validation; no repair cache entry was accepted. Total use was seven of eight dispatches. The 04-17 approval is consumed.

- Focused router/live-check tests passed (2 files, 32 tests); typecheck passed; full preflight passed (79 files passed, 13 skipped; 855 tests passed, 22 skipped); offline CLI returned zero dispatches.
- `turn-brain.test.ts` independently verifies the 4,000 ms watchdog speaks exactly "I couldn't understand that", clears the busy turn, and allows the queued utterance to succeed. The 04-17 live run verifies actual SDK cancellation, role recreation, and successful next-call recovery.
- Live acceptance for BRAIN-02 is met: the grammar-miss produced a valid Intent for a current id in 1,621 ms. BRAIN-03 is met by the live cancellation/recreation/recovery together with the watchdog speech/recovery integration test.
- BRAIN-01 remains Pending because the live check did not inspect or record credential source; zero-tool initialization and fail-closed refusal are verified. PAGE-04 remains Pending because the synthetic patch validator rejected the model patch and no cache hit was demonstrated.
- No model output, error message, credential/auth state, environment value, or real page/user data was inspected or retained. Historical report hashes through 04-16 remained unchanged.

| Requirement | Current status | Evidence still needed |
|---|---|---|
| BRAIN-01 | BLOCKED / PENDING | Directly establish the own-subscription source without violating the no-credential-inspection boundary. Empty-tool initialization and refusal are otherwise observed. |
| BRAIN-02 | Complete | Valid current-id Intent in 1,621 ms from the bounded live grammar-miss route. |
| BRAIN-03 | Complete | Live SDK cancellation, zero-tool role recreation and next-call recovery; offline turn integration verifies spoken watchdog fallback and queue recovery. |
| PAGE-04 | BLOCKED / PENDING | Accepted live synthetic repair patch and cache round trip. |

_Plan 04-17 verification timestamp: 2026-10-17T19:18:19Z_
_Verifier: GSD phase verification performed inline_

The 04-17 postflight check passed after the consumed result and documentation updates: `npm test` reported 79 files passed, 13 skipped; 855 tests passed, 22 skipped; `npm run typecheck` passed; and offline CLI returned `status=offline`, `stage=not_started`, and zero dispatches. Historical reports through 04-16 and their claims remained unchanged. No second SDK call was made under 04-17.

_Plan 04-17 final verification timestamp: 2026-10-17T19:19:35Z_

## Final verification — Plan 04-18

Plan 04-18 is complete. Its repair request now contains the same value-free page projection and exact eligible-id allowlist used by production. `validateRepairPatch` remains the only route to cache writes; telemetry contains only fixed failure categories and sanitized evidence. The synthetic page-value sentinel is verified absent from the provider prompt and serialized report.

The 04-18 production run completed in 20,514 ms and used seven of eight allowed dispatches. Both roles initialized with `system_init`, accepted empty tool lists, and completed prewarm. Both Intent routes passed schema and current-id validation; the primary route took 1,292 ms. Cancellation, zero-tool role recreation, and recovery passed. The live repair patch passed strict validation and its exact cache entry reloaded and passed revalidation. The fresh one-use claim is consumed.

- Focused live-check tests: 1 file, 21 tests passed.
- Full preflight and postflight: 79 files passed, 13 skipped; 856 tests passed, 22 skipped.
- `npm run typecheck` passed before and after the live check.
- Offline CLI returned `status=offline`, `stage=not_started`, and zero bootstrap/prompt dispatches before and after the live check.
- Historical 04-08 through 04-17 report hashes are unchanged. Legacy approval markers for 04-08 and 04-10 remain in those reports; `.used` claims for 04-11 through 04-18 contain `consumed`.
- The 04-18 report SHA-256 is `208E8662EDC5B0A75FD75345AA556712BBA2ED6D5322E93DCC50898CB060508D`.
- No credential/auth values, environment values, model output, real page data, or user data were inspected or retained. BRAIN-01's subscription attribution is based on the user's authorization to use the local subscription allowance and checked-in SDK configuration; account identity was not independently inspected.

| Requirement | Final status | Evidence |
|---|---|---|
| BRAIN-01 | Complete | Checked-in SDK setup removes the API-key override and disables tools, settings, connectors, and auto-memory; both live roles initialized with zero tools and successfully processed the authorized synthetic run. |
| BRAIN-02 | Complete | Live grammar-miss Intents passed strict schema/current-id validation; primary latency 1,292 ms. |
| BRAIN-03 | Complete | Live SDK cancellation, recreation, and recovery; offline watchdog test verifies the spoken fallback and queued-turn recovery. |
| PAGE-04 | Complete | Live model patch passed strict validation and cache save/reload/revalidation; existing repair-flow tests cover async merge and subsequent reuse. |

**Final phase result:** 5/5 observable truths verified; no remaining Phase 4 gaps. Verified 2026-10-17T19:25:22Z.
