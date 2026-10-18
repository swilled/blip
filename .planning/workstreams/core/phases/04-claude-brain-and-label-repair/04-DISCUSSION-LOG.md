# Phase 4: Claude Brain and Label Repair - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 4-claude-brain-and-label-repair
**Areas discussed:** SDK startup and structured calls, intent parsing and recovery, background label repair, model input/privacy/cache
**Mode:** `--auto`; recommended defaults selected by the agent, with no user-specific preferences supplied.

---

## SDK startup and structured calls

| Option | Description | Selected |
|--------|-------------|----------|
| Verify `outputFormat` + `startup()` in a bounded spike; use the documented streaming/schema-parse fallback if it fails | Tests the intended structured/prewarmed path before relying on it | ✓ |
| Ship the unverified combination directly | Less initial work, but risks losing structured output or warm startup | |
| Skip prewarming | Simpler lifecycle, but conflicts with the phase latency criteria | |

**Agent's choice under `--auto`:** Verify the combination, then fall back exactly as the roadmap specifies.
**Notes:** Prior decisions already fix subscription login, no API key, empty cwd, no built-in tools/settings/connectors/memory, and refusal on unexpected init tools.

---

## Intent parsing and failure recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Grammar first; validate one structured Intent, retry one invalid result, then speak the safe clarification on failure | Preserves determinism and avoids silence or unbounded retries | ✓ |
| Let the model handle every utterance and retry until valid | Adds latency and weakens predictable recovery | |
| Return raw model text on parse failure | Avoids schema handling but cannot safely route the result | |

**Agent's choice under `--auto`:** Keep grammar-first, tool-less, schema-checked intent parsing with one bounded invalid-output retry and the specified failure phrase.
**Notes:** Existing intent routing and the gated Executor remain the only action path.

---

## Background label repair

| Option | Description | Selected |
|--------|-------------|----------|
| Return baseline immediately; merge only validated descriptive patches for existing ids, preserving kind/value/sensitivity | Meets the instant-answer criterion and keeps policy-owned data authoritative | ✓ |
| Wait for model repair before speaking the first answer | Could improve labels but delays the baseline answer | |
| Replace the full FormModel with model output | Simpler merge, but lets the model rewrite values and policy fields | |

**Agent's choice under `--auto`:** Background-only, narrow patches with source and confidence preserved; add `model` to the frozen label-source enum as an additive value.
**Notes:** Keep the baseline if repair fails. Use the roadmap's Sonnet-class repair default, subject to research and subscription availability.

---

## Model input, privacy, and cache

| Option | Description | Selected |
|--------|-------------|----------|
| Trim to roughly 8k tokens at the model boundary, omit sensitive values, and persist repairs by origin/path/structure hash | Matches the roadmap and supports instant return visits without caching user data | ✓ |
| Trim the extension wire snapshot and cache the whole FormModel | Blurs the wire/model boundary and risks retaining live field values | |
| Keep repairs only in memory | Avoids disk state but cannot provide instant repair on a later visit | |

**Agent's choice under `--auto`:** Keep wire capture independent, send bounded privacy-filtered context, and cache only validated structure-scoped repair data.
**Notes:** Cache hits must be checked against the current structure and ids before use.

---

## The agent's Discretion

- Watchdog timing, process management, prompt wording, trimming/tokenizer details, cache format/eviction, confidence thresholds, and model version within the roadmap defaults.

## Deferred Ideas

- Phase 5 injection warnings, hostile-page proof, and real public-form support remain outside this phase.
