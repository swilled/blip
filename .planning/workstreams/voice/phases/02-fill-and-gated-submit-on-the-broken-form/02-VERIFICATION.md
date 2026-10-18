---
phase: 02-fill-and-gated-submit-on-the-broken-form
workstream: voice
verified: 2026-10-17T22:12:21Z
status: passed
score: 45/45 truths verified; HO-8 production reducer integration passed in isolated browser E2E
covered_files:
  - .gitignore
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-01-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-01-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-02-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-02-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-03-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-03-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-04-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-04-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-05-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-05-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-06-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-07-PLAN.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-07-SUMMARY.md
  - .planning/workstreams/voice/phases/02-fill-and-gated-submit-on-the-broken-form/02-HANDOFFS.md
  - apps/server/src/voice/dialogue-runner.ts
  - apps/server/src/voice/core-gate-port.ts
  - apps/server/src/act/gated.ts
  - apps/server/src/session/session.ts
  - apps/server/test/dialogue-core-gate-port.test.ts
  - apps/extension/test/e2e/gated-flow.e2e.test.ts
  - apps/extension/test/e2e/harness.ts
  - apps/server/src/voice/gate-port.test.ts
  - apps/server/src/voice/gate-port.ts
  - apps/voice/src/banner.test.ts
  - apps/voice/src/banner.ts
  - apps/voice/src/main.ts
  - apps/voice/src/stt.ts
  - apps/voice/src/styles.css
  - dev/mock-server/extension/background.js
  - dev/mock-server/extension/content.js
  - dev/mock-server/extension/manifest.json
  - dev/mock-server/src/broken-form.test.ts
  - dev/mock-server/src/dialogue-runner.test.ts
  - dev/mock-server/src/extension-id.ts
  - dev/mock-server/src/launch-window.ts
  - dev/mock-server/src/reset.test.ts
  - dev/mock-server/src/reset.ts
  - dev/mock-server/src/run-real.test.ts
  - dev/mock-server/src/server.test.ts
  - dev/mock-server/src/server.ts
  - fixtures/demo/profile.template.json
  - fixtures/forms/broken.html
  - fixtures/forms/broken.snapshot.json
  - fixtures/forms/survey-form.model.json
  - packages/dialogue/src/confirm.invariant.test.ts
  - packages/dialogue/src/confirm.test.ts
  - packages/dialogue/src/confirm.ts
  - packages/dialogue/src/effects.ts
  - packages/dialogue/src/events.ts
  - packages/dialogue/src/fields.test.ts
  - packages/dialogue/src/fields.ts
  - packages/dialogue/src/fill.test.ts
  - packages/dialogue/src/index.ts
  - packages/dialogue/src/normalize.test.ts
  - packages/dialogue/src/normalize.ts
  - packages/dialogue/src/read-fill.ts
  - packages/dialogue/src/read.test.ts
  - packages/dialogue/src/reduce.test.ts
  - packages/dialogue/src/reduce.ts
  - packages/dialogue/src/state.ts
  - packages/dialogue/src/submit.test.ts
  - packages/dialogue/src/submit.ts
  - packages/dialogue/src/templates.test.ts
  - packages/dialogue/src/templates.ts
  - scripts/gen-survey-form-model.ts
behavior_unverified: 0
overrides_applied: 0
deferred: []
human_verification: []
---

# Phase 2: Fill and Gated Submit on the Broken Form — Verification Report

**Phase goal:** As a person completing the self-hosted survey, I want to hear its fields, fill them by dictation, review my answers, and have submission accepted only after I say submit survey, so that a generic confirmation like yes can never submit the form.
**Verified:** 2026-10-17T22:12:21Z
**Status:** passed
**Re-verification:** Yes — HO-8 reducer-to-core integration and production-extension browser flow.

## User Flow Coverage

