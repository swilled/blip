# Phase 3: Full Command Set with Real Claude - Research

**Researched:** 2026-10-17
**Domain:** Voice dialogue behavior, local profile fill, and trust disclosures over the shared form-model contract
**Confidence:** HIGH for repository patterns and locked behavior; MEDIUM for core integration readiness

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Profile fill (DLG-05)
- **D-01:** “Fill from my profile” fills every unambiguous autocomplete-token match in one command.
- **D-02:** Skip unmatched or ambiguous fields, finish the clear matches, then name the skipped fields so the user can dictate them. Do not guess a mapping.
- **D-03:** Leave fields with existing values unchanged and report that they were skipped.
- **D-04:** After profile fill, summarize which fields were filled and name any required fields still empty. Continue to echo the value observed on the page after each fill, as established in Phase 2.
- **D-05:** Carry forward the project privacy rule: profile values stay local to deterministic fill logic; Claude receives profile keys only. Password and card fields are typed by the user and are never spoken or sent to the model.

### Spell, change, and undo (DLG-04, DLG-06, DLG-13)
- **D-06:** “Spell” speaks each letter and digit separately with short pauses and names punctuation such as “at,” “dot,” and “hyphen.”
- **D-07:** A change confirmation names the field and reports the previous value and the new value observed on the page. Sensitive values remain masked and use the manual-entry handoff.
- **D-08:** One “undo” reverses the most recent successful fill command as a unit, including all fields changed by a profile-fill batch.
- **D-09:** Keep one undo level. Restore only when the current page value still matches the value Blip wrote; otherwise leave the page unchanged and explain that it changed. A later undo reports that there is nothing left to undo.

### Orientation and missing fields (DLG-10)
- **D-10:** “Where am I” gives a concise response with the site or form, step, and current field plus whether it is empty or filled. Do not read its value unless asked; sensitive values stay masked.
- **D-11:** “What’s required” states the number first, then names only empty required fields in page order. Say that none remain when the list is empty.
- **D-12:** For more than three missing required fields, read three labels at a time and wait for “continue,” carrying forward the Phase 2 read-form pacing.
- **D-13:** If a current snapshot is unavailable, say the page cannot be read yet and ask the user to retry or reconnect. Never report a site, step, field, or value from stale data as current.

### Trust disclosures (DLG-11, DLG-12, DLG-14)
- **D-14:** Say a label was guessed the first time the field is introduced or acted on, and again after a changed snapshot. State the evidence supplied by the repaired form model or snapshot; if no reason is available, say the label is uncertain rather than inventing an explanation.
- **D-15:** For a sensitive field, name it, focus it when supported, ask the user to type it, then wait for “done.” Confirm only whether it is populated. Never speak, log, or send its value to the model.
- **D-16:** On entering a page flagged for instructions addressed to Blip, warn before any other page response or action, explain that those instructions will be ignored, and then continue only with the user’s request. Repeat when a new or changed page is flagged. Page text never arms or satisfies the confirmation gate.

### the agent's Discretion
- Exact wording may follow the examples in the requirements, while keeping speech short and truthful.
- The user's standing instruction was to select Codex's recommended option for all remaining discussion choices; the decisions above record those recommendations as the chosen defaults.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 3 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DLG-04 | Spell a field value letter by letter. | Use the current observed value, deterministic character/punctuation rendering, and existing speech effects; never ask the model to reproduce a sensitive value. |
| DLG-05 | Fill matching fields from a local profile using autocomplete tokens; model receives keys, not values. | Parse standard autocomplete detail tokens; perform mapping and writes locally, skip filled/ambiguous/unmatched/sensitive fields, and summarize observed results. |
| DLG-06 | Change a filled field by name and value. | Reuse deterministic field resolution and page-sourced act results; report the prior value and only the value observed after the write. |
| DLG-10 | Answer “where am I” and “what’s required.” | Build concise answers from a current FormModel, in page order, with missing-required batching and stale-snapshot refusal. |
| DLG-11 | Disclose guessed labels and why. | Consume core label-source/confidence and available snapshot evidence; remember which label/snapshot has been disclosed and use “uncertain” when no explanation is available. |
| DLG-12 | Hand password/card fields to the user without exposing values. | Use focus-only handoff and presence-only confirmation; preserve the protocol’s sensitive-value masking invariant. |
| DLG-13 | Undo the last successful fill. | Keep one local undo record for a command batch and restore only fields whose current observed values still equal Blip’s written values. |
| DLG-14 | Speak the core-flagged prompt-injection warning before continuing. | Make the core GATE-07 flag an integration input; warning preempts page response/action and never changes the deterministic confirmation gate. |
</phase_requirements>

