# Requirements: Blip

**Defined:** 2026-10-16
**Core Value:** A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.

**Ownership:** every requirement belongs to one track.
- **core** = Person A (Pranav): extension, server hub, Executor, policy gate, brain (Claude), result reading. Workstream `core`.
- **voice** = Person B (teammate): voice UI, STT/TTS, NVDA, dialogue reducer and commands, demo assets. Workstream `voice`.
- Shared contract (`PROT-*`) is authored by core, reviewed by voice, and frozen in the first ~45 minutes.

The per-workstream copies under `.planning/workstreams/{core,voice}/REQUIREMENTS.md` contain each track's subset. This file is the master list.

## v1 Requirements

### Protocol & Runtime (core)

- [ ] **PROT-01**: Both developers build against one `@blip/protocol` package of zod schemas + fixtures covering extension↔server and voice↔server messages, the snapshot/form-model shapes, ActRequest/ActResult and the Intent union
- [x] **PROT-02**: Either developer can run the full system offline from Claude using a fake extension, a fake brain (`--brain=fake`) and a typed REPL
- [ ] **PROT-03**: Developer can start Blip with one command that launches the server, a dedicated Chrome profile with the extension, and the voice window
- [x] **PROT-04**: The server binds only to 127.0.0.1 and rejects WebSocket connections whose Origin is not the extension or the voice UI

### Page Understanding (core)

- [x] **PAGE-01**: Blip captures a snapshot of the active tab's form controls via a content-script DOM walk (accessible names, roles, values, required, options, errors), capped at 250 elements on the extension wire; `truncated` is true only when that element cap cuts the result, and the ~8k-token trim is applied in Phase 4 at the model-prompt boundary
- [x] **PAGE-02**: Blip builds a baseline form model in code from the snapshot (field id, label, labelSource, confidence, type, required, options, value, error) in under 100 ms
- [x] **PAGE-03**: Every actionable element gets a kind (fill / select / check / click-safe / submit / pay / delete / send / navigate-cross-domain) from fail-closed rules, never from the model
- [ ] **PAGE-04**: For unlabeled or placeholder-only fields, Claude repairs labels/title/grouping in the background via a tool-less structured-output call, patching only existing ids, cached by origin + path + structure hash
- [x] **PAGE-05**: When the page changes (navigation, revealed fields, new errors), Blip re-snapshots and the form model updates within ~1 s

### Actions (core)

- [x] **ACT-01**: Blip types a value into a text field so that React/Vue-style site validation fires, without ever sending Enter
- [x] **ACT-02**: Blip selects options in selects, radio groups and checkboxes
- [x] **ACT-03**: The field Blip is working on is visibly highlighted on the page (for sighted judges)
- [x] **ACT-04**: After every fill, Blip reads the value back from the DOM and reports that actual value (not what was heard)

### Safety Gate (core)

- [x] **GATE-01**: Submit / pay / delete / send / cross-domain navigation actions are blocked by default and only execute through the single Executor with a valid grant
- [x] **GATE-02**: Pressing Enter in a field, `form.submit()`, `requestSubmit()` or a div "button" cannot submit the form while no grant is armed (capture-phase interception in the extension)
- [x] **GATE-03**: A grant is single-use, expires after 30 s, and is bound to target + kind + URL + snapshot version
- [x] **GATE-04**: If any field value changes after the read-back the user heard, the pending confirmation is voided (values-hash binding)
- [x] **GATE-05**: The model cannot approve a gated action: the Intent schema has no confirm variant and the confirm phrase is matched in code only on utterances from the voice socket
- [x] **GATE-08**: The server ignores a confirm-phrase match while a `speak` is outstanding (no `speak.done` yet) and for 1 s after `speak.done`, regardless of what the voice UI does with its mic. Needed because VOX-05 now allows barge-in, so Blip must not rely on a half-duplex mic to avoid confirming itself
- [ ] **GATE-06**: A seeded prompt-injection test page (hidden instructions, fake "verified" banner, "click #pay", lookalike submit button) cannot trigger any gated action
- [ ] **GATE-07**: When a page contains text addressed to Blip/AI agents, Blip flags it so the user hears a warning

### Brain (core)

- [ ] **BRAIN-01**: Blip runs Claude through the Agent SDK on the developer's own subscription with all built-in tools, settings, connectors and auto-memory disabled, and refuses to start if the init message lists any unexpected tool
- [ ] **BRAIN-02**: Free-form utterances the grammar can't match are turned into a structured Intent by a tool-less Claude call, typically within ~2 s
- [ ] **BRAIN-03**: Claude processes are pre-warmed at startup, and a watchdog recovers from a hung or failed call with a spoken "I couldn't understand that" rather than silence

### Results (core)

- [x] **RES-01**: After a gated submit, Blip reads the result page: a confirmation (with any confirmation number) or each error tied to its field; it never claims success the page doesn't confirm
- [x] **RES-02**: User can ask "what went wrong" and hear each validation error tied to its field label

### Voice I/O (voice)

