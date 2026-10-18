---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 4
current_phase_name: NVDA Mode and Demo-Safe
status: verifying
stopped_at: Plan 04-08 repair evidence recorded; original Phase 4 human acceptance remains open
last_updated: "2026-10-18T07:05:03Z"
last_activity: 2026-10-18
last_activity_desc: Microsoft Forms required-field repair verified on the updated build; Phase 4 regression suite passed
state_head: 9b323c6b56063dbc074fa00cf199e1cec85d5516
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 30
  completed_plans: 29
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-16)
Workstream: voice (Person B). Roadmap: .planning/workstreams/voice/ROADMAP.md

**Core value:** A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.
**Current focus:** Phase 4 — NVDA Mode and Demo-Safe

## Current Position

Phase: 4 (NVDA Mode and Demo-Safe) — EXECUTING
Plan: 04-08 repair regression and Microsoft required-field check recorded; remaining Phase 4 acceptance is human-led
Status: Phase 4 remains human_needed for NVDA, live submission rehearsal, fallback/video, and freeze evidence
Last activity: 2026-10-18 — Root suite 1,316 passed / 28 skipped; typecheck and voice/extension builds passed; user confirmed five Microsoft required fields

Progress: [█████░░░░░] 50%

## Shared Milestones

| Milestone | Target | Voice phase | Status |
|-----------|--------|-------------|--------|
| M0 protocol frozen (voice signs off) | ~h0.75 | 1 | Pending |
| I1 walking skeleton | ~h6–8 | 1 | Pending |
| I2 end-to-end with gate (fake brain OK) | ~h12 | 2 | Pending |
| I3 real Claude + real form + repair + injection blocked | ~h20 | 3 | Pending |
| Freeze, tag `demo-safe` (backup video ~h36) | ~h30 | 4 | Pending |

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 11 | - | - |
| 03 | 4 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02 P01 | 8min | 2 tasks | 5 files |
| Phase 02 P02 | 10 min | 3 tasks | 8 files |
| Phase 02 P03 | 8min | 2 tasks | 5 files |
| Phase 02 P04 | 18min | 3 tasks | 13 files |
| Phase 02 P05 | 12min | 3 tasks | 6 files |
| Phase 02 P06 | 14min | 3 tasks | 10 files |
| Phase 03 P01 | 8min | 3 tasks | 7 files |
| Phase 03 P02 | 10min | 3 tasks | 11 files |
| Phase 03 P03 | 24min | 3 tasks | 22 files |
| Phase 04 P01 | 3min | 2 tasks | 12 files |
| Phase 04 P02 | 10min | 3 tasks | 9 files |
| Phase 04 P03 | 9min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in the PROJECT.md Key Decisions table.
Recent decisions affecting the voice track:

- [Roadmap]: Voice builds against `apps/voice-ui/dev/mock-server.ts` until I1 and never blocks on core
- [Roadmap]: Grammar first. Unmatched utterances become a `parseIntent` effect (core BRAIN-02)
- [Roadmap]: Half-duplex audio. The confirm phrase is matched in server code; the voice UI never decides
- [Pending, Phase 1 spikes by ~h3]: voice-window layout; PTT route (uiohook-napi hold vs `chrome.commands` toggle); NVDA route (controller DLL via koffi vs in-page live region)
- [Phase 02]: The phone field keeps autocomplete=tel, with form-level autocomplete=off and reset hooks covering restoration safety.
- [Phase 02]: Field matching uses normalized token lists and returns ambiguity instead of guessing. — This keeps page text out of regular expressions and makes uncertain dictation fail closed.
- [Phase 02]: Confirmation accepts only the exact requested token sequence with a one-second gate window. — Affirmatives and near-phrases cannot arm or satisfy the submit gate.
- [Phase 02]: Spoken echo and read-back use observed page values and hide sensitive fields. — The user hears what the page holds while password and card values remain undisclosed.
- [Phase 02]: Keep kind: armConfirm as the Effect discriminant and name its ActionKind payload actionKind. — An Effect object cannot carry two different kind properties; this keeps the type contract unambiguous and aligned with Plans 02-05 and 02-06.
- [Phase 02]: Keep the development GatePort fail-closed until core supplies a grant-bound Executor. — The voice runner can verify the confirmation path without allowing an unconnected gate to submit.
- [Phase 03]: Spell only non-sensitive values from the current FormModel, naming punctuation between characters.
- [Phase 03]: Confirm a named change from the prior safe value and act.result.observedValue, never from the requested value.
- [Phase 03]: Redact utterances that trigger sensitive-field focus before sending transcript frames.
- [Phase 03]: Profile values stay in deterministic local fill logic; parseIntent receives only value-free form metadata.
- [Phase 03]: Profile matching uses explicit autocomplete field tokens and skips uncertain or sensitive fields.
- [Phase 03]: Batch undo restores only fields still equal to page-observed writes and consumes its one-level record.
- [Phase 04]: Keep agent-voice rate in memory for the current window session and apply it when each browser utterance starts.
- [Phase 04]: Intercept exact voice rate commands before barge-in cancellation so rate changes leave active speech running.
- [Phase 04]: Keep the live Microsoft Form authoritative; disclose the offline practice copy and do not count it as DEMO-03 evidence.

### Pending Todos

- Phase 2 I2 local gate check: user reported bare “yes” and “submit form” stayed blocked, while exact “submit survey” submitted once after the Gate/Executor integration. This confirms only the local synthetic gate path; it is not Phase 4 live-form submission evidence.

### Blockers/Concerns