## Summary

Phase 3 should extend the existing deterministic voice dialogue layer. The repository already defines a pure reducer, an effect runner, page-sourced fill echoes, form fixtures, and a test suite. Keep command recognition grammar-first; use core’s structured `parseIntent` path only for phrases the local grammar does not understand. The model returns intent data; voice code and the core Executor remain the only paths that can request page actions. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:20-23; .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:74-86; packages/dialogue/src/reduce.ts:36-40, 73-99; packages/dialogue/src/effects.ts:6-21; CLAUDE.md:307-311]

Keep profile values local to deterministic token matching and fill logic. Treat the repaired FormModel and fresh page observations as the source for labels, current values, required status, and field presence. All cross-track dependencies remain core-owned: real Claude and its watchdog, label repair, page-change snapshots, injection detection/flagging, and the action gate. Until those contracts land, voice can exercise behavior through fixtures and its mock runner, but I3 needs the real core path. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:17-38, 84-86; .planning/workstreams/voice/ROADMAP.md:128-147; docs/WORK-SPLIT.md:33-35; CLAUDE.md:307-311]

**Primary recommendation:** Plan voice-owned reducer, mock-runner, fixture, and test changes around the locked decisions, with explicit upstream contract checks for GATE-07 and label evidence. Do not add dependencies or plan edits to core-owned implementation. [VERIFIED: docs/WORK-SPLIT.md:1-20, 25-37; .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md:1-12]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Command grammar, orientation, spell/change/undo responses | API / Backend | Browser / Client | Dialogue is a pure reducer; a runner interprets its effects and routes speech or fill operations. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:20-23; packages/dialogue/src/reduce.ts:36-40] |
| Local profile lookup and fill batching | API / Backend | Browser / Client | Voice owns local profile orchestration; extension/core executes writes and returns observed page values. [VERIFIED: docs/WORK-SPLIT.md:33-35; .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:17-21, 74-86] |
| Actual DOM writes, re-snapshot, and core form repair | Browser / Client and API / Backend (core-owned) | — | Voice emits typed effects and consumes returned data; core owns the extension, page model, and repair pipeline. [VERIFIED: docs/WORK-SPLIT.md:1-20; .planning/workstreams/voice/ROADMAP.md:133] |
| Sensitive-field focus and handoff speech | API / Backend | Browser / Client | The dialogue selects/focuses the field and confirms presence only; the page/protocol must keep the value masked. [VERIFIED: packages/dialogue/src/read-fill.ts:97-109; packages/protocol/src/snapshot.ts:10-18, 52-57; 03-CONTEXT.md:37] |
| Guessed-label disclosure and injection warning | API / Backend | Browser / Client | Voice speaks core-provided provenance and warning flags; core owns label repair and injection detection. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:35-38, 84-86; docs/WORK-SPLIT.md:34-35] |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | `>=24` project engine; observed runtime `24.20.0` | Workspace runtime | Declared by the root package and available in this environment. [VERIFIED: package.json:11-13; environment probe 2026-10-17] |
| TypeScript | `6.0.3` | Voice/dialogue implementation | Existing root development dependency; no new language/runtime is needed. [VERIFIED: package.json:22-29] |
| Vitest | `5.0.5` | Unit and workspace integration tests | Existing root test script runs Vitest across configured workspaces. [VERIFIED: package.json:15-18, 22-29; vitest.config.ts:1-9] |
| `@blip/dialogue` + `@blip/protocol` | Existing private workspaces | Reducer/effects and shared typed form/intent contracts | The dialogue package already depends on protocol and exports TypeScript source. [VERIFIED: packages/dialogue/package.json:1-14; packages/protocol/package.json:1-20] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `tsx` | `4.23.15` | Run TypeScript source in local server/mock scripts | Use the existing scripts for mock and integration behavior; do not create a second runner. [VERIFIED: package.json:22-27; dev/mock-server/package.json:1-18] |
| WHATWG HTML autocomplete tokens | Living standard | Interpret `Field.autocomplete` for deterministic local profile matching | Use the defined token sequence and separate field-name matching from scope/hint tokens. [CITED: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html] |

