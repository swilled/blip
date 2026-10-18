---
phase: 04-nvda-mode-and-demo-safe
verified: 2026-10-18T07:55:43Z
status: gaps_found
score: 1/5 must-haves verified
covered_files:
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-01-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-01-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-02-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-02-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-03-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-03-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-04-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-04-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-05-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-05-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-06-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-06-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-07-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-07-SUMMARY.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-08-PLAN.md
  - .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-08-SUMMARY.md
  - apps/server/src/main.ts
  - apps/server/src/server.ts
  - apps/server/src/session/refresh.ts
  - apps/server/src/session/session.ts
  - apps/server/src/voice/dialogue-runner.ts
  - apps/server/src/voice/nvda.test.ts
  - apps/server/src/voice/nvda.ts
  - apps/server/src/voice/ptt-hook.test.ts
  - apps/server/src/voice/ptt-state.test.ts
  - apps/server/src/voice/ptt-state.ts
  - apps/server/src/voice/speech-routing.ts
  - apps/server/test/dialogue-core-gate-port.test.ts
  - apps/server/test/dialogue-runner-server.test.ts
  - apps/server/test/refresh.test.ts
  - apps/server/test/static.test.ts
  - apps/voice/index.html
  - apps/voice/src/hold-client.test.ts
  - apps/voice/src/hold-client.ts
  - apps/voice/src/main.ts
  - apps/voice/src/native-synth.test.ts
  - apps/voice/src/native-synth.ts
  - apps/voice/src/output-mode.test.ts
  - apps/voice/src/output-mode.ts
  - apps/voice/src/socket.test.ts
  - apps/voice/src/socket.ts
  - apps/voice/src/speak-bridge.ts
  - apps/voice/src/speech-diagnostics.test.ts
  - apps/voice/src/speech-diagnostics.ts
  - apps/voice/src/speech-rate-command.test.ts
  - apps/voice/src/speech-rate.test.ts
  - apps/voice/src/speech-rate.ts
  - apps/voice/src/state.test.ts
  - apps/voice/src/state.ts
  - apps/voice/src/stt.test.ts
  - apps/voice/src/stt.ts
  - apps/voice/src/styles.css
  - apps/voice/src/talk-controller.test.ts
  - apps/voice/src/talk-controller.ts
  - apps/voice/src/tts.test.ts
  - apps/voice/src/tts.ts
  - apps/voice/src/ui-log.ts
  - apps/voice/vite.config.ts
  - dev/mock-server/src/demo-runbook.test.ts
  - dev/mock-server/src/run-real.test.ts
  - fixtures/forms/offline/manifest.json
  - fixtures/forms/offline/public-form.html
  - packages/dialogue/src/index.ts
  - packages/dialogue/src/speech-rate.ts
  - packages/dialogue/src/submit.test.ts
  - scripts/demo.test.ts
  - scripts/demo.ts
covered_digest: "v3:sha256:6edb7ddf26ebfa72d2808e0203829061f5cc482b1ba1e494ce57d27173359a9f"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "In screen-reader mode with NVDA running and the form tab focused, Blip replies are spoken exclusively through NVDA and the matching speech item completes safely."
    status: failed
    reason: "The shipped route always returns nvda-unavailable because the controller exposes no safe per-item completion signal. The documented D-16 demo fallback does not implement or satisfy VOX-08."
    artifacts:
      - path: "apps/server/src/voice/speech-routing.ts"
        issue: "routeSpeech returns nvda-unavailable whenever completionSignal is unavailable; the production adapter declares that signal unavailable."
      - path: "apps/server/src/voice/nvda.ts"
        issue: "The adapter only exposes dispatch/cancel return codes and cannot complete an exact speakId from observed audible completion."
    missing:
      - "A safe NVDA completion/cancellation signal correlated to each speakId, with no double speech, or a phase contract change accepted by the developer."
  - truth: "Commands requiring a fresh page snapshot cannot speak or act on stale form data when refresh fails (04-REVIEW CR-01)."
    status: failed
    reason: "CR-01 remains dispositioned open as critical. The utterance handler awaits refreshSnapshot but ignores its boolean result before reducing the utterance. The concrete createRefresher currently marks its session stale on failure, but this caller does not enforce or test that contract; the focused refresh test covers the helper, not the user-command path."
    artifacts:
      - path: "apps/server/src/voice/dialogue-runner.ts"
        issue: "The fresh-read branch discards refreshSnapshot's result and continues into confirmation checks and reducer dispatch."
      - path: ".planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-REVIEW-DISPOSITION.md"
        issue: "CR-01 is still marked open."
    missing:
      - "Fail closed at the command handler when a required refresh returns false, and add an integration regression proving no stale answer or gated action is emitted."