| Step | Expected | Evidence | Status |
|---|---|---|---|
| Open and reset | The local broken survey opens empty with a fresh session and fictional profile. | `dev/mock-server/src/reset.ts` restores the template and restarts the owned demo process; the user confirmed the latest reset opened the survey and that reload, Back, and tab restore leave fields empty. Reset lifecycle test passed. | ✓ VERIFIED |
| Hear the fields | “Read the form” speaks fields in page order, identifies required fields, and numbers non-placeholder select/radio choices. | `packages/dialogue/src/read-fill.ts`; the read/options tests passed; the user confirmed the live Chrome run. | ✓ VERIFIED |
| Dictate and review | Named/current dictation fills the live field, echo uses the page-observed value, and read-back includes all values and required-empty items with sensitive values masked. | `dev/mock-server/extension/content.js` returns observed DOM values; `apps/server/src/voice/dialogue-runner.ts` feeds them into reducer events; the end-to-end runner test and human run passed. | ✓ VERIFIED |
| Request submission | Submit triggers a full read-back and distinct prompt; while waiting, the banner and blocked earcon appear; “yes” and near-phrases are refused. | `packages/dialogue/src/submit.ts`, `apps/voice/src/banner.ts`; boundary and invariant tests passed; the user confirmed the live behavior. | ✓ VERIFIED |
| Say the phrase | The exact phrase alone reaches the core gate after the tracked read-back and quiet window. | The isolated production-extension E2E completes read-back, confirms the correlated speakId, rejects bare yes, and accepts exact submit survey. apps/server/src/voice/core-gate-port.ts routes redemption through core one-use grants. | VERIFIED |
| See a successful result | A production submission succeeds only after the exact phrase and Blip reads the page result. | BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/gated-flow.e2e.test.ts passed with the production extension and local synthetic page; exactly one submit was recorded and the page confirmation was read aloud. | VERIFIED |
| Outcome: “yes” never submits | Generic confirmation cannot produce redeem; only exact phrase can request redemption, and the development gate cannot execute it. | `packages/dialogue/src/confirm.invariant.test.ts` passed its 500-seed walk; exact timing boundary test passed; I2 user run confirmed “yes” did not submit. | ✓ VERIFIED |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | The deliberately broken survey loads locally; one reset restores the empty form, fictional profile, and fresh session. | ✓ VERIFIED | `fixtures/forms/broken.html`; `dev/mock-server/src/reset.ts`; reset lifecycle test; human-confirmed reset, reload, Back, and tab restore. |
| 2 | Read-form speaks page-ordered fields and required status; choices are numbered and selectable by number or name. | ✓ VERIFIED | `packages/dialogue/src/read-fill.ts`; read/options tests passed; user-confirmed in Chrome. |
| 3 | Dictation fills current or named fields and echoes the value observed from the page. | ✓ VERIFIED | Extension `content.js` returns `observedValue`; runner dispatches action results into reducer; end-to-end test and human run passed. |
| 4 | Read-back speaks every field, calls out empty required fields, and masks sensitive values. | ✓ VERIFIED | `packages/dialogue/src/templates.ts`, `submit.ts`; read-back/template tests; human-confirmed. |
| 5 | At I2, only the exact phrase can authorize submission; a bare yes never submits. | VERIFIED | The reducer-to-core GatePort E2E confirms the tracked read-back, refuses bare yes without an action, accepts exact submit survey, records one submit, and reads the page result. Adapter tests cover stale IDs, replay, and invalidation paths. |

**Score:** 45/45 roadmap and plan truths verified. The production gate path was exercised with synthetic utterances in an isolated browser profile; microphone/STT hardware was not part of this integration test.

### Plan-Specific Must-Haves

