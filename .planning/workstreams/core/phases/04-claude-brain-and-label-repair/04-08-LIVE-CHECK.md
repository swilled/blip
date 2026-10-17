# Phase 4 Follow-up Live SDK Check

phase04FollowupApproval: approve-04-08-live-check
approvalRecorded: 2026-10-17

## Decision provenance

The earlier `$gsd-next` run deferred this check because no fresh explicit authorization had been provided. On 2026-10-17, the user answered `approve-04-08-live-check` to the explicit checkpoint asking approval for one 15-minute, five-prompt synthetic live check. This exact response authorizes only the scope below.

## Approval scope

- At most 15 minutes total and five synthetic prompts total.
- At most four intent prompts using `claude-haiku-5-5`: two grammar-miss/current-ID probes, one deliberately aborted cancellation probe, and at most one post-recreation recovery probe.
- At most one repair prompt using `claude-sonnet-5-5`.
- Each intent probe has one provider prompt; no live retry is allowed.
- Use only in-memory synthetic form data and a synthetic utterance/value. Do not use a real page, transcript, or user data.
- Initialize both production streaming roles first and require zero tools from each before any prompt. Re-check zero tools before a recovery prompt after recreation.
- If any init reports a tool, abort immediately and send zero prompts after that init. Record `externally_blocked`; leave BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04 pending.
- Count every dispatched prompt monotonically, including a deliberately aborted prompt. Never reset counts after abort, recreation, or a later init failure.
- If an intent call finishes before the cancellation abort takes effect, mark cancellation unverified and do not spend another prompt to force a timeout.
- Record only role, prompt count, tool count, stage status, schema/current-ID/cache booleans, and elapsed milliseconds. Do not record prompts, outputs, tool names, credentials, or environment values.
- No API key, hosted mode, or relaxation of any tool guard is permitted. The fresh exact approval line below is required; approval recorded for `04-SDK-SPIKE.md` does not authorize this check.

## Offline diagnosis

The pinned SDK declarations document `tools: []` as disabling built-in tools, `settingSources: []` as disabling filesystem settings, and `strictMcpConfig: true` as ignoring external MCP configuration. No safe offline cause for the prior init tool was established, so no runtime option was added or relaxed. The production empty-init refusal remains mandatory; a fresh guarded init is needed to determine whether the tool persists.

## Result

status: approved_pending_run
stage: not_started
blockingReason: none
sdkInitializationCount: 0
elapsedMs: 0
intentPromptCount: 0
repairPromptCount: 0
totalPromptCount: 0
initialIntentToolCount: not_run
initialRepairToolCount: not_run
rejectingRole: none
subsequentPromptsAfterBlock: 0
intentLatenciesMs: []
intentSchemaValid: []
currentSyntheticIdMatched: []
cancellationVerified: not_run
recreatedIntentToolCount: not_run
repairSchemaValid: not_run
repairCacheReloaded: not_run

Requirements pending: BRAIN-01, BRAIN-02, BRAIN-03, PAGE-04.
