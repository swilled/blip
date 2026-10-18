---
phase: 03-gated-submit-and-result-reading
verified: 2026-10-18T02:14:38Z
status: passed
score: 5/5 must-haves verified
re_verification: true
re_verification_note: "The first-party voice UI confirm.redeem path now reconciles the DialogueRunner after core execution; a production browser E2E confirms one submit and a normal follow-up turn."
---

# Phase 3: Gated Submit and Result Reading Verification Report

**Phase Goal:** Nothing irreversible can happen on a page except through the single Executor, after a full read-back and the exact spoken phrase from the user's voice channel, and afterwards the user hears what the page actually said.
**Verified:** 2026-10-18T02:14:38Z
**Status:** passed
**Re-verification:** Yes — first-party voice UI redemption handoff and post-submit continuation

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Gated actions pass through one server Executor and an independent live extension check; attempts are audited without page text or values. | ✓ VERIFIED | `apps/server/src/turn.ts` routes `request_action` and `click_safe` into `executeGatedAction`; `apps/server/src/act/gated.ts` consumes the grant before its only `act.request`, emits bounded audit fields on refusal/success, and never audits labels, values, URL, transcript, or phrase. `apps/extension/src/background/acts.ts` and `apps/extension/src/content/act.ts` independently check the gate and current kind. Server gate-flow tests and Plan 03-06 browser evidence cover refusal, successful dispatch, and log privacy. |
| 2 | With no grant, native `form.submit`, `requestSubmit`, Enter, and a div-button submit route cannot submit. | ✓ VERIFIED | `apps/extension/src/content/submit-method-guard-main.ts` installs the immutable native-method no-op at document start. `apps/extension/src/content/submit-guard.ts` keeps a window capture listener default-deny. `apps/extension/manifest.template.json` loads both guards at `document_start`; the existing `content.js` stays at `document_idle`. Plan 03-06's matched no-extension baseline proved valid routes reach the sink, and the extension-enabled run proved all listed routes produce no page submit event or sink navigation before an act/grant. |
| 3 | A grant is single-use, expires after 30 seconds, and binds target, kind, exact URL, snapshot version, and field state; stale or changed state requires a new read-back. | ✓ VERIFIED | `apps/server/src/act/grants.ts` fingerprints the required binding, uses sensitive-field presence only, checks the 30-second expiry, and deletes a grant before checking/returning from consume. `Session.applySnapshot` invalidates pending state on page/action/version changes; `acceptConfirmation` obtains a fresh snapshot and checks field fingerprint before dispatch. Focused grant/gated-flow tests and the browser mutation/retry scenario are recorded in the summaries. |
| 4 | Only the exact per-kind phrase from the voice-role path, after matching uninterrupted speech completion and the one-second cooldown, can consume the grant. | ✓ VERIFIED | `packages/policy/src/confirmation.ts` defines the five fixed phrases and exact normalized matching. `apps/server/src/server.ts` routes `speak.done` through the gated completion handler; `apps/server/src/act/gated.ts` binds the pending `speakId`, rejects interruption/early or wrong phrases, waits 1,000 ms, and consumes before dispatch. Hub role routing keeps utterances on the voice role. Plan 03-06 exercised the typed voice-socket stand-in, including bare “yes”, early phrase, and changed-value refusal. |
| 5 | After a gated action, speech reflects fresh page evidence; current field/page errors are labeled and repeatable, and unsupported success remains unverified. | ✓ VERIFIED | `apps/server/src/session/refresh.ts` returns the exact accepted snapshot. `apps/server/src/results/interpret.ts` requires the snapshot/model identity to match and uses bounded heading/status/alert evidence; it reports ordered field errors and distinct page errors. `apps/server/src/turn.ts` routes the exact “what went wrong” command through a fresh read. Plan 03-06 observed labeled validation and explicit `GH-2048` confirmation in Chromium. |

