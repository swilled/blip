---
phase: 04-nvda-mode-and-demo-safe
verified: 2026-10-18T07:05:03Z
status: human_needed
score: 1/5 must-haves verified
covered_files:
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-01-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-01-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-02-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-02-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-03-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-03-SUMMARY.md
  - apps/voice/src/main.ts
  - apps/voice/src/output-mode.test.ts
  - apps/voice/src/output-mode.ts
  - apps/voice/src/styles.css
  - fixtures/forms/offline/public-form.html
covered_digest: "v3:sha256:8de891eb6ee72b44ae68a6b9b4bcfb7ed4d0acee7135660a83d3c2379324b808"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 0/5
  gaps_closed:
    - "VOX-07 rate changes: user reports faster/slower speech works."
    - "Microsoft Forms required-field identification: the five expected fields matched and optional questions were excluded."
  gaps_remaining:
    - "VOX-08 NVDA completion/cancellation or D-16 fallback disposition."
    - "DEMO-03 live negative validation and three consecutive page-observed submissions."
    - "DEMO-04 fallback, hotspot, recorder, video, and freeze review."
  regressions: []
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: "On the demo workstation with the form tab focused, verify NVDA output completion/cancellation against exactly one matching speakId, or make and record the D-16 agent-voice-main-demo/NVDA-opening-hook fallback decision."
    expected: "Either actual NVDA speech is exclusive and completion/cancellation resolves its matching speakId exactly once, or the team records acceptance of the documented D-16 fallback while VOX-08 remains human-needed."
    why_human: "The installed controller exposes no safe completion signal and code deliberately refuses NVDA dispatch; only workstation observation and a human fallback decision can close this acceptance item."
  - test: "On the supplied live Microsoft Form, perform the missing-required-field validation attempt, then three consecutive reset-and-submit runs using fictional values and the distinct phrase."
    expected: "Errors are tied to observed field labels with no success claim; each successful run speaks only page-observed confirmation data, and any interruption resets the consecutive-run count."
    why_human: "No Phase 4 live validation or submissions were performed. The offline practice page and earlier synthetic result cannot prove the live form flow."
  - test: "Rehearse the fallback sequence: one clear STT miss and typed retry, one hotspot attempt, explicit offline disclosure, and a recorder test that is reopened and reviewed."
    expected: "Typed input uses the same command pipeline; hotspot outcome is recorded; offline use is disclosed and sends no live response; the sample recording reopens with understandable audio."
    why_human: "STT, venue networking, actual fallback disclosure, and recorder operation depend on the demo workstation and venue. The runbook evidence fields remain pending."
  - test: "Record and review an uninterrupted three-minute local demo video, then conduct the freeze review."
    expected: "The recording uses fictional values, contains no personal information, is stored outside the repository, and the reviewer records acceptance before creating the demo-safe tag."
    why_human: "The runbook records the video and freeze review as pending; neither has been observed."
---

# Phase 4: NVDA Mode and Demo-Safe Verification Report

**Phase Goal:** As a demo presenter, I want to complete the public-form demo with accessible speech and rehearsed fallbacks, so that the team can deliver a reliable demonstration.
**Verified:** 2026-10-18T07:05:03Z
**Status:** human_needed
**Re-verification:** Yes — refreshed after code-review remediation commit `d65653e`.

## User Flow Coverage

The phase is in MVP mode. Its user-story outcome is that the team can deliver a reliable public-form demonstration with accessible speech and rehearsed fallbacks. The implementation and automated checks cover preparation and local behavior. The user reports working microphone input and audible rate changes, and confirmed the Microsoft required-field list on the updated build; the remaining live/device acceptance steps below have not been performed.

