---
status: resolved
trigger: "Investigate Phase 4 bounded live-check initialization timeout using local repo only"
created: 2026-10-17T15:47:37Z
updated: 2026-10-17T19:25:22Z
---

## Current Focus

hypothesis: The repair rejection came from a mismatch between the synthetic harness prompt and the production RepairCoordinator context.
test: Plan 04-18 supplied the same value-free projection and exact synthetic eligible id, then ran the unchanged strict patch/cache validators.
expecting: A production repair result passes validateRepairPatch and the cache round trip.
next_action: None. 04-18 confirmed the hypothesis and all Phase 4 criteria now have live or offline evidence.

## Symptoms

expected: The approved bounded 15-minute synthetic live check initializes Claude SDK roles and proceeds through its prompt sequence.
actual: `npm run claude:live-check --workspace @blip/server -- --live --max-seconds 900` timed out after about 900 seconds at `stage: initialization`, with zero intent/repair/total prompts and no role init/tool results.
errors: Recorded bounded timeout at initialization; no SDK error or role init result was observed.
reproduction: Recorded invocation: `npm run claude:live-check --workspace @blip/server -- --live --max-seconds 900`. Do not rerun.
started: First real streaming live check; prior `startup()+outputFormat` SDK spike used a different path and completed quickly.
latest_followup: The separately approved 04-11 run failed during initialization after 7,157 ms with one synthetic intent bootstrap, zero repair bootstrap/probes, and no role result or tool count. Its one-time approval is consumed. Do not repeat it.

## Eliminated

## Evidence

- timestamp: 2026-10-17
  checked: `.planning/debug/knowledge-base.md` and planning file inventory
  found: No debug knowledge base exists. Phase 4 artifacts are under `.planning/workstreams/core/phases/04-claude-brain-and-label-repair/`; repository has pre-existing modified `.planning/config.json` and untracked `.claude/`.
  implication: No prior resolved timeout pattern is available. Preserve the unrelated workspace changes.

- timestamp: 2026-10-17
  checked: `04-08-LIVE-CHECK.md`, `04-08-PLAN.md`, `session.ts`, `provider.ts`, and `claude-sdk-live-check.ts`
  found: The report records timeout at `initialization`, zero prompts, and no role init/tool result. The live-check sets that stage immediately before `createProvider`; provider startup opens `intent` first and awaits its session `start()` before opening `repair`. The SDK adapter resolves startup only when its query pump receives `system/init`, or rejects it on a pump error/unexpected end.
  implication: The recorded evidence localizes the wait to provider construction/role startup before the first init result, but does not identify whether the SDK subprocess, subscription/auth startup, or another external dependency stalled.

- timestamp: 2026-10-17
  checked: startup cancellation and SDK adapter close paths in `session.ts`; pinned SDK `Query.close()` declaration
  found: The startup signal listener calls `session.abort()`, then `#openRole` still awaits `session.start()` directly. In the concrete adapter, `abort()` sets `closed = true` and closes the query; if its pump then ends before an init/error message, the pump deliberately does not throw because `closed` is true, while the init deferred is never rejected.
  implication: A real startup abort can leave `session.start()` and provider creation pending, preventing the manager's catch/cleanup path from running. This is a confirmed local timeout-cleanup defect, but it occurs after the deadline and does not explain why no init arrived during the 900-second window.

- timestamp: 2026-10-17
  checked: installed pinned SDK `0.3.302` `sdk.d.ts` Query, SDKUserMessage, and SDKSystemMessage contracts against `createSdkAdapter`
  found: `query()` accepts `string | AsyncIterable<SDKUserMessage>`. The user-message documentation says a client-written message submits a prompt and starts a turn; the system/init documentation describes session metadata emitted at the start of each turn. The adapter creates an initially empty async queue, and only `call()` pushes a user message; the provider does not expose `call()` until `start()` has received `system/init`. The prior startup()+outputFormat spike is a distinct API path and recorded one tool for each role.
  implication: The code has a likely local pre-init cycle under the documented streaming contract, consistent with the timeout. The declarations do not explicitly guarantee that no pre-turn init is emitted, and the timed-out run captured no event ordering, so this remains a high-confidence static diagnosis rather than runtime confirmation. Switching back to the startup API would encounter its already-recorded nonempty-tool refusal before any prompt.

