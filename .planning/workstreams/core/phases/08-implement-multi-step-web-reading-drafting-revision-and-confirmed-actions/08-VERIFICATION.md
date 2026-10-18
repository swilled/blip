---
phase: 08-implement-multi-step-web-reading-drafting-revision-and-confirmed-actions
verified: 2026-10-18T08:30:53Z
status: passed
score: 30/30 plan must-haves verified
re_verification:
  previous_result: gaps_found
  previous_score: 22/25
  gaps_closed:
    - "Configured dialogueRunner routes Phase 8 tasks through the core turn and task-bound voice gate, preserving the original redemption source and IDs."
  gaps_remaining: []
  regressions: []
---

# Phase 8: Multi-step Web Reading and Drafting Verification Report

**Phase Goal:** Add generic, page-grounded workflows that read requested content, summarize it on request, draft and revise text, read the final draft back, and perform a send or other gated action only after explicit confirmation bound to that exact draft and page. Site names and the email example are not hardcoded.

**Verified:** 2026-10-18T08:30:53Z  
**Status:** passed  
**Re-verification:** Yes - after gap closure in plan 08-07

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Capture includes bounded generic visible items, stable capture-local IDs, and conservative date evidence; hidden, nested, stale, or unsupported records cannot become targets. | VERIFIED | browser-content.ts, session.ts, capture/schema and live-revalidation tests. |
| 2 | Item reads traverse server, extension background, content handler, and live DOM; identity or recency ambiguity prompts clarification. | VERIFIED | read-item.integration.test.ts, executor.ts, and tasks.ts validate identities and resolve only a unique latest item. |
| 3 | Direct reads remain local; only explicit summary/question/draft/revision requests send a bounded filtered excerpt to the tool-less prose provider. | VERIFIED | tasks.ts, content-projection.ts, provider setup, privacy and task acceptance tests. |
| 4 | Drafting/revision use deterministic targets, write through the existing fill path, present the observed DOM value, and never send. | VERIFIED | drafting.ts, ungated.ts, and synthetic task acceptance tests check observed-value binding and zero dispatch during composition/revision. |
| 5 | Send prompt includes the final observed draft and recipient; only a matching voice phrase after tracked readback, the guard, and live binding checks can redeem. | VERIFIED | Configured-server loopback test drives speak.done, the 1,000 ms guard, confirm.armed, and the original voice-source redeem through core. |
| 6 | Affirmations, wrong/stale phrases, typed/source-less redemption, and changed bindings dispatch zero times; success requires fresh page confirmation. | VERIFIED | New loopback adversarial matrix and missing-confirmation case; core gate and task acceptance coverage remain green. |
| 7 | Workflow is generic and acceptance uses synthetic content without real accounts, private data, external pages, credentials, or live AGY. | VERIFIED | Local synthetic page/task responder and fake tool-less provider; no live services or data were used. |
| 8 | Demo's dialogueRunner: true composition routes generic page tasks through Phase 8 core while ordinary form dialogue remains reducer-owned. | VERIFIED | scripts/demo.ts enables this mode; server.ts selectively routes parsed page-task commands and task-bound sends. Existing reducer grammar, model-suggestion, and Agy-fallback tests remain. |
| 9 | Only the exact voice phrase with live task bindings dispatches once; typed, source-less, affirmative, incorrect, stale, or mutated attempts dispatch zero times. | VERIFIED | dialogue-runner-server.test.ts tests missing/typed source, yes/okay/yeah/sure, wrong phrase, stale grant/speech IDs, and task/page/draft/recipient/target mutations. |
| 10 | Successful send is reported only after fresh validated confirmation from the bound synthetic page. | VERIFIED | Positive loopback returns a fresh success alert; missing confirmation performs one accepted dispatch but reports an unverified outcome. |
| 11 | Task grant is invalidated on interrupted speech, stop, repeat, cancel, PTT, page/tab change, output-mode settings, voice disconnect/reconnect, and replacement. | VERIFIED | Runner-mode loopback cases clear the grant before a saved redemption; every case asserts zero dispatch, including current voice replacement. |
| 12 | Acceptance remains synthetic; the shared phrase/protocol review gate is cleared based on the reported full-diff approval. | VERIFIED | 08-07 plan/summary, PROTOCOL.md, and `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-VOICE-OWNER-APPROVAL.md`. |