**Score:** 5/5 roadmap success criteria verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/policy/src/confirmation.ts` | Fixed phrase table and exact matcher | ✓ VERIFIED | Substantive browser-safe implementation; used by the server Executor. |
| `apps/server/src/act/grants.ts` | Hashed, expiring, atomic one-use grant store | ✓ VERIFIED | Node crypto remains server-only; sensitive values are excluded from fingerprints. |
| `apps/server/src/act/gated.ts`, `apps/server/src/session/session.ts` | Single gated Executor and pending confirmation lifecycle | ✓ VERIFIED | Fresh read-back, voice completion/cooldown, invalidation, atomic consume, one dispatch, refusal, audit, and result handoff are wired. |
| `apps/extension/src/content/submit-method-guard-main.ts`, `apps/extension/src/content/submit-guard.ts` | Persistent direct-submit and event barriers | ✓ VERIFIED | Immutable MAIN-world no-op plus persistent isolated-world default-deny listener and exact one-event allowance. |
| `apps/extension/src/background/submit-method-guard.ts`, `apps/extension/src/background/acts.ts`, `apps/extension/src/content/act.ts` | Frame preflight and independent live gate checks | ✓ VERIFIED | Exact-frame verifier fails closed; background and content both reclassify/check gated requests. |
| `apps/server/src/results/interpret.ts`, `apps/server/src/session/refresh.ts` | Evidence-only result interpretation over accepted fresh data | ✓ VERIFIED | Snapshot identity is checked; action result, title, URL, and absence of errors cannot alone claim success. |
| `apps/server/src/turn.ts`, `apps/server/src/brain/grammar.ts` | Deterministic action/error command routing | ✓ VERIFIED | Gated intents enter the Executor; “what went wrong” is an exact local command. |
| `apps/extension/test/e2e/submit-method-guard.e2e.test.ts`, `apps/extension/test/e2e/gated-flow.e2e.test.ts` | Real browser bypass and gated-flow proofs | ✓ VERIFIED | Tests contain matched baseline, pre-grant bypass routes, refusal/retry, validation, privacy, and explicit-result assertions. |
| `tools/test-pages/public/submit-bypass.html`, `submit-sink.html`, `gated-form.html` | Local fixtures for submit and result evidence | ✓ VERIFIED | Fixtures exercise native event routes, validation errors, and explicit confirmation status. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/server/src/turn.ts` | `apps/server/src/act/gated.ts` | `request_action` / `click_safe` routing | ✓ WIRED | Both routes dispatch to the same Executor; tests cover model-produced gated `click_safe`. |
| `apps/server/src/server.ts` | `apps/server/src/act/gated.ts` | voice-role `speak.done` and utterance handling | ✓ WIRED | Matching non-interrupted completion is tied to the pending read-back speak id. |
| `apps/server/src/act/gated.ts` | `apps/server/src/act/grants.ts` | arm and consume | ✓ WIRED | Grant binding is checked after fresh snapshot and consumed before the extension request. |
| `apps/server/src/act/gated.ts` | extension `act.request` | single dispatch with `{grantId, kind}` | ✓ WIRED | One dispatch path; failures clear pending state and are not retried. |
| `apps/extension/src/background/acts.ts` | `apps/extension/src/content/act.ts` | resolved-frame act dispatch | ✓ WIRED | Current snapshot/target checks precede forwarding; returned values are sanitized and recaptured. |
| `apps/extension/src/content/act.ts` | `apps/extension/src/content/submit-guard.ts` | exact form/submitter allowance | ✓ WIRED | Only a granted gated submit-control click can allow one matching event synchronously. |
| `apps/server/src/act/gated.ts` | `apps/server/src/results/interpret.ts` | post-act accepted snapshot | ✓ WIRED | One refresh returns the accepted snapshot and matching current model to the interpreter. |
| `apps/server/src/brain/grammar.ts` | `apps/server/src/turn.ts` | exact `what_went_wrong` command | ✓ WIRED | Command forces a current snapshot and speaks current detected errors. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `apps/server/src/results/interpret.ts` | `Snapshot` and `FormModel` | Extension snapshot accepted by `Session.applySnapshot`; baseline model built from that snapshot | Yes; `Refresher` returns the exact accepted snapshot and the interpreter checks version, structural hash, and URL | ✓ FLOWING |
| `apps/server/src/act/gated.ts` | Field read-back and pending binding | Fresh current `FormModel` from the extension snapshot | Yes; document-ordered DOM values, required-empty state, and sensitive presence only | ✓ FLOWING |

### Behavioral Spot-Checks

Evidence below is from the recorded executions in the six plan summaries, which were treated as available for this audit. No browser or test suite was launched again.