- timestamp: 2026-10-17
  checked: pinned SDK `startup()`, `WarmQuery`, `Query.initializationResult()`, and `Options.outputFormat` declarations; `claude-sdk-spike.ts`
  found: The SDK documents `startup()` as prewarming the CLI and completing its initialize handshake before returning a `WarmQuery`, without requiring a query prompt. `WarmQuery` exposes only `query(prompt)` (once) and `close()`; it has no documented init-tools accessor. Its `Query.initializationResult()` returns commands, agents, styles, models, and account metadata, but not the `system/init.tools` list. `Options.outputFormat` is optional; docs define it as structured output, and describe such sessions as end-turn tool sessions. The old spike always set `outputFormat`, so its one-tool result does not isolate whether that tool was due to structured output.
  implication: Omitting `outputFormat` is likely to avoid the structured-output tool path, but the pinned declarations do not promise that this yields zero init tools. `startup()` can warm a role without a model prompt, but its public API does not expose the required tool list before `WarmQuery.query()`. A single persistent `Query` can accept an async iterable, but the SDK contract does not document that its `system/init.tools` event is available before that iterator's first prompt. The plan's strict pre-prompt zero-tool gate cannot be claimed satisfied through the documented API without relying on unverified event ordering or sending a prompt before the gate.

- timestamp: 2026-10-17
  checked: offline regression test, focused provider/live-check suite, and workspace typecheck after the startup-cancellation fix
  found: The new injected-adapter test passes when `start()` stays pending and the owner signal aborts; provider startup rejects and session cleanup runs. Focused tests passed 19/19 and `npm run typecheck` passed.
  implication: The abort cleanup defect is fixed and locally verified. This change does not alter the no-prompt-before-init order, so it cannot establish or repair the cause of the initial 900-second stall.

## Resolution

root_cause: "Likely pre-init control-flow cycle: the streaming query waits for an SDK system/init event while the adapter waits for that event before sending the first user message that starts a turn. Runtime event ordering was not observed, so this diagnosis is not experimentally confirmed. A separate abort-path defect was confirmed: provider startup could remain pending after the deadline if the session start promise did not reject."
fix: "Race role startup against the owner's abort signal, so provider startup enters its failure/cleanup path even if the adapter's start promise remains pending."
verification: "Focused provider and live-check tests passed (19/19); workspace typecheck passed. No provider/SDK invocation was made. The original initialization behavior remains unverified."
files_changed: [apps/server/src/brain/claude/session.ts, apps/server/test/claude-provider.test.ts]

## 04-11 Follow-up Evidence

- timestamp: 2026-10-17T18:42:47Z
  checked: `04-11-LIVE-CHECK.md` and sanitized CLI result
  found: The single fresh no-retry invocation returned `status=failed`, `stage=initialization`, and 7,157 ms elapsed. One intent bootstrap was dispatched; no role result, tool count, repair bootstrap, or ordinary probe was observed.
  implication: The attempt produced no production evidence for Phase 4 requirements. The runtime cause remains unknown; keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending. Do not retry without a new plan and fresh precise authorization.

## 04-12 Follow-up Evidence

- timestamp: 2026-10-17T18:54:00Z
  checked: `04-12-LIVE-CHECK.md` and sanitized CLI result
  found: One intent `system_init` event arrived; the intent init tool array was empty and accepted. The fixed synthetic bootstrap response reached local validation but was rejected as `bootstrap_result_rejected` after 4,027 ms. No ordinary prompt, repair role, or repair probe ran. The approval claim is consumed.
  implication: The pre-init-cycle hypothesis does not explain the current failure. Runtime startup works at least through the intent init/empty-tool gate. The precise JSON/schema/shape failure remains unknown; preserve the result as discarded and refine only the fixed failure category. The user authorized repeated bounded synthetic attempts, with a fresh plan-scoped claim per run. Keep BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending.