**Installation:** None recommended. Reuse workspace dependencies; this phase does not require an external package. [VERIFIED: package.json:1-29; packages/dialogue/package.json:1-14]

## Package Legitimacy Audit

Not applicable: no external package installation is recommended for this phase. If planning later adds one, run the package-legitimacy and registry checks before adding it. [VERIFIED: phase scope in .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:5-11; existing stack in package.json:1-29]

## Architecture Patterns

### Recommended Flow

```text
Utterance
  -> pure reducer: local grammar first
       -> deterministic speak/fill/focus/undo effects
       -> unmatched phrase becomes a structured-Intent request to core
  -> voice-owned runner interprets effects
       -> core/extension performs permitted page operation
       -> fresh snapshot / observed result returns to reducer
  -> short, truthful speech from the observed form state
```

The boundaries in this flow match the project’s current reducer/effect split and core/voice ownership. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:20-23; packages/dialogue/src/effects.ts:6-21; .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:74-86]

### Pattern 1: Keep the Reducer Pure and Grammar-First

**What:** The reducer receives state, an event, and a context; it returns a new state plus effect descriptions. The runner owns I/O. [VERIFIED: packages/dialogue/src/reduce.ts:36-40; packages/dialogue/src/effects.ts:6-21]

**When to use:** Every new command and state transition in this phase.

**Example:**

```ts
const result = reduce(state, event, { form, now });
state = result.state;
for (const effect of result.effects) await runEffect(effect);
```

This follows the existing reducer and runner structure. [VERIFIED: packages/dialogue/src/reduce.ts:36-40; apps/server/src/voice/dialogue-runner.ts:87-108]

The current shared Intent schema already contains profile and command intent shapes. The relevant variants are exactly: `z.object({ type: z.literal("fill_profile") })`, `z.object({ type: z.literal("spell"), fieldId: z.string() })`, and `z.object({ type: z.literal("undo") })`. [VERIFIED: packages/protocol/src/intent.ts:14, 20-21] Keep any new dialogue handling inside the existing agreed boundary; do not have the model supply profile values or approve an action. [VERIFIED: CLAUDE.md:307-311]

```ts
z.object({ type: z.literal("fill_profile") }),
z.object({ type: z.literal("spell"), fieldId: z.string() }),
z.object({ type: z.literal("undo") }),
```

### Pattern 2: Use Form Data and Page Observations as the Truth

The shared resolved field carries these exact contract members: [VERIFIED: packages/protocol/src/form-model.ts:13-30]

```ts
  labelSource: LabelSource,
  confidence: z.number().min(0).max(1),
  hint: z.string().max(200).optional(), // format hints ("MM/DD/YYYY")
  required: z.boolean(),
  autocomplete: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  value: z.string().nullable(), // LAST VALUE READ FROM DOM, not intended value; null when sensitive
  hasValue: z.boolean(),
  sensitive: Sensitivity,
  error: z.string().max(300).nullable(),
  group: z.string().max(120).optional(),
  disabled: z.boolean(),
  order: z.number().int(),
```

Profile mapping should parse autocomplete details rather than compare the whole attribute string to one key. The WHATWG standard defines an ordered sequence with optional `section-*` and `shipping`/`billing` tokens before the autofill field name; scope is distinct from the field name. [CITED: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html; https://html.spec.whatwg.org/dev/form-control-infrastructure.html]

Use explicit profile-key matches only. For duplicate scoped fields, skip ambiguous matches rather than silently filling every field that shares a field-name token; preserve the locked decisions for existing values, summaries, and required empties. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:17-21; CITED: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html]

### Pattern 3: Make Mutations Observable and Undo Conditional

The current runner marks the session stale after a page act and dispatches the page’s `observedValue`; the current dialogue already waits for an act result before echoing. Extend this pattern for change/profile batches and required-field summaries. [VERIFIED: apps/server/src/voice/dialogue-runner.ts:118-175; packages/dialogue/src/read-fill.ts:116-131, 260-288; packages/dialogue/src/templates.ts:57-66]

