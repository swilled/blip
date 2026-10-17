# Roadmap: Blip

## Overview

This is the **voice workstream** roadmap (Person B). It covers the voice UI window, push-to-talk, STT/TTS, NVDA screen-reader mode, the `packages/dialogue` reducer (grammar, read-back, confirm-phrase flow, profile map), the visibility UI and the demo assets. This track owns what the user says and hears. The core workstream owns the extension, server hub, Executor, policy gate and Claude.

The plan:
1. Prove the risky voice pieces in hours 0–3.
2. Get a push-to-talk loop that answers "what's here" by I1.
3. Add the fill, read-back and confirm-phrase conversation on the broken demo form by I2.
4. Finish the command set and trust disclosures with real Claude by I3.
5. Make the demo safe before freeze: NVDA mode, the real public form, and a fallback kit.

Almost everything here is templates and UI over the form model that core provides. The heavy infrastructure is in the core track.

**Coverage:** 28/28 voice v1 requirements mapped (VOX 8, DLG 14, VIS 2, DEMO 4).

## Working Rules (voice track)

- Build against `apps/voice-ui/dev/mock-server.ts` until I1, so voice never waits on core.
- `packages/dialogue` is pure: `reduce(state, event, ctx) -> { state, effects }`, tested with vitest against `@blip/protocol` fixtures. The grammar is tried first. Anything it can't match goes out as a `parseIntent` effect, which core handles (BRAIN-02).
- The voice UI only shows and speaks. It never decides whether a confirm phrase matched; server code does that, and only for utterances from the voice socket.
- Protocol changes after M0 must be additive, optional fields, agreed with core.

## Shared Milestones

Both workstreams hit these same checkpoints. Each one also appears in the success criteria of the voice phase that delivers it.

| Milestone | Target | Must be true (both tracks) | Voice delivers | Voice needs from core | Voice phase |
|-----------|--------|----------------------------|----------------|-----------------------|-------------|
| **M0** Protocol frozen | ~h0.75 | `@blip/protocol` zod schemas and fixtures are frozen. After this, only additive optional fields. | Review and sign-off on the voice↔server messages and the dialogue `Effect` union. A hand-written broken-form form-model fixture. | PROT-01 draft | Phase 1 |
| **I1** Walking skeleton | ~h6–8 | Round trip: voice UI ↔ server ↔ (fake or real) extension | Voice window (PTT, STT, TTS, transcript) plus a reducer that answers "what's here" | PROT-01, PROT-02 (hub, fake extension, fake brain), PAGE-01/02 baseline form model | Phase 1 |
| **I2** End-to-end with gate | ~h12 | On the local broken demo form: describe, fill, read back, gated submit by distinct phrase (fake brain OK) | Read / fill / read-back / confirm templates, BLOCKED banner, broken form, reset script | Real extension, ACT-01/02/04, PAGE-03, GATE-01..05 | Phase 2 |
| **I3** Real brain | ~h20 | Real Claude, real public form, label repair, injection page blocked | Guessed-label disclosure, spoken injection warning, profile fill (model sees keys only), team-owned public form (created by ~h12) | BRAIN-01..03, PAGE-04/05, GATE-06/07 (incl. the seeded injection page) | Phase 3 |
| **Freeze** | ~h30 (backup video by ~h36) | Feature freeze and tag `demo-safe`. Bug fixes only after this. | NVDA mode, rehearsed real-form runs, fallback kit, backup video | PROT-03 one-command startup, RES-01 result reading | Phase 4 |

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Spikes and Push-to-Talk Loop** - Risk spikes in hours 0–3, then a voice window that listens on a held key, talks back, and answers "what's here" at I1 (completed 2026-10-17)
- [ ] **Phase 2: Fill and Gated Submit on the Broken Form** - Read the form, dictate values, full read-back, distinct confirm phrase and BLOCKED banner, end to end at I2
- [ ] **Phase 3: Full Command Set with Real Claude** - Profile fill, spell / change / undo, where am I, guessed-label and injection warnings, sensitive-field handoff, verified at I3
- [ ] **Phase 4: NVDA Mode and Demo-Safe** - Screen-reader mode through NVDA, speech rate, the real public form end to end, fallback kit and backup video

## Phase Details

### Phase 1: Spikes and Push-to-Talk Loop

