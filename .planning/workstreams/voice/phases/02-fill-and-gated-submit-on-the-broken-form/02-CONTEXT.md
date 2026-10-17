# Phase 2: Fill and Gated Submit on the Broken Form - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

On the self-hosted, deliberately broken survey form, the user can hear the fields, fill them by dictation, hear a full read-back, and submit only by saying the distinct phrase. A bare "yes" never submits. Runs end to end at I2 (~h12) against the real server and extension with the fake brain.

Requirements: DLG-02, DLG-03, DLG-07, DLG-08, DLG-09, VIS-02, DEMO-01, DEMO-02.

</domain>

<decisions>
## Implementation Decisions

### Reading the form (DLG-02, DLG-07)
- **D-01:** "Read the form" reads fields in page order, **3 fields at a time**, then waits. The user says "continue" to hear the next 3. Each field is spoken with its label and whether it is required. The user can interrupt (hold push-to-talk or typed "stop") or start filling at any point.
- **D-02:** For selects and radio groups, options are read **numbered in page order** ("one, small. Two, medium."). The user picks by **number or by name**.

### Dictating and echo (DLG-03)
- **D-03:** Dictation targets a **named field or the current field**. "Email is jane at example dot com" fills the named field. A bare value fills the **current field**, which is the last field Blip read or filled.
- **D-04:** After a fill, Blip echoes **the label and the value read back from the page** ("Email, jane@example.com"), not what it heard. A truncated or rejected value is therefore obvious. Replacing an existing value is mentioned.

### Read-back and confirm (DLG-08, DLG-09, VIS-02)
- **D-05:** The full read-back lists **every field in page order**, with empties called out and required ones marked ("Phone, empty, required"). Sensitive fields say they are entered and hidden, **never the value**. It ends by naming how many required fields are still empty.
- **D-06:** After the read-back, Blip states the distinct phrase (for example "say 'submit survey'"). On a bare "yes" or a wrong phrase, Blip **refuses, stays blocked and repeats the phrase** ("Not submitting. I need you to say 'submit survey'."). The BLOCKED banner and blocked earcon stay up. There is no retry limit. "Cancel" or any field edit ends the wait.
- **D-07:** If the user asks to submit while **required fields are empty**, Blip says what is missing ("I can't submit yet. Phone and Email are required and empty.") and **does not arm the confirm phrase**.

### Demo form and reset (DEMO-01, DEMO-02)
- **D-08:** The broken survey form has **5-6 fields** mixing every kind of break: unlabeled inputs, a placeholder-only field, a select, a radio group, a div "button" for submit, and errors shown by color only. It should be small enough to demo in 3 minutes.
- **D-09:** The one-command reset restores **the form (empty), the fictional demo profile, and the session** (the voice window log and Blip's conversation state), so every run starts identical.

### Claude's Discretion
- The exact wording of the phrase for each gated kind (the plan should check the kind table in core's policy package).
- How spoken emails and numbers ("at", "dot", digit groups) are normalized into text.
- How long option lists (for example a country picker) are truncated, if at all.
- The BLOCKED banner text format beyond the reserved slot and "BLOCKED - say '{phrase}'" format from the UI contract, and the blocked-earcon repeat behavior.

</decisions>

<carried_forward>
## Carried Forward From Phase 1 (do not re-decide)

- Voice UI is a pinned popup window; push-to-talk is a global hold of Right Ctrl + Space (the sidecar delivery, PTT_DELIVERY = B, is in use until `ptt.hold` is merged).
- Interrupting Blip is by the key hold or typed "stop". Voice barge-in is built but forced off (`GATE_08_PRESENT = false`) because Blip hears itself on this hardware.
- The UI contract (`01-UI-SPEC.md`) holds: live caption plus finished log, a reserved 96 px BLOCKED banner slot above the transcript, "Send Command" label, dark high-contrast theme.
- The reducer is pure, grammar-first, and its wording matches core's `describeReply` for "what's here".
- **The voice window never decides whether a confirm phrase matched.** The phrase is matched in code by the server on a voice-socket utterance, after the read-back finished speaking. Voice only shows the banner and speaks.

</carried_forward>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestones
- `.planning/workstreams/voice/ROADMAP.md` — Phase 2 goal, success criteria 1-5 (I2 milestone)
- `.planning/workstreams/voice/REQUIREMENTS.md` — DLG-02, DLG-03, DLG-07, DLG-08, DLG-09, VIS-02, DEMO-01, DEMO-02
- `docs/WORK-SPLIT.md` — voice work packages V4-V6, V9 and the hand-offs from core

### Phase 1 outputs this phase builds on
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-CONTEXT.md` — locked Phase 1 decisions
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-UI-SPEC.md` — approved UI contract (banner slot, copy, accessibility)
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-SPIKE-DECISIONS.md` — what was proven, what is forced off
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/I1-HANDOFFS.md` — open hand-offs to core (HO-1 to HO-7)
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/M0-SIGNOFF.md` — protocol facts voice relies on

### Core contracts (read-only for voice)
- `PROTOCOL.md` and `packages/protocol/src/` — frozen v1 messages: `confirm.*`, `speak`, `speak.done`, `transcript`, `state`, FormModel (`sensitive`, `labelSource`, `required`, `options`, `value`, `error`)
- `.planning/workstreams/core/ROADMAP.md` — core Phase 2 (real extension read/fill) and Phase 3 (policy gate, Executor, grants, GATE-01..05, GATE-08) that I2 depends on
- `.planning/workstreams/core/REQUIREMENTS.md` — GATE-01 to GATE-08, ACT-01 to ACT-04
- `CLAUDE.md` — safety invariants (gated kinds default-deny; phrase matched in code on voice-socket utterances only; passwords/card numbers never spoken or logged)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/dialogue/src/reduce.ts` plus `effects.ts` and `events.ts`: the pure reducer and the Effect / DialogueEvent unions to extend with read, fill, read-back and confirm states.
- `apps/voice/src/ui-log.ts`, `state.ts`, `tts.ts`, `talk-controller.ts`, `speak-bridge.ts`: the window's status machine, speech queue, log rendering and the speak.done bridge. The banner slot already exists in `apps/voice/index.html`.
- `dev/mock-server`: the protocol-speaking mock; extend it (or a fake executor that always replies "blocked") so Phase 2 can be built before core's gate lands. A stub gate must **fail closed**.
- `fixtures/forms/broken-form.model.json` (generated by `scripts/gen-broken-form-model.ts` from core's `broken.snapshot.json`): current 5-field "Customer survey" fixture. The new self-hosted demo form is separate (DEMO-01).

### Established Patterns
- Grammar first; anything unmatched goes out as a `parseIntent` effect that core handles.
- All page text rendered with `textContent` only. No utterance text in logs.

### Integration Points
- I2 needs core's real extension fills and the policy gate; until then build against the mock and a fail-closed fake executor.
- The reset script and demo profile are voice-owned (`fixtures/forms/`, demo assets).

</code_context>

<specifics>
## Specific Ideas

- Demo phrase example: "say 'submit survey'".
- Refusal example: "Not submitting. I need you to say 'submit survey'."
- Missing-required example: "I can't submit yet. Phone and Email are required and empty."
- Read-back example: "Phone, empty, required."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Profile fill, spell / change / undo, "where am I", and the guessed-label and injection warnings belong to voice Phase 3.)

</deferred>

---

*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Context gathered: 2026-10-17*
</content>