| Step | Expected | Evidence | Status |
|---|---|---|---|
| Start the demo and select speech mode | The voice window opens with labeled, keyboard-operable output and rate controls. | `apps/voice/index.html`, `apps/voice/src/main.ts`; user reports microphone input and faster/slower operation work. Detailed timing traces were not retained. | Partial: reported working; NVDA and quantitative rate checks remain open. |
| Complete the real form | Describe, fill, read back, state the distinct phrase, and hear the live page's result. | User confirmed the updated build lists the five current required fields correctly; negative validation and three live runs remain pending in `04-DEMO-RUNBOOK.md`. | Partial: required-field identification passed; full real-form acceptance pending. |
| Use speech and network fallbacks | Retry a clear STT miss through typed input; try hotspot once, then disclose local offline use if needed. | Typed input shares the command pipeline; `fixtures/forms/offline/manifest.json` maps local routes and the offline page is tested as local-only. | Human needed: STT, hotspot, and disclosure rehearsal pending. |
| Capture and approve the demo | Record an uninterrupted three-minute walkthrough, review the evidence, then accept the freeze. | Runbook specifies local storage outside the repository and keeps the video and freeze/tag entries pending. | Human needed. |
| Reach the outcome | The team can deliver a reliable demonstration with accessible speech and rehearsed fallbacks. | The offline fallback assets and runbook exist, but NVDA completion/cancellation, full live-form acceptance, venue/recorder rehearsal, and video evidence remain absent. | Human needed; outcome not yet demonstrated. |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | In screen-reader mode, NVDA speaks replies exclusively and switching back restores Blip voice. | HUMAN NEEDED | The controller has no safe completion signal; `speech-routing.ts` deliberately returns unavailable before dispatch. The UI returns to agent voice. Resolve the workstation acceptance by exact speakId observation or the documented D-16 fallback decision. |
| 2 | Faster/slower audibly changes Blip's rate for the session. | USER-REPORTED PASS | The user reports speed changes work; earlier device feedback said the second slower confirmation was clearly slower. No three-level timing trace was retained, so the Plan 04-08 quantitative comparison remains unverified. |
| 3 | The team-owned live form completes three consecutive user-led runs with only page-observed results spoken. | HUMAN NEEDED | The runbook has reset, negative-validation, and three-run steps, but all Phase 4 live evidence entries remain pending. |
| 4 | At freeze, a tested fallback kit and rehearsed plan-B script are ready. | HUMAN NEEDED | Offline routes are implemented and tested; hotspot, actual fallback rehearsal, recorder, freeze acceptance, and tag remain pending. |
| 5 | A backup video of the full three-minute demo is recorded. | HUMAN NEEDED | The runbook requires a local recording outside the repository; no recording path or review evidence is recorded. |

**Score:** 1/5 roadmap truths verified. The rate-change truth is supported by the user's direct device report. The NVDA, three-run public form, fallback/freeze, and backup video truths remain open.

### Plan Must-Have Detail

Plan-specific implementation checks were also traced so their passing code paths are not confused with completion of the broader roadmap outcomes.