For a profile-fill command, capture a single undo record for the command as a unit, with each field’s pre-fill and written value. Before restoring each field, compare its current page value with Blip’s written value; preserve user edits and report any skipped restoration. This is the locked safety condition, not an optional convenience. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:25-27]

### Pattern 4: Treat Provenance and Page Instructions as Data

Speak guessed-label disclosure from core-provided source/confidence and any explicit evidence available in the form or snapshot. Track disclosure by field and snapshot so it is said on first introduction/action and after a changed snapshot, not on every repeated mention. If the source offers no explanation, use the locked uncertain wording. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:35-38; packages/protocol/src/form-model.ts:17-30]

When GATE-07 marks a page, make the warning the first response/action for that page or changed page. The page’s text stays untrusted data; only the user’s voice utterance and deterministic gate logic can participate in confirmation. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:36-38; CLAUDE.md:307-311]

### Recommended Project Structure

```text
packages/dialogue/src/       # pure command/state behavior and unit tests
dev/mock-server/src/         # voice-owned test runner and stand-in core responses
fixtures/forms/              # sanitized model/snapshot cases for low-confidence, sensitive, and injection states
fixtures/demo/               # fictional local profile; values stay outside model requests
```

This maps to the existing work split and the phase context’s reusable assets. [VERIFIED: docs/WORK-SPLIT.md:25-37; .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:74-86]

### Anti-Patterns to Avoid

- Do not send profile values to Claude; pass only the profile keys allowed by the contract and fill locally. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:20-21; .planning/workstreams/voice/REQUIREMENTS.md:27-28]
- Do not let the model perform page actions, set label confidence, arm/complete confirmation, or override the gate. [VERIFIED: CLAUDE.md:307-311; packages/protocol/src/intent.ts:3-8]
- Do not guess autocomplete mappings, field matches, label explanations, or current values. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:18, 25-27, 36]
- Do not report values from a stale snapshot, or speak sensitive values in answers, logs, transcripts, or model input. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:21, 30, 33, 37; packages/protocol/src/snapshot.ts:10-18]
- Do not implement core-owned Claude, page repair, injection detection, or Executor behavior in voice files. [VERIFIED: docs/WORK-SPLIT.md:1-20; .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:84-86]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Intent understanding | A second model call or free-form field-action executor in voice | Existing grammar-first reducer and core `parseIntent` contract | Keeps deterministic commands fast and prevents model authority from crossing into page actions. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:20-23; CLAUDE.md:307-311] |
| Profile mapping | Label guessing, fuzzy value inference, or sending profile values to the model | WHATWG autocomplete field-name semantics plus a local explicit token map | The standard distinguishes scope from the field name; locked decisions require ambiguous/unmatched fields to be skipped. [CITED: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html; VERIFIED: 03-CONTEXT.md:17-21] |
| Form state / write result | A second client-side source of truth or an echo of what STT/model intended | Current FormModel and DOM-observed act results | Existing behavior already echoes the value observed by the page. [VERIFIED: packages/dialogue/src/templates.ts:57-66; apps/server/src/voice/dialogue-runner.ts:149-164] |
| Prompt-injection defense and gate | Voice-side reimplementation of page scanning or action approval | Core GATE-07 flag plus the existing core action gate; voice only speaks the warning | Ownership and the no-model-action invariant are locked. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:36-38, 84-86; CLAUDE.md:307-311] |

**Key insight:** Phase 3 is integration-sensitive rather than library-sensitive. The voice value is in short deterministic responses around core-owned snapshots and actions; keep model output as typed intent data and keep the page as the source of truth. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:20-23, 128-147; CLAUDE.md:307-311]

## Common Pitfalls

### Pitfall 1: Matching the Whole Autocomplete Attribute

**What goes wrong:** A field such as `section-blue shipping email` fails an exact comparison to `email`, or multiple billing/shipping fields are treated as the same unique target.
**How to avoid:** Parse the standard token sequence, separate scope/hint tokens from the field-name token, and apply only explicit, unambiguous local key mappings.
**Source:** [CITED: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html]

### Pitfall 2: Echoing Intent Instead of the Page Result

