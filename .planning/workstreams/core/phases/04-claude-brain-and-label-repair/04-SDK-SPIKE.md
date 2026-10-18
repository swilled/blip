# Phase 4 SDK Spike

## Pin selection and approval basis

sdkPinApproval: @anthropic-ai/claude-agent-sdk@0.3.302

The owner delegated the exact version choice by repeatedly asking GSD to choose what was best after the recommended `0.3.302` pin had been presented. This records delegated selection; the owner did not literally type `approve-0.3.302`.

## Live-use gate

ownerLiveUse: confirmed

On 2026-10-17, the owner confirmed their own eligible Claude subscription is available for local use and authorized one bounded startup()+outputFormat spike, with a maximum duration of 30 minutes, in the Phase 4 checkpoint response. No subscription credentials were inspected. The probe below uses synthetic prompts and records only bounded timing, usage, schema-validity, tool-list, and error observations.

## Offline setup and spike

- Installed the exact server dependency `@anthropic-ai/claude-agent-sdk@0.3.302`, including npm's Windows x64 optional runtime.
- Added `npm run claude:spike --workspace @blip/server -- --max-seconds 1800`. Its default path returns before dynamically importing the SDK and makes no provider request; `--live` requires both exact approval lines above.
- Offline verification: `npm run claude:spike --workspace @blip/server -- --max-seconds 1800` passed on 2026-10-17. It exited through the offline branch without importing the SDK or making a provider request.

## Lifecycle decision

The bounded live probe first exercised `startup()` for both roles with `tools: []`; each init message reported a nonempty tool list, and the probe stopped before calling `WarmQuery.query()`. A second bounded attempt added the SDK's `disallowedTools: ["*"]` deny-all option; both roles still reported exactly one tool. That attempt also stopped before `WarmQuery.query()`, so neither run sent a model prompt or measured schema output, usage, warm-call behavior, or recovery. The combined `outputFormat` + `startup()` path therefore failed the required empty-tool safety check and was not selected. The production provider remains fail-closed on any unexpected init tool.

**Selected D-01 fallback:** one streaming session per role, JSON-only prompts, local `zod.safeParse`, and one retry, still with `tools: []`. Neither startup probe established whether the streaming adapter can initialize with an empty tool list, so successful live provider use remains unverified until that check can pass safely.

The installed SDK type declares that a `WarmQuery` accepts one query, so the spike uses a new prewarmed handle for each sample and records that lifecycle limitation. This API fact does not establish whether structured output is reliable or whether later application calls can reuse a session.


## Live SDK probe (tools disabled through `tools: []`)

```json
{
  "startedAt": "2026-10-17T10:02:12.984Z",
  "elapsedMs": 6583,
  "maxSeconds": 1800,
  "observations": [
    {
      "role": "intent",
      "repetition": 1,
      "model": "haiku",
      "startupMs": 3641,
      "wallMs": 4338,
      "sdkDurationMs": null,
      "inputTokens": null,
      "structuredOutputPresent": false,
      "schemaValid": false,
      "initToolsEmpty": false,
      "error": "unexpected-tools"
    },
    {
      "role": "repair",
      "repetition": 1,
      "model": "sonnet",
      "startupMs": 1261,
      "wallMs": 2243,
      "sdkDurationMs": null,
      "inputTokens": null,
      "structuredOutputPresent": false,
      "schemaValid": false,
      "initToolsEmpty": false,
      "error": "unexpected-tools"
    }
  ],
  "warmHandleReuse": "WarmQuery.query() is documented as one-use; each probe starts a fresh prewarmed handle."
}
```


## Live SDK probe (explicit `disallowedTools: ["*"]` deny-all)

```json
{
  "startedAt": "2026-10-17T10:06:50.291Z",
  "elapsedMs": 3792,
  "maxSeconds": 1700,
  "observations": [
    {
      "role": "intent",
      "repetition": 1,
      "model": "haiku",
      "startupMs": 2084,
      "wallMs": 2833,
      "sdkDurationMs": null,
      "inputTokens": null,
      "structuredOutputPresent": false,
      "schemaValid": false,
      "initToolsEmpty": false,
      "initToolCount": 1,
      "error": "unexpected-tools"
    },
    {
      "role": "repair",
      "repetition": 1,
      "model": "sonnet",
      "startupMs": 542,
      "wallMs": 956,
      "sdkDurationMs": null,
      "inputTokens": null,
      "structuredOutputPresent": false,
      "schemaValid": false,
      "initToolsEmpty": false,
      "initToolCount": 1,
      "error": "unexpected-tools"
    }
  ],
  "warmHandleReuse": "WarmQuery.query() is documented as one-use; each probe starts a fresh prewarmed handle."
}
```
