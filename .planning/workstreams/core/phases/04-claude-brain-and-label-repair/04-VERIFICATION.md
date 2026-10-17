---
phase: 04-claude-brain-and-label-repair
verified: 2026-10-17T10:24:21Z
status: gaps_found
score: 1/5 must-haves verified
gaps:
  - truth: "The production Claude provider initializes on the owner's subscription with an empty tool list and can serve requests."
    status: partial
    reason: "Isolation configuration and fail-closed handling are implemented, but both bounded startup probes reported one init tool per role, including with disallowedTools: [\"*\"]. The probes stopped before any model prompt; production streaming initialization is also unverified."
    artifacts:
      - path: "apps/server/src/brain/claude/session.ts"
        issue: "The role manager rejects any nonempty init tool list, so the observed live runtime cannot start the provider."
      - path: ".planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-SDK-SPIKE.md"
        issue: "Both bounded probes recorded initToolCount: 1 for both roles and no query/result."
    missing:
      - "A live SDK initialization that passes the zero-tool check before enabling --brain=claude."
  - truth: "A grammar miss produces a schema-valid, current-page Intent from a live Claude call within the intended latency."
    status: partial
    reason: "The router's grammar-first behavior, privacy gate, schema validation, ID checks, retry, and current-page checks pass with injected providers. No live model prompt was sent, so real output and latency are unknown."
    artifacts:
      - path: "apps/server/src/brain/claude/intent-router.ts"
        issue: "The routing behavior is tested with fakes; no production SDK response has passed through it."
      - path: ".planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-SDK-SPIKE.md"
        issue: "The live probes stopped at the init tool check."
    missing:
      - "A safe live streaming call that returns an Intent accepted by the local schema and current-ID checks, with measured latency."
  - truth: "A real SDK intent timeout or failure recovers on Windows and the following utterance works."
    status: partial
    reason: "The watchdog, fallback speech, turn release, and role recreation are covered with injected adapters. The pinned SDK's Windows cancellation and recreation behavior remains explicitly unverified."
    artifacts:
      - path: "apps/server/src/turn.ts"
        issue: "Recovery path is implemented, but production SDK cancellation/recreation was not exercised."
      - path: ".planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-RESEARCH.md"
        issue: "Open Question 3 remains open for Windows SDK cancellation/recreation."
    missing:
      - "A bounded Windows SDK abort/close/recreate check followed by a successful next intent call."
  - truth: "Real Claude repairs labels asynchronously and a later visit reuses a validated cache entry."
    status: partial
    reason: "The baseline-first coordinator, strict descriptive patch validation, identity checks, merge, and value-free cache are wired and pass fake-provider tests. No live repair result was produced because the provider probes stopped before a model prompt."
    artifacts:
      - path: "apps/server/src/brain/claude/repair-coordinator.ts"
        issue: "Production repair is wired, but no live model patch or real-model cache hit was observed."
      - path: "apps/server/src/brain/claude/repair-cache.ts"
        issue: "Cache behavior is verified offline only."
    missing:
      - "A safe live repair result and return-visit cache reuse after the provider passes the empty-tool check."
---

# Phase 4: Claude Brain and Label Repair Verification Report