human_verification:
  - test: "On the demo workstation, exercise the screen-reader control with NVDA running and the form tab focused; verify exclusive audible output and matching completion/cancellation for each speakId."
    expected: "Exactly one output route speaks each item; completion/cancellation settles the matching speakId once. If unavailable, retain the D-16 fallback and do not claim VOX-08."
    why_human: "Audibility, focus announcements, and device-level NVDA behavior cannot be established by source inspection. The current software route fails closed before NVDA speech."
  - test: "On the team-owned live form, perform the missing-required-field validation attempt and then three reset-and-submit runs with fictional data and the exact spoken phrase."
    expected: "Errors and confirmation are reported only from the active page; no success is claimed after a phrase or click; all three page-observed results succeed consecutively."
    why_human: "No live validation attempt or public-form submission is recorded; local fixtures do not prove the live service flow."
  - test: "Rehearse one clear STT miss followed by typed input, one phone-hotspot attempt, and disclosed offline continuation; test the recorder and reopen/review its sample."
    expected: "Typed input uses the same command path, hotspot outcome is recorded, offline use is disclosed before continuing, and reopened audio is understandable."
    why_human: "Microphone recognition, venue networking, spoken disclosure, and recorder behavior depend on the actual demo workstation and venue."
  - test: "Record and review an uninterrupted three-minute demo, then conduct the freeze review."
    expected: "Video uses fictional values, contains no personal information, is stored outside the repository, and receives reviewer acceptance before any demo-safe tag is created."
    why_human: "No video or freeze review evidence exists; these are physical and human acceptance steps."
---

# Phase 4: NVDA Mode and Demo-Safe Verification Report

**Phase Goal:** As a demo presenter, I want to complete the public-form demo with accessible speech and rehearsed fallbacks, so that the team can deliver a reliable demonstration.
**Verified:** 2026-10-18T07:55:43Z
**Status:** gaps_found
**Re-verification:** No. The earlier report had no structured `gaps:` section, so this pass re-established the roadmap and plan must-haves. All eight plans and summaries were read.

## User Flow Coverage

The phase is in MVP mode. Its story outcome is that the team can deliver a reliable public-form demonstration with accessible speech and rehearsed fallbacks. Local preparation and rate behavior are present, but the NVDA success criterion is not implemented and the live, venue, recording, and freeze steps remain unperformed.

| Step | Expected | Evidence in codebase | Status |
|---|---|---|---|
| Select accessible speech mode | Use one labeled output route for the session; NVDA speaks and settles its matching item safely. | The UI offers session-scoped modes. `speech-routing.ts` returns `nvda-unavailable` because `nvda.ts` has no safe completion signal. | FAILED — blocker; VOX-08 is not achieved. |
| Adjust Blip's rate | Faster/slower changes the current session rate and later utterances use it. | Preset adjustments and utterance-start rate capture are wired; focused rate and TTS tests pass. The user also reports audible changes. | VERIFIED — user-reported audibility; no quantitative three-level timing trace. |
| Complete the public form | Describe, fill, read back, speak the distinct phrase, and hear page-observed validation/result on three consecutive resets. | The runbook defines this flow and the local observed-result path exists. Live validation and all three live runs remain pending. | HUMAN NEEDED. |
| Use the fallbacks | Retry a clear STT miss by typing; try hotspot; disclose and use local copy; verify recorder. | Offline copy and local route exist; runbook documents each step. Hotspot, typed retry, offline disclosure, and recorder checks remain pending. | HUMAN NEEDED. |
| Record and accept the freeze | Review the full three-minute video and freeze evidence before creating a tag. | The runbook and evidence ledger leave video, review, freeze acceptance, and tag pending. | HUMAN NEEDED. |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | In screen-reader mode, NVDA speaks replies exclusively and the matching speech item completes safely; switching back restores agent voice. | FAILED | `routeSpeech` cannot dispatch NVDA speech without a completion signal; the production adapter reports that signal unavailable. D-16 is a disclosed fallback, not fulfillment of this truth. |
| 2 | Faster/slower audibly changes agent-voice speech rate for the session. | VERIFIED | Preset and queue wiring inspected; named rate-adjustment and next-utterance tests pass. User reports audible rate changes. Quantitative timing remains unrecorded. |
| 3 | The team-owned public form completes three consecutive user-led runs with only page-observed results spoken. | HUMAN NEEDED | The live-form ledger has no negative-validation attempt or completed run. Synthetic local responses do not count. |
| 4 | The tested fallback kit and rehearsed plan-B script are ready at freeze. | HUMAN NEEDED | Offline page and route are present, but hotspot, rehearsal, recorder, and freeze evidence are pending. |
| 5 | A backup video of the full three-minute demo is recorded. | HUMAN NEEDED | No recording path or review evidence is recorded. |

