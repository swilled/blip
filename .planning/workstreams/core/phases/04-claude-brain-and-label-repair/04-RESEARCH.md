# Phase 4: Claude Brain and Label Repair — Research

**Researched:** 2026-10-17  
**Domain:** TypeScript Agent SDK, structured intent parsing, asynchronous form-label repair, privacy  
**Confidence:** HIGH for existing architecture and documented SDK features; MEDIUM for integration patterns; LOW for exact local token estimation and the required combined SDK spike

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### SDK startup and structured calls
- **D-01 (auto-selected recommended default):** First run the roadmap's bounded spike for `outputFormat` with `startup()` prewarming. Use that combination only if the SDK reliably returns the required schema and warms the session. If it does not, use the documented fallback: one streaming session per role, JSON-only prompts, `zod.safeParse`, and one retry. Keep `tools: []` in both paths.
- **D-02 (carried forward):** Use the developer's subscription login, no API key, empty working directory, and no built-in tools, settings, connectors, or memory. Refuse startup if the SDK init message contains any unexpected tool. The model produces Intent or repair data only; it cannot call browser actions, authorize a grant, or confirm a gated action.

### Intent parsing and failure recovery
- **D-03 (auto-selected recommended default):** Keep deterministic grammar matching first. Only unmatched utterances reach Claude, and the result must parse as the existing `Intent` schema and refer only to current field/action ids. Preserve the roughly two-second typical response target; use the roadmap's Haiku-class intent model as the initial latency-conscious default.
- **D-04 (auto-selected recommended default):** Allow one bounded retry for invalid structured output. On timeout, SDK failure, or a second invalid result, speak exactly “I couldn't understand that”; clear per-call busy state so the next utterance can proceed. Do not retry indefinitely or turn model output directly into an action.

### Background label repair
- **D-05 (auto-selected recommended default):** Publish the deterministic baseline model immediately and run repair in the background. Merge only validated changes to existing field ids and descriptive fields (label, title, grouping); retain deterministic kind, value, sensitivity, required state, options, and errors. Add `model` to the label-source enum additively under the frozen contract, mark changed labels as model-sourced, and preserve confidence so the voice layer can disclose guesses.
- **D-06 (carried forward):** Start with the roadmap's Sonnet-class model for label repair, separate from the latency-sensitive intent route. If repair fails, keep the baseline model and report its existing labels; repair must never delay the initial answer or leave the page without a usable model.

### Page context, privacy, and cache
- **D-07 (auto-selected recommended default):** Apply the roughly 8k-token trim only when constructing model input; the extension wire snapshot remains governed by the Phase 2 element cap. Never send page values from sensitive fields, passwords, card numbers, or sensitive fill-command values to Claude. Reuse the safe field-phrase redaction and shape checks; if a free-form utterance clearly contains a secret or card-shaped value, withhold it from the model and use a focus-and-type handoff. Keep the established post-write shape recheck before any value can be spoken.
- **D-08 (auto-selected recommended default):** Cache successful repairs on disk by origin, path, and structural hash. Validate a cache hit against current field ids and the current structure before merging; structure changes miss the cache. Do not cache field values, transcripts, or sensitive data.

### The Agent's Discretion
- Exact watchdog duration and process lifecycle details, within the stated response and recovery criteria.
- Prompt wording, schema wrapper, tokenizer/trim implementation, cache file format, and cache eviction policy.
- Confidence thresholds and the exact wording the voice track uses to disclose a model-sourced guess, provided source/confidence remain available.
- Model version selection within the Haiku-class intent and Sonnet-class repair defaults, subject to current SDK research, subscription availability, and the phase latency criteria.