| Plan | Truth | Status | Evidence |
|---|---|---|---|
| 02-01 | A deliberately broken survey exists and is served at the local fixture URL. | ✓ VERIFIED | `fixtures/forms/broken.html`; static fixture root configured by `dev/mock-server/src/run-real.ts`; generated model and form tests. |
| 02-01 | Six controls cover placeholder-only, adjacent-text, unlabeled, select, radio, and div-button cases. | ✓ VERIFIED | `broken.html`, `broken.snapshot.json`, and `broken-form.test.ts`. |
| 02-01 | Errors use border color only, without per-field error text. | ✓ VERIFIED | `broken.html` form validation styles/alert and structural test. |
| 02-01 | Form values reset on load/history restoration. | ✓ VERIFIED | DOMContentLoaded/pageshow reset in `broken.html`; live reload, Back, and tab-restore human checks passed. |
| 02-01 | Survey FormModel is generated by the baseline builder, not hand-typed. | ✓ VERIFIED | `scripts/gen-survey-form-model.ts` imports `buildBaselineFormModel`; generated JSON is schema-tested. Final generator run had no fixture diff per supplied run evidence. |
| 02-02 | Spoken email normalization accepts valid forms and rejects invalid values before fill. | ✓ VERIFIED | `normalize.ts` and `normalize.test.ts`; end-to-end named dictation passed. |
| 02-02 | Field resolution chooses a unique longest label or numbered unlabeled field; ambiguity is not guessed. | ✓ VERIFIED | `fields.ts`, `fields.test.ts`, `read-fill.ts`; reducer tests. |
| 02-02 | Confirmation matching is exact token-sequence text; “yes” and near-phrases do not match. | ✓ VERIFIED | `confirm.ts`, phrase table tests, and 500-seed invariant test. |
| 02-02 | Templates never speak values for sensitive fields. | ✓ VERIFIED | `templates.ts` and sensitive-marker assertions in template/read-back tests. |
| 02-02 | Page-controlled labels, choices, and title are sanitized before speech. | ✓ VERIFIED | `normalize.ts`, `fields.ts`, and template sanitizer tests. |
| 02-03 | Armed confirmation displays a prominent BLOCKED phrase banner in the reserved slot. | ✓ VERIFIED | `banner.ts`, `styles.css`, renderer tests, and human run. |
| 02-03 | Banner clears on matching clear, socket close, or state leaving awaiting-confirm. | ✓ VERIFIED | `banner.ts` model tests and `main.ts` socket wiring; user confirmed cancel clears it. |
| 02-03 | Voice window displays the server phrase but never decides whether it matches. | ✓ VERIFIED | `main.ts` only forwards confirm payload to `banner.ts`; no phrase matcher in voice UI. |
| 02-03 | Blocked earcon comes only from the server earcon frame. | ✓ VERIFIED | `main.ts` message handling; banner test/source check confirms no extra armed-event earcon. |
| 02-03 | Banner uses textContent and is not an assertive live region. | ✓ VERIFIED | `banner.ts` renderer and DOM test. |
| 02-04 | Read-form speaks fields in order, three at a time, with required/optional status. | ✓ VERIFIED | `read-fill.ts`; read tests; human-confirmed all six fields. |
| 02-04 | Select/radio choices are numbered and selectable by number or name. | ✓ VERIFIED | `read-fill.ts`, option tests, and human run. |
| 02-04 | Named and current-field dictation fill the intended field. | ✓ VERIFIED | `read-fill.ts`, fill tests, runner test, and human run. |
| 02-04 | Fill echo is derived from `act.result.observedValue`. | ✓ VERIFIED | `read-fill.ts` consumes event observed value; fake-extension integration asserts parity; human-confirmed. |
| 02-04 | Sensitive fields produce no fill effect and instead focus the field with a type-it-yourself message. | ✓ VERIFIED | `read-fill.ts` and sensitive marker assertions in `fill.test.ts`. |
| 02-04 | “What’s here” remains byte-identical to the existing description reply. | ✓ VERIFIED | `packages/dialogue/src/reduce.test.ts` and `dev/mock-server/src/run-real.test.ts` parity checks. |
| 02-05 | Read-back lists every field in order, calls out empties/required, masks sensitive values, and counts missing required fields. | ✓ VERIFIED | `templates.ts`, `submit.test.ts`, template privacy tests; human-confirmed full read-back. |
| 02-05 | Submit with required fields empty reports missing fields and does not arm. | ✓ VERIFIED | Named `submit.test.ts` case and human-confirmed no early banner. |
| 02-05 | Confirmation arms only after correlated uninterrupted read-back completion. | ✓ VERIFIED | `submit.ts`, named correlation/interruption tests, and invariant suite. |
| 02-05 | Bare yes, near-phrases, or phrase during the quiet window are refused with blocked earcon. | ✓ VERIFIED | Refusal table, 999/1000 ms boundary test, 500-seed invariant, and human run. |
| 02-05 | Exact phrase requests redeem only with no outstanding speech and at least 1000 ms quiet. | ✓ VERIFIED | `confirm.ts`, `submit.ts`, named boundary test and seeded invariant. |
| 02-05 | Armed mode never calls the model; cancel and named edits end the wait. | ✓ VERIFIED | `submit.ts`, refusal table/model assertions; human confirmed cancel/edit clears banner. |
| 02-05 | Seeded random walk proves redeem invariant. | ✓ VERIFIED | `confirm.invariant.test.ts`: 500 seeds × 60 steps; named test passed. |
| 02-05 | Every speak/cancel in reducer state is tracked. | ✓ VERIFIED | `state.ts`, `submit.ts`, reducer invariant assertions. |
| 02-06 | Real mock-server path reads, fills, and reads back with page-observed echo. | ✓ VERIFIED | `dialogue-runner.ts`, `run-real.ts`, named end-to-end runner test, and human bridge run. |
| 02-06 | Missing required fields never arm confirmation. | ✓ VERIFIED | `dialogue-runner.test.ts` and `submit.test.ts`. |
| 02-06 | Only uninterrupted read-back completion produces the armed frame and blocked earcon. | ✓ VERIFIED | Named submit/runner tests and human run. |
| 02-06 | Bare yes is refused; runner emits no click or gate-bearing act request. | ✓ VERIFIED | End-to-end runner test asserts no click; user confirmed refusal. |
| 02-06 | Development gate refuses exact phrase and performs no submit. | ✓ VERIFIED | `gate-port.ts` unconditionally returns `gate-not-connected`; runner test and human run confirm page remains unsubmitted. |
| 02-06 | Only voice-role utterances reach confirmation handling. | ✓ VERIFIED | `dialogue-runner.ts` role checks and named role-guard integration test. |
| 02-06 | HO-8 is recorded and core-owned files are outside this voice implementation. | ✓ VERIFIED | `02-HANDOFFS.md` identifies owner and files; security/review artifacts record the ownership boundary. |
| 02-07 | One reset restores form/profile/session and opens the survey in the profile with the installed bridge. | ✓ VERIFIED | `reset.ts`, `extension-id.ts`, reset test; human confirmed the latest reset opened the form. |
| 02-07 | Reset adds no network endpoint. | ✓ VERIFIED | `reset.ts` has no listener/server creation; reset tests use injected process and readiness dependencies. |
| 02-07 | Demo profile is fictional and working copy is gitignored. | ✓ VERIFIED | `profile.template.json` uses fictional example.com/555 data; `.gitignore` excludes working profile. |
| 02-07 | Human ran I2 and recorded production submission as human-needed while Executor is absent. | ✓ VERIFIED | Human results supplied for this verification; `02-07-SUMMARY.md` and HO-8 handoff describe the same limitation. |