**Plan must-have score:** 30/30 verified across all seven plans.

### Plan Frontmatter Must-Haves

| # | Plan | Observable truth | Status | Evidence |
|---|---|---|---|---|
| 1 | 08-01 | Bounded generic visible items, stable local IDs, unknown recency without evidence. | VERIFIED | Capture/schema and bound tests. |
| 2 | 08-01 | Visible dates require semantic consistent evidence. | VERIFIED | Date evidence tests and conservative time extraction. |
| 3 | 08-01 | Hidden, nested, stale, unbounded, and non-semantic content cannot become targets. | VERIFIED | Capture exclusion and live revalidation tests. |
| 4 | 08-01 | Link opening remains same-origin and click-safe. | VERIFIED | Phase 8 leaves the existing link policy unchanged. |
| 5 | 08-02 | read-item traverses BrowserExecutor, extension background, content handler, and live DOM. | VERIFIED | Synthetic read-item.integration.test.ts. |
| 6 | 08-02 | Changed/hidden/disconnected/recaptured/mismatched items are rejected. | VERIFIED | Extension and server rejection tests. |
| 7 | 08-02 | Server accepts results only for matching request, operation, capture, tab, and page. | VERIFIED | BrowserExecutor and content-result tests. |
| 8 | 08-03 | Session retains one bounded current item/task/draft binding and clears it on lifecycle changes. | VERIFIED | Session/task-state implementation and tests; runner invalidation loopback cases. |
| 9 | 08-03 | Direct reads revalidate through extension and make no AGY call. | VERIFIED | Resolver and fake-provider tests. |
| 10 | 08-03 | Filtered excerpts reach AGY only after explicit summary/question/draft intent. | VERIFIED | Closed parser, projection boundary, and task acceptance tests. |
| 11 | 08-03 | Ambiguous item identity or recency returns clarification. | VERIFIED | Tied, missing, stale, and ambiguous resolver cases. |
| 12 | 08-04 | AGY receives bounded filtered excerpts only after explicit request. | VERIFIED | Content projection and privacy tests. |
| 13 | 08-04 | Model output is prose-only and cannot select target/action/phrase/grant. | VERIFIED | Tool-less provider schema and hostile-output tests. |
| 14 | 08-04 | Draft/revision use the same deterministic field and read back observed DOM value. | VERIFIED | Drafting and observed-fill implementation/tests. |
| 15 | 08-04 | Draft/revision do not perform the consequential action. | VERIFIED | Synthetic acceptance asserts zero send dispatch during composition/revision. |
| 16 | 08-05 | Send prompt reads the final observed draft and recipient, then asks for the exact phrase. | VERIFIED | beginDraftSend and configured loopback prompt assertions. |
| 17 | 08-05 | Only exact voice redemption after tracked readback and one-second guard redeems once. | VERIFIED | Loopback helper completes tracked speech, fires the 1,000 ms guard, and proves one successful voice redemption; denial matrix proves zero for alternatives. |
| 18 | 08-05 | Grant binds draft, recipient, source/page, tab, operation/target, and speak ID. | VERIFIED | Grant fingerprint and loopback mutation cases. |
| 19 | 08-05 | Lifecycle and binding changes invalidate the grant. | VERIFIED | Gate/task invalidation code and core plus configured-runner tests. |
| 20 | 08-05 | Dispatch uses one GatePort and success requires fresh page confirmation. | VERIFIED | Synchronous one-use consumption and positive/missing post-act result tests. |
| 21 | 08-06 | Generic flow reads/summarizes/drafts/revises and reads back final observed text. | VERIFIED | Default task acceptance plus configured runner read, draft, and revision loopback. |
| 22 | 08-06 | Draft/revision never send; final draft/recipient readback precedes exact phrase prompt. | VERIFIED | Observed draft assertions and prompt content in configured loopback; composition/revision tests assert zero send. |
| 23 | 08-06 | Affirmations, wrong/stale/typed/early/repeated/mismatched attempts produce zero dispatch. | VERIFIED | Core gate and configured runner denial matrix. |
| 24 | 08-06 | Success is reported only after fresh synthetic page confirmation. | VERIFIED | Positive fresh result and missing-confirmation unverified result. |
| 25 | 08-06 | Acceptance uses no real account, private content, external site, or live provider. | VERIFIED | Local fixture and fake-only test setup. |
| 26 | 08-07 | DialogueRunner composition routes generic Phase 8 tasks to core and keeps ordinary form turns on reducer. | VERIFIED | server.ts wrapper plus reducer regression tests and configured server task test. |
| 27 | 08-07 | Only exact voice redemption with live bindings dispatches once; source, phrase, ID, and binding attacks dispatch zero. | VERIFIED | Loopback denial table and one-success case. |
| 28 | 08-07 | Success requires fresh confirmation from the bound synthetic page. | VERIFIED | Success and no-fresh-confirmation loopback cases. |
| 29 | 08-07 | Runner task grants clear on interruption, stop/repeat/cancel, page/tab, settings, PTT, and voice lifecycle changes. | VERIFIED | Loopback invalidation cases include disconnect/reconnect and direct replacement. |
| 30 | 08-07 | Acceptance is fake/synthetic and the shared phrase/protocol review gate is cleared based on the reported full-diff approval. | VERIFIED | Test rig and Phase 6 approval record. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| packages/protocol/src/payloads-browser.ts | Bounded item and identity-bound read-item contract | VERIFIED | Optional item metadata, bounds, and identity-bearing operation/result. |
| apps/extension/src/content/browser-content.ts | Generic capture and live item revalidation | VERIFIED | Semantic visible candidates; connection, visibility, text, date, frame, and identity checks. |
| apps/extension/src/background/browser.ts | Current-tab dispatch and response recheck | VERIFIED | Checks page before/after dispatch and validates typed result. |
| apps/server/src/browser/executor.ts, session/session.ts | Accepted capture/task state and result validation | VERIFIED | Current request, operation, item, tab, capture, and page are checked. |
| apps/server/src/browser/tasks.ts, task-state.ts | Task parsing, item resolution, live reread, and cancellation | VERIFIED | One bounded current task; ambiguous or stale selection clarifies. |
| apps/server/src/brain/agy/content-projection.ts, provider | Explicit filtered model input and prose-only output | VERIFIED | Direct reads stay local; provider is tool-less and receives bounded filtered data. |
| apps/server/src/browser/drafting.ts, act/ungated.ts | Deterministic draft/revision and observed readback | VERIFIED | Target is core-selected; accepted value must match extension observation and refreshed FormModel. |
| packages/policy/src/confirmation.ts | Deterministic exact context phrase | VERIFIED | Local email-message-send maps to `send this email`; the reported full-diff approval is recorded in the Phase 6 approval artifact. |
| apps/server/src/act/grants.ts, gated.ts | Bound one-use grant, invalidation, and fresh result interpretation | VERIFIED | Fingerprint includes draft/recipient hashes, source identity/item, tab, operation, target, and speak ID. |
| apps/server/src/turn.ts | Page-task route into read/model/draft/gate code | VERIFIED | Default server turn path plus selective runner route both reach existing core task handling. |
| apps/server/src/server.ts | Composed dialogueRunner and Phase 8 handlers | VERIFIED | Task commands, task-bound redemption, speech completion, and lifecycle cleanup wrap reducer handlers. |
| apps/server/test/dialogue-runner-server.test.ts | Regression for configured demo composition | VERIFIED | Real loopback WebSocket clients and fake extension/provider cover positive path and adversarial cases. |
| tools/test-pages/public/browser-task.html, task acceptance tests | Synthetic workflow fixture and adversarial matrix | VERIFIED | Generic local fixture and fake-only task tests; no account or external page. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Extension capture | Browser item schema | Typed bounded item records | WIRED | Capture produces schema-compatible visible records. |
| BrowserExecutor | Extension background/content | Identity-bound read-item request | WIRED | Synthetic integration test traverses dispatcher to live DOM validation. |
| Page-task resolver | Session and BrowserExecutor | Current capture plus live reread | WIRED | Selection comes from accepted capture; chosen item is reread before use. |
| Draft coordinator | Projection and fill executor | Explicit request then observed-value write | WIRED | Model supplies prose; target and fill remain deterministic. |
| Draft gate | GrantStore and GatePort | Binding fingerprint and synchronous consume | WIRED | Exact phrase consumes once; invalid inputs dispatch zero times. |
| scripts/demo.ts | startServer | dialogueRunner: true | WIRED | Confirmed demo configuration matches loopback test composition. |
| server.ts | turn.ts page-task path | Selective utterance dispatch to default handler | WIRED | Parsed page tasks reach handleUtterance; normal form turns stay on reducer. |
| server.ts | Voice gate adapter | Task-bound confirm.redeem | WIRED | Original source, grant, speech, and utterance IDs are passed through. |
| Runner lifecycle handlers | Session/core gate | Speech, stop/repeat/cancel, PTT, settings, page/tab, disconnect/replacement | WIRED | Cleanup occurs before runner lifecycle behavior; stale grant tests assert zero dispatch. |