**Goal**: The user can hold a key while the form tab is focused, speak or type a command, and hear Blip answer in its own voice, with the transcript on screen. This works first against the voice track's own mock server, then against the real server at I1.
**Mode:** mvp
**Depends on**: Nothing (first phase; runs in parallel with core's protocol work)
**Needs from core**: PROT-01 draft for the M0 review. For I1: PROT-02 (server hub, fake extension, fake brain) and the PAGE-01/02 baseline form model.
**Target window**: h0–8 (spikes h0–3; M0 ~h0.75; I1 ~h6–8)
**Requirements**: VOX-01, VOX-02, VOX-03, VOX-04, VOX-05, VOX-06, VIS-01, DLG-01
**Success Criteria** (what must be TRUE):
  1. **M0 (~h0.75):** Voice has reviewed and signed off `@blip/protocol`. That covers the voice↔server messages (utterance, ptt, speak, speak.done, earcon, state, confirm armed/cleared) and the dialogue `Effect` union. `dev/mock-server` speaks the frozen protocol, so the voice window runs with no core code.
  2. By ~h3, spike results are written down as decisions:
     - Does Web Speech recognition work while the voice window is unfocused or in the background? Does speechSynthesis?
     - Does NVDA announce an ARIA live region in the voice window while the form tab has focus?
     - Does NVDA (installed) speak a test string through `nvdaControllerClient.dll` via koffi?
     - Global push-to-talk: uiohook-napi hold-to-talk or `chrome.commands` toggle?
     - The voice-window layout chosen from those results.
  3. With the Chrome form tab focused, the user holds the push-to-talk key, speaks and releases. The voice window's live transcript shows what they said and what Blip replied. Typing the same command into the text box gives the same reply.
  4. Blip replies in its own voice and plays earcons (listening on key-down, thinking while waiting, blocked). It says "one moment" once when a reply takes over ~1.5 s. The user can interrupt Blip by speaking or by holding push-to-talk; the server never accepts a confirm phrase while Blip speaks or within 1 s after (core GATE-08). Saying "stop" (or pressing push-to-talk) cuts Blip off right away.
  5. **I1 (~h6–8):** With the real server in place of the mock, the user says "what's here" on a page served through the fake or real extension. They hear a short counts-first summary from the reducer, such as "Survey form. 6 fields, 3 required."

**Notes**:
- Spike fallbacks:
  - Unfocused STT fails: put the voice UI in its own Chrome app window, not a tab.
  - uiohook-napi fails: use the `chrome.commands` toggle (press to start, press to stop).
  - NVDA DLL fails: route speech to an in-page live region through the extension's `announce` (decided in Phase 4).
- Typed input is the safety net everywhere.

**Plans**: 11 plans

Plans:
- [x] 01-01-PLAN.md — M0 sign-off: review frozen protocol, ptt.hold request, GATE-08 reliance, Effect/Event types, doc fixes
- [x] 01-02-PLAN.md — Package gate (uiohook-napi, koffi), voice workspaces, additive root config, PTT state machine
- [x] 01-03-PLAN.md — Spike tooling (spike page, log server, PTT/pin/NVDA scripts)
- [x] 01-04-PLAN.md — Run spikes A-F and record 01-SPIKE-DECISIONS.md
- [x] 01-05-PLAN.md — Broken-form model fixture, dialogue reducer, mock server on the frozen protocol
- [x] 01-06-PLAN.md — Voice status machine, speech queue with per-speak completion, window markup and styles
- [x] 01-07-PLAN.md — Protocol client, speak.done bridge, earcons, main wiring, Vite build
- [x] 01-08-PLAN.md — Listening/barge-in state (forced ptt-only until GATE_08_PRESENT), echo filter, STT wrapper, global PTT hook wrapper (wave 6, after 07)
- [x] 01-09-PLAN.md — Talk controller, hold delivery (ptt.hold or sidecar), window wiring
- [x] 01-10-PLAN.md — Window launcher, in-process dev and real runners, manual PTT run
- [x] 01-11-PLAN.md — I1 hand-offs and real-server cutover run

**UI hint**: yes

### Phase 2: Fill and Gated Submit on the Broken Form

**Goal**: On the self-hosted broken survey form, the user can hear the fields, fill them by dictation, hear a full read-back, and submit only by saying the distinct phrase. A bare "yes" never submits. This runs end to end at I2.
**Mode:** mvp
**Depends on**: Phase 1
**Needs from core**: The real extension with ACT-01/02/04 (fills plus the observed value for echo), PAGE-03 action kinds, and GATE-01..05 (grants, phrase table, values-hash binding).
**Target window**: h6–12 (reducer templates can start ~h5 against fixtures; I2 ~h12)
**Requirements**: DLG-02, DLG-03, DLG-07, DLG-08, DLG-09, VIS-02, DEMO-01, DEMO-02
**Success Criteria** (what must be TRUE):
  1. The deliberately broken survey form (unlabeled inputs, placeholder-only labels, div buttons, color-only errors) loads from the local server. One reset command restores the empty form, the fictional demo profile and a fresh session between runs.
  2. When the user says "read the form", they hear each field in page order with its label and whether it's required. For a select or radio group, Blip reads the options numbered in page order, and the user can pick by number ("two") or by name.
  3. The user dictates a value into the current field or a named one ("email is jane at example dot com"). Blip echoes back the value it read from the page, not the words it heard.
  4. When the user says "read back", they hear every field and value, grouped. Empty required fields are called out by label and sensitive values are masked.
  5. **I2 (~h12):** On the broken form, through the real server and extension with the fake brain:
     - "submit" gets a full read-back, then "say 'submit survey'".
     - While Blip waits, the voice window shows a prominent "BLOCKED — say 'submit survey'" banner and the blocked earcon plays.
     - A bare "yes" is refused and the banner stays.
     - Only "submit survey" submits.

**Plans**: 6/7 plans executed

Plans:
- [x] 02-01-PLAN.md — Broken survey form page, voice-owned snapshot and generated survey FormModel (DEMO-01)
- [x] 02-02-PLAN.md — Pure helpers: spoken-text normalizers, field/option resolver, phrase matcher, templates
- [x] 02-03-PLAN.md — BLOCKED banner model, renderer and window wiring (VIS-02)
- [x] 02-04-PLAN.md — Reducer contracts plus read-the-form, option pick and dictation fill with page-sourced echo
- [x] 02-05-PLAN.md — Read-back, submit, arm-after-read-back, armed-mode refusal, seeded invariant test
- [x] 02-06-PLAN.md — Dialogue runner, fail-closed stub gate, run-real wiring, end-to-end test, HO-8 hand-offs
- [ ] 02-07-PLAN.md — One-command reset, demo profile, human I2 run

**UI hint**: yes

### Phase 3: Full Command Set with Real Claude

**Goal**: As a person completing forms by voice, I want to complete a form with profile fill and truthful guidance, so that I can enter accurate information while keeping sensitive data private.
**Mode:** mvp
**Depends on**: Phase 2
**Needs from core**: BRAIN-01..03 (locked-down Claude, `parseIntent` fallback, watchdog), PAGE-04 (labelSource and confidence from label repair), PAGE-05 (re-snapshot on change), GATE-06/07 (seeded injection page and injection flag).
**Target window**: h12–20 (I3 ~h20)
**Requirements**: DLG-04, DLG-05, DLG-06, DLG-10, DLG-11, DLG-12, DLG-13, DLG-14
**Success Criteria** (what must be TRUE):
  1. The user says "fill from my profile". Fields with matching autocomplete tokens are filled from the fictional profile and echoed. The brain request log shows only profile keys, never profile values.
  2. "spell email" reads the value letter by letter. "change phone to 555 0100" updates the field and says the old and new values. "undo" restores the previous value and says what was restored.
  3. "where am I" gives the site, step and current field. "what's required" lists the required fields that are still empty, by label.
  4. Guessed labels and sensitive fields:
     - On the broken form with real Claude label repair, Blip says when a label was guessed and why ("I think this is phone, based on the text next to it").
     - On a password or card field, Blip announces the field and asks the user to type it.
     - That value never appears in speech, the transcript or any brain request.
  5. **I3 (~h20):** With real Claude:
     - Opening the seeded injection page makes Blip speak the injection warning before anything else.
     - The confirm gate never arms from page text.
     - The team-owned public form (created by ~h12 so core can test it) can be described and filled by voice.

**Plans**: TBD

### Phase 4: NVDA Mode and Demo-Safe

**Goal**: As a demo presenter, I want to complete the public-form demo with accessible speech and rehearsed fallbacks, so that the team can deliver a reliable demonstration.
**Mode:** mvp
**Depends on**: Phase 3
**Needs from core**: PROT-03 (one-command startup that opens the voice window) and RES-01 (reading the confirmation page after submit).
**Target window**: h20–36 (NVDA mode and real-form runs before Freeze ~h30; backup video by ~h36)
**Requirements**: VOX-07, VOX-08, DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):
  1. In screen-reader mode with NVDA running and the form tab focused, Blip's replies come out of NVDA through the controller client DLL. Blip's own voice stays silent and nothing is spoken twice. Switching back to agent-voice mode brings Blip's voice back.
  2. "faster" and "slower" audibly change Blip's speech rate in agent-voice mode, and the new rate lasts for the session.
  3. The team-owned real public form is completed end to end by voice on three consecutive runs from reset: describe, fill, read back, the distinct "submit …" phrase, and the confirmation read aloud.
  4. **Freeze (~h30):** `demo-safe` is tagged and the fallback kit is ready:
     - offline copies of every demo site, served locally
     - a tested phone-hotspot plan
     - a timed, rehearsed plan-B script: typed input if STT fails, agent voice if NVDA fails, offline copies if the site or Wi-Fi fails
  5. A backup video of the full 3-minute demo is recorded by ~h36.

**Notes**:
- Double-speech risk: NVDA's own focus announcements can overlap `speakText`. Tune this with the form tab focused.
- If the NVDA path isn't solid by ~h30, demo in agent-voice mode and show NVDA only in the opening hook.
- The demo script follows the four beats in research/FEATURES.md: hook, repair, fill, then the gate (bare "yes" blocked, injection ignored, phrase submits).

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Spikes and Push-to-Talk Loop | 11/11 | Complete    | 2026-10-17 |
| 2. Fill and Gated Submit on the Broken Form | 6/7 | In Progress | - |
| 3. Full Command Set with Real Claude | 0/TBD | Not started | - |
| 4. NVDA Mode and Demo-Safe | 0/TBD | Not started | - |