**Score:** 1/5 roadmap truths verified. Two blocking gaps remain; the live and physical acceptance items are retained below as pending.

### Plan Must-Have Detail

Plan-specific detail supplements the roadmap contract and does not reduce it. Plan 04-01 artifacts pass the CLI artifact check, but the NVDA speakId completion link is absent by design because safe completion is unavailable. Plan 04-02 artifacts and links pass; source uses later Windows presets from the repair plan rather than the original 0.8–1.5 numeric range. Plans 04-03 through 04-08 contain substantial local assets and repair code; their physical acceptance steps remain explicitly pending. Automated key-link queries report some source-to-test/document links as unresolved because the plan describes test coverage in prose rather than importing the test; those were checked against the production imports and named test files manually. The substantive unresolved safety connection is CR-01.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/server/src/voice/nvda.ts` | NVDA adapter that never equates dispatch return with audible completion | VERIFIED as fail-closed adapter | Substantive adapter; no safe completion/cancellation callback exists. Its intentional inability to route speech leaves VOX-08 failed. |
| `apps/server/src/voice/speech-routing.ts` | Route selected output safely | VERIFIED as fail-closed routing | Explicitly returns `nvda-unavailable` when completion is unavailable. |
| `apps/voice/src/output-mode.ts`, `apps/voice/index.html`, `apps/voice/src/main.ts` | Accessible session-only, exclusive output choice | VERIFIED in source/tests | Wired through settings; keyboard/assistive-technology device review remains human. |
| `apps/voice/src/speech-rate.ts`, `apps/voice/src/tts.ts` | Session rate presets applied at utterance start | VERIFIED | Source and focused tests show rate capture for later queue items without restarting active speech. |
| `apps/server/src/voice/dialogue-runner.ts` | Fresh current-page commands fail closed on refresh failure | FAILED / CR-01 open | Refresh result is ignored at the utterance handler; no caller-level regression proves stale output is blocked. |
| `fixtures/forms/offline/public-form.html`, `fixtures/forms/offline/manifest.json` | Local disclosed fallback and route inventory | VERIFIED locally | Real local assets; runbook test passed. This is not DEMO-03 evidence. |
| `04-DEMO-RUNBOOK.md`, `04-REPAIR-ACCEPTANCE.md` | Live sequence and acceptance ledger | VERIFIED as preparation | Steps exist and pending evidence is accurately recorded. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `apps/voice/src/main.ts` | `apps/voice/src/socket.ts` | Mode selection sends `SettingsPayload` | WIRED | CLI pattern check passed; source call is present. |
| `apps/server/src/server.ts` | `apps/server/src/voice/speech-routing.ts` / `nvda.ts` | Session mode routes output | WIRED to fail-closed behavior | Server consults routing; screen-reader mode reports unavailable instead of falsely completing speech. |
| `apps/server/src/voice/nvda.ts` | GATE-08 speak completion | Exact completion/cancellation settles matching `speakId` | NOT WIRED | No speakId completion handling exists in the adapter; CLI link check found no `speakId`. |
| `apps/voice/src/main.ts` | `apps/voice/src/speech-rate.ts` | Exact local commands adjust rate | WIRED | CLI pattern check passed. |
| `apps/voice/src/speech-rate.ts` | `apps/voice/src/tts.ts` | Later queued utterance captures rate | WIRED | CLI pattern check and named behavior test passed. |
| Offline manifest | `dev/mock-server` static route | Local URL maps to local file | WIRED | CLI pattern check and runbook tests support local serving; no remote submission path is claimed. |
| `apps/server/src/voice/dialogue-runner.ts` | `apps/server/src/session/refresh.ts` | Fresh-page command uses current snapshot | PARTIAL / CR-01 | Production refresher marks failure stale, but the utterance handler discards the result; caller-level fail-closed behavior is not tested. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| Offline practice page | Entered values and local errors | User input and local required-field validation | Yes, local only | FLOWING locally; the page is disclosed practice and cannot prove the live service. |
| Session rate | Current synthesis preset | Exact command/button updates session state; TTS reads at utterance start | Yes | FLOWING; named rate/queue tests passed and user reports audible change. |
| Public-form result | Current errors or confirmation | Live page observation through extension/core RES path | Not observed in this phase | HUMAN NEEDED; no live result may be inferred from offline or synthetic data. |
| NVDA speech | NVDA output for tracked `speakId` | Production screen-reader route | No | DISCONNECTED by explicit fail-closed route; this is the VOX-08 blocker. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Rate presets change by an audible step | `npm.cmd test -- --run apps/voice/src/speech-rate.test.ts -t "increases by two tenths for an audible change"` | 1 named test passed | PASS |
| Next queued item captures changed rate without restart | `npm.cmd test -- --run apps/voice/src/tts.test.ts -t "captures rate when each utterance starts without restarting active speech"` | 1 named test passed | PASS |
| Failed snapshot refresh marks session stale | `npm.cmd test -- --run apps/server/test/refresh.test.ts -t "maps disconnection and failed snapshots to safe stale results without speaking"` | 1 named helper test passed; it does not exercise the utterance caller's ignored boolean | PASS for helper only; CR-01 remains open |
| Runbook preserves live/fallback acceptance steps | `npm.cmd test -- --run dev/mock-server/src/demo-runbook.test.ts` | 2 tests passed | PASS for documentation assertions only |
| Public form, NVDA workstation, hotspot, recorder, video, and freeze | Runbook evidence ledger | All are pending or not performed | HUMAN NEEDED |

### Probe Execution

Not applicable. Phase 4 is not a migration/tooling phase and declares no probe script.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|---|---|---|---|---|
| VOX-07 | 04-02, 04-06, 04-07 | Faster/slower adjusts Blip's rate | SATISFIED at functional level | Source, named adjustment/queue tests, and user report support session rate behavior; measured three-level timing remains pending. |
| VOX-08 | 04-01, 04-03, 04-06 | NVDA replies without double speech and with safe completion | BLOCKED | Controller completion is unavailable; server route declines NVDA speech. D-16 does not satisfy the requirement. |
| DEMO-03 | 04-03 | Complete a real public form end to end by voice | NEEDS HUMAN | Negative validation plus three consecutive live runs are pending in the runbook. |
| DEMO-04 | 04-03 | Offline copies, hotspot, backup video, and rehearsed fallback | NEEDS HUMAN | Offline assets are present; hotspot, recorder, video, and rehearsal have not been performed. |

### Decision Coverage

All trackable Phase 4 CONTEXT decisions are honored (16/16; non-blocking gate).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/server/src/voice/dialogue-runner.ts` | 385 | Fresh-snapshot result ignored by caller | BLOCKER (CR-01) | Current-page commands do not enforce refresh success at the point of use. |
| `apps/server/src/voice/nvda.ts` | 26, 37 | `return null` on native library load failure | INFO | Expected fail-closed error handling; callers report NVDA unavailable. |

