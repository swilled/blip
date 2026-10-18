# Roadmap: Blip

**Workstream:** `core` (Person A, Pranav)
**Owns:** `@blip/protocol`, server hub, Chrome MV3 extension, Executor + policy gate (`packages/policy`), AGY subscription brain (intent-as-data), result reading
**Scope:** the 26 core v1 requirements (PROT, PAGE, ACT, GATE, BRAIN, RES). Voice-track requirements (VOX, DLG, VIS, DEMO) are planned in `.planning/workstreams/voice/` and appear here only as dependencies.
**Granularity:** coarse (5 v1 phases plus follow-on phases) | **Project mode:** mvp (vertical slices; the build is demoable at the end of every phase)

## Overview

Core builds Blip's trust machinery from the contract outward. Phase 1 freezes the shared `@blip/protocol` package and stands up a loopback-only server with a fake extension, a fake brain and a typed REPL, so neither developer waits on a model subscription. Phase 2 swaps the fake extension for a real one that reads a live form and fills it the way a person would, reporting only what the DOM actually holds. Phase 3 adds the policy gate and the single Executor (nothing irreversible happens without a read-back and the exact spoken phrase) and reads the result page back, which lands I2 with no model in the loop. Phase 4 adds a locked-down, tool-less subscription brain for free-form intents and background label repair; the current implementation is AGY via the Antigravity CLI using Gemini 3.8 Flash. Phase 5 hardens Blip against a seeded prompt-injection page and validates the demo against a self-hosted synthetic survey, adds one-command startup, and ends at the `demo-safe` feature freeze. The owner confirmed this hackathon has no public-form URL; Core's local survey is the Phase 5 acceptance target, while voice-owned DEMO-03 remains deferred. Follow-on phases start after v1 technical acceptance and leave the existing v1 release gates intact. Phase 6 defines the contract and policy proposal for user-directed browser control. Gate before brain: everything through Phase 3 demos without AGY.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Contract and Walking Skeleton** - Implementation and 5/5 plans complete; written M0 protocol sign-off remains pending
- [x] **Phase 2: Real Page Read and Fill** - The Chrome extension snapshots a live form, classifies every action by rule, and fills fields with DOM-verified values (completed 2026-10-17)
- [x] **Phase 3: Gated Submit and Result Reading** - Submit-class actions run only through the Executor after read-back + exact phrase; Blip reads back what the page said (I2) (completed 2026-10-17)
- [x] **Phase 4: AGY Subscription Brain and Label Repair** - Current runtime uses the locked-down Antigravity CLI with Gemini 3.8 Flash; provider checks and live synthetic startup/roundtrip passed (2026-10-17)
- [ ] **Phase 5: Hostile Pages, Local Synthetic Web and Freeze** - AGY hostile, full I3, and launcher-cache acceptance pass; written M0 sign-off, teammate review, and mainline release gates remain
- [x] **Phase 6: Browser Control Contract and Policy Proposal** - Proposal complete; core-owner authorized follow-on implementation, with voice-owner review still required before shared protocol or policy changes merge
- [ ] **Phase 7: Generic Browser Control and Content Reading** - Add user-directed navigation, page reading, links, search, tabs, scrolling and find-on-page on supported sites
- [ ] **Phase 8: Multi-Step Web Reading and Drafting** - Add generic page-grounded read, summarize, draft, revise and confirmation-gated actions

## Shared Milestones

Both workstreams hit these checkpoints together. Hours are from kickoff (about 40 h total).

| Milestone | Target | Definition (must be TRUE) | Core delivers | Voice delivers (dependency) |
|-----------|--------|---------------------------|---------------|-----------------------------|
| **M0** Protocol frozen | ~h0.75 | `@blip/protocol` v1 (zod schemas + fixtures) and `PROTOCOL.md` committed; voice has reviewed and signed off; port and Origin allowlist chosen | Phase 1: authors schemas, fixtures, `PROTOCOL.md` (first task of the phase) | Reviews the protocol; hand-writes `booking.formmodel.json` and a snapshot fixture; drafts the `Effect` union for `packages/dialogue` |
| **I1** Walking skeleton | ~h6-8 | Voice UI <-> server <-> extension (fake or real) round trip: an utterance triggers a snapshot request and comes back as a spoken reply | Phase 1 (hub, fake extension, fake brain); Phase 2 (real extension) | Voice UI shell with ws client and typed input (VOX-03); TTS queue (VOX-04) |
| **I2** End-to-end with the gate | ~h12 | On the local broken demo form: describe -> fill -> read back -> exact phrase -> submitted -> result read back; bare "yes" rejected; fake brain OK | Phases 2-3 (extension, policy gate, Executor, result reading) | DEMO-01 broken form; `packages/dialogue` read-back and confirm states (DLG-08, DLG-09); BLOCKED banner (VIS-02) |
| **I3** Real brain, local survey | ~h20 | AGY (Gemini 3.8 Flash) in the loop; the self-hosted synthetic survey is completed by voice through gated submit; labels are repaired by AGY; injection page is blocked and warned about | Phase 4 (brain, label repair); Phase 5 (injection defense, local survey) | DLG-11 "I guessed" disclosure; DLG-14 injection warning; public-form DEMO-03 deferred by core-owner decision |
| **Freeze** | ~h30 | Feature freeze; `main` tagged `demo-safe`; bugfix only afterwards | Phase 5 (one-command startup, pre-warmed repair cache, `--brain=fake` plan B) | DEMO-02 reset script; DEMO-04 fallback kit; NVDA mode (VOX-08) |

**Core never blocks on voice or model access:** core keeps `tools/fake-extension`, `--brain=fake`, `tools/repl`, a stub dialogue reducer (describe / fill / read back / submit) until `packages/dialogue` lands, and its own small extension test pages (React-controlled input, implicit Enter submit, div button). Core can rehearse each joint milestone alone with these before the real voice pieces arrive.

## Phase Details

### Phase 1: Contract and Walking Skeleton

**Goal**: Both developers build against one frozen contract, and the whole loop (typed utterance -> server -> extension snapshot -> spoken reply) runs on one machine with no Chrome, no voice UI and no AGY CLI.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PROT-01, PROT-02, PROT-04, PAGE-02
**Target window**: h0-h3 (M0 at ~h0.75)
**Shared milestones**: M0 (delivers it); server side of I1
**Success Criteria** (what must be TRUE):
  1. M0 (~h0.75): `@blip/protocol` holds zod schemas and fixtures for every extension<->server and voice<->server message, the Snapshot and FormModel shapes, ActRequest/ActResult and the Intent union (with no confirm variant); `PROTOCOL.md` matches it and the voice developer has signed off.
  2. With AGY unavailable, `npm run dev -- --brain=fake` starts the server and the fake extension and REPL attach; typing "what's here" returns a reply built from the fixture form (field count, required count), with the fake brain's ~1.5 s delay visible on model-routed turns.
  3. For every protocol fixture snapshot, code builds the baseline form model (id, label, labelSource, confidence, type, required, options, value, error) in under 100 ms, checked by unit tests.
  4. The server listens on 127.0.0.1 only; a WebSocket opened from an ordinary web page (Origin not the extension or voice UI) is rejected, and an `utterance` from a client that said hello as `extension` is refused.
  5. The voice developer's UI, pointed at the real server instead of its mock, connects as `role=voice` and receives `welcome` and `state` pushes, so the voice track can retire `dev/mock-server`.

**Research**: Standard patterns, no spike. Record at M0: port (7777 vs 8787), and intent-as-data with the gate in the Executor (supersedes MCP tools).
**Plans:** 5/5 plans executed

Plans:
- [x] 01-01-PLAN.md — Workspace scaffold, dependency-pin gate, registry tracer, domain schemas (ActionKind, Snapshot, FormModel, Intent, Act*)
- [x] 01-02-PLAN.md — Full 24-message registry, PROTOCOL.md checked against it by test, pinned extension identity
- [x] 01-03-PLAN.md — Fixtures, pure baseline form model under 100 ms (PAGE-02), M0 freeze decision and lock
- [x] 01-04-PLAN.md — Loopback hub with Origin/Host guard and role-bound permissions (PROT-04)
- [x] 01-05-PLAN.md — Walking skeleton: fake brain, fake extension, REPL, `npm run dev -- --brain=fake` (PROT-02)

**UI hint**: no

### Phase 2: Real Page Read and Fill

**Goal**: On a real page in Chrome, Blip reads the form's controls and fills them the way a person would, and only ever reports the value the page actually holds.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PAGE-01, PAGE-03, PAGE-05, ACT-01, ACT-02, ACT-03, ACT-04
**Target window**: h3-h8
**Shared milestones**: I1 (~h6-8)
**Success Criteria** (what must be TRUE):
  1. On a local test form in the dedicated browser profile, a snapshot returns every control with its accessible name, role, value, required flag, options and visible error text. The extension wire snapshot is capped at 250 elements and sets `truncated: true` only when that element cap cuts the result; the roughly 8k-token trim is applied in Phase 4 at the model-prompt boundary.
  2. Every button, link and div "button" in the snapshot carries a kind from the fail-closed rules (a typeless `<button>` in a form and anything unrecognized come out `submit`; an off-site link comes out `navigate-cross-domain`), and until Phase 3 the extension refuses to click anything gated.
  3. From the REPL, the developer fills a React-controlled text input and picks a select option, a radio and a checkbox: the site's own validation reacts, no Enter is ever sent, the active field is visibly highlighted, and each reply reports the value read back from the DOM (a maxlength-truncated value is reported truncated).
  4. When the page navigates, reveals new fields or shows new errors, the server's form model reflects it within about 1 s without a manual refresh, and the extension's socket survives an idle service worker (keepalive + reconnect).
  5. I1 (~h6-8): the voice developer's UI sends an utterance that travels through the server to the extension (real one preferred, fake acceptable) and comes back as a spoken reply.

**Research**: Spike needed: React/Vue-safe fills (native value setter + bubbling `input`/`change`), MV3 service-worker keepalive and reconnect, shadow DOM and iframes. Check `--silent-debugger-extension-api` only if CDP gets used.
**Plans:** 20/20 plans complete

Plans:
- [x] 02-01-PLAN.md — Review exact dependency pins before installation
- [x] 02-02-PLAN.md — Register approved workspaces and extension TypeScript/test configuration
- [x] 02-03-PLAN.md — Build the MV3 identity and prove the production-Origin browser connection
- [x] 02-04-PLAN.md — Implement socket reconnect state and service-worker keepalive
- [x] 02-05-PLAN.md — Add idempotent reinjection and typed early replies
- [x] 02-06-PLAN.md — Add fail-closed action and field classification rules in `@blip/policy` (PAGE-03)
- [x] 02-07-PLAN.md — Add ordered server refresh and ~2-second read-intent freshness (PAGE-05)
- [x] 02-08-PLAN.md — Add hash, identity, bounded text and shared readonly/visibility helpers
- [x] 02-09-PLAN.md — Add label, required/error, sensitivity and option helpers, including Luhn detection
- [x] 02-10-PLAN.md — Implement the content DOM walker and per-frame 250-element snapshot
- [x] 02-11-PLAN.md — Route snapshots across frames, preserve ordering and prove baseline compatibility
- [x] 02-12-PLAN.md — Add deterministic REPL field phrases and the allowlisted server act path
- [x] 02-13-PLAN.md — Build the loopback-only fixture host and bounded report endpoint
- [x] 02-14-PLAN.md — Add React, vanilla, readonly and auto-submit form fixtures
- [x] 02-15-PLAN.md — Add dynamic/iframe/CSP/shadow fixtures and the dedicated browser launcher
- [x] 02-16-PLAN.md — Implement live field writes, post-write sensitivity recheck and submit-event blocking
- [x] 02-17-PLAN.md — Route acts through frames and prove privacy/auto-submit behavior in a browser
- [x] 02-18-PLAN.md — Add the closed-shadow highlight and structural mutation observer
- [x] 02-19-PLAN.md — Connect navigation/tab/structural changes to server freshness
- [x] 02-20-PLAN.md — Complete the browser matrix, voice-path privacy check and human-verify checklist
**UI hint**: no

### Phase 3: Gated Submit and Result Reading

**Goal**: Nothing irreversible can happen on a page except through the single Executor, after a full read-back and the exact spoken phrase from the user's voice channel, and afterwards the user hears what the page actually said.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-08, RES-01, RES-02
**Target window**: h8-h12
**Shared milestones**: I2 (~h12)
**Success Criteria** (what must be TRUE):
  1. A submit, pay, delete, send or cross-domain action requested without a valid grant is refused by the Executor and again by the extension's live re-check, and every gated attempt, allowed or blocked, appears in the audit log.
  2. With no grant armed, pressing Enter in a text field, calling `form.submit()` or `requestSubmit()` from the console, or clicking a div "button" on the test form does not submit it.
  3. A grant works exactly once: it executes only for the same target, kind, URL and snapshot version within 30 s; a second use, a 31 s wait, a page change, or any field value changing after the read-back the user heard voids it, and Blip says it is not submitting.
  4. Saying "yes", sending the phrase from the extension socket, or a fake brain returning `request_action` for the submit button never executes it; only the exact phrase from the fixed kind table, matched in code on a voice-socket utterance after the read-back finished speaking, does.
  5. I2 (~h12): on the local broken demo form with the fake brain, a user goes describe -> fill -> read back -> says the phrase -> submitted, then hears the confirmation (with any confirmation number) or each error tied to its field label; "what went wrong" repeats the errors, and Blip never claims a success the page doesn't show.

**Research**: No research; needs adversarial tests in `packages/policy/test` ("yes", injected labels, typeless buttons, Enter, value change after read-back, phrase from the wrong socket).
**Plans**: 6/6 plans complete
**UI hint**: no

### Phase 4: AGY Subscription Brain and Label Repair

**Goal**: AGY, running locked down through the developer's Antigravity subscription, understands free-form requests and repairs a broken form's labels in the background, with no way to act on the page.
**Mode:** mvp
**Depends on**: Phase 3 (gate before brain)
**Requirements**: BRAIN-01, BRAIN-02, BRAIN-03, PAGE-04
**Target window**: h12-h17
**Shared milestones**: brain side of I3
**Success Criteria** (what must be TRUE):
  1. Starting with `--brain=agy` runs AGY on the subscription login (no API key) with no model tools, connectors or memory and an isolated working directory; an unexpected tool call fails closed.
  2. An utterance the grammar can't match (e.g. "put my work email in the second box") comes back as a schema-valid Intent that refers only to existing field ids, typically within about 2 s, from a pre-warmed process.
  3. When an AGY call hangs, errors or returns invalid output, the user hears "I couldn't understand that" within the watchdog timeout instead of silence, and the next utterance works normally.
  4. On the broken demo form, unlabeled and placeholder-only fields get repaired labels in the background (marked model-sourced, with a confidence) without delaying the instant baseline answer; patches touch only existing ids and never kind, value or sensitivity; a second visit loads the repair from cache instantly.

**Research and current implementation**: The original Phase 4 plans and live checks used Claude. Commit `ac4fb1c` replaced the production provider with AGY via the Antigravity CLI; intent uses `gemini-3.8-flash-low` and repair uses `gemini-3.8-flash-medium`. The AGY provider's synthetic bootstrap/roundtrip, full automated suite, typecheck, extension build, and live browser startup smoke passed. This replaces the runtime provider; historical Claude plan and Phase 5 evidence remain historical. Full hostile-page and local I3 acceptance with AGY is tracked as a Phase 5 revalidation item. No credential values or auth state were inspected. Apply the roughly 8k-token snapshot trim at the model-prompt boundary; Phase 2 only caps the extension wire snapshot at 250 elements.
**Plans**: 18/18 plans executed; the provider migration is on `integration/ho8-voice-gate` at `ac4fb1c`. BRAIN-01/02/03 and PAGE-04 are implemented; release evidence for the current AGY provider is recorded separately from the Claude-era phase plans.

Plans:
- [x] 04-01-PLAN.md — Approve the exact SDK pin and add a bounded, gated SDK lifecycle spike
- [x] 04-02-PLAN.md — Implement the isolated, tool-less Claude provider and role lifecycle
- [x] 04-03-PLAN.md — Build the sanitized, value-free prompt projection with an approximate 8k-token bound
- [x] 04-04-PLAN.md — Share pure sensitive-shape checks and gate secret-bearing utterances
- [x] 04-05-PLAN.md — Separate deterministic label candidates from model-sourced resolved labels
- [x] 04-06-PLAN.md — Route grammar misses through schema-checked intents and a recovering watchdog
- [x] 04-07-PLAN.md — Repair labels asynchronously and cache validated value-free patches
- [x] 04-08-PLAN.md — Close Phase 4 live SDK verification gaps behind a fresh approval gate
- [x] 04-09-PLAN.md — Complete the approved-mode synthetic verifier behind the existing approval gate
- [x] 04-10-PLAN.md — Resolve the SDK init gate with a capped bootstrap and one authorized synthetic live check
- [x] 04-11-PLAN.md — Use one fresh single-use synthetic live check and update evidence-based Phase 4 status
- [x] 04-12-PLAN.md — Add allowlisted SDK startup diagnostics and run a fresh bounded synthetic check
- [x] 04-13-PLAN.md — Distinguish bootstrap validation failures and run a fresh bounded synthetic check
- [x] 04-14-PLAN.md — Treat bootstrap as discarded prewarm output and verify the full synthetic provider sequence
- [x] 04-15-PLAN.md — Exercise the intent router's bounded retry in a fresh synthetic production check
- [x] 04-16-PLAN.md — Categorize safe intent-output failures and refine the JSON-only prompt
- [x] 04-17-PLAN.md — Add explicit Intent variant and required-key guidance, then recheck synthetically
- [x] 04-18-PLAN.md — Match the production repair prompt in the synthetic check and recheck repair/cache
**UI hint**: no

### Phase 5: Hostile Pages, Local Synthetic Web and Freeze