| Plan | Detail checked | Status | Evidence |
|---|---|---|---|
| 04-01 | Session-only agent-voice default and exclusive labeled mode control | VERIFIED (source/test) | `output-mode.ts`, `main.ts`, `index.html`; focused mode tests. |
| 04-01 | Cancel old output before a mode change and keep only one route active | VERIFIED (source/test) | Output-mode controller ordering and regression tests; latest review remediation also guards local rate acknowledgements by selected mode. |
| 04-01 | Complete NVDA speech/cancellation against matching speakId only on a safe signal | HUMAN NEEDED | Successful NVDA completion is not implemented because the available DLL has no safe signal. No false completion is emitted; decide exact device path or D-16 fallback. |
| 04-01 | Unavailable NVDA announces once and returns to agent voice | VERIFIED (source/test) | Server routing emits unavailable; mode controller fallback is exercised by tests. |
| 04-02 | Exact faster/slower commands adjust session rate by 0.1 within 0.8–1.5 | VERIFIED (source/test) | `speech-rate.ts` and focused rate/command tests. |
| 04-02 | New utterances and acknowledgement use the new rate without restarting active speech | VERIFIED (source/test) | TTS captures rate at utterance start; focused queue/command tests; latest review fix makes acknowledgement mode-aware. |
| 04-02 | Limit attempts remain bounded and acknowledge the limit | VERIFIED (source/test) | Pure rate helper tests cover both boundaries. |
| 04-02 | Rate is session-local and does not change NVDA's rate | VERIFIED (source) | In-memory voice-window state and no NVDA rate-setting operation. |
| 04-03 | Three live runs and truthful page-observed results | HUMAN NEEDED | No live run or validation evidence in the runbook ledger. |
| 04-03 | Live validation errors and missing fields are reported truthfully | HUMAN NEEDED | The runbook specifies this sequence; no live form result was observed. |
| 04-03 | Offline counterparts are local, disclosed, and cannot submit to the live form | VERIFIED (source/test) | Manifest and self-contained page; serving tests assert local route, no remote assets, and no live submission path. |
| 04-03 | Fallback rehearsal covers typed input, hotspot, offline copy, recorder, and video | HUMAN NEEDED | Procedures are documented; physical/network/recording execution remains pending. |
| 04-03 | NVDA either resolves exact speakIds or D-16 fallback is accepted and recorded | HUMAN NEEDED | The fallback is documented, but no workstation test or human acceptance decision has been recorded. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/server/src/voice/nvda.ts` | Native speech adapter that does not equate DLL dispatch return with completion | VERIFIED | Substantive fail-closed adapter; no safe callback exists in the current controller path. |
| `apps/server/src/voice/speech-routing.ts` | Select screen-reader handling only when it can safely satisfy completion | VERIFIED | Returns `nvda-unavailable` when completion is unavailable; no fabricated `speak.done`. |
| `apps/voice/src/socket.ts` | Existing protocol settings sender | VERIFIED | Existing `SettingsPayload` carries session mode. |
| `apps/voice/index.html`, `apps/voice/src/main.ts`, `apps/voice/src/output-mode.ts` | Accessible session mode and rate controls wired to live UI behavior | VERIFIED | Native labeled controls; mode state rendered; output-mode and rate behavior tests included in focused run. |
| `apps/voice/src/speech-rate.ts`, `apps/voice/src/tts.ts` | Bounded session rate applied to future browser utterances | VERIFIED | Rate captured at queue start; active item is retained. |
| `apps/voice/src/styles.css` | Responsive compact layout and usable controls | VERIFIED (source) | Commit `d65653e` adds responsive compact/viewport behavior. Visual/zoom review remains human acceptance. |
| `fixtures/forms/offline/manifest.json`, `fixtures/forms/offline/public-form.html` | Local offline counterpart and route inventory | VERIFIED | Self-contained, labeled offline form; tests check local serving and no live submission path. Offline use remains a disclosed fallback. |
| `04-DEMO-RUNBOOK.md` | Live sequence, fallback steps, evidence ledger, and freeze instructions | VERIFIED as preparation | Required steps exist; live, venue, recorder, video, and freeze evidence is explicitly pending. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/voice/src/main.ts` | `apps/voice/src/socket.ts` | Mode selection sends existing `SettingsPayload` | WIRED | Plan query found `sendSettings`; mode controller is called from the UI. |
| `apps/server/src/server.ts` | `apps/server/src/voice/speech-routing.ts` and `nvda.ts` | Session settings select speech handling | WIRED for safe fallback | Server stores the mode and consults routing; unsupported NVDA completion returns unavailable. |
| `apps/server/src/voice/nvda.ts` | GATE-08 `speakId` completion | Audible completion/cancellation resolves matching id | HUMAN NEEDED / unavailable | Plan query finds no `speakId` in the adapter. The absent safe signal is the reason the route fails closed; exact workstation completion or D-16 fallback remains pending. |
| `apps/voice/src/main.ts` | `apps/voice/src/speech-rate.ts` | Exact local commands and buttons update session rate | WIRED | Plan query found `adjustSpeechRate`; local typed and voice paths share the handler. |
| `apps/voice/src/speech-rate.ts` | `apps/voice/src/tts.ts` | Future queued utterances capture updated rate | WIRED | Plan query found rate-provider wiring; queue tests verify capture without restart. |
| `fixtures/forms/offline/manifest.json` | `dev/mock-server` static fixtures route | Offline route resolves locally | WIRED | Plan query found local fixture route; serving test checks manifest routes. |
| Core observed result | Voice speech route | Server speech message carries page-observed response | WIRED locally; live path pending | The local server/client speech contract is present; no Phase 4 public-form result has been observed. The plan's conceptual `from` entry is not a relative file, so its automated link query is not authoritative. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| Offline practice result | Required-field values and local result text | User-entered values in `public-form.html` and local required-field check | Yes, local practice only | FLOWING locally; tested serving and no live submission. |
| Demo route inventory | Offline URLs and file paths | `manifest.json` consumed by local static fixture serving | Yes | FLOWING; route checks are part of `run-real.test.ts`. |
| Speech rate | Current session rate | Exact voice/typed command or labeled button updates in-memory state; TTS reads it at utterance start | Yes | FLOWING in source/tests; audible effect pending. |
| Live form result | Confirmation or field errors | Live Microsoft Forms page through core RES-01 observation | Not observed in this phase | HUMAN NEEDED; no live page result may be inferred from offline or synthetic data. |

### Behavioral Spot-Checks