## 04-13 Follow-up Evidence

- timestamp: 2026-10-17T18:59:00Z
  checked: `04-13-LIVE-CHECK.md` and sanitized CLI result
  found: The second fresh attempt again observed intent `system_init` and accepted zero tools. The synthetic bootstrap result failed JSON parsing, reported only as `bootstrap_invalid_json`, after 5,727 ms. One intent bootstrap dispatch occurred; no ordinary probe or repair role ran. The 04-13 claim is consumed.
  implication: The provider's startup failure is caused by parsing the content of a prewarm operation, not failure to initialize the SDK or a nonempty tool list for intent. The bootstrap output is discarded and application calls have their own strict validators. Plan 04-14 should wait for successful SDK turn completion but should not require unused bootstrap output to be JSON. Keep BRAIN-01/02/03/PAGE-04 pending until the bounded probe sequence verifies their full criteria.

## 04-14 Follow-up Evidence

- timestamp: 2026-10-17T19:03:00Z
  checked: `04-14-LIVE-CHECK.md` and sanitized CLI result
  found: Both roles emitted `system_init`, accepted empty tool lists, and completed their fixed warmups. The first actual intent probe took 2,798 ms but did not yield an accepted Intent. The check dispatched one intent probe and then stopped. The live-check wrapper enforces one provider dispatch per `routeIntent` call, so the router's built-in second attempt is blocked before provider dispatch. The `.used` claim is consumed.
  implication: Prewarm now works for both roles. The next limitation is the verifier's per-route dispatch cap, not the production router: it does not exercise the existing retry behavior. Plan 04-15 should permit one retry for one grammar-miss route while keeping aggregate dispatches at eight, and keep strict schema/current-id checks. BRAIN-02/03 and PAGE-04 remain pending.

## 04-16 Follow-up Evidence

- timestamp: 2026-10-17
  checked: `04-16-LIVE-CHECK.md` and sanitized runner result
  found: Both roles initialized with empty tools and completed fixed warmups. The two-call Intent route failed after 3,398 ms with fixed category `intent_schema_rejected`. No model output or error details were retained; the 04-16 approval is consumed.
  implication: The remaining intent issue is within the strict output schema boundary, not initialization. Plan 04-17 should make the finite allowed Intent forms and required keys explicit in the prompt without weakening validation. Keep BRAIN-01/02/03 and PAGE-04 pending.
## 04-17 Follow-up Evidence

- timestamp: 2026-10-17
  checked: `04-17-LIVE-CHECK.md`, `runApprovedProbeSequence`, and production `RepairCoordinator.promptFor`
  found: Two actual Intent routes passed schema/current-id checks; the primary took 1,621 ms. Cancellation/recreation and a valid recovery Intent succeeded. The synthetic repair request sent only a generic instruction; production prompt construction uses a projected page and exact eligible ids. The returned patch was rejected and not cached.
  implication: BRAIN-02/03 are complete from combined live and offline integration evidence. The repair failure is likely a harness context mismatch; 04-18 should send the same value-free projection plus only the synthetic eligible id, then retest strict patch validation and cache. BRAIN-01 and PAGE-04 remain pending.

## 04-18 Resolution

- timestamp: 2026-10-17T19:21:00Z
  checked: `04-18-LIVE-CHECK.md`, projection-based synthetic repair prompt, strict repair validator, and RepairCache round trip
  found: Both production SDK roles initialized with empty tool lists. The synthetic Intent, cancellation/recreation/recovery, repair patch validation, and cache reload all passed in 20,514 ms using seven of eight dispatches. The repair prompt included the production value-free page projection and exact synthetic eligible id; tests verify the synthetic page-value sentinel is absent.
  implication: The former repair rejection was caused by insufficient synthetic prompt context. PAGE-04 and all Phase 4 requirements are now complete. No credentials/auth values, environment values, model output, or real page/user data were inspected or retained. The one-use 04-18 approval is consumed.