No unreferenced `TBD`, `FIXME`, or `XXX` debt markers were found in plan-listed implementation files. Empty handlers and `return null` matches are guarded validation/native-load branches or test doubles, not user-visible stubs.

### Human Verification Required — Pending

1. **NVDA device behavior:** exercise the screen-reader control with NVDA and the form tab focused; observe exclusivity and exact completion/cancellation. The current implementation intentionally cannot route speech, so VOX-08 remains blocked even if D-16 is used for the presentation.
2. **Live public form:** perform the negative validation attempt and three consecutive reset-and-submit runs with fictional data, reporting only page-observed results.
3. **Fallback rehearsal:** test one STT miss and typed retry, one hotspot attempt, explicit offline disclosure, and a recorder sample that can be reopened and understood.
4. **Video and freeze:** record and review the uninterrupted three-minute demo and conduct human freeze review. No `demo-safe` tag is authorized by this evidence.

### Gaps Summary

Phase 4 has not achieved its roadmap goal. The screen-reader success criterion is observably unmet because the NVDA path fails closed without a completion signal. The current review also has an open critical CR-01: fresh-page commands ignore refresh success at the reducer boundary. Rate adjustment and local preparation are supported, but live-form results, the complete fallback rehearsal, device checks, video review, and freeze acceptance remain pending. No phase-completion claim or demo-safe tag is supported.

---

_Verified: 2026-10-18T07:55:43Z_
_Verifier: the agent (gsd-verifier)_
