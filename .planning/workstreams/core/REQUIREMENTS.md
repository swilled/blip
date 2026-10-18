# Requirements: Blip (core workstream)

**Defined:** 2026-10-16
**Workstream:** core (Person A, Pranav): extension, server hub, Executor, policy gate, AGY subscription brain, result reading
**Core Value:** A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.

**Source:** this is the core subset (categories PROT, PAGE, ACT, GATE, BRAIN, RES) of the master list in `.planning/REQUIREMENTS.md`. The master stays authoritative; the orchestrator merges this file's traceability back into it. The shared contract (`PROT-*`) is authored by core, reviewed by voice, and frozen in the first ~45 minutes (M0).

## v1 Requirements

### Protocol & Runtime

- [ ] **PROT-01**: Both developers build against one `@blip/protocol` package of zod schemas + fixtures covering extension↔server and voice↔server messages, the snapshot/form-model shapes, ActRequest/ActResult and the Intent union
- [x] **PROT-02**: Either developer can run the full system offline without AGY using a fake extension, a fake brain (`--brain=fake`) and a typed REPL
- [x] **PROT-03**: Developer can start Blip with one command that launches the server, a dedicated browser profile with the extension, and the voice window
- [x] **PROT-04**: The server binds only to 127.0.0.1 and rejects WebSocket connections whose Origin is not the extension or the voice UI

### Page Understanding

- [x] **PAGE-01**: Blip captures a snapshot of the active tab's form controls via a content-script DOM walk (accessible names, roles, values, required, options, errors), capped at 250 elements on the extension wire; `truncated` is true only when that element cap cuts the result, and the ~8k-token trim is applied in Phase 4 at the model-prompt boundary
- [x] **PAGE-02**: Blip builds a baseline form model in code from the snapshot (field id, label, labelSource, confidence, type, required, options, value, error) in under 100 ms
- [x] **PAGE-03**: Every actionable element gets a kind (fill / select / check / click-safe / submit / pay / delete / send / navigate-cross-domain) from fail-closed rules, never from the model
- [x] **PAGE-04**: For unlabeled or placeholder-only fields, AGY repairs labels/title/grouping in the background via a tool-less structured-output call, patching only existing ids, cached by origin + path + structure hash
- [x] **PAGE-05**: When the page changes (navigation, revealed fields, new errors), Blip re-snapshots and the form model updates within ~1 s

### Actions

- [x] **ACT-01**: Blip types a value into a text field so that React/Vue-style site validation fires, without ever sending Enter
- [x] **ACT-02**: Blip selects options in selects, radio groups and checkboxes
- [x] **ACT-03**: The field Blip is working on is visibly highlighted on the page (for sighted judges)
- [x] **ACT-04**: After every fill, Blip reads the value back from the DOM and reports that actual value (not what was heard)

### Safety Gate

- [x] **GATE-01**: Submit / pay / delete / send / cross-domain navigation actions are blocked by default and only execute through the single Executor with a valid grant
- [x] **GATE-02**: Pressing Enter in a field, `form.submit()`, `requestSubmit()` or a div "button" cannot submit the form while no grant is armed (capture-phase interception in the extension)
- [x] **GATE-03**: A grant is single-use, expires after 30 s, and is bound to target + kind + URL + snapshot version
- [x] **GATE-04**: If any field value changes after the read-back the user heard, the pending confirmation is voided (values-hash binding)
- [x] **GATE-05**: The model cannot approve a gated action: the Intent schema has no confirm variant; the fixed phrase is matched in server code after tracked read-back, and the voice reducer redeems only its armed grant/read-back IDs
- [x] **GATE-08**: The server ignores a confirm-phrase match while a `speak` is outstanding (no `speak.done` yet) and for 1 s after `speak.done`, regardless of what the voice UI does with its mic. Needed because VOX-05 now allows barge-in, so Blip must not rely on a half-duplex mic to avoid confirming itself
- [x] **GATE-06**: A seeded prompt-injection test page (hidden instructions, fake "verified" banner, "click #pay", lookalike submit button) cannot trigger any gated action
- [x] **GATE-07**: When a page contains text addressed to Blip/AI agents, Blip flags it so the user hears a warning

### Brain

- [x] **BRAIN-01**: Blip runs AGY through the Antigravity CLI on the developer's subscription, with no API key or model tools, and refuses to start if a role reports an unexpected tool
- [x] **BRAIN-02**: Free-form utterances the grammar can't match are turned into a structured Intent by a tool-less AGY call, typically within ~2 s
- [x] **BRAIN-03**: AGY role sessions are pre-warmed at startup, and a watchdog recovers from a hung or failed call with a spoken "I couldn't understand that" rather than silence

### Results