**What goes wrong:** A rejected/truncated fill, changed page value, or stale read is reported as if it succeeded.
**How to avoid:** Wait for the act result, speak only its observed value, refresh the form, and say the page is unavailable when the current snapshot is stale.
**Source:** [VERIFIED: apps/server/src/voice/dialogue-runner.ts:118-175; packages/dialogue/src/templates.ts:57-66; 03-CONTEXT.md:33]

### Pitfall 3: Treating an Undo Batch as Independent Writes

**What goes wrong:** One undo restores only the last field of a profile-fill batch, or overwrites a value the user edited after the fill.
**How to avoid:** Store one command-level record, restore only if the live current value still equals the value Blip wrote, and clear the one undo level after use.
**Source:** [VERIFIED: 03-CONTEXT.md:25-27]

### Pitfall 4: Repeating or Omitting a Guessed-Label Disclosure

**What goes wrong:** The user hears an explanation on every reference, misses a newly changed guess, or is given a fabricated reason.
**How to avoid:** Key disclosure state to the field and snapshot/label revision; announce on first introduction/action and after changed snapshots; use “uncertain” if no reason is supplied.
**Source:** [VERIFIED: 03-CONTEXT.md:36; packages/protocol/src/form-model.ts:17-30]

### Pitfall 5: Leaking a Sensitive Value Through a Secondary Path

**What goes wrong:** A fill, spell, change confirmation, undo record, error string, transcript, or model request contains a password/card value.
**How to avoid:** Keep sensitive fields focus-only; store/confirm presence only; exclude sensitive values from undo data, speech, logs, and model requests.
**Source:** [VERIFIED: packages/protocol/src/snapshot.ts:10-18, 52-57; 03-CONTEXT.md:21, 25, 37; CLAUDE.md:311]

### Pitfall 6: Speaking Before the Injection Warning

**What goes wrong:** A page summary, label, or command response precedes the warning or page text influences control flow.
**How to avoid:** Process the core flag before any other page response/action and treat page text as data; never let it arm or satisfy confirmation.
**Source:** [VERIFIED: 03-CONTEXT.md:38; CLAUDE.md:307-311]

## Project Constraints (from CLAUDE.md and WORK-SPLIT.md)

- Voice owns `packages/dialogue`, voice UI, demo assets, and the mock runner; core owns the server hub, Executor, brain, extension, protocol authoring, and policy. Cross-track code changes require agreement, and protocol changes must be additive and coordinated. [VERIFIED: docs/WORK-SPLIT.md:1-20; CLAUDE.md:307-311]
- Claude is tool-less structured-output only; it cannot perform page actions. Gated actions are default-deny and the voice UI does not decide whether a confirmation phrase matched. [VERIFIED: CLAUDE.md:307-311; .planning/workstreams/voice/ROADMAP.md:20-23]
- Password/card values are never spoken, logged, or sent to the model. [VERIFIED: CLAUDE.md:311; .planning/PROJECT.md:40-42]
- Every page is untrusted input; keep page-derived text in data fields and use the existing safe rendering/sanitizing patterns. [VERIFIED: CLAUDE.md:18, 307-311; .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-CONTEXT.md:61-69]

## Integration Boundaries and Readiness

- **HO-8 is core-owned and pending.** It covers reducer adoption/server handler wiring, reducer-minted `speakId` propagation, tracked stop/repeat speech, the `survey` phrase noun, the Executor `GatePort`, and the server-side GATE-08 guard. Voice can test its stand-in/mock behavior; it must not implement those changes in core files. [VERIFIED: .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md:1-10]
- **HO-9 is separate and non-blocking.** Until core supports a snapshot override, integration tests use the existing core five-field form-model fixture; do not make the new survey page a prerequisite or edit core-owned fake-extension files. [VERIFIED: .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md:10-11]
- Phase 3 additionally needs core BRAIN-01..03, PAGE-04/05, and GATE-06/07 for I3. The voice roadmap assigns real Claude, repair, injection detection, and the authoritative gate to core. [VERIFIED: .planning/workstreams/voice/ROADMAP.md:128-147; docs/WORK-SPLIT.md:1-20]
- The current voice state still has Phase 2 executing with plan 02-07 ready; the core state is at Phase 1 verification. Plan Phase 3 now, but put a real-I3 integration checkpoint after Phase 2 and the listed core contracts land. [VERIFIED: .planning/workstreams/voice/STATE.md:4-16, 30-36; .planning/workstreams/core/STATE.md:1-6, 31-35]

