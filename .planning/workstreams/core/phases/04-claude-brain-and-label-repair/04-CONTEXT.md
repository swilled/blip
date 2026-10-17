# Phase 4: Claude Brain and Label Repair - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a real, tool-less Claude brain on the developer's own subscription for grammar-missed utterances and background form-label repair. The brain returns schema-validated data only; deterministic code retains all authority to act. The first baseline reply stays immediate, repair patches are limited to existing ids and permitted descriptive fields, and bounded failures produce a spoken clarification rather than silence. Hostile-page warnings and the real public web demo remain Phase 5.

</domain>

<decisions>
## Implementation Decisions

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

### The agent's Discretion
- Exact watchdog duration and process lifecycle details, within the stated response and recovery criteria.
- Prompt wording, schema wrapper, tokenizer/trim implementation, cache file format, and cache eviction policy.
- Confidence thresholds and the exact wording the voice track uses to disclose a model-sourced guess, provided source/confidence remain available.
- Model version selection within the Haiku-class intent and Sonnet-class repair defaults, subject to current SDK research, subscription availability, and the phase latency criteria.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and product decisions
- `.planning/workstreams/core/ROADMAP.md` § Phase 4 — goal, success criteria, SDK spike, latency, cache, and snapshot trim boundary.
- `.planning/workstreams/core/REQUIREMENTS.md` — BRAIN-01, BRAIN-02, BRAIN-03, and PAGE-04.
- `.planning/PROJECT.md` — subscription-only constraint, tool-less intent-as-data boundary, deterministic Executor, and core value.
- `.planning/workstreams/core/phases/02-real-page-read-and-fill/02-CONTEXT.md` — 250-element wire cap, Phase 4 prompt-boundary trim, and sensitivity guarantees.
- `.planning/workstreams/core/phases/03-gated-submit-and-result-reading/03-CONTEXT.md` — immutable authorization boundary and the rule that model output never approves a gated action.

### Contract and current integration points
- `PROTOCOL.md` — frozen message and FormModel contract.
- `packages/protocol/src/form-model.ts` — field source/confidence and `repairStatus` schema.
- `packages/protocol/src/snapshot.ts` — current label-source enum and the rule that sensitive values are null on the wire.
- `apps/server/src/brain/fake-brain.ts` — current `IntentBrain.parseIntent` seam and offline implementation.
- `apps/server/src/brain/grammar.ts` — deterministic first-pass command handling.
- `apps/server/src/turn.ts` — unmatched utterances enter the brain and Intents return through deterministic server routing.
- `apps/server/src/baseline/` and `apps/server/src/session/session.ts` — immediate baseline construction and accepted snapshot lifecycle.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IntentBrain` and `createFakeBrain` in `apps/server/src/brain/fake-brain.ts` already provide the narrow asynchronous `parseIntent(text)` seam; keep the fake path working for offline tests.
- `matchGrammar` in `apps/server/src/brain/grammar.ts` already handles deterministic commands before model routing.
- `buildBaselineFormModel` and `Session.applySnapshot` synchronously create the baseline; `FormModel` already includes `labelSource`, `confidence`, and `repairStatus`.
- Protocol snapshot and form-model schemas already enforce sensitive values as null.

### Established Patterns
- Zod parses all protocol input; protocol changes are additive-only and guarded by the lock test.
- Every gated operation still routes through the Phase 3 Executor and independent extension guard.
- Test suites use Vitest; server integration tests use real local sockets and injected clocks/schedulers where timing needs deterministic control.

### Integration Points
- Replace or extend the `IntentBrain` provider in `apps/server/src/server.ts` while retaining `--brain=fake`.
- Extend the frozen protocol's `LabelSource` enum with `model` additively; update protocol documentation/tests and preserve all existing source values.
- Add the repair pipeline after baseline snapshot acceptance without blocking `Session.applySnapshot` or the initial reply.
- Merge validated repair output into the current `FormModel` and cache by page structure, never replacing policy-owned fields.
- Add startup validation, prewarming, watchdog cleanup, and repair cache lifecycle in server-owned modules; no extension action API is exposed to Claude.

</code_context>

<specifics>
## Specific Ideas

- The first observable reply should come from the current deterministic baseline even when model repair is still running.
- A returning user should see a matching cached label repair immediately, after its ids and structure are revalidated.
- Phase 4 does not ship the Phase 5 prompt-injection warning or real public-form demo.

</specifics>

<deferred>
## Deferred Ideas

None — the discussion stayed within Phase 4 scope.

</deferred>

---

*Phase: 04-claude-brain-and-label-repair*
*Context gathered: 2026-10-17*