- [x] **RES-01**: After a gated submit, Blip reads the result page: a confirmation (with any confirmation number) or each error tied to its field; it never claims success the page doesn't confirm
- [x] **RES-02**: User can ask "what went wrong" and hear each validation error tied to its field label

## Cross-Track Dependencies

Voice-owned requirements that core phases or shared milestones rely on. These are planned and tracked in `.planning/workstreams/voice/`; listed here only so core knows what it waits on and what its fakes must stand in for.

| Voice requirement | What core needs it for | Core stand-in until it lands | Milestone |
|-------------------|------------------------|------------------------------|-----------|
| VOX-03 typed input + voice UI ws client | Phase 1 criterion 5, Phase 2 I1 round trip | `tools/repl` | I1 |
| VOX-04 TTS queue + `speak.done` | Read-back -> arm-confirm sequencing (GATE-05) | REPL auto-sends `speak.done` | I1 / I2 |
| VOX-05 barge-in with confirm guard | Blip's own "say 'submit survey'" can't confirm itself; enforced server-side by GATE-08 | n/a (typed REPL) | I2 |
| DLG-08 read back, DLG-09 confirm phrase states | Phase 3 I2 gated submit | core stub dialogue reducer | I2 |
| DLG-05 profile fill, DLG-12 sensitive handoff | Exercise ACT-01/ACT-04 fills and the `focus`-only path for sensitive fields | REPL `set_fields` | I2 |
| DEMO-01 broken demo form | Phase 3 I2, Phase 4 label repair | core's own extension test pages | I2 |
| VIS-02 BLOCKED banner | I2 demo visibility of the armed gate | `confirm.armed` printed in REPL | I2 |
| DLG-11 "I guessed" disclosure | Speaks PAGE-04 repair confidence | REPL prints labelSource/confidence | I3 |
| DLG-14 injection warning | Speaks the GATE-07 flag | REPL prints the flag | I3 |
| DEMO-03 public form | Phase 5 I3 | none (no public-form URL exists for this hackathon; Core uses its local synthetic survey) | Deferred by core-owner decision |
| DEMO-02 reset script, DEMO-04 fallback kit, VOX-08 NVDA mode | Freeze readiness | `--brain=fake` plan B (core side) | Freeze |

## v2 Requirements (core-relevant, deferred)

- **AGENT-01**: Optional MCP-tools "agent mode" for open-ended multi-step requests, with every tool routed through the Executor/gate
- **FORM-01**: Multi-step wizards with per-step read-back
- **FORM-02**: Adapters for custom date pickers and comboboxes
- **FORM-03**: Vision fallback (cropped screenshot -> vision model) for fields still unresolved
- **FORM-04**: CDP accessibility-tree snapshots via `chrome.debugger` as an enhancement to the DOM walk
- **TRUST-01**: Encrypted profile vault in extension storage

## Out of Scope (core-relevant)

| Feature | Reason |
|---------|--------|
| Autonomous submit / "just do it" mode | Violates core value; blind users asked to be asked first (OLLA) |
| Bare "yes" as confirmation | Irreversible actions need deliberate intent |
| Model deciding action risk | Kind comes from deterministic rules only |
| Passwords / card numbers sent to the model or filled by voice | Never spoken, never sent to the model; Blip focuses the field and the user types |
| CAPTCHA solving | Site bans and legal risk; tell the user instead |
| Direct Anthropic API keys | Team has subscriptions only; production would use per-user keys |
| Hosting Blip for other people on our subscriptions | Not allowed under subscription terms |
| Chrome Web Store release, Edge/Firefox/mobile | Post-hackathon |

## Traceability

| Requirement | Workstream | Phase | Status |
|-------------|------------|-------|--------|
| PROT-01 | core | Phase 1 | Pending |
| PROT-02 | core | Phase 1 | Complete |
| PROT-03 | core | Phase 5 | Complete |
| PROT-04 | core | Phase 1 | Complete |
| PAGE-01 | core | Phase 2 | Complete |
| PAGE-02 | core | Phase 1 | Complete |
| PAGE-03 | core | Phase 2 | Complete |
| PAGE-04 | core | Phase 4 | Complete |
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
| GATE-06 | core | Phase 5 | Complete |
| GATE-07 | core | Phase 5 | Complete |
| GATE-08 | core | Phase 3 | Complete |
| BRAIN-01 | core | Phase 4 | Complete |
| BRAIN-02 | core | Phase 4 | Complete |
| BRAIN-03 | core | Phase 4 | Complete |
| RES-01 | core | Phase 3 | Complete |
| RES-02 | core | Phase 3 | Complete |

**Coverage:**
- Core v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-10-16*
*Last updated: 2026-10-18 after first-party voice UI GATE-05 re-verification. PROT-03 and GATE-07 are complete; PROT-01 remains pending written M0 sign-off; public-form DEMO-03 is deferred by core-owner decision.*