| Behavior | Command/evidence | Result | Status |
|---|---|---|---|
| Full workspace regression | `npm.cmd test` | 127 files passed, 16 skipped; 1,316 tests passed, 28 skipped | PASS |
| TypeScript validation | `npm.cmd run typecheck` and `npm.cmd run typecheck --workspace @blip/extension` | Both passed | PASS |
| Current voice and extension builds | `npm.cmd run build --workspace @blip/voice`; `npm.cmd run build --workspace @blip/extension` | Both passed | PASS |
| Microsoft Forms required-field recognition | User recheck on build `67114f9-dirty-2026-10-18T07:00:58.786Z` | Exactly Employment type, Department, Leave type, Leave date, Return date; optional questions excluded | PASS (user report) |
| Live NVDA, form validation/submissions, venue, recorder, and video outcomes | Runbook evidence ledger | Not run or not recorded; remain pending | HUMAN NEEDED |

These automated commands were run during this execution. Device and live-service evidence is explicitly attributed to the user's report; no public-form submission is claimed.

### Probe Execution

Not applicable. Phase 4 is not a migration/tooling phase and declares no probe script.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|---|---|---|---|---|
| VOX-07 | 04-02 | Faster/slower changes Blip's rate | User-verified | User reports rate changes work; detailed three-level timing trace remains a Plan 04-08 evidence gap. |
| VOX-08 | 04-01, 04-03 | NVDA output without double speech | Human needed | Safe route intentionally unavailable without completion signal; verify exact speakId or accept D-16 fallback. |
| DEMO-03 | 04-03 | Complete a real public form end to end by voice | Human needed | Negative validation and three consecutive page-observed live runs remain pending. |
| DEMO-04 | 04-03 | Offline copies, hotspot plan, backup video, rehearsed fallback | Partially prepared; human needed | Local pages and runbook exist; hotspot, rehearsal, recorder, video, and freeze evidence remain pending. |

No later phase in the Voice roadmap explicitly owns these checks. No Phase 4 requirement is orphaned from the three plans.

### Decision Coverage

All 16 trackable CONTEXT.md decisions are honored by shipped artifacts. This non-blocking result does not change the human-needed status.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `apps/server/src/voice/nvda.ts` | 26, 37 | `return null` on unavailable native adapter | Info | Intentional fail-closed availability path, not a stub; prevents treating a missing DLL/callback as successful speech. |

No unreferenced TBD/FIXME/XXX debt markers or placeholder implementations were found in the inspected implementation and requirement-linked tests. The relevant mode/rate/offline tests are active; tests exercise local state, routing, and fixture behavior, not real audio or live form outcomes.

### Human Verification Required

1. **NVDA or D-16:** On the workstation with the form tab focused, check exclusive NVDA output, completion/cancellation, and exactly one matching `speakId`; otherwise record human acceptance of agent voice for the main demo and NVDA for the opening hook, leaving VOX-08 human-needed.
2. **Live Microsoft Form:** Perform one negative-validation attempt, then three consecutive reset runs with fictional values and the distinct phrase. Record only page-observed errors/confirmation; synthetic local results do not count. Required-field identification itself passed on the updated build; this does not replace validation or submissions.
3. **Fallback rehearsal:** Cause one STT miss and type through the same pipeline; make exactly one hotspot attempt; disclose offline use; test and reopen the recorder sample. Record the outcomes.
4. **Video and freeze:** Record/review the uninterrupted three-minute local video, store it outside the repository, then review all acceptance evidence before creating the `demo-safe` tag.
5. **Repair measurement record:** If the detailed Plan 04-08 timing threshold is retained, capture one fixed phrase at slow/default/fast and record three native duration samples per level. Current user report confirms audible rate changes, but no quantitative trace was retained.

### Gaps Summary

No implementation blocker was found in the locally verifiable preparation. The rate controller and queue, mode-aware live region and acknowledgements, responsive layout, 48 px offline controls, local fallback routes, and runbook are present. Automated checks passed. The user reports working microphone input and audible rate changes; the updated Microsoft Form's five required labels were confirmed. The phase outcome remains open because NVDA disposition, live validation and three submissions, venue/fallback rehearsal, recorder, video, and freeze review remain pending. Quantitative rate timings were not captured. Do not claim VOX-08, DEMO-03, or DEMO-04 complete and do not create the `demo-safe` tag before evidence review.

---

_Verified: 2026-10-18T03:40:26Z_  
_Verifier: the agent (gsd-verifier)_