### Completed Integration Follow-up

| Item | Addressed In | Evidence |
|---|---|---|
| Exact-phrase survey submission through a grant-bound Gate/Executor, followed by result read-back. | Core HO-8 integration on integration/ho8-voice-gate | Production-extension E2E passed on a local synthetic form; exact phrase recorded one submit and the actual page result was read aloud. |

### Required Artifacts

| Plan | Artifacts | Status | Details |
|---|---|---|---|
| 02-01 | `broken.html`, `survey-form.model.json`, `gen-survey-form-model.ts` | ✓ VERIFIED | GSD artifact query: 3/3 exist with no stub issues; builder import link verified; structural test covers form breaks. |
| 02-02 | `normalize.ts`, `fields.ts`, `confirm.ts`, `templates.ts` | ✓ VERIFIED | 4/4 substantive; template-to-fields import verified; co-located tests cover outputs and edge cases. |
| 02-03 | `banner.ts`, `banner.test.ts` | ✓ VERIFIED | 2/2 substantive; main-to-banner link verified; renderer uses textContent. |
| 02-04 | `state.ts`, `read-fill.ts`, `submit.ts` | ✓ VERIFIED | 3/3 substantive; reducer dispatch and server reducer context links verified. |
| 02-05 | `submit.ts`, `confirm.invariant.test.ts` | ✓ VERIFIED | 2/2 substantive; confirmation and armed-mode links verified. |
| 02-06 | `gate-port.ts`, `dialogue-runner.ts`, `02-HANDOFFS.md` | ✓ VERIFIED | 3/3 substantive; run-real wiring into the server and reducer link verified. GatePort is intentionally refusal-only. |
| 02-07 | `reset.ts`, `extension-id.ts`, `profile.template.json` | ✓ VERIFIED | 3/3 substantive; package reset script and runner PID lifecycle links verified. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/gen-survey-form-model.ts` | `apps/server/src/baseline/index.ts` | `buildBaselineFormModel` import | ✓ WIRED | Validated snapshot is passed to the builder and output is parsed as FormModel. |
| `packages/dialogue/src/templates.ts` | `fields.ts` | `spokenLabel` / `optionList` imports | ✓ WIRED | GSD key-link query verified. |
| `apps/voice/src/main.ts` | `banner.ts` | armed/cleared/state socket events | ✓ WIRED | GSD key-link query verified; close/replacement paths are also handled. |
| `packages/dialogue/src/reduce.ts` | `read-fill.ts` | grammar dispatch after armed-mode guard | ✓ WIRED | GSD key-link query verified. |
| `dev/mock-server/src/server.ts` | `packages/dialogue/src/state.ts` | initial state and reducer context | ✓ WIRED | GSD key-link query verified. |
| `submit.ts` | `confirm.ts` | exact phrase and timing checks | ✓ WIRED | GSD key-link query verified; only one redeem construction exists. |
| `reduce.ts` | `submit.ts` | guarded modes before normal grammar | ✓ WIRED | GSD key-link query verified. |
| `dev/mock-server/src/run-real.ts` | `dialogue-runner.ts` | server handler injection | ✓ WIRED | GSD key-link query verified. |
| `dialogue-runner.ts` | reducer | serialized `reduce(state, event, { form, now })` path | ✓ WIRED | GSD key-link query verified; effects dispatch back to page and voice socket. |
| `dev/mock-server/package.json` | `reset.ts` | workspace `reset` script | ✓ WIRED | GSD key-link query verified. |
| `run-real.ts` | `.demo-pid` | owned PID record at startup and cleanup | ✓ WIRED | GSD key-link query verified; reset validates identity before stopping a process. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| Generated survey model | `FormModel.fields/actions` | Voice snapshot parsed and passed to core baseline builder | Yes; output is schema-validated and generator rerun had no diff per supplied verification evidence. | ✓ FLOWING |
| Live form dialogue | runner `form` / reducer context | Chrome content script snapshots live DOM; extension bridge sends snapshot to server | Yes; user exercised the installed local bridge; integration test exercises the runner with fake extension. | ✓ FLOWING |
| Fill echo | `act.result.observedValue` | Value read from target DOM after fill/select | Yes; content script returns actual DOM value, reducer echo uses that event value, and e2e test compares them. | ✓ FLOWING |
| Confirmation banner | banner model `text` | Server `confirm.armed` phrase | Yes; model renders the server-supplied phrase through `textContent`; user saw the live banner. | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Exact phrase rejected while speech is outstanding and opens at the 1000 ms boundary | `npx.cmd vitest run packages/dialogue/src/confirm.invariant.test.ts -t "refuses at 999 ms and redeems at 1000 ms"` | 1 named test passed | ✓ PASS |
| 500 seeded walks preserve confirm invariants | `npx.cmd vitest run packages/dialogue/src/confirm.invariant.test.ts -t "preserves the gate invariants across 500 seeded 60-step walks"` | 1 named test passed | ✓ PASS |
| Live runner read/fill/read-back path and no-click gate | `npx.cmd vitest run dev/mock-server/src/dialogue-runner.test.ts -t "reads, fills from observed page values, gates submission, and never sends a click"` | 1 named test passed | ✓ PASS |
| Reset lifecycle and safe browser launch | `npx.cmd vitest run dev/mock-server/src/reset.test.ts -t "restores the profile, replaces the previous stack, waits for readiness, then opens Chrome safely"` | 1 named test passed | ✓ PASS |
| Banner safe rendering | `npx.cmd vitest run apps/voice/src/banner.test.ts -t "renders one textContent-only blocked child and leaves the hidden slot empty"` | 1 named test passed | ✓ PASS |
| Field reading and options | `npx.cmd vitest run packages/dialogue/src/read.test.ts -t "dialogue read and option picks"` | 16 tests passed | ✓ PASS |
| Repository typecheck | `npm.cmd run typecheck` | TypeScript exited 0 | ✓ PASS |
| Full suite | Reported run: `npm.cmd test` | 57 files / 769 tests passed, supplied as latest I2 verification evidence | ✓ PASS (reported) |

### Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` files were found. Phase 2 is not a migration/probe phase; probe execution is not applicable.