### Deferred Ideas (OUT OF SCOPE)
None — the discussion stayed within Phase 4 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAIN-01 | Blip runs Claude through the Agent SDK on the developer's own subscription with built-in tools, settings, connectors and auto-memory disabled, and refuses to start if init lists an unexpected tool. | SDK isolation configuration, init-message validation, subscription policy caveat and environment audit. |
| BRAIN-02 | Free-form utterances the grammar can't match become a structured Intent through a tool-less Claude call, typically within ~2 s. | Existing grammar/Intent seam, JSON Schema support, Haiku-class route, current-ID checks, privacy gate and latency measurement. |
| BRAIN-03 | Claude processes are pre-warmed at startup, and a watchdog recovers from a hung or failed call with a spoken “I couldn't understand that” rather than silence. | startup API docs, required 30-minute combination spike, streaming fallback, timeout/restart plan and failure tests. |
| PAGE-04 | Claude repairs unlabeled/placeholder-only field labels, title and grouping in the background using a tool-less structured-output call, patches existing IDs only, and caches by origin + path + structure hash. | Narrow patch schema, baseline-first repair, guarded merge, label source, prompt trim, privacy and cache design. |
</phase_requirements>

## Summary

The repository already has the right trust boundary for Phase 4: deterministic grammar is first, IntentBrain is a narrow async seam, the executor and gate own every action, and accepted snapshots synchronously build a usable baseline FormModel. Keep the fake brain for offline operation. Add two separate model roles—Haiku-class intent and Sonnet-class label repair—with no action tools. Accept model output only after schema parsing and deterministic checks against the current model and IDs.

Anthropic's current TypeScript SDK documents JSON Schema structured output through query options, validates against JSON Schema draft-07, and separately documents streaming input and startup/prewarming. Those docs do not establish that outputFormat and startup() work together reliably for Blip's persistent roles, subscription login, or latency target. The first plan task must preserve the roadmap's bounded 30-minute spike. If it fails, use the locked fallback: one streaming session per role, JSON-only prompt, zod.safeParse, and one retry.

**Primary recommendation:** Put the 30-minute SDK spike first as a gate. Then implement a server-side structured-output adapter with separate role sessions, shared strict privacy projection, Zod and current-ID validation, a watchdog that releases the turn queue, and background repair that overlays only descriptive fields onto the current model. Keep the accepted wire snapshot at its Phase 2 cap; trim only the prompt projection. Cache validated, value-free patches by origin, path and structural hash.

## Standard Stack

### Core

| Library / tool | Version | Purpose | Why use it |
|---|---:|---|---|
| @anthropic-ai/claude-agent-sdk | **0.3.302** (registry latest checked 2026-10-17; published 2026-10-16) | Agent SDK query, streaming input, startup/prewarm and structured output | Official current TypeScript integration. Pin exactly because it changes frequently. Project docs mention 0.3.301; registry now reports 0.3.302. Not installed or declared yet. |
| zod | **4.6.7** | Existing protocol schemas, SDK JSON Schema conversion and output validation | Already used by @blip/protocol; keep one executable contract. |
| Node.js | **24.14.0** available; repo requires >=24 | Server and SDK child runtime | Installed version meets project constraint; SDK declares >=18. |
| TypeScript | **6.0.3** | Server adapter, schemas and cache | Existing root toolchain. |
| Vitest | **5.0.5** | Unit and integration tests | Existing test runner. |
| Existing server/protocol modules | workspace source | Grammar, Intent, FormModel, baseline/session and fake brain | Preserve existing deterministic routing and offline path. |

### Supporting

| Library / module | Version | Purpose | When to use |
|---|---:|---|---|
| node:crypto | Node built-in | Derive safe cache filename/key if needed | Never include sensitive values in the key. |
| node:fs/promises, node:path | Node built-ins | Repair cache file IO | Use bounded cache, schema-checked reads and atomic writes. |
| Existing test helpers | workspace source | Inject fake provider, clocks and schedulers | Test watchdog and race behavior without live Claude. |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| SDK json_schema outputFormat | Locked fallback: JSON-only prompt and zod.safeParse | Fallback depends on prompt formatting plus local validation; use if D-01 spike fails. |
| Existing protocol Intent | Separate model-only intent schema | Risks vocabulary and behavior drift; use Intent plus page-specific semantic checks. |
| Approximate local prompt budget | Anthropic Token Count API | API endpoint conflicts with subscription-only SDK path; estimate conservatively and calibrate using SDK usage. |
| Persistent streaming sessions | New process/query per utterance | Repeats process startup and loses warm session; use only if startup/streaming spike fails. |

**Installation proposal for implementation (not run during research):**

    npm install --workspace @blip/server --save-exact @anthropic-ai/claude-agent-sdk@0.3.302