### Data-Flow Trace

| Artifact | Data | Source | Status |
|---|---|---|---|
| tasks.ts | Selected source excerpt | Accepted capture plus live extension item response | FLOWING |
| content-projection.ts | Provider input | Explicit request and bounded filtered active-task excerpt | FLOWING |
| drafting.ts | Current draft | ActResult.observedValue, matched against refreshed FormModel | FLOWING |
| gated.ts | Pending send binding | Observed draft, recipient, page/item, tab, target, and tracked speech ID | FLOWING |
| Configured confirm.redeem | Source and correlation IDs | Original loopback voice frame into core voice-gate adapter | FLOWING |
| Post-action result | Success speech | Fresh post-act snapshot on current bound synthetic page | FLOWING; absent confirmation reports unverified |

### Behavioral Spot-Checks

| Behavior | Command / check | Result | Status |
|---|---|---|---|
| Configured dialogueRunner workflow, denials, lifecycle, and fresh result | npm test -- --run apps/server/test/dialogue-runner-server.test.ts | 30 tests passed | PASS |
| Focused runner/task/gate/content regressions | Four-file focused run recorded by 08-07 | 84 tests passed | PASS |
| Full repository suite | npm test | 133 files passed, 16 skipped; 1,509 tests passed, 28 skipped | PASS |
| Core TypeScript types | npm run typecheck | Exit 0 | PASS |
| Extension TypeScript types | npm run ext:typecheck | Exit 0 | PASS |
| Patch whitespace validation | git diff --check | Exit 0 | PASS |