- Install NVDA (2026.2) on both machines before the NVDA spike
- Voice sign-off is needed at M0 (~h0.75); it blocks both tracks
- Unverified (LOW confidence): AudioWorklet microphone capture and speechSynthesis while the voice window is unfocused. Phase 1 spike
- The team-owned Microsoft Form URL is available; Phase 4 live validation and submission rehearsal remain unverified
- Speech recognition now runs locally through whisper.cpp; still use only fictional data in the demo profile

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-18T07:05:03Z
Stopped at: 04-08 repair evidence recorded; Phase 4 milestone acceptance remains open
Resume file: .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-UAT.md

### Voice repair planning, 2026-10-18

- Five sequential gap-closure plans: 04-04 through 04-08.
- Official browser and seven existing code repositories informed the repair; sources and revision identifiers are in 04-REPAIR-RESEARCH.md.
- VOX-01, VOX-02, VOX-04, and VOX-07 reopened from the user's live regression reports.
- Static planning checks do not establish microphone or audible speech success. No application test suite or live audio check ran during planning.
- The interrupted stt.ts draft was reconciled in 04-05; capture and synthesis implementation is committed and automated checks passed.
- Next command: `$gsd-execute-phase 4 --ws voice --gaps-only`.

### Voice repair execution, 2026-10-18

- Plans 04-04 through 04-07 complete; 04-08 task 1 complete in 4b07bc4. Human task 2 and evidence closure task 3 remain pending.
- Full root regression: 123 files / 1,298 tests passed; 16 files / 28 tests skipped. Root typecheck and voice build passed. Prior-phase regression coverage is included in this root run; opt-in E2Es were not run.
- Old repository demo PID 45444 was identified and stopped. Updated fake-brain demo launched with global hook ready and both extension/voice connected. Runtime and disk identities agree: 8151ed9-2026-10-18T05:23:13.854Z.
- Demo process is running through tool session 9366. Actual microphone/audio checks have not passed. First requested check: Check microphone, then hold button and complete read the form.
- No connected browser automation surfaces are available; request content-free diagnostic trace copies for native timing measurements. No public form submitted, no push, and no demo-safe tag created.

### Local recognition migration requested by user, 2026-10-18

- Implementation c3ba227 replaces the live Chrome SpeechRecognition input path with raw AudioWorklet capture and a native Windows whisper.cpp base.en CPU process. Chrome remains microphone/UI; recordings stay in memory and are transcribed after release. Existing deterministic gate authority is unchanged.
- Official release/model artifacts are installed locally and hash verified; setup is reproducible with npm.cmd run stt:setup. Research, comparisons, sources and exact artifact hashes: phases/04-nvda-mode-and-demo-safe/04-LOCAL-STT-DECISION.md.
- Final full suite passed 125 files / 1,311 tests, with 16 files / 28 tests skipped. Typecheck and voice build passed. Five real native synthetic speech samples passed in about one second each.
- A dedicated real Chrome synthetic-microphone test passed with Chrome SpeechRecognition explicitly disabled: actual AudioWorklet -> native model -> one finalized voice frame after release. This test is separate from the unavailable interactive browser connector and does not prove physical microphone/audio acceptance.
- At this point in the execution, the 04-08 human checkpoint remained open; the later repair evidence below records the updated user reports and Microsoft Forms check. The original Phase 4 milestone is still incomplete.
- Updated demo is running through tool session 86898 with build 56ae0be-2026-10-18T05:41:00.454Z. Native recognition endpoint reports ready=true and engine=whisper.cpp base.en; global hold hook started successfully and voice-role connection was observed after reopening. Extension connection was observed, but the launcher's specific synthetic-page readiness condition has not yet passed. Do not infer form-reading readiness from the microphone engine status.

### Recognition accuracy investigation, 2026-10-18

- User confirms faster/slower works; actual recognition still poor. Do not treat the earlier synthetic tests as user accuracy acceptance.
- Implementation d548b7f prefers small.en with beam five, exposes selected microphone/live level/capture duration/filter comparison and installed David/Mark/Zira output voices. Existing tracked output/rates and action gate remain authoritative. Compact controls in 92cbad4.
- Compared base/small/quantized medium on identical clean and 6 dB synthetic-noise samples: all ten cases per model passed, so no user accuracy improvement is established. Medians: 1.097 / 3.806 / 11.332 seconds. Medium is not the default because its delay is unsuitable for confirmation freshness.
- Automated evidence: 1,315 tests passed / 28 skipped; root typecheck passed; final focused backend tests passed; actual Chrome synthetic microphone integration passed using small.en with Chrome recognition disabled and actual capture duration/levels shown.
- Real microphone type, exact said/heard example and level remain pending. Debug session: .planning/debug/voice-recognition-accuracy.md. Sources/comparison: phases/04-nvda-mode-and-demo-safe/04-ACCURACY-RESEARCH.md. Phase 4 stays human_needed.

### Microsoft Forms required-status repair, 2026-10-18

- Microsoft Forms exposes required status through a question-level `requiredStar` note. `requiredStateOf` now reads that marker only within the matching `questionItem`; a regression test confirms an adjacent optional question remains optional.
- Extension tests, extension typecheck/build, root typecheck, voice build, and the full root suite passed. Full suite: 127 files passed, 16 skipped; 1,316 tests passed, 28 skipped.
- On the restarted updated build `67114f9-dirty-2026-10-18T07:00:58.786Z`, the user confirmed the five expected required fields—Employment type, Department, Leave type, Leave date, Return date—and that optional questions were excluded. No public-form submission was attempted.
- The user reports microphone input and faster/slower operation work. Detailed per-route counts and rate timings were not retained. Phase 4 remains open for NVDA/D-16, live validation and three submissions, fallback/hotspot/recorder rehearsal, video, and freeze review; no `demo-safe` tag is authorized yet.
