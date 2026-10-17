# Phase 4 Follow-up Live SDK Check

phase04FollowupApproval: pending

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

status: pending
stage: not_started
elapsedMs:
intentPromptCount:
repairPromptCount:
totalPromptCount:
initialIntentToolCount:
initialRepairToolCount:
rejectingRole:
subsequentPromptsAfterBlock:
intentLatenciesMs: []
intentSchemaValid: []
currentSyntheticIdMatched: []
cancellationVerified:
recreatedIntentToolCount:
repairSchemaValid:
repairCacheReloaded:
