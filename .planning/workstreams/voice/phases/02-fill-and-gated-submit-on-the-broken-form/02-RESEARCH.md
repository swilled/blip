# Phase 2: Fill and Gated Submit on the Broken Form - Research

**Researched:** 2026-10-16 (repo state: branch `voice/vox-05-barge-in`, core still at its Phase 1)
**Domain:** pure TypeScript dialogue reducer (read / fill / read-back / confirm), a fail-closed stub gate, a self-hosted static demo form, deterministic spoken-text normalization
**Confidence:** HIGH on repo facts and integration seams (all read from source); MEDIUM on spoken-text normalization and Chrome form restoration (no authoritative source, must be tested)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reading the form (DLG-02, DLG-07)**
- **D-01:** "Read the form" reads fields in page order, **3 fields at a time**, then waits. The user says "continue" to hear the next 3. Each field is spoken with its label and whether it is required. The user can interrupt (hold push-to-talk or typed "stop") or start filling at any point.
- **D-02:** For selects and radio groups, options are read **numbered in page order** ("one, small. Two, medium."). The user picks by **number or by name**.

**Dictating and echo (DLG-03)**
- **D-03:** Dictation targets a **named field or the current field**. "Email is jane at example dot com" fills the named field. A bare value fills the **current field**, which is the last field Blip read or filled.
- **D-04:** After a fill, Blip echoes **the label and the value read back from the page** ("Email, jane@example.com"), not what it heard. A truncated or rejected value is therefore obvious. Replacing an existing value is mentioned.

**Read-back and confirm (DLG-08, DLG-09, VIS-02)**
- **D-05:** The full read-back lists **every field in page order**, with empties called out and required ones marked ("Phone, empty, required"). Sensitive fields say they are entered and hidden, **never the value**. It ends by naming how many required fields are still empty.
- **D-06:** After the read-back, Blip states the distinct phrase (for example "say 'submit survey'"). On a bare "yes" or a wrong phrase, Blip **refuses, stays blocked and repeats the phrase** ("Not submitting. I need you to say 'submit survey'."). The BLOCKED banner and blocked earcon stay up. There is no retry limit. "Cancel" or any field edit ends the wait.
- **D-07:** If the user asks to submit while **required fields are empty**, Blip says what is missing ("I can't submit yet. Phone and Email are required and empty.") and **does not arm the confirm phrase**.

