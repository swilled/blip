# Phase 3: Full Command Set with Real Claude - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

With real Claude in the loop, the user can fill matching fields from the local profile, inspect and correct what Blip did, and hear clear disclosures about guessed labels, sensitive fields, and page instructions. This phase delivers DLG-04, DLG-05, DLG-06, DLG-10, DLG-11, DLG-12, DLG-13, and DLG-14, depending on core's BRAIN-01..03, PAGE-04/05, and GATE-06/07.

</domain>

<decisions>
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

### The agent's Discretion
- Exact wording may follow the examples in the requirements, while keeping speech short and truthful.
- The user's standing instruction was to select Codex's recommended option for all remaining discussion choices; the decisions above record those recommendations as the chosen defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/workstreams/voice/ROADMAP.md` — Phase 3 goal, success criteria, I3 dependencies.
- `.planning/workstreams/voice/REQUIREMENTS.md` — DLG-04..06, DLG-10..14 and core dependencies.
- `.planning/PROJECT.md` — core value, privacy constraints, and prohibited sensitive-data handling.
- `docs/WORK-SPLIT.md` — ownership and Phase 3 handoffs between voice and core.

### Decisions carried forward
- `.planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-CONTEXT.md` — observed-value echo, field targeting, read pacing, sensitive handling, and reducer rules.
- `.planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md` — HO-8/HO-9 integration boundaries and core-owned gate work.
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-CONTEXT.md` — voice interaction and typed fallback decisions.
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-SPIKE-DECISIONS.md` — proven voice behavior and known limitations.

### Core contracts and user interaction guidance
- `.planning/workstreams/core/ROADMAP.md` — core phases delivering Claude, label repair, snapshots, and injection flags.
- `.planning/workstreams/core/REQUIREMENTS.md` — BRAIN-01..03, PAGE-04/05, GATE-06/07.
- `.planning/research/FEATURES.md` — counts-first interaction, orientation, and user-control guidance.
- `CLAUDE.md` — ownership boundaries and privacy/safety invariants.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/dialogue/src/read-fill.ts`, `fields.ts`, and the reducer: existing grammar-first read/fill behavior, observed-value echo, and sensitive-field handling to extend.
- `apps/server/src/voice/dialogue-runner.ts`: reducer effect execution and extension focus/fill integration; the core brain supplies parse-intent and repaired-form data through its contract.
- `fixtures/demo/profile.template.json`: fictional local name, email, and phone fields; profile fill should remain token-mapped and value-private.

### Established Patterns
- Dialogue remains a pure reducer; unmatched phrases use the structured `parseIntent` path.
- Field resolution reports ambiguity instead of guessing. The page's observed value is the source of truth after a fill.
- Sensitive data is excluded from speech, transcript, logs, and model requests. The model cannot perform page actions or satisfy the confirmation gate.

### Integration Points
- Voice-owned reducer and runner consume core's PAGE-04/05 form-model fields and GATE-07 injection flag.
- Core owns real Claude, label repair, injection detection, and the authoritative action gate; voice uses the agreed contracts and fixtures.

</code_context>

<specifics>
## Specific Ideas

- For spelling, say characters individually and name punctuation (for example, “at” and “dot”).
- For an unknown page snapshot, be explicit that the page is not visible yet instead of using stale context.
- The profile-fill completion should tell the user what remains required, consistent with the user's earlier concern that the form should make missing information clear.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 3 scope.

</deferred>

---

*Phase: 03-full-command-set-with-real-claude*
*Context gathered: 2026-10-17*