### Requirements Coverage

All seven plans declare requirements: []; no Phase 8 requirement IDs are mapped in the roadmap. There are no orphaned requirement IDs. The 30 plan must-haves above are the verification contract.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| Inspected Phase 8 paths | No TODO/FIXME/placeholder or console-only implementation found; null returns are fail-closed resolver/filter branches. | Info | No stub blocker found. |

### Human Verification

No human-only check is required to verify the specified server-side task and confirmation contract. The configured server path was driven with loopback sockets, a synthetic page responder, and fake providers. No actual microphone/STT/TTS hardware or live page was used.

### Review and Release State

At the time of this verification, the shared item protocol and `send this email` phrase/policy delta were awaiting voice-owner review, and the branch was local. On 2026-10-18, the core owner reported that the voice owner reviewed and approved the full `core/browser-control` diff, including the Phase 8 item schema and phrase. The reported scope and provenance are recorded in `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-VOICE-OWNER-APPROVAL.md`; this integration review gate is cleared. M0 protocol-freeze approval and Phase 5 release gates remain separate.

### Gaps Summary

The previous configured-handler integration gap is closed. In startServer({ dialogueRunner: true }), explicit Phase 8 tasks now use the same deterministic core turn/task route, and a task-bound redemption reaches the existing voice gate with its original source and IDs. Ordinary dialogue remains on the reducer. The loopback acceptance test proves the complete read/draft/revise/readback/guard/redeem/fresh-confirmation path, plus zero dispatch for invalid input and invalidation events. No implementation gaps remain in the 30 plan must-haves.

The reported voice-owner review gate is cleared for integration. The roadmap phase was not marked complete by this verification.

---

_Verified: 2026-10-18T08:30:53Z_  
_Verifier: Codex (gsd-verifier)_