| Behavior | Command | Result | Status |
|---|---|---|---|
| Native submit barriers and complete gated browser flow | `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e --no-file-parallelism` | 12 files passed; 22 passed, 1 skipped. The optional long E2E was then run separately and passed 1/1. | ✓ PASS |
| Gated submit, refusal recovery, and page-evidence result | `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/gated-flow.e2e.test.ts --no-file-parallelism` | 1/1 passed after type/assertion fixes; two authorized submits produced labeled error evidence and explicit `GH-2048` success. | ✓ PASS |
| Full repository tests | `npm test` | 66 files passed, 12 skipped; 721 passed, 21 skipped. | ✓ PASS |
| Full extension tests | `npx vitest run apps/extension/test --no-file-parallelism` | 28 files passed, 12 browser-gated files skipped; 133 passed, 21 skipped. | ✓ PASS |
| Builds and types | `npm run pages:build`; `npm run ext:build`; `npm run ext:typecheck`; `npm run typecheck` | All passed. | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| GATE-01 | 03-02, 03-04, 03-06 | One Executor and valid-grant-only gated actions, with independent extension checks and audit | ✓ SATISFIED | Server grant/dispatch path, extension rechecks, audit tests, and real gated browser flow. |
| GATE-02 | 03-03, 03-04, 03-06 | No-grant submit bypasses are blocked for the document lifetime | ✓ SATISFIED | Persistent MAIN method guard, isolated event guard, manifest timing, matched Chromium baseline/proof. |
| GATE-03 | 03-01, 03-02, 03-06 | Single-use, 30-second, target/kind/URL/version-bound grant | ✓ SATISFIED | Server grant store and focused expiry/binding/one-use tests. |
| GATE-04 | 03-01, 03-02, 03-06 | Field changes after read-back void confirmation | ✓ SATISFIED | Ordered field-state fingerprint; browser mutation caused refusal and required a fresh read-back. |
| GATE-05 | 03-01, 03-02, 03-06 | Model cannot approve; only exact code-matched voice-role phrase confirms | ✓ SATISFIED | No confirm Intent, fixed phrase matcher, Hub role separation, server routing and fake-brain adversarial tests. |
| GATE-08 | 03-02, 03-06 | Outstanding speech and one-second post-speech window cannot confirm | ✓ SATISFIED | Matching speak-id/interruption/cooldown implementation and browser early-phrase refusal. |
| RES-01 | 03-05, 03-06 | Fresh page evidence reports confirmation or errors without invented success | ✓ SATISFIED | Evidence-only classifier, accepted snapshot handoff, browser validation/success results. |
| RES-02 | 03-05, 03-06 | “What went wrong” repeats current labeled errors | ✓ SATISFIED | Exact grammar command and forced refresh; browser test repeats current field and page errors. |

No additional Phase 3 requirements are mapped to this phase in `REQUIREMENTS.md`.

### First-party voice UI handoff re-verification (2026-10-18)

The browser voice UI sends `confirm.redeem` after its own exact-phrase match. The DialogueRunner now validates the frame's grant and read-back IDs, routes the phrase through its armed reducer and the core GatePort, and clears its reducer state after a rejected early/mismatched UI confirmation. This closes the stale `awaiting-confirm` state found during the Core milestone integration audit.

- `BLIP_E2E_BROWSER=1 BLIP_BROWSER=<Edge executable> npx vitest run apps/extension/test/e2e/demo-form.e2e.test.ts --maxWorkers=1 -t "reconciles the browser UI redemption"` — **1 passed**. It used the production first-party voice page and extension, completed exactly one local survey submit, then asked “what's here” and received the normal current-page answer.
- `npx vitest run apps/server/test/dialogue-core-gate-port.test.ts apps/server/test/dialogue-runner-server.test.ts --maxWorkers=1` — **10 passed**, including early confirmation refusal/clearing and single-use dispatch.
- `npm test` — **114 files passed, 16 skipped; 1,197 tests passed, 28 skipped**.
- Root and extension typechecks passed; extension, test-page, and voice production builds passed.

The canonical supported connected launch path is `npm run demo -- --brain=fake` for I2 and `npm run demo -- --brain=agy` for I3. The dev REPL and legacy `npm start` entrypoints serve different development paths and are not equivalent connected-gate launchers.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No placeholder/TODO-only implementation found in audited runtime or E2E artifacts. | ℹ️ Info | `return null` hits are intentional fail-closed matcher, probe, or error-formatting paths; they do not leave a goal behavior stubbed. |

### Human Verification Required

None for the Core Phase 3 contract. The browser harness uses the documented Core stand-in: typed utterances on the voice-role socket and controlled `speak.done`. This verifies server authorization and extension behavior, but does not claim acoustic microphone or TTS quality; those are owned by the Voice workstream.

### Gaps Summary

No Core Phase 3 goal gaps found. All five roadmap success criteria and all eight mapped requirements have implementation and test evidence. The known extension workspace test-wrapper current-directory issue is documented in `deferred-items.md`; the full extension suite and build test passed when invoked from repository root, so it does not block this phase.

---

_Re-verified: 2026-10-18T02:14:38Z_
_Verifier: Codex (goal-backward phase audit)_
