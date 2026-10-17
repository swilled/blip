# Phase 4 SDK Spike

## Pin selection and approval basis

sdkPinApproval: @anthropic-ai/claude-agent-sdk@0.3.302

The owner delegated the exact version choice by repeatedly asking GSD to choose what was best after the recommended `0.3.302` pin had been presented. This records delegated selection; the owner did not literally type `approve-0.3.302`.

## Live-use gate

ownerLiveUse: not confirmed

The user's latest response was: “do what u think is best if this is a discuss phase, on the core track.” This does not confirm an active eligible local subscription or authorize its usage allocation, so the live-use gate remains closed. No subscription credentials were inspected and no Claude request was made. The live spike leg was not run; no live result is claimed.

## Offline setup and spike

- Installed the exact server dependency `@anthropic-ai/claude-agent-sdk@0.3.302`, including npm's Windows x64 optional runtime.
- Added `npm run claude:spike --workspace @blip/server -- --max-seconds 1800`. Its default path returns before dynamically importing the SDK and makes no provider request; `--live` requires both exact approval lines above.
- Offline verification: `npm run claude:spike --workspace @blip/server -- --max-seconds 1800` passed on 2026-10-17. It exited through the offline branch without importing the SDK or making a provider request.

## Lifecycle decision

The structured `outputFormat` plus `startup()` composition has not been exercised live. The decision is **provisional**: retain the documented D-01 fallback of one streaming session per role, JSON-only prompts, local `zod.safeParse`, and one retry until the live spike can be authorized and measured. Keep `tools: []` in either path.

The installed SDK type declares that a `WarmQuery` accepts one query, so the spike uses a new prewarmed handle for each sample and records that lifecycle limitation. This API fact does not establish whether structured output is reliable or whether later application calls can reuse a session.