**Demo form and reset (DEMO-01, DEMO-02)**
- **D-08:** The broken survey form has **5-6 fields** mixing every kind of break: unlabeled inputs, a placeholder-only field, a select, a radio group, a div "button" for submit, and errors shown by color only. It should be small enough to demo in 3 minutes.
- **D-09:** The one-command reset restores **the form (empty), the fictional demo profile, and the session** (the voice window log and Blip's conversation state), so every run starts identical.

### Claude's Discretion
- The exact wording of the phrase for each gated kind (the plan should check the kind table in core's policy package).
- How spoken emails and numbers ("at", "dot", digit groups) are normalized into text.
- How long option lists (for example a country picker) are truncated, if at all.
- The BLOCKED banner text format beyond the reserved slot and "BLOCKED - say '{phrase}'" format from the UI contract, and the blocked-earcon repeat behavior.

### Deferred Ideas (OUT OF SCOPE)
None. Profile fill, spell / change / undo, "where am I", and the guessed-label and injection warnings belong to voice Phase 3.

### Carried forward (do not re-decide)
- Voice UI is a pinned popup; PTT is a global hold of Right Ctrl + Space (sidecar delivery, `PTT_DELIVERY = B`).
- Interrupt = key hold or typed "stop". Voice barge-in built but forced off (`GATE_08_PRESENT = false`).
- UI contract `01-UI-SPEC.md` holds: live caption + finished log, reserved 96 px BLOCKED banner slot above the transcript, "Send Command" label, dark high-contrast theme. No new UI-SPEC.
- Reducer is pure, grammar-first; its wording matches core's `describeReply` for "what's here".
- **The voice window never decides whether a confirm phrase matched.** The phrase is matched in server code on a voice-socket utterance after the read-back finished speaking. Voice only shows the banner and speaks.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DLG-02 | "read the form": each field in page order, label, required | Batch-of-3 read cursor in reducer state; spoken-label rules (unlabeled -> ordinal); Section "Reducer design" |
| DLG-03 | Dictate into current or named field, echo | Field resolver, bare-value guard, `fill` effect + `act.result.observedValue` echo; Section "Normalization" |
| DLG-07 | Selects/radios numbered, pick by number or name | Option numbering skipping empty-value placeholders, `select` ActOp takes option `value` not label |
| DLG-08 | "read back": every field/value, empties/required called out, sensitive masked | Read-back template built from `Field.hasValue` / `sensitive`, never `value` for sensitive |
| DLG-09 | Gated action: full read-back, then distinct phrase, bare "yes" rejected | Arm-after-`speak.done` sequence, exact token match, stub gate that fails closed, invariant tests |
| VIS-02 | BLOCKED banner while awaiting confirm | `confirm.armed` / `confirm.cleared` drive a pure banner model; slot already in `index.html` |
| DEMO-01 | Self-hosted deliberately broken form | `fixtures/forms/broken.html`, already served by core's static root at `/fixtures/forms` |
| DEMO-02 | Demo profile + one-command reset | Restart-based reset script; profile template/working copy |
</phase_requirements>

## Summary

The most important finding is an integration gap that the CONTEXT does not mention. **Core's real server does not call `@blip/dialogue` at all.** `apps/server/src/turn.ts` has its own grammar (`brain/grammar.ts`) and its own reply text (`reply.ts`); only the voice mock server and a parity test import `reduce`. [VERIFIED: grep for `@blip/dialogue` across repo]. Core's `Intent` handling refuses everything but read-only intents with "I can't do that yet" and never sends `act.request` or `confirm.armed` [VERIFIED: apps/server/src/turn.ts:90-113]. The Executor, the policy gate, grants, the phrase table and GATE-08 do not exist yet: `packages/policy/src/index.ts` is a 3-line re-export stub and `apps/extension` does not exist [VERIFIED: file reads, `ls apps`]. So Phase 2 must (a) extend the pure reducer, and (b) own a small **voice-side dialogue runner** that connects the reducer to the hub and to a **fail-closed stub gate**, with explicit ports that core's real Executor replaces at I2.

The seam that makes (b) possible without editing core files already exists: `startServer({ handlers })` spreads caller handlers over the defaults, so a voice-owned `utterance` / `speak.done` handler can run the reducer in the server process, exactly as ARCHITECTURE.md intended ("`packages/dialogue` ... runs inside the server") [VERIFIED: apps/server/src/server.ts:139-148; .planning/research/ARCHITECTURE.md:148]. Because that replaces core's `utterance` handler, the reducer must also cover everything core's grammar covers today (describe, what's required, read the form, stop, repeat).

Second finding: **no phrase table exists anywhere in code.** The only definition is ARCHITECTURE.md:518: `submit -> "submit form"`, with an optional noun from a fixed whitelist `booking, order, application, message`. "survey" is not in that whitelist, so a literal implementation produces "submit form" for "Customer survey", contradicting the demo's "say 'submit survey'" (CONTEXT, ROADMAP success criterion 5). This needs a one-line additive agreement with core (add `survey`), tracked as a hand-off. Until then the voice stub gate carries its own copy of the table, clearly marked as a stand-in.

**Primary recommendation:** Build Phase 2 as three pure, vitest-tested layers plus thin glue: (1) extend `packages/dialogue` (reducer, field resolver, templates, spoken-text normalizers, phrase matcher, mode state, new Effect/Event kinds, all pure); (2) a voice-owned `DialogueRunner` in `apps/server/src/voice/` plugged in through `startServer({ handlers })`, talking to the extension through the existing `act.request` / `snapshot.request` protocol and to a `GatePort` whose default implementation fails closed; (3) `fixtures/forms/broken.html` plus a restart-based reset. Enforce "a bare yes never submits" with a seeded random-walk invariant test over the reducer, not just example tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Utterance -> intent/effects (grammar, field resolution, templates) | Server process, pure `packages/dialogue` | — | ARCHITECTURE: dialogue is deterministic server code; the model never owns conversation state |
| Confirm-phrase match | Server process (reducer is server code) | — | Window must never decide; only `role=voice` utterances reach the reducer |
| Grant mint / redeem / bind (target, kind, URL, version, values hash, 30 s) | Core `packages/policy` + Executor | Voice stub (fail-closed) until C6 lands | GATE-01..05 are core requirements |
| Fill / select / click execution, observed value | Extension (core) via Executor | Fake extension (core, read-only) | ACT-01/02/04 |
| Speech output, earcons, queue, `speak.done` | Voice window | — | VOX-04, already built |
| BLOCKED banner rendering | Voice window (display only) | — | VIS-02; driven by `confirm.armed` / `confirm.cleared` / `state` |
| Demo form HTML | Static files (served by core's static root) | — | DEMO-01 |
| Reset (profile, session, form) | Dev tooling (voice-owned script) | — | DEMO-02 |

## Standard Stack

No new runtime packages are needed. Everything below is already installed and pinned in this repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@blip/protocol` | workspace | FormModel, Field, Intent, ActOp/ActResult, `confirm.*`, `speak*` messages, `buildFrame`/`parseFrame` | The frozen contract [VERIFIED: packages/protocol/src] |
| `@blip/dialogue` | workspace | Pure reducer + Effect/Event unions | Voice-owned package, already imported by mock-server [VERIFIED] |
| vitest | 5.0.5 | Unit, invariant and WebSocket integration tests | Already root devDependency, `projects` glob covers `packages/*`, `apps/*`, `dev/*` [VERIFIED: package.json, vitest.config.ts] |
| zod | via protocol | Parse `confirm.*` and fixture JSON | Already used |
| ws 8.22.0, sirv 3.0.2 | pinned | Mock server / integration tests | Already used by dev/mock-server [VERIFIED: dev/mock-server/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tools/fake-extension` (core, read-only) | workspace | In-memory fill/select/check, fail-closed click | Integration tests and the dev runner until the real extension lands |
| `scripts/gen-broken-form-model.ts` pattern | — | Generate a FormModel fixture from a snapshot via core's `buildBaselineFormModel` | Generate a model for the new survey form instead of hand-writing one |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled spoken-email/number-word normalizer (~100 lines) | npm `words-to-numbers` etc. | Adds an unvetted dependency for one narrow use (0-99 and email tokens); a table-tested pure function is safer for a 36-48 h build and keeps `packages/dialogue` dependency-free |
| `fast-check` for the invariant test | Seeded PRNG random walk (10 lines) | `fast-check` is not installed [VERIFIED: node_modules scan]; a seeded walk gives the same coverage without a new package |
| `jsdom` for banner/DOM tests | Pure `banner.ts` model + thin render | `jsdom`/`happy-dom` are not installed [VERIFIED]; existing voice tests are all pure-logic tests [VERIFIED: apps/voice/src/*.test.ts names] |

**Installation:** none. **Version verification:** vitest 5.0.5 on Node v24.20.0 confirmed by `npx vitest --version`.

## Package Legitimacy Audit

No external packages are installed or recommended in this phase, so slopcheck was not run. If the planner decides to add `fast-check` or `jsdom` anyway, gate each behind `checkpoint:human-verify` (package-name provenance rule) and prefer not to.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 user speech/typed ──► voice window (STT, TTS queue, banner)
                          │ utterance{text,source}      ▲ speak / earcon / state / confirm.armed / confirm.cleared
                          ▼                              │
                    hub (role=voice only) ──────────────┘
                          │  handlers.utterance / "speak.done"  (voice-owned DialogueRunner, injected via startServer)
                          ▼
              ┌──────────────────────────────┐
              │ reduce(state, event, ctx)    │  PURE. ctx = { form, now }. No IO, no clock.
              │  1 confirm gate FIRST        │
              │  2 grammar (read/continue/   │
              │    fill/pick/read back/      │
              │    submit/cancel/describe..) │
              │  3 else parseIntent effect   │  (never while armed)
              └──────────────┬───────────────┘
                 effects[]   │   ▲ events: act.result, confirm.armed/refused/cleared, gated.result, speak.done, form.changed
                             ▼   │
              ┌──────────────────────────────┐
              │ DialogueRunner (effect runner)│
              │  speak/earcon ──► hub.send(voice)
              │  fill/select/focus ─► hub.request(extension,"act.request") ─► act.result{observedValue}
              │  refreshForm ─► hub.request(extension,"snapshot.request") ─► session.applySnapshot
              │  armConfirm / clearConfirm / redeem ─► GatePort
              └──────────────┬───────────────┘
                             ▼
         GatePort (interface)   StubGate (voice, FAIL CLOSED)  |  core Executor + policy (I2)
                             ▼
              extension (real at I2, fake-extension before): click is refused unless a valid grant exists
```

Primary use case trace: "submit" -> reducer checks required-empty (D-07) -> emits `speak(readback, speakId=R)` -> runner sends it -> voice window speaks and returns `speak.done{R, interrupted:false}` -> reducer (state `reading-back`) emits `armConfirm` -> gate returns grant + phrase -> `confirm.armed` event -> reducer enters `awaiting-confirm`, emits `speak(confirm-prompt)` and `earcon blocked`, runner sends the `confirm.armed` frame (banner appears) -> user utterance "submit survey" arrives after `speak.done` + 1 s -> reducer emits `redeem{grantId}` -> gate/Executor decides; only then is a click sent.

### Recommended Project Structure
```
packages/dialogue/src/
├── reduce.ts            # top-level dispatch (keeps "what's here" path byte-identical)
├── effects.ts / events.ts   # extended unions (additive)
├── state.ts             # DialogueState (mode, read cursor, current field, pending options, confirm)
├── fields.ts            # resolveField(), spokenLabel(), optionList(), required-empty helpers
├── templates.ts         # all spoken text (read batch, echo, read-back, refusals) - pure strings
├── normalize.ts         # spoken email, number words, digit grouping, speakable() for TTS
├── confirm.ts           # normalizePhrase(), phraseMatches(), GATE-08 timing helper, affirmative set
├── *.test.ts            # co-located like reduce.test.ts
apps/server/src/voice/
├── dialogue-runner.ts   # effect runner + handlers factory (voice-owned dir)
├── gate-port.ts         # GatePort interface + StubGate (fails closed)
dev/mock-server/src/
├── run-real.ts          # pass handlers: createDialogueHandlers(...) ; fixture broken
├── reset.ts             # DEMO-02
fixtures/forms/
├── broken.html          # DEMO-01 (name matches the URL core's fixtures already use)
├── broken.model.json?   # generated, only if a voice-owned snapshot is added
fixtures/demo/
├── profile.template.json   # fictional, committed
└── profile.json            # working copy, gitignored (Phase 3 consumes it; Phase 2 only restores it)
apps/voice/src/
├── banner.ts            # pure model (+ banner.test.ts) and a 15-line textContent renderer
```

### Pattern 1: Confirm gate runs FIRST, before routing, and the model is never reachable while armed
**What:** At the top of `reduce`, if `state.mode === "awaiting-confirm"`, handle only: exact phrase, `cancel`, `read back`, `repeat`, `stop`, recognized field edit; everything else (including a bare "yes") is a refusal that repeats the phrase. Nothing in this mode may emit `parseIntent`.
**Why:** ARCHITECTURE.md:477 (gate first) and D-06 (no retry limit, stay blocked). It also removes the whole "model decides" class of bug.
**Example:**
```typescript
// Source: this repo's design (ARCHITECTURE.md Pattern 1, adapted to D-06)
function onArmedUtterance(s: ArmedState, text: string, ev: UtteranceEvent, ctx: Ctx) {
  const guard = confirmWindowOpen(s, ctx.now);          // no outstanding speak AND >= 1000 ms since last speak.done
  if (guard && phraseMatches(text, s.confirm.phrase)) {
    return { state: toMode(s, "executing"), effects: [{ kind: "redeem", grantId: s.confirm.grantId }] };
  }
  if (isCancel(text)) return cancel(s);                  // effect clearConfirm{cancelled} + "Okay, not submitting."
  if (isReadOnlyCommand(text)) return answerReadOnly(s, text, ctx);   // read back re-arms; repeat; stop
  const edit = matchFieldEdit(text, ctx.form);           // recognized dictation/pick = field edit
  if (edit) return editWhileArmed(s, edit);              // performs the fill, clearConfirm{value-changed}
  return refuse(s);                                      // "Not submitting. I need you to say 'submit survey'." + earcon blocked
}
```
Note the refusal covers: bare yes, wrong phrase, silence-ish noise, and an utterance heard *inside* the GATE-08 window even if it equals the phrase (that case also refuses; do not silently drop it, or the user hears nothing).

### Pattern 2: Reducer-supplied `speakId` for correlation
**What:** `speak` effects carry an optional `speakId` generated from a counter in reducer state (`b${seq}`); the runner sends that exact id in the `speak` frame. `speak.done{speakId, interrupted}` then lets the reducer know the read-back finished uninterrupted, which is the only thing that triggers `armConfirm`.
**Why:** core's own `speak()` helper mints `newId()` internally [VERIFIED: turn.ts:35-39], so the reducer cannot correlate otherwise. `speakId` is just a 1-64 char string on the wire [VERIFIED: payloads-voice SpeakDonePayload].

### Pattern 3: Ports with a fail-closed default
**What:** The runner depends on `GatePort { arm(req) -> {ok:true, grantId, phrase, expiresAt} | {ok:false, reason}; clear(grantId, reason); redeem(grantId) -> {ok:false, reason:"gate-not-connected"} | {ok:true,...} }`. `StubGate.redeem` always returns `ok:false`; `arm` works (so the banner/phrase flow is demoable) but a redeemed correct phrase ends in "Blocked. The safety gate is not connected, so nothing was submitted." The stub never sends a gated `act.request`.
**Why:** WORK-SPLIT rule "Safety stubs must fail closed. The fake executor blocks everything. Never stub a gate open." [VERIFIED: docs/WORK-SPLIT.md:61]. Core's fake extension already refuses all gated clicks [VERIFIED: fake-extension.ts:116-121], giving defense in depth.

### Pattern 4: Apply our own fills to local truth only via the extension's answer
**What:** After `act.result`, speak the echo from `observedValue` (mapped through `field.options` for select/radio), then request a fresh snapshot (`reason: "post-act"`) and `session.applySnapshot` so `ctx.form` reflects the DOM. Do not patch the model from the dictated text.
**Why:** D-04 (echo what the page holds) and ACT-04. `Session.applySnapshot` is public; `ensureSnapshot` in turn.ts is not exported, so the runner needs its own ~15-line helper [VERIFIED: turn.ts:56-76, session.ts:47-61].

### Anti-Patterns to Avoid
- **Matching the phrase anywhere except reducer/server code:** the window must not contain phrase logic. [CITED: CONTEXT carried_forward]
- **Using `utterance.alternatives` for phrase matching:** a lower-ranked hypothesis could equal the phrase while the top hypothesis does not. Match on `text` only. [ASSUMED: design choice, follows fail-closed principle]
- **Letting a recognized-but-ambiguous utterance fall through to `parseIntent` while armed.**
- **Reading `Field.value` for sensitive fields or for the read-back of selects without mapping value -> label.**
- **Using the page's button label as the phrase noun** (ARCHITECTURE Anti-Pattern 3): phrase = fixed table + whitelisted noun from the title.
- **Hand-writing a FormModel fixture for the survey page:** generate it with `buildBaselineFormModel` from a snapshot JSON, like `gen-broken-form-model.ts`.

## Reducer design (what to build, concretely)

### State
```typescript
type Mode = "ready" | "reading" | "awaiting-value" | "reading-back" | "awaiting-confirm" | "executing";
type DialogueState = {
  lastSpoken: string | null;           // existing, keep
  mode: Mode;
  seq: number;                         // speakId counter
  readCursor: number | null;           // index of next field for "continue"
  currentFieldId: string | null;       // D-03 "current field"
  pendingOptions: { fieldId: string } | null;   // options were just read for this select/radio
  outstanding: string[];               // speakIds sent, no speak.done yet (GATE-08 mirror)
  lastDoneAt: number | null;
  readBack: { speakId: string; actionId: string; digest: string } | null;   // waiting for uninterrupted speak.done
  confirm: { grantId: string; phrase: string; actionId: string; digest: string; expiresAt: number } | null;
  previousValues: Record<string, string>;   // cheap now, enables DLG-13 undo in Phase 3
};
```
`DialogueState` is currently `{ lastSpoken }` and the mock server initializes it with that literal [VERIFIED: server.ts:79]; keep new fields **required with a `initialState()` factory** and update the two call sites (mock server, tests) rather than making them optional, so TypeScript catches a missed initialization.

### Events and effects to add (additive; all in voice-owned `packages/dialogue`, no protocol change)
- Events: `utterance` gains required `now: number` (use the envelope `ts` or `Date.now()` in the runner), `speak.done` gains `now`, plus `act.result {fieldId|actionId, ok, error?, observedValue?}`, `confirm.armed {grantId, phrase, expiresAt}`, `confirm.refused {reason}`, `confirm.cleared {grantId, reason}`, `gated.result {ok, reason?}`, `form.changed` (exists).
- Effects: `speak` (+`speakId?`), `earcon`, `cancelSpeech`, `parseIntent` (exist) plus `fill {fieldId, value}`, `select {fieldId, optionValue}`, `focus {fieldId}`, `refreshForm`, `armConfirm {actionId}`, `clearConfirm {grantId, reason}`, `redeem {grantId}`, `setCurrentField {fieldId|null}`.
- Hand-off: core's future effect runner interprets this union (ARCHITECTURE.md:148 "freeze that union early"). Post the added kinds to Pranav as **HO-8** before I2; until he agrees, the voice-owned runner is the only interpreter.

### Mapping to protocol `DialogueStateName`
`ready -> ready`, `reading -> describing`, `awaiting-value -> awaiting-value`, `reading-back -> reading-back`, `awaiting-confirm -> awaiting-confirm`, `executing -> executing`. The runner sets `session.dialogue` / `session.focusFieldId` and calls `hub.pushState()` after each reduce. The window already receives `state` frames.

### Grammar to implement (exact-lookup / token-prefix, no nested-quantifier regex, 200-char guard like `grammar.ts`)
Must cover what core's `turn.ts` covers today because the voice handler replaces it: describe (`whats here` family, keep the reducer's existing regexes), `whats required` (mirror `requiredReply`), `read the form`/`read form`, `stop`, `repeat`. Then new: `continue`/`next`/`more`, `read back`/`read it back`, `submit`/`submit it`/`submit the form`, `cancel`/`never mind`, field edit (`<label> is|to|equals <value>`, `set|fill|enter|type <label> to <value>`, `my <label> is <value>`), option pick (`two`, `number two`, `option 2`, `<option name>`), bare value.

**Field resolution (D-03):** do not regex free text for labels. For each field compute a normalized label token list (page-order, skipping disabled/hidden); an utterance is a named-field edit when its leading tokens equal (or are a unique contiguous subset of) a field's label tokens followed by an optional `is|to|as|equals`. Longest label wins; a tie or a subset that matches several fields -> ask "Which one, email or alternate email?" (no fill). Unlabeled fields are addressable as `field <n>` / `number <n>` using the same 1-based order the read used ("field 3"). Label text is page-controlled: sanitize (strip control chars, cap 80) before speaking, as `cleanTitle` already does.

**Spoken label rule:** `label.trim() === ""` -> `unlabeled field <n>`; low-confidence labels keep core's hedge `probably <label>` for parity with `readFormReply` [VERIFIED: reply.ts:11-15]. (DLG-11's full "I guessed because..." wording is Phase 3.) Optional, deterministic, no model: if the label is empty and `autocomplete` is a known token (`tel`, `email`, `name`, ...), say "unlabeled field 3, looks like phone" - flag as Open Question 4.

**Bare-value guard (D-03 risk):** a mis-heard command must not silently overwrite a field. Accept a bare value only when the grammar matched nothing, `currentFieldId` is set, and the current field is a fillable text-like field; reject for select/radio (route to option picker), sensitive (hand-off: `focus` + "type it yourself"), disabled. Always echo with label and say "Replacing <old>" when `hasValue` was true (D-04). Store the old value in `previousValues` (Phase 3 undo).

### Templates (suggested wording; short sentences, counts first)
- Read batch: `"Field 1: Your name, optional. Field 2: Email, required. Field 3: unlabeled field 3, required. Say continue for more."` / last batch: `"... That is all 6 fields."` For select/radio: `"Field 4: How did you hear about us, required. Options: one, Friend. Two, Web."` (D-02), then set `pendingOptions`.
- Echo: `"Email, jane@example.com."` using `speakable()` of the observed value; `"Phone, 5 5 5, 0 1 0 0. Replacing the old value."` Rejected/unchanged: `"I tried to fill Age, but the page shows nothing."` when `observedValue` is empty or `ok:false`.
- Read-back (D-05): `"Reading back 6 fields. Your name, Jane Doe. Email, jane at example dot com. Phone, empty, required. How did you hear about us, Friend. Rating, empty. Password, entered, hidden. 2 required fields are still empty."` Select/radio values are mapped to option labels. A field with `error` set adds `", error: <text>"`. Sensitive: `hasValue ? "entered, hidden" : "empty, required|optional"`, never `value`.
- Confirm prompt (D-06): `"To submit the survey, say 'submit survey'."` Refusal: `"Not submitting. I need you to say 'submit survey'."` (repeats each time, plus `earcon blocked`).
- D-07: `"I can't submit yet. Phone and Email are required and empty."` Join with "and"; more than 3 -> `"4 required fields are empty: ..."`. No `armConfirm`.
- After cancel: `"Okay, not submitting."`; after a field edit while armed: `"The form changed, so I'm not submitting. Say submit when you're ready."`; expiry: `"That timed out. Say submit to start again."`; read-back interrupted (PTT hold): no arm, say nothing extra or `"Say submit to hear the read-back again."`.
- `speak.category`: `answer` for reads/echo, `readback` for the read-back, `confirm-prompt` for the phrase prompt and refusals, `error` for failures [VERIFIED: PROTOCOL.md `speak` row].

### Arming rules (all must hold; each one gets a test)
1. `submit` with required-empty > 0 -> D-07 message, mode stays `ready`, no `armConfirm`.
2. Arm only on `speak.done{speakId === readBack.speakId, interrupted:false}` while still `reading-back`. Interrupted -> back to `ready`, no arm.
3. If `form.changed` shows a different values digest before arming completes -> abandon, say the form changed.
4. 30 s TTL (GATE-03) is the gate's job; the reducer handles `confirm.cleared{expired|page-changed|value-changed|cancelled|executed}` by returning to `ready` (and speaking for expired/value-changed only; `executed` stays silent because core's RES-01 reads the result).
5. Phrase accepted only if `outstanding.length === 0` and `now - lastDoneAt >= 1000` (mirror of GATE-08; core's server guard is **absent** today, `speak.done` is a no-op there [VERIFIED: server.ts:119, I1-HANDOFFS HO-6], and our handler replaces it, so the reducer is currently the only guard).
6. Which action: `form.actions.find(primary)` else the only gated action; several non-primary gated actions and no primary -> "Which button?" and no arm. Never choose by label text.

## Normalization (spoken emails and numbers) - Claude's discretion, recommended rules

Applies to the *value* part of a fill, using the field's type (`type === "email"`, `autocomplete === "email"`, label contains "email"/"e-mail") and `tel`/`number`/digit-ish fields. Pure functions in `normalize.ts`, table-tested.

**Email (MEDIUM; Web Speech sometimes already returns `jane@example.com`, sometimes words [ASSUMED]):**
- lowercase, strip trailing `. , ! ?`
- if it already contains `@`: just remove spaces.
- else: replace the **last** standalone token `at` that has at least one token after it with `@` (so "pat at work at example dot com" -> `pat` + `at work` ... see test table; last-`at` heuristic is deliberately simple), then `dot`/`period` -> `.`, `dash`/`hyphen` -> `-`, `underscore` -> `_`, `plus` -> `+`; digit-word tokens (`zero`..`nine`, `oh` only when adjacent to other digit words) -> digits; delete all spaces.
- validate `^[^\s@]+@[^\s@]+\.[^\s@]+$`; invalid -> do not fill, say `"I didn't catch a full email address. Say it again, for example name at example dot com."`
- Echo uses TTS-friendly form: `@` -> " at ", `.` -> " dot " (`speakable()`), but the *page value* is the plain address.

**Numbers / phone:**
- Digit words -> digits; `oh`/`o` -> 0 only in tel/number context; `double five` -> `55`, `triple` -> three copies (tiny table); keep Chrome's digits if STT already produced them (it usually does for phone numbers [ASSUMED]); do not reformat.
- Number words 0-999 for numeric fields (`twenty five` -> `25`, `one hundred and five` -> `105`); hand-rolled, table-tested; anything else passes through unchanged.
- Spoken digit groups in echo/read-back: any run of 4+ digits in a tel/number field is read as spaced digits ("5 5 5, 0 1 0 0") so the TTS does not say "five million five hundred ...". Text fields (names, free text) pass through unchanged apart from trim, whitespace collapse, control-char strip and the 300-char cap (Intent `set_fields` limit [VERIFIED: intent.ts:18]).

Option lists: skip options with empty `value` (placeholder rows like the fixture's `{"value":"","label":""}`); read up to 8 in full; above 8: `"... and 12 more. Say the one you want, or say more."` with a `more` cursor in `pendingOptions`. Match by name = normalized equality, else unique substring, else "I found 3 matches" and read those numbered. Numbers: digits or words one..twenty. `select` ActOp takes the option **value**, so map label -> value before the effect and value -> label for the echo.

## Demo form and reset (DEMO-01, DEMO-02)

**Serving:** core's real server already serves `fixtures/forms` at `/fixtures/forms` when the directory exists (Host-checked, sirv in dev mode reads from disk on each request) [VERIFIED: apps/server/src/main.ts:75-79, hub/static.ts]. `broken-form.model.json` already records `url: http://127.0.0.1:7777/fixtures/forms/broken.html` and the core snapshot uses the same URL, but **no `broken.html` exists** [VERIFIED: git ls-files]. Name the new page `fixtures/forms/broken.html` so core's URL assumptions hold. `scripts/dev.ts` currently serves **no** static roots (HO-7 pending); voice's `run-real.ts` passes `staticRoots` itself and must add `fixtures/forms` the same way (it currently passes only the voice `dist`) [VERIFIED: run-real.ts:31, I1-HANDOFFS HO-7].

**Static server limits:** only GET/HEAD are served, so a real `<form method=post>` would 404. All submit handling is client-side JS.

**Page design (original markup; do not copy the W3C BAD page, its footer reserves copyright and document-use terms [CITED: https://www.w3.org/WAI/demos/bad/before/survey.html]; the style reference is its unlabeled spacer-image/table layout):**
- 6 controls matching D-08: (1) name - placeholder-only; (2) email - label only as adjacent plain text (nearby-text), required via asterisk or attr; (3) phone - **no label, no placeholder**, `autocomplete="tel"`, required; (4) "How did you hear about us" select with an empty first option, required; (5) satisfaction radio group, no `fieldset/legend`, labels as plain text; (6) one more text or number field (age). A hidden honeypot is optional (core's broken fixture has one, correctly excluded from the model as `visible:false`).
- Submit is a `<div role="button" tabindex="0">` with a click handler; a decoy second div button (unlabeled) mirrors core's e8.
- Validation errors: toggle a CSS class that only changes border color red; **no error text** (D-08). Plus a page-level "Some answers need attention" block matching core's existing `alerts` fixture (so `pageErrors` is exercised). Note the consequence: with color-only errors `Field.error` is `null`, so Blip cannot name the failing field from text. Surface it through `required` + empty (D-07) rather than promising error text.
- Success: a visible `<div id="result" role="status">` "Thank you. Confirmation BLIP-1234" so core's RES-01 has something deterministic to read.
- Wrap the controls in a real `<form novalidate>` whose `submit` handler runs the same submit routine, so an ungated Enter keypress *would* submit. That makes GATE-02 interception provable on this page (core's concern). Fill code must never send Enter.
- Empty on every load: `autocomplete="off"` on form and controls, plus a `reset()` on `DOMContentLoaded`, on `pageshow`, and one `setTimeout(reset, 0)`, because Chrome's form-state restoration after reload/back is not specified in anything I could find (MDN says `autocomplete="off"` stops the browser caching form data in session history; Chrome has known cases where it ignores it for dropdowns) [CITED: https://developer.mozilla.org/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion; https://support.zabbix.com/browse/ZBX-15705]. Verify manually (reload, back, restore-tab). No `localStorage`.
- Snapshot parity: ship a voice-owned `fixtures/forms/broken.snapshot.json` describing what the extension *should* see for this page, and generate `broken-form.model.json` from it with the existing generator pattern. Do **not** touch `packages/protocol/fixtures` (core). Caveat: `tools/fake-extension` loads only protocol fixture names [VERIFIED: fixtures-loader.ts FIXTURE_NAMES], so until core adds an option (or the real extension arrives) the dev runner keeps using core's 8-element `broken` fixture. Ask core for an optional `snapshot` override on `startFakeExtension` (HO-9, additive, non-blocking).

**Reset (D-09), recommended "restart is the reset":** `npm run reset -w @blip/mock-server` (workspace script, so the shared root `package.json` is not edited) does: (1) copy `fixtures/demo/profile.template.json` over the gitignored `profile.json`; (2) stop the previous demo stack via a pid file (runner writes `.demo-pid`); (3) start `run-real` again (fresh `Session`, fresh `DialogueState`, fresh fake extension values); (4) relaunch the voice window (fresh log) and open `http://127.0.0.1:7777/fixtures/forms/broken.html` in the dedicated profile (`chrome.exe --user-data-dir=<repo>/.chrome-profile <url>`, args array, no shell, like `launch-window.ts`). This restores all three D-09 items deterministically with zero new network surface. Alternatives rejected: an HTTP `POST /reset` (any web page can POST to loopback without Origin checks), and extending the PTT sidecar (it deliberately accepts no inbound messages and checks Origin).
Profile content: fictional only (STATE.md blocker: speech audio goes to Google STT). Keep keys aligned to `autocomplete` tokens (`name`, `email`, `tel`) because Phase 3's DLG-05 maps by token and the model must see keys only. Phase 2 only restores it.

## BLOCKED banner (VIS-02)

- `apps/voice/src/banner.ts` pure model: `bannerFor(confirmArmed | null, dialogue) -> { visible, text, phrase }`. Text `"BLOCKED - say '" + phrase + "'"` with an ASCII hyphen per the UI-SPEC (the ROADMAP uses an em dash; the UI contract is the later, approved source). Render with `textContent` only, since `phrase` arrives from the server and the server derives it from a fixed table, but the rule in this codebase is textContent for everything [VERIFIED: ui-log.ts header comment].
- Show on `confirm.armed`; clear on `confirm.cleared`, on socket close, on `state` frames whose `dialogue` is not `awaiting-confirm` (stale-banner safety net), and on replace. Never infer "armed" from text in the transcript.
- Sound: play `blocked` only when the server sends an `earcon blocked` frame (reducer emits one at arm time and on every refusal, which gives D-06's repeat behavior). The window must not also play it on `confirm.armed`, or it doubles. [VERIFIED: main.ts currently ignores confirm.* and plays earcons only from `earcon` frames, lines 140-152]
- Accessibility: styled as destructive (`#FF6B6B` background with `#0B0F14` text is ~7:1, meets the UI-SPEC AAA rule [ASSUMED: computed by hand, re-check with a contrast tool]), plus a shape/word ("BLOCKED"), never color alone. Do **not** make the banner an assertive live region: Blip already speaks the prompt, and an `alert` would be double-announced in NVDA mode (Phase 4). Use a static region with `aria-label`; the log's polite region already carries the spoken text. Min height `var(--space-banner)` (96 px) exists in CSS [VERIFIED: styles.css:176-181].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame validation / envelopes | Custom JSON checks | `buildFrame` / `parseFrame` / `canSend` from `@blip/protocol` | Frozen contract; mock server already does this |
| Host/Origin guard in any new listener | New checks | Core's `hostAllowed` / `rolesForOrigin` (read-only import, as mock-server does) | Security-sensitive |
| Static file serving | Own file server | Core's `createStaticHandler` via `staticRoots` | Traversal/MIME handling already solved |
| Baseline FormModel for the survey page | Hand-typed JSON | `buildBaselineFormModel(snapshot)` in a generator script | Avoids a second author of FormModel semantics (M0 item 9) |
| Gate semantics (single use, TTL, binding, audit) | Re-implement grants in voice | `GatePort` + core `packages/policy` at I2 | Two gates would drift; voice stub only needs to fail closed |
| Phrase source | Deriving phrase from button text | Fixed kind table (+ whitelisted noun) | ARCHITECTURE Anti-Pattern 3 |

**Key insight:** voice owns *what is said and when*, core owns *whether anything may happen*. Anything that decides "may happen" must stay behind `GatePort`.

## Common Pitfalls

### Pitfall 1: Core's turn handler is replaced, and its safety nets go with it
**What goes wrong:** Overriding `handlers.utterance` removes core's grammar and its read-only behaviour; overriding `speak.done` removes core's no-op (and, later, core's GATE-08 guard).
**How to avoid:** the reducer covers every command core's grammar covered (parity test against `matchGrammar` outputs for the five command families), and keeps its own `outstanding` / `lastDoneAt` guard. Note the override to core in HO-8 so Pranav wires GATE-08 into whichever handler is final.
**Warning signs:** "what's required" or "repeat" suddenly gets `parseIntent`.

### Pitfall 2: Arming on the wrong `speak.done`
**What goes wrong:** Arming after any `speak.done` (filler "One moment", an earlier answer) or after an interrupted read-back lets the phrase be accepted without the user having heard the read-back.
**How to avoid:** correlate by reducer-minted `speakId`; require `interrupted:false`; remember the voice window sends `speak.done` for every speak including cancelled ones [VERIFIED: M0-SIGNOFF R3]. Test: interrupted read-back never arms; filler speak.done never arms.

### Pitfall 3: Confirm phrase heard from Blip's own mouth
**What goes wrong:** the confirm prompt says "say 'submit survey'" and the mic hears it.
**How to avoid:** GATE-08 window in the reducer (no outstanding speak, 1 s after last done); barge-in stays forced off (`GATE_08_PRESENT=false`); test the sequence "prompt speak outstanding + utterance 'submit survey' -> refused".

### Pitfall 4: A mis-heard command becomes a fill
**What goes wrong:** "reed the form" is treated as a bare value for the current field.
**How to avoid:** see the bare-value guard; echo always names the field and mentions replacement; store `previousValues`. Consider requiring `sttConfidence >= 0.5` for bare values when present (optional, Open Question 3).

### Pitfall 5: Select echo shows the option value, not the label
`observedValue` for select/radio is the option `value` ("friend") [VERIFIED: fake-extension.ts:140-142]; map through `field.options`. Placeholder option with empty value must never be offered or echoed.

### Pitfall 6: Sensitive values leaking through templates
Templates must take `Field` and never interpolate `field.value` when `sensitive !== "none"`; the schema already forces `value: null` there [VERIFIED: form-model.ts:33-36] but `hasValue` is the signal. Add a test that runs every template against a form containing a password/card field and asserts the output contains no value text and no `value` of any field with `sensitive`.

### Pitfall 7: Fill refused for sensitive fields
Fake and real extension return `sensitive-field` for writes [VERIFIED: fake-extension.ts:109]. The reducer must not emit `fill` for a sensitive field at all; it emits `focus` and speaks the hand-off (full DLG-12 wording is Phase 3, but Phase 2's read/read-back must already mask).

### Pitfall 8: Page-controlled strings spoken verbatim
Labels, options, titles, errors are untrusted. Sanitize (control chars, length) before speech, as `cleanTitle` does. They cannot reach the phrase table or the matcher, which must stay true: the phrase comes only from `confirm.armed`, never from `form`.

### Pitfall 9: Stale `ctx.form`
After a fill the form model is stale until re-snapshot. Read-back and `required-empty` counts must use a refreshed model; the runner sets `session.stale = true` after every act and awaits a fresh snapshot before feeding the next utterance (turns already run one at a time via `turnQueue`; reuse that serialization in the voice handler).

### Pitfall 10: Chrome restores the previous form values
See the form section; reset must be verified by an actual reload, back, and tab-restore.

## Code Examples

### Phrase normalization and match (exact token sequence, fail closed)
```typescript
// Source: design per ARCHITECTURE.md:518-520 and FEATURES.md:75; no fuzzy match, no model.
const FILLERS = new Set(["um", "uh", "please"]);
export function phraseTokens(text: string): string[] {
  if (text.length > 200) return [];
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  while (t.length > 0 && FILLERS.has(t[0]!)) t.shift();
  while (t.length > 0 && FILLERS.has(t[t.length - 1]!)) t.pop();
  return t;
}
export function phraseMatches(text: string, phrase: string): boolean {
  const a = phraseTokens(text);
  const b = phraseTokens(phrase);
  return b.length > 0 && a.length === b.length && a.every((tok, i) => tok === b[i]);
}
```
"yes submit survey", "submit the survey" and "submit surveys" do not match; the user repeats. That is intended.

### Fail-closed stub gate
```typescript
// apps/server/src/voice/gate-port.ts  (voice-owned stand-in; replaced by core's Executor at I2)
export type ArmResult = { ok: true; grantId: string; phrase: string; expiresAt: number } | { ok: false; reason: string };
export interface GatePort {
  arm(req: { actionId: string; kind: ActionKind; title: string; digest: string }): ArmResult;
  clear(grantId: string, reason: ConfirmClearedPayload["reason"]): void;
  redeem(grantId: string): Promise<{ ok: false; reason: string }>;   // type says it can only fail
}
export function createStubGate(now: () => number): GatePort {
  // STAND-IN phrase table, copied from ARCHITECTURE.md:518 plus "survey" (HO-8 asks core to add it).
  return {
    arm: (r) => ({ ok: true, grantId: newId(), phrase: stubPhrase(r.kind, r.title), expiresAt: now() + 30_000 }),
    clear: () => {},
    redeem: async () => ({ ok: false, reason: "gate-not-connected" }),   // never sends a gated act.request
  };
}
```
Making `redeem`'s stub return type `{ ok: false }` means the stub cannot compile a success path.

### Seeded random-walk invariant (the "bare yes never submits" proof)
```typescript
// packages/dialogue/src/confirm.invariant.test.ts
// Invariant: a `redeem` effect appears ONLY if (mode was awaiting-confirm) && phraseMatches(text, phrase)
//            && outstanding.length === 0 && now - lastDoneAt >= 1000 && event.source in {voice,typed}.
const POOL = ["yes","yeah","yep","ok","okay","sure","do it","go ahead","confirm","submit","submit it","yes submit survey",
  "submit survey","Submit Survey.","please submit survey","submit survey please","submit the survey","cancel","read back",
  "email is a at b dot com","two","continue","stop","repeat"];
function rng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
it("never redeems unless every condition holds", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const r = rng(seed); let st = armedState(); let now = 10_000;
    for (let i = 0; i < 60; i++) {
      now += Math.floor(r() * 1500);
      const ev = pick(r, [utter(pick(r, POOL), now), speakDone(now), formChanged(), confirmCleared(now)]);
      const before = st; const out = reduce(st, ev, { form, now });
      const redeemed = out.effects.some((e) => e.kind === "redeem");
      if (redeemed) expect(allConditionsHold(before, ev, now)).toBe(true);
      st = out.state;
    }
  }
});
```
Plus explicit example tests (below) so a regression names the exact utterance.

### Wiring without touching core files
```typescript
// dev/mock-server/src/run-real.ts (voice-owned), sketch
const server = await startServer({
  port, dev: true, brain: "fake", fakeDelayMs,
  staticRoots: [...voiceDist, { urlPrefix: "/fixtures/forms", dir: formsDir }],
  handlers: createDialogueHandlers({ gate: createStubGate(Date.now), now: Date.now }),   // utterance, speak.done
});
```
Handlers receive `{ message, hub, session }` [VERIFIED: hub.ts:33-34].

## Testing Strategy (vitest; `nyquist_validation` is false in config, so no formal validation-architecture matrix)

| Layer | File(s) | What it proves | Command |
|-------|---------|----------------|---------|
| Pure reducer, example tests | `packages/dialogue/src/reduce.test.ts` (extend), `read.test.ts`, `fill.test.ts`, `readback.test.ts`, `confirm.test.ts` | D-01..D-07 wording and transitions, using `broken-form.model.json` plus a purpose-built survey model (select + radio + sensitive + unlabeled) | `npx vitest run packages/dialogue` |
| Invariant | `confirm.invariant.test.ts` | Redeem only under all conditions, over 500 seeded random walks | same |
| Bare-yes table | in `confirm.test.ts` | each of ~25 affirmatives and near-phrases -> refusal text + `earcon blocked` + no `redeem`; correct phrase *inside* the GATE-08 window -> refusal; correct phrase after interrupted read-back -> never armed | same |
| Normalizers | `normalize.test.ts` | email table (~20 rows incl. already-`@`, trailing period, `pat at work at example dot com`, invalid), number words 0-999, digit grouping, `speakable()` | same |
| Core-parity | `parity.test.ts` (in dev/mock-server, imports core read-only) | reducer output equals core's `describeReply` / `requiredReply` for those commands (extends the existing run-real parity test) | `npx vitest run dev/mock-server` |
| Sensitive masking | `templates.test.ts` | no template output contains any value for `sensitive != none`; read-back says "entered, hidden" | same |
| Runner integration | `dev/mock-server/src/dialogue-runner.test.ts` | real `startServer` + fake extension + a `ws` voice client: "read the form" -> 2 speaks; "email is a at b dot com" -> `act.request` fill -> echo equals `observedValue`; "submit" with empties -> D-07; full "submit" -> readback `speak` -> test sends `speak.done` -> `confirm.armed` frame + `earcon blocked`; "yes" -> refusal, **zero** `act.request` with `op:"click"` or `gate`; correct phrase -> still zero gated `act.request` (stub gate), and the user hears the blocked message | `npx vitest run dev/mock-server` |
| Banner model | `apps/voice/src/banner.test.ts` | text, hide on cleared/close/state mismatch | `npx vitest run apps/voice` |
| Demo form | manual checklist + a node-only structural test that reads `broken.html` as text and asserts: no `<form method>` post, `autocomplete="off"`, role=button divs, at least one input without label/placeholder, no element text ever equal to a command phrase | `npx vitest run fixtures` or in `dev/mock-server` |
| Manual UAT (human) | I2 run on the real extension | full beat: describe, fill, read back, bare yes refused, phrase submits | n/a |

Quick run (per task commit): `npx vitest run packages/dialogue apps/voice`. Full: `npm test`. Use `npx vitest`/`node --import tsx`, not bare `npx tsx` scripts: I1-HANDOFFS notes script execution is blocked in the user's PowerShell for `npx`; its own commands use `npm run` / `node --import tsx` [VERIFIED: I1-HANDOFFS.md:32]. Prefer `npm test -- <path>`.

Wave 0 gaps: none for framework (vitest present); new files listed above are all created by the phase itself. A survey `FormModel` test fixture must exist before the reducer tests (generate it first).

## Runtime State Inventory
Not a rename/refactor phase. Omitted. (Related reset state, listed so reset is complete: dialogue state and `Session` live in the server process; voice log lives in the window DOM; fake-extension values live in its process; demo profile lives in `fixtures/demo/profile.json`; Chrome form state lives in the browser profile, which is why the form clears itself on load.)

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Core stub reducer "written in 20 minutes" (ARCHITECTURE:680) | Voice's `@blip/dialogue` used by the server via `handlers` | Core must not also implement describe/fill/read-back; avoid two dialogues |
| Arm on any `speak.done` | Arm only on the correlated, uninterrupted read-back `speak.done` | See Pitfall 2 |
| Phrase "submit form" (ARCHITECTURE table) | "submit survey" via whitelist noun | Needs HO-8 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Chrome Web Speech often returns phone numbers as digits and sometimes emails already as `name@host.com`; spoken "at/dot" words otherwise | Normalization | Normalizer covers both paths; low risk, test with real STT in the manual run |
| A2 | Matching on `text` only (never `alternatives`) is acceptable to core's GATE-05 implementation | Anti-patterns | Core might want alternatives considered; safer side chosen |
| A3 | Banner colors reach ~7:1 | Banner | Re-check with a contrast tool; tweak token |
| A4 | Chrome may restore form values on reload/back despite `autocomplete="off"`, so JS `reset()` hooks are needed | Demo form | If wrong, harmless redundancy |
| A5 | `speakId` strings chosen by the reducer are accepted by the window and core (1-64 chars) | Pattern 2 | Verified on the schema side; core code not yet reading `speak.done` |
| A6 | Core accepts the added Effect kinds (HO-8) and the "survey" noun | Reducer design | If declined, voice keeps its own runner/phrase table through I2; demo phrase becomes "submit form" |
| A7 | `Intent` adds nothing needed for Phase 2 (set_fields/read_form/read_back exist), so the fake brain's `clarify` answer remains the only model-routed reply in I2 | Summary | Unmatched phrases get the fake brain's offline message; fine for I2 |
| A8 | Last-`at` heuristic is adequate for emails whose local part contains the word "at" | Normalization | Rare; wrong value is visible in the page-read echo |

## Open Questions (RESOLVED)

1. **Who owns the dialogue->hub wiring at I2?**
   - Known: core has no reducer wiring; `handlers` makes a voice-owned runner possible with zero core edits; core's `scripts/dev.ts` (HO-7 already pending) is where it would be plugged in for the product launcher.
   - Unclear: whether Pranav prefers to adopt `createDialogueHandlers` or write his own effect runner for the same Effect union.
   - Recommendation: build the voice-owned runner now, post HO-8 (Effect union additions, handler factory, "survey" noun, `speak.done` correlation by id) and let him adopt it; keep ports (`GatePort`) so his Executor drops in.
   - **RESOLVED:** voice builds `createDialogueHandlers` (plan 02-06) and records the adoption request, Effect additions, phrase noun and speak.done correlation as HO-8 in `02-HANDOFFS.md`; no core file is edited.

2. **Is the I2 real-submit achievable if core's Executor slips?**
   - The voice-visible I2 beats (banner, refusals, blocked earcon) work on the stub. Actual submission needs core's GATE-01..05 and real extension.
   - Recommendation: gate the success criterion "Only submit survey submits" on core; Phase 2 verification marks that item `human_needed` until C6 lands, as Phase 1 did for GATE-08.
   - **RESOLVED:** yes. If core's Executor/gate is absent at I2, "only 'submit survey' submits" is `human_needed`; the stub-gate refusal message is the expected pass criterion in the meantime (plans 02-06, 02-07).

3. **STT confidence for bare values** (`sttConfidence` is optional on utterance): require >= 0.5 when present? Recommend yes, cheap, safe; if lower, ask "Did you say <value>? Say it again to confirm" is too heavy, so just re-prompt "I'm not sure I heard that. Say it again."
   - **RESOLVED:** a bare value with sttConfidence below 0.5 is rejected and Blip asks again (plan 02-04 Task 3).

4. **Fallback label from `autocomplete`** for the unlabeled phone field before Phase 3's repair: recommend "unlabeled field 3, looks like phone" (deterministic, no model). It lets D-07's "Phone and Email are required and empty" example be true on the fake brain. Planner to confirm with the user if it conflicts with Phase 3's DLG-11 wording.
   - **RESOLVED:** no autocomplete guess in Phase 2; fields read as "unlabeled field N". The "looks like" wording belongs to Phase 3 DLG-11 (plan 02-02).

5. **In-place reset vs restart reset:** restart is recommended for determinism; if the user wants a hot reset mid-demo, a file-watch trigger (`fixtures/demo/.reset` mtime) is the no-network option.
   - **RESOLVED:** restart-based reset via `npm run reset -w @blip/mock-server`; no hot reset and no network endpoint (plan 02-07).

6. **Field edit while armed:** recommended behavior (perform the edit, void the grant, say the form changed) follows D-06 "any field edit ends the wait". If the user would rather block edits until "cancel", flip one branch.
   - **RESOLVED:** dictation of a named field while a confirm is armed performs the edit and voids the grant (D-06 "any field edit ends the wait"); a bare value while armed is refused (plan 02-05).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | yes | v24.20.0 | — |
| vitest | tests | yes | 5.0.5 | — |
| tsx via `node --import tsx` | runners/scripts | yes | 4.23.15 (root devDependency) | — |
| Chrome (dedicated profile) | demo form + window | not probed | `resolveChromePath()` finds it or `CHROME_PATH` | manual browser |
| Real Chrome extension | I2 real fills/submit | no (`apps/extension` does not exist) | — | `tools/fake-extension` with core's `broken` fixture |
| Core policy gate / Executor | real submit | no (stub package) | — | `StubGate` fails closed |
| jsdom / happy-dom / fast-check | optional tests | no | — | pure-model tests, seeded PRNG |
| NVDA | not needed this phase | n/a | — | n/a |

**Missing with no fallback:** none for the voice-visible parts. **Missing with fallback:** real extension, gate.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no (loopback, single user) | existing role/Origin binding |
| V4 Access Control | yes | confirm gate: only `role=voice` utterances reach the reducer; Executor owns grants (core) |
| V5 Input Validation | yes | `parseFrame` zod validation on every frame; reducer treats all page text and utterance text as data; 200-char grammar guard; 300-char value cap; sanitize spoken page strings |
| V6 Cryptography | no | — |
| V7 Logging | yes | never log utterance text, values, or labels (codebase convention) |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Bare "yes" / near-phrase confirms a submit | Tampering | Exact token match, fixed phrase table, invariant test |
| Blip's own prompt confirms itself | Spoofing | Outstanding-speak + 1 s guard in the reducer; barge-in off |
| Page text says "say submit survey" / labels a button "yes" | Tampering / injection | Phrase only from `confirm.armed`; matcher input is `utterance.text` from the voice socket only; page text is never matched |
| Model/`request_action` approves | Elevation | No confirm Intent variant; reducer never emits `redeem` from an Intent; no `parseIntent` while armed |
| Sensitive value spoken or logged | Information disclosure | Templates read `hasValue`, never `value`, for `sensitive != none`; no `fill` effect for sensitive fields; no value logging |
| Hostile web page posts to localhost reset/control | Tampering | No new HTTP endpoints; reset by restart; any new listener must reuse `hostAllowed` / `rolesForOrigin` |
| Unlabeled/odd field names crafted to hijack field resolution | Tampering | Longest-label unique match, ambiguity asks, sanitized labels |
| Stale grant after form edit | Tampering | Digest compare on `form.changed` voids; core's values-hash is authoritative (GATE-04) |

## Sources

### Primary (HIGH confidence, read this session)
- `packages/dialogue/src/{reduce,effects,events,index}.ts`, `reduce.test.ts` - current reducer surface
- `apps/server/src/{server,turn,reply,main}.ts`, `brain/{grammar,fake-brain}.ts`, `hub/{hub,static}.ts`, `session/session.ts` - core's actual behavior and extension seams
- `tools/fake-extension/src/fake-extension.ts` - fill/select semantics, fail-closed click
- `packages/protocol/src/{form-model,intent,act,payloads-voice,fixtures-loader}.ts`, `PROTOCOL.md` - contract
- `packages/policy/src/index.ts` - confirms no phrase table / gate yet
- `dev/mock-server/src/{server,run-real,launch-window}.ts`, `apps/voice/src/{main,ui-log}.ts`, `apps/voice/index.html`
- `.planning/research/ARCHITECTURE.md` (Pattern 1, 2, gate table, flows), `FEATURES.md`, `PITFALLS.md` (Pitfall 5), `docs/WORK-SPLIT.md`, core `ROADMAP.md`/`REQUIREMENTS.md`, voice `I1-HANDOFFS.md`, `M0-SIGNOFF.md`, `01-UI-SPEC.md`

### Secondary (MEDIUM)
- https://www.w3.org/WAI/demos/bad/before/survey.html - structure of the BAD survey (unlabeled spacer controls, long country dropdown); footer states copyright 2012 W3C, so write original markup
- https://developer.mozilla.org/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion - `autocomplete="off"` and session-history form caching
- https://support.zabbix.com/browse/ZBX-15705 - report that Chrome ignored `autocomplete="off"` on a dropdown after Back

### Tertiary (LOW)
- Spoken-email/number behavior of Chrome Web Speech: training knowledge only; verify in the manual run

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - nothing new, all installed and read
- Architecture / integration seams: HIGH - traced through `server.ts`, `hub.ts`, `turn.ts`; the Executor/gate side is MEDIUM because it does not exist yet and the port shapes are voice's proposal
- Normalization and Chrome form restoration: MEDIUM-LOW - untested heuristics, covered by tables and manual checks
- Pitfalls: HIGH for gate sequencing (derived from code), MEDIUM for UX ones

**Research date:** 2026-10-16
**Valid until:** about 3 days (core is moving; re-check `git log origin/main` for `packages/policy`, `apps/extension`, `phrases.ts` and any `speak.done` handling before planning wave 1)

## Project Constraints (from CLAUDE.md)
- TypeScript everywhere; Windows only; Node 24; use `npm run` / `node --import tsx` (never `npx tsx` scripts in PowerShell).
- Voice workstream: do not edit core-owned files (`packages/protocol`, `packages/policy`, `apps/server` except `apps/server/src/voice/`, `apps/extension`, `tools/fake-*`, `tools/repl`). `packages/protocol` changes need both people's sign-off; shared files (`package.json`, `.planning/PROJECT.md`, `REQUIREMENTS.md`) are edited only by agreement.
- Safety invariants: the model never acts; gated kinds default-deny; confirm phrase matched in code only on voice-socket utterances; passwords/card numbers never spoken, logged or sent to the model; stubs fail closed; never `bypassPermissions`.
- Page text rendered with `textContent` only; no utterance text in logs.
- Branches `voice/*`, small merges; GSD workflow entry points before file edits.