## Architecture Patterns

### Keep a narrow provider boundary and grammar-first routing

apps/server/src/brain/fake-brain.ts defines IntentBrain.parseIntent(text) and createFakeBrain; apps/server/src/brain/grammar.ts handles deterministic matches. Preserve both. Put SDK lifecycle, structured output parsing, timeout and restart behind a server-owned Claude provider so routing and tests do not depend on SDK message types. apps/server/src/turn.ts is the current unmatched-utterance seam.

The SDK recommends streaming input for persistent interactive sessions. Use separate sessions for intent and repair, with no shared conversation history. Keep prompts stateless: include only sanitized context needed for that request. Verify structured output and startup/prewarm composition in the spike.

    const schema = z.toJSONSchema(Intent, { target: "draft-7" });
    const result = await callRole({
      prompt: safePrompt,
      options: {
        tools: [],
        outputFormat: { type: "json_schema", schema },
      },
    });
    // Require a successful result with structured_output, then re-parse locally.
    const parsed = Intent.safeParse(result.structured_output);
    if (!parsed.success) throw new InvalidModelOutputError();

callRole above is an application wrapper, not an SDK export. In the SDK stream, inspect the terminal result message; success with missing structured_output, retry error, thrown process/transport error, or local Zod failure is failure. SDK validation does not replace application parsing or semantic checks.

### Build the SDK configuration fail-closed

Every role must explicitly use the locked isolation settings: tools: [], settingSources: [], strictMcpConfig: true, permissionMode: "dontAsk", empty cwd, no MCP servers/connectors, no auto-memory, and an environment with ANTHROPIC_API_KEY removed. Preserve host environment entries such as PATH when passing SDK env; the SDK docs say supplied env replaces child environment. Disable claude.ai connectors explicitly, and isolate CLAUDE_CONFIG_DIR if needed to prevent host user config from adding settings or plugins. Assert the SDK system/init tool list is exactly empty before accepting requests; otherwise close the session and fail startup clearly. Never use bypassPermissions.

Configuration nuance: settingSources: [] disables filesystem user/project/local settings and project memory files, but does not by itself eliminate every host source. Official docs say managed host settings remain, ~/.claude.json is read unless the config directory is redirected, and auto-memory/connectors have separate controls. Use multiple explicit controls and keep the init tool assertion as the fail-closed check.

Do not create a model action tool or expose browser actions as tools. The model gets prompt data and returns Intent or repair data. A model request_action/click_safe Intent still goes through deterministic routing and current IDs; the model cannot produce a confirmation variant or arm a grant.

### Validate Intent as both schema and current-page data

Run deterministic grammar first. Before sending unmatched free-form speech to Claude, run a privacy gate on the raw utterance: recognizable secret/card-shaped content must be withheld and use focus-and-type handoff. Field-filling phrases must pass through safePhraseForBrain(); do not send dictated values.

After Zod parsing, verify each fieldId/actId refers to the currently accepted FormModel/snapshot and remains actionable under existing policy. Reject stale IDs and unexpected shapes. Then route through the current deterministic handler. Never execute an action/value directly from model output.

    const output = Intent.safeParse(rawStructuredOutput);
    if (!output.success || !intentReferencesCurrentIds(output.data, currentModel)) {
      return boundedInvalidOutputRetryOrFailure();
    }
    return routeThroughExistingDeterministicIntentHandler(output.data);

Schema-valid does not imply page-valid or authorized.

### Publish baseline first; merge repair asynchronously

Session.applySnapshot() and refresh synchronously accept the deterministic baseline. Start repair only after acceptance. Keep the immediate baseline reply; set repairStatus to pending while repair runs. On success, validate captured and current origin/path, structural hash and field IDs, then merge onto the current model so newer values, options, required flags and errors survive. If tab/page/structure changed, discard and do not cache. A same-structure newer snapshot may receive a description overlay only if identity checks still pass.

Use a narrow strict repair patch: optional title, group suggestions, and fields keyed by existing IDs with bounded label/group/confidence. Reject unknown keys, duplicate IDs, invalid confidence and any ID not in both the captured/current set. On merge, set labelSource to model only for changed labels and preserve confidence. Do not permit kind, value, sensitive, required, options, errors, actions or policy classifications in the patch. On failure, retain baseline and set repairStatus to failed; never await repair before first reply.