**Phase Goal:** Real Claude, running locked down on the developer's own subscription, understands free-form requests and repairs a broken form's labels in the background, with no way to act on the page.
**Verified:** 2026-10-17T10:24:21Z
**Status:** gaps_found
**Re-verification:** No previous Phase 4 VERIFICATION.md was present.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Claude mode uses isolated subscription-backed roles, starts only with an empty init tool list, and refuses startup with a clear error otherwise. | PARTIAL | `session.ts` configures `tools: []`, `disallowedTools: ["*"]`, `settingSources: []`, strict empty MCP config, `dontAsk`, a fresh empty cwd, API-key removal, and disabled memory/connectors. The fake-adapter test proves refusal and cleanup. The bounded live `startup()+outputFormat` probes reported one init tool for each role even with deny-all and stopped before `WarmQuery.query()`. The production streaming adapter has not been initialized live, so Claude mode is not demonstrated usable. |
| 2 | An unmatched utterance yields a schema-valid Intent referencing current page IDs, typically within about two seconds. | PARTIAL | `intent-router.ts` keeps grammar and field phrases local, gates private utterances, builds the sanitized projection, validates strict Intent keys and current IDs, and retries invalid output once. Router/provider tests pass with injected adapters. No live model response or latency was measured. |
| 3 | A hung or failed Claude intent call speaks the exact fallback, releases the next turn, and recovers the role. | PARTIAL | `turn.ts` has a four-second watchdog, abort/recreation path, exact `I couldn't understand that` fallback, and queue release. Fake-adapter integration tests cover a following call. Windows cancellation/recreation for the pinned SDK is an open research question and was not exercised. |
| 4 | The deterministic baseline is immediate; eligible labels are repaired asynchronously with descriptive-only patches and safely reused from cache. | PARTIAL | `server.ts` and `refresh.ts` wire accepted snapshots to `RepairCoordinator`, scheduling after the baseline turn; `repair-schema.ts`, `repair-merge.ts`, and `repair-cache.ts` restrict patches, validate identities/IDs, preserve policy state, and cache bounded hashed entries. `repair-flow.test.ts` verifies fake-provider and cache behavior. No real Claude patch was produced. |
| 5 | The model cannot directly act on the page, and sensitive-shaped text or values are withheld from model/speech read-back. | VERIFIED | The provider exposes only Intent parsing and a descriptive repair patch; its SDK config supplies no action tools and rejects any reported init tool. `intent-router.ts` validates model output against current targets, and action execution remains in the deterministic turn/executor path. `privacy.ts` gates secret-shaped utterances; projection tests omit current/error/sensitive values; extension `executeAct` rechecks written/select values before returning observations. Focused privacy, routing, provider, and extension safety tests pass. |

**Score:** 1/5 truths fully verified. Four functional truths remain partial because the live provider never passed its init tool check or reached a model prompt.

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/server/src/brain/claude/session.ts` | Isolated role lifecycle and fail-closed init validation | PARTIAL | Substantive and wired through provider/server. Offline tests validate config and refusal. The live probe found a nonempty init list, so startup refuses. |
| `apps/server/src/brain/claude/provider.ts` | JSON/Zod Intent and repair provider API | PARTIAL | Substantive, called by server and role manager; no live output has passed through it. |
| `apps/server/src/brain/claude/intent-router.ts` | Grammar-first privacy and current-ID routing | VERIFIED OFFLINE | Wired from `turn.ts`; focused fake-provider tests passed. |
| `apps/server/src/brain/claude/projection.ts` | Value-free, prompt-only ~8k estimate and trim | VERIFIED | Imported by intent and repair prompts; tests cover sentinels, immutability, IDs, and trimming. Estimate is intentionally approximate and not live-token calibrated. |
| `apps/server/src/brain/claude/repair-schema.ts`, `repair-merge.ts` | Strict descriptive-only patch and current identity merge | VERIFIED OFFLINE | Wired from the coordinator; tests reject unknown keys, stale/duplicate IDs, and disallowed fields. |
| `apps/server/src/brain/claude/repair-coordinator.ts`, `repair-cache.ts` | Asynchronous baseline-first repair and bounded value-free cache | VERIFIED OFFLINE | Wired from snapshot acceptance and server turn completion; fake integration tests cover delayed repair, stale results, and cache reuse. |
| `packages/protocol/src/snapshot.ts`, `form-model.ts` | Deterministic raw label candidates; `model` only on resolved FormModel provenance | VERIFIED | Raw and resolved source enums are separate; protocol/baseline tests were included in the focused passing run. The approved split is recorded in Plan 04-05 summary and research. |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/server/src/server.ts` | `createClaudeProvider` | `--brain=claude` selection before listener start | WIRED | Server awaits provider creation; startup error prevents listening. |
| `apps/server/src/turn.ts` | `routeIntent` | Claude-mode unmatched utterance path | WIRED | Router runs after the deterministic/local paths and before existing intent handling. |
| `apps/server/src/session/refresh.ts` | `RepairCoordinator.accept` | Accepted snapshot callback | WIRED | Only an accepted current snapshot becomes a repair candidate. |
| `apps/server/src/server.ts` | `RepairCoordinator.schedulePending` | After baseline turn completion and successful refresh | WIRED | Repair is scheduled after the awaited turn handler returns; it is not awaited by the answer path. |
| `apps/server/src/brain/claude/repair-coordinator.ts` | `repair-cache.ts` | Validated cache load/save | WIRED | Cache hits are revalidated against current identity and eligible IDs; only validated successful patches are written. |