**Goal**: Blip holds up against a page that tries to hijack it, completes a self-hosted synthetic survey by voice, starts with one command, and is frozen in a state the team can demo without surprises.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: GATE-06, GATE-07, PROT-03
**Target window**: h17-h30 (I3 at ~h20, Freeze at ~h30)
**Shared milestones**: I3 (~h20), Freeze (~h30)
**Success Criteria** (what must be TRUE):
  1. On the seeded injection page (hidden instructions, fake "verified" banner, "click #pay", lookalike submit button), with AGY in the loop, no gated action ever executes, and each attempt shows as blocked in the audit log.
  2. When a page contains text addressed to Blip or AI agents, accepted page state carries only an optional warning boolean and the voice side speaks a warning before continuing (with voice's DLG-14); the signal and page text never enter `FormModel` or model input.
  3. I3 (~h20): automated local runs prove the self-hosted synthetic survey completes through the voice UI and gated submit, AGY repairs and reuses the exact demo-form cache identity, and the injection page remains blocked. No public form is in scope without a team-owned URL; voice-owned DEMO-03 is deferred.
  4. One command on either developer's machine launches the server, the dedicated Chrome profile with the extension (which connects on its own), and the voice window.
  5. Freeze (~h30): `main` is tagged `demo-safe`, demo-form repairs are pre-warmed in the cache, and the full demo script also runs with `--brain=fake` as plan B.

**Research**: Spike needed: real-site widgets (Google Forms ARIA radios and listboxes, React fills on the live form); one-command Chrome launch now that branded Chrome 137 removed `--load-extension` (load unpacked once into a dedicated `--user-data-dir` profile).
**Plans**: 11/11 original phase plans executed. Follow-up diagnostics 05-12 through 05-29 are recorded separately and do not change the original phase plan count. AGY hostile-page refusal passed in 05-13; full AGY I3 passed in 05-26 with exactly one local submit; and the launcher cache was AGY-refreshed and reloaded in 05-27/05-29. Phase 5 acceptance is technically verified. Freeze stays open until written M0 sign-off and teammate review are complete, the branch is promoted to main, and `demo-safe` is tagged. Public-form DEMO-03 is explicitly deferred, not replaced by an arbitrary external target. See `05-VERIFICATION.md`, `05-AGY-REVALIDATION-SUMMARY.md`, and `RELEASE-CHECKLIST.md`.
Plans:
- [x] 05-01-PLAN.md — Add the synthetic hostile-page fixture and deterministic refusal assertions
- [x] 05-02-PLAN.md — Implement the bounded local warning detector
- [x] 05-03-PLAN.md — Exercise hostile actions in an isolated real browser
- [x] 05-04-PLAN.md — Prepare the warning-field proposal and obtain voice-owner sign-off
- [x] 05-05-PLAN.md — Add approved warning fields to the shared protocol
- [x] 05-06-PLAN.md — Carry the accepted warning boolean through extension, server, and REPL
- [x] 05-07-PLAN.md — Verify hostile-page refusal and warning flow end to end
- [x] 05-08-PLAN.md — Build and smoke-test the isolated one-command local demo
- [x] 05-09-PLAN.md — Record evidence and apply the local freeze tag only when eligible
- [x] 05-10-PLAN.md — Prove hostile-page refusal with the bounded real-Claude synthetic check
- [x] 05-11-PLAN.md — Complete local synthetic survey acceptance, repair-cache reuse, and fake fallback
**UI hint**: no

## Progress

**Execution Order:**
V1 phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5. Phase 6 follows Phase 5 technical acceptance; Phases 7 and 8 build on the Phase 6 proposal. Outstanding v1 release gates remain independent and unchanged. Voice-owner review is required before shared protocol or live policy changes merge.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Contract and Walking Skeleton | 5/5 | In Progress - M0 written sign-off pending | - |
| 2. Real Page Read and Fill | 20/20 | Complete    | 2026-10-17 |
| 3. Gated Submit and Result Reading | 6/6 | Complete    | 2026-10-17 |
| 4. AGY Subscription Brain and Label Repair | 18/18 | Complete | 2026-10-17 |
| 5. Hostile Pages, Local Synthetic Web and Freeze | 11/11 | In Progress - technical acceptance passed; written sign-off and release review pending | - |
| 6. Browser Control Contract and Policy Proposal | 2/2 | Proposal complete; follow-on phases authorized, review pending before merge | 2026-10-18 |
| 7. Generic Browser Control and Content Reading | 2/6 | In Progress - 07-01 and 07-02 complete; four plans remain | - |
| 8. Multi-Step Web Reading and Drafting | 2/6 | In Progress - 08-01 and 08-02 complete; four plans remain | - |

**Coverage:** 25/25 core v1 requirements mapped (see `.planning/workstreams/core/REQUIREMENTS.md` traceability).

### Phase 6: Browser control contract and policy proposal

**Goal:** Define a teammate-reviewable, additive protocol and policy proposal for user-directed page reading, navigation, links, search, tabs, scrolling, and summaries. Preserve the existing form flow, privacy rules, and confirmation gates. This phase does not implement browser-control features. No contract change may merge before the voice owner approves it in writing.
**Requirements**: TBD
**Planning note:** Proposal-only phase; no v1 requirement IDs change. AGENT-01 and multi-step page workflows are scoped to Phase 8.
**Depends on:** Phase 5 technical acceptance (passed); written v1 release gates remain independent.
**Plans:** 2/2 plans executed

Plans:
- [x] 06-01-PLAN.md — Draft the additive contract and policy proposal
- [x] 06-02-PLAN.md — Create the evidence matrix, adversarial cases, and approval gates

### Phase 7: Generic browser control and content reading

**Goal:** Implement core-owned browser primitives from the Phase 6 proposal so users can direct Blip from a new tab to supported sites, navigate, read bounded page content, follow selected links, search, switch tabs, scroll, and find text. Every target must come from the user's words or a user-selected live page item. Page text stays untrusted and actions remain in the Executor.
**Requirements**: No shared requirement changes in this phase
**Depends on:** Phase 6 proposal; core owner has authorized local implementation. Written voice-owner review remains required before shared protocol or live policy changes merge.
**Plans:** 2/6 plans executed

Plans:
- [x] 07-01-PLAN.md — Add closed browser operation and content result schemas
- [x] 07-02-PLAN.md
- [x] 07-03-PLAN.md
- [x] 07-04-PLAN.md
- [x] 07-05-PLAN.md
- [x] 07-06-PLAN.md

### Phase 8: Multi-step web reading and drafting

**Goal:** Add generic, page-grounded workflows that can read requested content, summarize it on request, draft and revise text, read the final draft back, and carry out a send or other gated action only after explicit confirmation bound to that exact draft and page. Site names and the email example are not hardcoded.
**Requirements**: No shared requirement changes in this phase
**Depends on:** Phase 7
**Plans:** 6 plans

Plans:
- [x] 08-01-PLAN.md — Capture generic visible items with bounded recency evidence
- [x] 08-02-PLAN.md — Route item reads through the full extension path with live DOM revalidation
- [x] 08-03-PLAN.md — Add per-session task state and deterministic item resolution
- [ ] 08-04-PLAN.md — Compose and revise drafts with observed field read-back
- [ ] 08-05-PLAN.md — Gate sending on exact phrase and draft-bound grant
- [ ] 08-06-PLAN.md — Integrate and verify the synthetic end-to-end workflow

---
*Roadmap created: 2026-10-16*
