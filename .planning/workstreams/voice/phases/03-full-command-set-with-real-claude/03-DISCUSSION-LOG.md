# Phase 3: Full Command Set with Real Claude - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 3-full-command-set-with-real-claude
**Areas discussed:** Profile fill, Spell/change/undo, Orientation and missing fields, Trust disclosures

---

## Profile fill

**Q1 — How should “fill from my profile” handle matches?**
- Fill all unambiguous matches in one command, then summarize. **Selected by user.**
- Ask before each matching field.
- Fill only the current or named field.

**Q2 — What about ambiguous or unmatched fields?**
- Skip them, fill clear matches, then name skipped fields. **Selected by user.**
- Pause for a decision on every ambiguous field.
- Guess from the label.

**Q3 — What about fields that already contain values?**
- Leave unchanged and report the skip. **Selected by user.**
- Replace with the profile value.
- Ask before replacing each value.

**Q4 — What should the completion summary include?**
- Fields filled and any required fields still empty. **Selected by user.**
- Filled/skipped fields only; report missing required fields only on request.
- Read the entire form.

---

## Spell, change, undo

The user instructed Codex to choose its recommended option for all remaining questions.

**Q1 — How should “spell email” be spoken?**
- Say each letter and digit separately, pause briefly, and name punctuation. **Selected by standing instruction.**
- Use the phonetic alphabet and name punctuation.
- Repeat the value slowly without spelling each character.

**Q2 — How should a change be confirmed?**
- Name the field and report the previous and page-observed new values. **Selected by standing instruction.**
- Say only that it changed.
- Read the whole form after each change.

**Q3 — What should one undo revert?**
- Revert the most recent successful fill command as a unit, including a profile batch. **Selected by standing instruction.**
- Revert only the latest field.
- Revert all session changes.

**Q4 — How deep should undo history go?**
- One level, and do not overwrite if the page value has changed since the fill. **Selected by standing instruction.**
- Keep a history for repeated undo.
- Do not allow undo after another command.

---

## Orientation and missing fields

**Q1 — How concise should “where am I” be?**
- One response with site/form, step, current field, and empty/filled status; no value unless asked. **Selected by standing instruction.**
- Read the full form and all values.
- Give only the site.

**Q2 — How should “what’s required” report missing fields?**
- Count first, then empty required field labels in page order; say none remain when empty. **Selected by standing instruction.**
- List all required fields, including completed ones.
- Give only the count.

**Q3 — How should long missing-field lists be spoken?**
- Three at a time, then wait for “continue,” matching Phase 2 pacing. **Selected by standing instruction.**
- Read all in one response.
- Give only a summary.

**Q4 — What if a current snapshot is unavailable?**
- Say the page cannot be read yet and ask for retry/reconnection; do not guess from stale data. **Selected by standing instruction.**
- Use the last known snapshot without warning.
- Guess from the tab title.

---

## Trust disclosures

**Q1 — When should Blip say a label was guessed?**
- On first introduction/use and after a changed snapshot. **Selected by standing instruction.**
- Every time the field is mentioned.
- Only when asked.

**Q2 — How should it explain the guess?**
- State only available evidence; say it is uncertain if no reason is available. **Selected by standing instruction.**
- Use a generic explanation even without evidence.
- State the guessed label as certain.

**Q3 — How should Blip hand off a sensitive field?**
- Name and focus it when supported, ask the user to type and say “done,” then confirm presence only. **Selected by standing instruction.**
- Tell the user to locate it without focusing.
- Fill from profile and mask the spoken response.

**Q4 — How should an injection warning be delivered?**
- Warn on page entry before any page response/action, say page instructions will be ignored, and repeat on a changed/new flagged page. **Selected by standing instruction.**
- Repeat before every command on the same page.
- Stop all interaction on a flagged page.

## the agent's Discretion

- Exact phrasing and pauses may follow the requirements' examples while keeping speech brief.
- For all questions after the first four Profile fill questions, the user directed Codex to select the recommended option.

## Deferred Ideas

None.