**Protocol integration constraint:** LabelSource currently serves both raw label candidates and resolved FormModel fields. Adding model to that shared enum would let a raw extension candidate claim model provenance. Keep raw candidate sources restricted to deterministic sources and add model only to resolved FormModel source type. Update protocol schema, PROTOCOL.md, fixtures/lock checks and affected tests together. The frozen contract requires both developers' sign-off. Type deterministic baseline candidate ranking to the narrower source type so model cannot enter baseline ranking.

### Trim only a sanitized model-input projection

Never mutate or re-send a trimmed extension snapshot. Build a compact server-side projection from accepted safe metadata: page title/headings, field IDs, safe labels/placeholders, type/required/options/errors, and action IDs/kinds only as needed. Do not include field values, sensitive values, transcript history or raw fill-command values. Trim the projection conservatively while retaining IDs needed for validation. Remove low-priority descriptions/options/headings before any required IDs.

No suitable current local tokenizer for Haiku 5.5/Sonnet 5.5 was verified. The archived official TypeScript tokenizer is explicitly approximate for pre-Claude 3 and should not be used as exact for current models. The Token Count API is outside the subscription-only SDK path. For the roughly 8k limit, use a deterministic conservative estimate over the exact serialized sanitized projection, leave margin, and calibrate against SDK usage.input_tokens from the spike. Describe it as approximate. Never change Snapshot.truncated or the 250-element wire cap.

### Cache only validated safe repair patches

Cache only successful validated descriptive patches, not whole FormModel/snapshot/values/transcripts/prompts/sensitive data. Key by normalized origin + pathname + structural hash; existing structural hash excludes values. Exclude query and fragment. On hit, parse with strict schema and recheck key/current IDs before merge. Corrupt, stale, unknown-ID or structure-mismatched entries are cache misses. Use atomic writes, bounded entry/size limits and eviction. Do not cache failures.

### Add a watchdog that releases the serialized turn path

Server turns are serialized; a never-settling SDK promise blocks later speech even if a timeout phrase has already been sent. Timeout must settle/cancel the request, clear busy state, close/recreate a stuck role if needed, speak exactly “I couldn't understand that”, and permit the next turn. Allow only the locked bounded retry for invalid output; don't keep retrying a timeout or broken process. Repair timeout only marks failure and keeps the baseline.

The SDK docs do not establish that a timed-out streaming request is safely reusable. Verify cancel/close/recreate behavior for the pinned version and ensure timeout settles the server turn chain even if subprocess shutdown continues.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Intent vocabulary | Separate model-only Intent system | Existing protocol Intent + semantic ID checks | Prevents contract drift. |
| First-pass commands | Model route for every utterance | Existing grammar before Claude | Keeps known commands fast and confirmations deterministic. |
| Output parsing | Ad hoc JSON string parsing | SDK structured output + local strict Zod parse | Validates both SDK and app contract. |
| Exact current tokenizer | Custom “exact” tokenizer or archived legacy tokenizer | Conservative estimate calibrated from SDK usage | Tokenization is model-specific; legacy tokenizer is obsolete/approximate. |
| Authorization and actions | Model action tools or model confirmation | Existing deterministic router, Executor and gate | Phase 3 owns grants and confirmation. |
| Secret redaction | Divergent new patterns | Existing safePhraseForBrain and shape/redaction helpers; generalize shared pure helpers if needed | Avoid inconsistent disclosure. |
| Repair merge | Replace whole FormModel | Validated patch merged into current model | Avoids overwriting newer values and policy-owned state. |

**Key insight:** JSON validation alone is not a trust boundary. Filter sensitive input, verify output IDs against current accepted state, and overlay only permitted descriptions.

## Common Pitfalls

