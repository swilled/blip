---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 4
current_phase_name: NVDA Mode and Demo-Safe
status: verifying
stopped_at: Researched repair plans 04-04 through 04-08 ready; voice device acceptance pending
last_updated: "2026-10-18T05:02:14Z"
last_activity: 2026-10-18
last_activity_desc: User-reported voice regressions researched and planned
state_head: 9b323c6b56063dbc074fa00cf199e1cec85d5516
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 30
  completed_plans: 25
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
Plan: 04-07 next; launch, capture, and speech-output repairs complete
Status: Repair plans ready for execution; live verification remains open
Last activity: 2026-10-18 — Research-backed voice repair planning completed

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

- Keep the “only ‘submit survey’ submits” criterion `human_needed` until HO-8's core Gate/Executor handoff and the separate I2 run pass.

### Blockers/Concerns

- Install NVDA (2026.2) on both machines before the NVDA spike
- Voice sign-off is needed at M0 (~h0.75); it blocks both tracks
- Unverified (LOW confidence): Web Speech recognition and speechSynthesis while the voice window is unfocused. Phase 1 spike
- The team-owned public form (Google Form) must exist by ~h12 so core can test it before I3
- Speech audio goes to Google STT, so use only fictional data in the demo profile

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-18T05:02:14Z
Stopped at: Five researched repair plans ready; 04-04 next and device evidence pending
Resume file: .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-REPAIR-OVERVIEW.md

### Voice repair planning, 2026-10-18

- Five sequential gap-closure plans: 04-04 through 04-08.
- Official browser and seven existing code repositories informed the repair; sources and revision identifiers are in 04-REPAIR-RESEARCH.md.
- VOX-01, VOX-02, VOX-04, and VOX-07 reopened from the user's live regression reports.
- Static planning checks do not establish microphone or audible speech success. No application test suite or live audio check ran during planning.
- The interrupted stt.ts implementation draft remains unverified for reconciliation in 04-05.
- Next command: `$gsd-execute-phase 4 --ws voice --gaps-only`.