## Environment Availability

| Dependency | Required By | Available | Version / Observation | Fallback |
|------------|-------------|-----------|-----------------------|----------|
| Node.js | Tests and local workspace execution | Yes | `v24.20.0`; project declares `>=24` | — |
| npm | Workspace scripts | Yes | `11.19.0` | — |
| Vitest | Unit/integration tests | Yes | `5.0.5` | — |
| Chrome | I3 real page integration | Yes | Found at the current user install path under LocalAppData | Use fixtures and the mock runner until core integration is ready |
| Core Claude/repair/injection integration | I3 | Not ready in the current workstream state | Core is still at Phase 1 verification; do not inspect or copy credentials | Fixture/mock behavior for voice tests; real I3 remains an upstream dependency |

Availability probes were run on 2026-10-17. Claude credentials were not inspected. [VERIFIED: environment probes; .planning/workstreams/core/STATE.md:1-6, 31-35]

## Open Questions (RESOLVED)

1. **GATE-07 warning contract — RESOLVED as an upstream contract gate.** Voice will consume only the core-owned warning flag once its exact payload is published; it will not invent a parallel wire field. Phase 3's integration plan verifies that contract before the real-core run. If the contract is not available, the integration acceptance remains blocked rather than treating a fixture as proof of the core path. [VERIFIED: 03-CONTEXT.md:84-86; .planning/workstreams/voice/ROADMAP.md:133-147; 03-04-PLAN.md]
2. **Evidence for DLG-11 guessed-label disclosures — RESOLVED by the locked truthful fallback.** Speak only explicit evidence present in the agreed repaired-model/snapshot contract. If core supplies provenance/confidence without an evidence reason, use the locked “uncertain” wording; do not infer a reason. The plan tests both evidence-present and evidence-absent cases. [VERIFIED: 03-CONTEXT.md:36; packages/protocol/src/form-model.ts:17-30; 03-03-PLAN.md]
3. **Core delivery timing for I3 — RESOLVED as an accepted dependency.** Delivery timing remains core-owned and is not assumed. Voice-owned behavior is exercised with fixtures/mock runner first; the real-Claude I3 run is gated on the required core contracts and delivery. If they are unavailable, record the human integration criterion as pending rather than claiming it passed. [VERIFIED: .planning/workstreams/core/STATE.md:1-6, 31-35; .planning/workstreams/voice/STATE.md:30-47; 03-04-PLAN.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [ASSUMED] Core will expose an agreed GATE-07 flag and enough label provenance for voice to consume before I3. | Integration Boundaries and Open Questions | DLG-11/DLG-14 cannot pass real integration; planner needs an upstream checkpoint or stand-in. |
| A2 | [ASSUMED] Voice can keep all Phase 3 behavior testable against fixtures/mock runner until core’s real implementation is available. | Summary / Environment | Some end-to-end work may be blocked if core changes its contract or mock behavior diverges. |

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement` to `false`. Use OWASP ASVS 5.0.0 category names for this phase; OWASP identifies 5.0.0 as its latest stable version. This is a phase-scoped security map, not a claim of ASVS certification. [VERIFIED: .planning/config.json:1-30; CITED: https://owasp.org/projects/asvs; https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json]

### Applicable ASVS Categories

| ASVS 5.0.0 Category | Applies | Standard Control |
|---------------------|---------|------------------|
| V1 Encoding and Sanitization | Yes | Keep page-derived and model-derived strings as untrusted data; use safe text rendering and context-appropriate encoding. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: CLAUDE.md:18, 307-311] |
| V2 Validation and Business Logic | Yes | Validate structured intents and preserve deterministic confirmation/action rules; fail closed when a required gate is unavailable. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: CLAUDE.md:307-311] |
| V3 Web Frontend Security | Yes | Treat form and page text as text, not executable markup; only act on typed, validated contracts. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: CLAUDE.md:18, 307-311] |
| V4 API and Web Service | Yes | Preserve the coordinated voice/core contract boundary and validate data crossing it; core owns the action gate and real model service. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: docs/WORK-SPLIT.md:1-20, 33-37] |
| V14 Data Protection | Yes | Keep profile values local and sensitive values out of speech, logs, and model input; confirm sensitive fields by presence only. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: CLAUDE.md:311; 03-CONTEXT.md:20-21, 33, 37] |
| V16 Security Logging and Error Handling | Yes | Do not log credentials/payment values; missing, stale, or failed core data must not be treated as successful or current. [CITED: https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json; VERIFIED: 03-CONTEXT.md:30, 33, 37; packages/protocol/src/snapshot.ts:10-18] |

### Known Threat Patterns for the TypeScript Voice / Browser Integration

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted page text attempts to redirect the assistant or influence confirmation | Tampering / Elevation of Privilege | Core detects and flags the page; voice warns before other responses; only user speech and the deterministic core gate can participate in confirmation. [VERIFIED: 03-CONTEXT.md:36-38, 84-86; CLAUDE.md:307-311] |
| Sensitive profile or password/card data leaks through speech, transcripts, logs, undo state, or model input | Information Disclosure | Keep profile values local; sensitive entry is user-only and presence-only; exclude values from speech, logs, transcripts, model input, and undo records. [VERIFIED: 03-CONTEXT.md:20-21, 25, 33, 37; CLAUDE.md:311] |
| Stale or malformed snapshot is presented as current or used for a write | Tampering / Information Disclosure | Reject stale data, refresh before acting, validate structured contracts, and report only page-observed results. [VERIFIED: 03-CONTEXT.md:30, 33; apps/server/src/voice/dialogue-runner.ts:118-175] |
| Page-derived label or value is rendered as active markup | Tampering | Preserve the existing safe rendering/sanitizing pattern and treat page text as inert data. [VERIFIED: CLAUDE.md:18, 307-311] |

Authentication, OAuth, cryptographic implementation, and file-upload controls are not changed by this phase; keep any changes in those areas out of the voice plan unless an upstream contract explicitly requires them. [VERIFIED: .planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md:5-11, 84-86; docs/WORK-SPLIT.md:1-20]

## Sources

### Primary (repository contracts and implementation)

- `.planning/workstreams/voice/phases/03-full-command-set-with-real-claude/03-CONTEXT.md` — locked decisions, boundaries, reusable code, integration points.
- `.planning/workstreams/voice/ROADMAP.md` and `.planning/workstreams/voice/REQUIREMENTS.md` — Phase 3 criteria and traceability.
- `docs/WORK-SPLIT.md`, `.planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md`, and `.planning/workstreams/core/ROADMAP.md` — ownership and cross-track dependencies.
- `packages/dialogue/src/reduce.ts`, `read-fill.ts`, `fields.ts`, `templates.ts`, `apps/server/src/voice/dialogue-runner.ts` — reducer, field resolution, page observations, and effect handling.
- `packages/protocol/src/form-model.ts`, `snapshot.ts`, `intent.ts` — shared field, sensitive-value, and intent contracts.
- `CLAUDE.md` and `.planning/PROJECT.md` — safety/privacy invariants.

### Secondary (official technical standard)

- [WHATWG HTML Standard: Autofill detail tokens and processing model](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html) — token order, field names, scope, and hint semantics. Cross-checked against the [WHATWG web-developer edition](https://html.spec.whatwg.org/dev/form-control-infrastructure.html). Confidence: MEDIUM per the research confidence seam.
- [OWASP Application Security Verification Standard 5.0.0](https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.json) and [OWASP ASVS project page](https://owasp.org/projects/asvs) — current version and relevant category names/controls for the phase-scoped security map. Confidence: MEDIUM per the research confidence seam.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read from current workspace manifests and runtime probes.
- Architecture: HIGH — reducer, protocol, and workstream ownership were read directly.
- Security domain: MEDIUM — mapped to current official OWASP ASVS 5.0.0 categories and constrained to Phase 3 ownership/safety requirements.
- External autocomplete semantics: MEDIUM — official standard pages cross-checked through web search.
- Integration readiness: MEDIUM — dependencies are explicitly assigned to core, but delivery is pending in current state.

**Research date:** 2026-10-17
**Valid until:** 2026-11-16 for repository patterns; re-check core handoffs and the living HTML standard before execution.