1. **Assuming documented features compose.** JSON Schema output and startup/prewarm are separately documented, but the combined persistent-session path is the explicit 30-minute spike. Gate the adapter choice on repeated valid schema results, actual warm behavior, latency, tools and failure recovery.
2. **Trusting SDK validation alone.** A success may have no structured_output; output retries/model fallback can fail; process errors may throw. Require the terminal successful structured result, parse locally and validate current IDs.
3. **Leaving host settings active.** settingSources: [] alone does not clear all host configuration. Disable connectors/memory explicitly, use isolated config where feasible, strip API key, preserve PATH, and assert init has no tools.
4. **Leaking dictated secrets via raw utterance.** turn.ts sends unmatched raw text to the brain; safe field-phrase redaction does not cover every free-form secret. Gate before provider invocation and test a sentinel against prompts, speech, logs and cache.
5. **Leaving a stuck turn promise alive.** Speaking fallback without settling/cancelling the SDK request still blocks the serialized turn queue. Test that the next utterance succeeds.
6. **Replacing current state with stale repair output.** Compare page identity, URL origin/path, structural hash and IDs, then overlay only allowed descriptions onto current model.
7. **Adding model to candidate enum.** Split raw candidate source from resolved FormModel LabelSource; add tests/docs/lock updates and obtain protocol sign-off.
8. **Calling a prompt estimate exact.** Keep ~8k trimming prompt-only; calibrate conservative estimate from SDK usage.
9. **Adding API-only token counting or changing auth.** Do not introduce API-key or Messages API fallback; verify current subscription policy for owner-operated local use and keep the app unhosted as required.

## Code Examples

### Structured Intent output

