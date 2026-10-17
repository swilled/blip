---
status: investigating
trigger: "Investigate Phase 4 bounded live-check initialization timeout using local repo only"
created: 2026-10-17T15:47:37Z
updated: 2026-10-17T18:45:16Z
---

## Current Focus

hypothesis: The 04-10 bootstrap addressed the suspected empty-input startup cycle, but 04-10 and 04-11 still failed during initialization after one synthetic intent bootstrap. The actual production initialization cause remains unknown. Startup cancellation cleanup is separately covered offline.
test: Compare the sanitized 04-08/04-10/04-11 reports and local pinned SDK adapter lifecycle; do not inspect credentials or run another provider attempt without a new plan and fresh precise authorization.
expecting: Preserve exact runtime evidence, keep the fail-closed init gate, and distinguish local hypotheses from observed production behavior.
next_action: Record the 04-11 initialization failure and keep BRAIN-01/02/03 and PAGE-04 pending; no retry is authorized by the consumed 04-11 approval.

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
