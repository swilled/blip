# Requirements: Blip (voice workstream)

**Defined:** 2026-10-16
**Source:** the master list `.planning/REQUIREMENTS.md`. This file is the voice subset; if the two disagree, the master wins.
**Core Value:** A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.

**Ownership:** voice = Person B (Pranav's teammate): voice UI, STT/TTS, NVDA, the dialogue reducer and commands, visibility UI, demo assets. Workstream `voice`. Core-track requirements (PROT/PAGE/ACT/GATE/BRAIN/RES) are listed below only as dependencies.

## v1 Requirements

### Voice I/O

- [ ] **VOX-01**: User can press a global push-to-talk key that works while the form tab has focus
- [ ] **VOX-02**: User's speech is transcribed per push-to-talk press (Web Speech API) and sent to the server as an utterance
- [ ] **VOX-03**: User can type any command instead of speaking it
- [ ] **VOX-04**: Blip speaks replies with its own voice, plays earcons (listening / thinking / blocked), and says "one moment" when a reply takes over ~1.5 s
- [ ] **VOX-05**: The user can interrupt Blip by speaking (barge-in). The confirm phrase is never accepted while Blip is speaking or within 1 s after it stops, so Blip's own speech can't confirm a submit. Echo handling is settled by a Phase 1 spike.
- [ ] **VOX-06**: User can say "stop" to cut off speech immediately
- [ ] **VOX-07**: User can say "faster" / "slower" to change Blip's speech rate
- [ ] **VOX-08**: In screen-reader mode, Blip's replies are spoken through NVDA (controller client DLL) instead of Blip's own voice, without double speech

### Dialogue & Commands

- [ ] **DLG-01**: User can ask "what's here" and hear a short counts-first summary (form title, step, number of fields, number required)
- [ ] **DLG-02**: User can say "read the form" and hear each field in page order with its label and whether it's required
- [ ] **DLG-03**: User can dictate a value into the current or a named field and hear it echoed back
- [ ] **DLG-04**: User can say "spell X" and hear the field's value spelled letter by letter
- [ ] **DLG-05**: User can say "fill from my profile" and matching fields are filled from a local profile mapped by autocomplete tokens; the model only ever sees profile keys, never values
- [ ] **DLG-06**: User can say "change X to Y" to edit a filled field
- [ ] **DLG-07**: For selects/radios, Blip reads options numbered in page order and the user can pick by number or name
- [ ] **DLG-08**: User can say "read back" and hear every field and value grouped, with empty required fields called out and sensitive values masked
- [ ] **DLG-09**: Before a gated action, Blip gives a full read-back, then states the distinct phrase (e.g. "say 'submit survey'"); a bare "yes" is rejected
- [ ] **DLG-10**: User can ask "where am I" (site, step, current field) and "what's required" (remaining required fields)
- [ ] **DLG-11**: When a label was guessed, Blip says so and why ("I think this is phone, based on the text next to it")
- [ ] **DLG-12**: On password or card fields, Blip announces the field and hands off to the user to type; those values are never spoken or sent to the model
- [ ] **DLG-13**: User can say "undo" to revert the last fill
- [ ] **DLG-14**: Blip speaks the injection warning flagged by GATE-07 before continuing

### Visibility

- [ ] **VIS-01**: The voice window shows a live transcript of what the user said and what Blip said
- [ ] **VIS-02**: While a gated action awaits confirmation, a prominent "BLOCKED — say 'submit …'" banner is shown

### Demo

- [ ] **DEMO-01**: A self-hosted deliberately broken form (W3C WAI BAD "Survey" style: unlabeled inputs, placeholder-only labels, div buttons, color-only errors) is available locally
- [ ] **DEMO-02**: A fictional demo profile and a one-command reset script restore the demo state between runs
- [ ] **DEMO-03**: At least one real public form (e.g. a team-owned Google Form) can be completed end to end by voice
- [ ] **DEMO-04**: The demo has a fallback kit: offline copies of the demo sites, a phone hotspot plan, a backup video, and a rehearsed plan-B script

## Core Dependencies (owned by workstream `core`, referenced only)

| Core requirement | Why the voice track needs it | Needed by |
|------------------|------------------------------|-----------|
| PROT-01 | Shared zod schemas and fixtures; voice signs off at M0 | Phase 1 (M0) |
| PROT-02 | Server hub, fake extension and fake brain for the I1 round trip | Phase 1 (I1) |
| PAGE-01, PAGE-02 | The form model that the describe and read templates read from | Phase 1 (I1) |
| PAGE-03 | Action kinds decide which actions need the confirm phrase | Phase 2 (I2) |
| ACT-01, ACT-02, ACT-04 | Fills, selects, and the observed DOM value used for echo-back | Phase 2 (I2) |
| GATE-01..05 | Grants, the fixed phrase table, the values-hash binding behind the confirm flow | Phase 2 (I2) |
| PAGE-04, PAGE-05 | labelSource / confidence for "I guessed"; re-snapshot on change | Phase 3 (I3) |
| BRAIN-01..03 | Real Claude, the `parseIntent` fallback, the watchdog's "I couldn't understand that" | Phase 3 (I3) |
| GATE-06, GATE-07 | The seeded injection page and the injection flag behind DLG-14 | Phase 3 (I3) |
| PROT-03 | One-command startup that opens the voice window | Phase 4 |
| RES-01 | Reading the confirmation page after submit (DEMO-03) | Phase 4 |

## v2 Requirements (voice-relevant)

- **VOICE-01**: On-device STT/TTS (Moonshine / Whisper / Kokoro) private mode
- **VOICE-02**: Barge-in with smart turn detection (Pipecat-style)
- **VOICE-03**: Spelling input mode for dictating letters

## Out of Scope (voice-relevant)

| Feature | Reason |
|---------|--------|
| Bare "yes" as confirmation | Irreversible actions need deliberate intent |
| Auto-summary on every page load | Talks over the user's screen reader; user asks instead |
| Always-on mic / wake word | Echo/feedback risk, privacy; push-to-talk only |
| Voice entry of passwords / card numbers | Never spoken, never sent to the model |
| On-device STT/TTS models | Heavy setup and VRAM; Web Speech API / OS speech first |

## Traceability

| Requirement | Workstream | Phase | Status |
|-------------|------------|-------|--------|
| VOX-01 | voice | Phase 1 | Pending |
| VOX-02 | voice | Phase 1 | Pending |
| VOX-03 | voice | Phase 1 | Pending |
| VOX-04 | voice | Phase 1 | Pending |
| VOX-05 | voice | Phase 1 | Pending |
| VOX-06 | voice | Phase 1 | Pending |
| VOX-07 | voice | Phase 4 | Pending |
| VOX-08 | voice | Phase 4 | Pending |
| DLG-01 | voice | Phase 1 | Pending |
| DLG-02 | voice | Phase 2 | Pending |
| DLG-03 | voice | Phase 2 | Pending |
| DLG-04 | voice | Phase 3 | Pending |
| DLG-05 | voice | Phase 3 | Pending |
| DLG-06 | voice | Phase 3 | Pending |
| DLG-07 | voice | Phase 2 | Pending |
| DLG-08 | voice | Phase 2 | Pending |
| DLG-09 | voice | Phase 2 | Pending |
| DLG-10 | voice | Phase 3 | Pending |
| DLG-11 | voice | Phase 3 | Pending |
| DLG-12 | voice | Phase 3 | Pending |
| DLG-13 | voice | Phase 3 | Pending |
| DLG-14 | voice | Phase 3 | Pending |
| VIS-01 | voice | Phase 1 | Pending |
| VIS-02 | voice | Phase 2 | Pending |
| DEMO-01 | voice | Phase 2 | Pending |
| DEMO-02 | voice | Phase 2 | Pending |
| DEMO-03 | voice | Phase 4 | Pending |
| DEMO-04 | voice | Phase 4 | Pending |

**Coverage:**
- Voice v1 requirements: 28 total
- Mapped to phases: 28 (Phase 1: 8, Phase 2: 8, Phase 3: 8, Phase 4: 4)
- Unmapped: 0

---
*Requirements defined: 2026-10-16*
*Last updated: 2026-10-16 after voice roadmap creation*