### Requirements Coverage

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| DLG-02 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Page-ordered read speech, required status, and human-run form reading. |
| DLG-03 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Named/current fill and page-observed echo tests plus human live bridge run. |
| DLG-07 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Numbered select/radio options; pick-by-number/name tests and human confirmation. |
| DLG-08 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Full read-back, missing required fields, and sensitive masking tests/human run. |
| DLG-09 | Voice REQUIREMENTS.md, Phase 2 plans | SATISFIED | Exact phrase, bare-yes refusal, tracked read-back, one-use core redemption, and result read-back passed integrated E2E. |
| VIS-02 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Banner model/render/socket wiring tests and human check. |
| DEMO-01 | Voice REQUIREMENTS.md, Phase 2 plans | ✓ SATISFIED | Local broken survey, six-control model, generated fixture, and human reset launch. |
| DEMO-02 | Voice REQUIREMENTS.md, Phase 2 plan 07 | ✓ SATISFIED | Fictional template, reset script and launch wiring, lifecycle tests, user-confirmed reset. |

All eight requested IDs appear in the Phase 2 plan set; no additional voice-owned Phase 2 requirement is orphaned. The master requirements tracker still reflects the core/voice workstream split, while the voice requirement detail is the source used here.

### Test Quality Audit

Requirement-linked tests are active; the targeted test files contain no skipped or todo cases. Expected values are asserted against fixtures or explicit safety contracts, not generated from the system under test. The generated-model test validates builder output and is distinct from the generator's output-writing command. No circular test pattern was found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| — | — | None in scanned Phase 2 implementation files | — | Standalone createStubGate remains an explicit fail-closed mock; the production path uses the integrated server-owned Gate/Executor adapter. |

### Integration Verification

The previously pending HO-8 flow now passes in an isolated browser profile using the production extension, the dialogue reducer, the core grant-bound Gate/Executor, and a local synthetic page. The harness sends synthetic voice-protocol utterances (not microphone audio): it verifies tracked uninterrupted read-back, bare-yes refusal, the exact submit survey phrase, one submit, and the page confirmation result. No public URL was available or used.

### Gaps Summary

The Phase 2 voice UI, broken form, reset, read/fill/read-back flow, exact-phrase reducer guard, BLOCKED banner, and runner are integrated and verified. HO-8 now connects redemption to core-owned one-use grants and the Executor; focused adapter tests and the production-extension browser E2E cover the successful result and invalidation paths. The re-verification passes; microphone/STT hardware and a public form were outside this local test.

---

_Verified: 2026-10-17T22:12:21Z_
_Verifier: automated integration re-verification_