- [ ] **VOX-01**: User can press a global push-to-talk key that works while the form tab has focus
- [ ] **VOX-02**: User's speech is transcribed per push-to-talk press (Web Speech API) and sent to the server as an utterance
- [ ] **VOX-03**: User can type any command instead of speaking it
- [ ] **VOX-04**: Blip speaks replies with its own voice, plays earcons (listening / thinking / blocked), and says "one moment" when a reply takes over ~1.5 s
- [ ] **VOX-05**: The mic is never open while Blip is speaking (half-duplex), so Blip's own speech can't confirm a submit
- [ ] **VOX-06**: User can say "stop" to cut off speech immediately
- [ ] **VOX-07**: User can say "faster" / "slower" to change Blip's speech rate
- [ ] **VOX-08**: In screen-reader mode, Blip's replies are spoken through NVDA (controller client DLL) instead of Blip's own voice, without double speech

### Dialogue & Commands (voice)

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

### Visibility (voice)

- [ ] **VIS-01**: The voice window shows a live transcript of what the user said and what Blip said
- [ ] **VIS-02**: While a gated action awaits confirmation, a prominent "BLOCKED — say 'submit …'" banner is shown

### Demo (voice)

- [ ] **DEMO-01**: A self-hosted deliberately broken form (W3C WAI BAD "Survey" style: unlabeled inputs, placeholder-only labels, div buttons, color-only errors) is available locally
- [ ] **DEMO-02**: A fictional demo profile and a one-command reset script restore the demo state between runs
- [ ] **DEMO-03**: At least one real public form (e.g. a team-owned Google Form) can be completed end to end by voice
- [ ] **DEMO-04**: The demo has a fallback kit: offline copies of the demo sites, a phone hotspot plan, a backup video, and a rehearsed plan-B script

## v2 Requirements

Deferred beyond the hackathon. Tracked, not in the current roadmap.

### Agent mode
- **AGENT-01**: Optional MCP-tools "agent mode" for open-ended multi-step requests, with every tool routed through the Executor/gate

### Forms
- **FORM-01**: Multi-step wizards with per-step read-back
- **FORM-02**: Adapters for custom date pickers and comboboxes
- **FORM-03**: Vision fallback (cropped screenshot → vision model) for fields still unresolved
- **FORM-04**: CDP accessibility-tree snapshots via `chrome.debugger` as an enhancement to the DOM walk

### Voice
- **VOICE-01**: On-device STT/TTS (Moonshine / Whisper / Kokoro) private mode
- **VOICE-02**: Barge-in with smart turn detection (Pipecat-style)
- **VOICE-03**: Spelling input mode for dictating letters

### Trust
- **TRUST-01**: Encrypted profile vault in extension storage
- **TRUST-02**: User studies with blind participants; FormBench benchmark

## Out of Scope

| Feature | Reason |
|---------|--------|
| Autonomous submit / "just do it" mode | Violates core value; blind users asked to be asked first (OLLA) |
| Bare "yes" as confirmation | Irreversible actions need deliberate intent |
| Model deciding action risk | Kind comes from deterministic rules only |
| Auto-summary on every page load | Talks over the user's screen reader; user asks instead |
| Always-on mic / wake word | Echo/feedback risk, privacy; push-to-talk only |
| Voice entry of passwords / card numbers | Never spoken, never sent to the model |
| CAPTCHA solving | Site bans and legal risk; tell user instead |
| Direct Anthropic API keys | Team has subscriptions only; production would use per-user keys |
| Hosting Blip for other people on our subscriptions | Not allowed under subscription terms |
| Chrome Web Store release, Edge/Firefox/mobile | Post-hackathon |
| Citing "AriaPilot" as prior art | Could not be verified by research |

## Traceability

Merged from `.planning/workstreams/core/REQUIREMENTS.md` and `.planning/workstreams/voice/REQUIREMENTS.md`. Phase numbers are per workstream (core Phase 1 ≠ voice Phase 1).

| Requirement | Workstream | Phase | Status |
|-------------|------------|-------|--------|
| PROT-01 | core | Phase 1 | Pending |
| PROT-02 | core | Phase 1 | Complete |
| PROT-03 | core | Phase 5 | Pending |
| PROT-04 | core | Phase 1 | Complete |
| PAGE-01 | core | Phase 2 | Complete |
| PAGE-02 | core | Phase 1 | Complete |
| PAGE-03 | core | Phase 2 | Complete |
| PAGE-04 | core | Phase 4 | Pending |
| PAGE-05 | core | Phase 2 | Complete |
| ACT-01 | core | Phase 2 | Complete |
| ACT-02 | core | Phase 2 | Complete |
| ACT-03 | core | Phase 2 | Complete |
| ACT-04 | core | Phase 2 | Complete |
| GATE-01 | core | Phase 3 | Complete |
| GATE-02 | core | Phase 3 | Complete |
| GATE-03 | core | Phase 3 | Complete |
| GATE-04 | core | Phase 3 | Complete |
| GATE-05 | core | Phase 3 | Complete |
| GATE-08 | core | Phase 3 | Complete |
| GATE-06 | core | Phase 5 | Pending |
| GATE-07 | core | Phase 5 | Pending |
| BRAIN-01 | core | Phase 4 | Pending |
| BRAIN-02 | core | Phase 4 | Pending |
| BRAIN-03 | core | Phase 4 | Pending |
| RES-01 | core | Phase 3 | Complete |
| RES-02 | core | Phase 3 | Complete |
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
- v1 requirements: 54 total (core 26, voice 28 — voice items are mostly cheap templates)
- Mapped to phases: 54 (core 5 phases, voice 4 phases)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-16*
*Last updated: 2026-10-17 after core Phase 3*