Source: [official Agent SDK structured outputs documentation](https://code.claude.com/docs/en/agent-sdk/structured-outputs)

    const jsonSchema = z.toJSONSchema(Intent, { target: "draft-7" });
    for await (const message of query({
      prompt: safePrompt,
      options: {
        tools: [],
        outputFormat: { type: "json_schema", schema: jsonSchema },
      },
    })) {
      if (message.type === "result") {
        if (message.subtype !== "success" || !message.structured_output) {
          throw new InvalidModelOutputError();
        }
        const parsed = Intent.safeParse(message.structured_output);
        if (!parsed.success) throw new InvalidModelOutputError();
        return parsed.data;
      }
    }

This documented shape does not prove composition with startup/prewarm; run D-01's spike first. The current SDK expects draft-07; Zod 4 otherwise targets draft 2020-12.

### Strict repair patch boundary

Illustrative only; adapt to current FormModel:

    const RepairPatch = z.strictObject({
      title: z.string().max(160).optional(),
      fields: z.array(z.strictObject({
        fieldId: z.string().min(1).max(160),
        label: z.string().min(1).max(160).optional(),
        group: z.string().max(120).nullable().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })).max(250),
    });

After parsing, enforce unique IDs and membership in captured/current model. Assign model source in server code for changed labels; do not trust model provenance.

### Startup isolation sketch

Sources: [Agent SDK configuration](https://code.claude.com/docs/en/agent-sdk/configuration), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [SDK feature controls](https://code.claude.com/docs/en/agent-sdk/claude-code-features).

    const options = {
      cwd: emptyWorkingDirectory,
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      permissionMode: "dontAsk",
      mcpServers: {},
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        ENABLE_CLAUDEAI_MCP_SERVERS: "false",
        CLAUDE_CONFIG_DIR: isolatedConfigDirectory,
      },
    };

Remove ANTHROPIC_API_KEY before constructing env. SDK env replaces subprocess environment, so preserve required entries such as PATH. Verify the exact connector-disable option against the pinned SDK types/docs. Keep the init tool assertion mandatory.

## Project Constraints (from CLAUDE.md)

- TypeScript throughout; Node.js 24 or newer; Windows and Chrome target.
- Use Claude Agent SDK with the developer's own logged-in subscription and no direct API key; do not host the product or offer other users subscription login/rate limits.
- Every page is untrusted. Disable built-in tools. Passwords/card numbers are never spoken, logged or sent to the model.
- Lock SDK roles with tools: [], disallowedTools: ["*"], settingSources: [], strictMcpConfig: true, permissionMode: "dontAsk", empty cwd, stripped ANTHROPIC_API_KEY, disabled auto-memory/connectors and init tool-list assertion. Never use bypassPermissions.
- Model returns structured Intent or repair data only; deterministic code owns page actions and gated authorization.
- Gated actions default-deny; confirmation phrase is matched in server code only from the voice socket.
- packages/protocol changes need both developers' sign-off; preserve the frozen wire contract and update documentation/tests/lock with additive changes.
- Start changes through the GSD workflow; no direct repository edits outside it.

## Environment Availability

| Dependency | Required by | Available | Version/status | Fallback |
|------------|-------------|-----------|----------------|----------|
| Node.js | Server/SDK runtime | Yes | v24.14.0; repo requires >=24 | — |
| npm | Workspaces | Yes | v11.9.0 | — |
| Agent SDK | Intent and repair | Not installed or declared | Registry 0.3.302 on 2026-10-17; Node >=18; Windows optional package published | Add exact pin in implementation; use locked streaming JSON/Zod fallback if spike fails |
| Claude CLI | Local runtime diagnostic only | Found | Version and auth not probed | SDK package bundles native Windows runtime |
| Subscription login | Live Claude | Not verified; credentials not inspected | Assumed by project | Required for live SDK; preserve --brain=fake offline |

**Missing with no fallback:** A valid developer subscription login is required for live Claude; it was not inspected.

**Missing with fallback:** SDK package is absent until implementation adds it; current fake brain continues to support offline tests.

## Existing Test Infrastructure

npm test runs Vitest 5.0.5 across workspace projects. npm run typecheck runs root TypeScript. Tests cover protocol lock, server acts and walking skeleton; server integration tests use local WebSockets and injected clocks/schedulers. .planning/config.json sets workflow.nyquist_validation false, so omit a Nyquist Validation Architecture section.

| Requirement | Suggested test | Type | Command | Existing coverage |
|------------|---------------|------|---------|------------------|
| BRAIN-01 | Empty init tool list starts; unexpected tool refuses startup; isolate settings/connectors/memory/API key | Unit/integration | npm test -- --project @blip/server | No SDK adapter tests |
| BRAIN-02 | Grammar bypass; unmatched safe utterance yields Intent; invalid/stale IDs fail; secret sentinel is absent from provider input | Unit | npm test -- --project @blip/server | Fake brain/turn seam exists |
| BRAIN-03 | Prewarm or fallback; timeout speaks exact phrase, clears busy/turn queue, then next utterance succeeds | Integration with fake provider/injected timers | npm test -- --project @blip/server | Add watchdog coverage |
| PAGE-04 | Baseline precedes delayed repair; only descriptive keys merge; stale IDs/hash and corrupt cache miss; cache hit reuses patch | Unit/integration | npm test -- --project @blip/server | Add repair/cache tests |
| Protocol | Existing sources remain valid; model source only for resolved fields, not raw candidates | Unit | npm test -- --project @blip/protocol | Lock test exists; add source separation |

Do not require subscription credentials or live Claude in CI. Make spike/live smoke explicitly opt-in. Test secret redaction with a unique sentinel and assert it never appears in provider input, logs, speech or cache bytes. Use fake SDK adapters, not timing sleeps, for failure/race tests.

## State of the Art

| Earlier approach | Current documented behavior | Planning implication |
|------------------|------------------------------|---------------------|
| Plain-text SDK response | outputFormat json_schema yields structured_output after SDK validation/retry | Use after spike; still parse locally. |
| Zod default JSON Schema | SDK validates draft-07, while Zod 4 defaults to draft 2020-12 | Convert using target draft-7. |
| One-shot query | Streaming input is documented recommended persistent interactive mode | Use role sessions; independently test prewarm combination. |
| Snapshot cap equals prompt cap | Phase 2 wire snapshot has 250-element cap; Phase 4 trims prompt context around 8k | Keep separate boundaries and truncated semantics. |

## Open Questions

1. **Resolved — the required empty-tool condition failed.** The bounded live runs initialized both roles with `tools: []`; a second attempt also set `disallowedTools: ["*"]`, but both init messages still reported exactly one tool. Both probes stopped before `WarmQuery.query()`, so no model prompt or structured result was sent. Do not select `startup()` + `outputFormat`; use the D-01 streaming/Zod fallback, which retains a deny-all option and still refuses startup if tools are reported.
2. **Resolved — conservative estimate selected; calibration unavailable.** `estimateProjectionTokens` uses `ceil(UTF-8 bytes / 2)` over the exact serialized prompt guide and projection, with projection-only trimming to an 8,000 estimate. This is explicitly an approximate bound, not a tokenizer-calibrated count; the live probe did not reach a model result with usage data.
3. **Open — Windows cancellation/recreation lacks live SDK evidence.** The role manager and watchdog have injected-adapter tests, but the live probe stopped before a query. Keep the timeout settling behavior covered by tests and do not claim the pinned SDK's Windows cancellation/recreation behavior is measured.
4. **Resolved — local owner use confirmed for this spike.** The owner confirmed the eligible subscription and bounded local use. Anthropic's current help article explicitly permits Agent SDK and third-party app use against Claude subscription limits; the project remains owner-run and does not share login or host a service. Do not switch to an API-key path.
5. **Resolved — exact additive split approved.** The owner confirmed the voice owner explicitly approved keeping raw extension label candidates deterministic while allowing `model` only on resolved FormModel labels. The approval was received in the Phase 4 checkpoint response before protocol edits.

## Sources

### Primary (HIGH confidence)

- [Agent SDK structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs) — outputFormat, draft-07 schema, Zod conversion, structured_output success/error behavior.
- [Agent SDK streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) — persistent streaming mode recommended for interactive sessions.
- [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) — query, startup(), WarmQuery, prewarm() and option APIs; verify exact installed declarations at implementation because SDK is fast-moving.
- [Agent SDK configuration](https://code.claude.com/docs/en/agent-sdk/configuration) — child environment replacement and settings/config.
- [Agent SDK Claude Code features](https://code.claude.com/docs/en/agent-sdk/claude-code-features) — settings sources, memory and connector controls.
- [Agent SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions) — dontAsk and bypass warning.
- [Agent SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions) — `disallowedTools: ["*"]` removes every tool definition; retained as an additional deny-all control alongside `tools: []` and the mandatory init check.
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) — Anthropic Help Center update 2026-10-07 confirms Agent SDK and third-party app usage can draw from subscription limits.
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — auth and third-party use restrictions; verify terms for locked local use.
- [Haiku 5.5 overview](https://platform.claude.com/docs/en/models/haiku-5-5/overview) and [Sonnet 5.5 overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) — current model IDs and role fit.
- [Haiku 5.5 migration guide](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide) — current tokenizer change; avoid old estimates.
- [Token Counting API](https://platform.claude.com/docs/en/build-with-claude/token-counting) — API endpoint, excluded from subscription-only SDK plan.
- [Official Agent SDK npm package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) — npm registry version/date/engine checked 2026-10-17.
- [Official archived TypeScript tokenizer repository](https://github.com/anthropics/anthropic-tokenizer-typescript) — archived September 2026; approximate for pre-Claude 3, unsuitable as exact current tokenizer.

### Project sources (HIGH confidence)

- .planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-CONTEXT.md, ROADMAP.md, REQUIREMENTS.md, STATE.md, PROJECT.md, PROTOCOL.md and CLAUDE.md — scope, requirements and locked boundaries.
- apps/server/src/brain/fake-brain.ts, grammar.ts, turn.ts, server.ts, session/session.ts, session/refresh.ts, baseline/build.ts, baseline/label.ts, results/interpret.ts and log.ts — extension seams, routing and redaction patterns.
- packages/protocol/src/form-model.ts, snapshot.ts, intent.ts and packages/protocol/package.json — schemas, LabelSource and Zod version.
- apps/extension/src/content/act.ts, content/sensitive.ts, background/acts.ts and background/frames.ts — post-write shape recheck and background trust-boundary sanitization.
- vitest.config.ts, root package.json and existing protocol/server tests — test commands and patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed repository versions and current official docs/registry were checked; SDK pin is not installed.
- Architecture: HIGH — based on current code and locked context; startup/session composition awaits spike.
- Privacy/action boundary: HIGH — locked requirements and existing protocol/server/extension patterns.
- Token trimming: LOW for exact token count; MEDIUM for conservative calibrated estimate.
- Subscription policy: HIGH that official docs impose third-party use constraints; MEDIUM applying them to this owner-operated local hackathon case.

**Research date:** 2026-10-17  
**Valid until:** 2026-10-24 for fast-moving SDK/model details; repository findings remain valid until code changes.