## Data-Flow Trace (Level 4)

No dynamic UI artifact is part of this phase. The relevant server data flow was traced: accepted `Snapshot` plus deterministic `FormModel` feed an allowlisted value-free projection; validated model patch data is checked against captured/current page identity and IDs; merge changes only descriptive fields; a validated patch, not the model or snapshot, is cached.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Provider isolation, privacy, intent routing, watchdog integration, repair/cache, post-write safety, and protocol label split | `npm exec vitest -- run apps/server/test/claude-provider.test.ts apps/server/test/brain-projection.test.ts apps/server/test/brain-privacy.test.ts apps/server/test/intent-router.test.ts apps/server/test/turn-brain.test.ts apps/server/test/repair-patch.test.ts apps/server/test/repair-flow.test.ts apps/extension/test/act.test.ts packages/protocol/test/form-model.test.ts packages/protocol/test/protocol-lock.test.ts` | 10 files passed; 83 tests passed | PASS |
| Server TypeScript | `npm run typecheck` | Exit 0 | PASS |
| Extension TypeScript | `npm run ext:typecheck` | Exit 0 | PASS |
| Offline SDK probe gate | `npm run claude:spike --workspace @blip/server -- --max-seconds 1800` | Offline branch passed; SDK is not imported and no provider request is made | PASS |
| Live Claude Intent/repair behavior | Not run by this verifier; prior bounded probes stopped before a model prompt | No live schema result, latency, recovery, or repair output exists | GAP |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| BRAIN-01 | 04-01, 04-02 | Isolated Agent SDK subscription provider; refuses init with tools | PARTIAL | Isolation and fail-closed behavior are implemented/tested, but live init still reports one tool and production streaming startup is unverified. |
| BRAIN-02 | 04-03, 04-04, 04-06 | Free-form requests become structured current-page Intents | PARTIAL | Offline privacy/projection/schema/ID flow passes; no live output or latency. |
| BRAIN-03 | 04-01, 04-02, 04-06, 04-07 | Prewarm and recover from failed/hung calls with spoken fallback | PARTIAL | Code and fake recovery tests pass; live SDK startup and Windows cancellation/recreation remain unverified. |
| PAGE-04 | 04-03, 04-05, 04-07 | Background Claude label repair, narrow patches, structural cache | PARTIAL | Offline repair/cache behavior and protocol split pass; no real Claude repair result was produced. |

No Phase 4 requirements mapped in `REQUIREMENTS.md` were absent from plan `requirements` fields. No orphaned Phase 4 requirement was found. `REQUIREMENTS.md` still lists these four requirements as Pending, consistent with this verification result.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/server/src/brain/claude/repair-coordinator.ts` | 19 | `PLACEHOLDER_LABEL` matching regex | Info | This is an eligibility classifier for generic field labels, not a placeholder implementation. No TODO/FIXME/empty implementation was found in the scanned Phase 4 source. |

## Human Verification Required

No separate user-flow check was attempted. Real SDK behavior remains a blocking verification gap rather than a passed automated result: the live probes stopped before sending any prompt, and this verifier did not run another live Claude call.

## Gaps Summary

Offline code paths, safety boundaries, repair/cache behavior, types, and focused tests are substantive and connected. The phase goal is still not achieved because the only authorized live startup probe reported one init tool for each role even with the explicit deny-all option, and therefore stopped before sending a model prompt. The production provider correctly fails closed in this state. This leaves real Intent output, warm latency, repair output, and the pinned SDK's Windows cancellation/recreation behavior unverified. Do not mark BRAIN-01, BRAIN-02, BRAIN-03, or PAGE-04 complete yet.

Planning metadata is behind the code artifacts: `STATE.md` and the Core roadmap still say Plan 04-07 is pending (6/7), although `04-07-SUMMARY.md` and its implementation are present. The plan progress should be reconciled after this verification report is reviewed.

---
Verified: 2026-10-17T10:24:21Z
Verifier: GSD phase verifier
