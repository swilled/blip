---
phase: 02-fill-and-gated-submit-on-the-broken-form
plan: 07
subsystem: demo
tags: [voice, demo, chrome, bridge, reset, uat]
requires:
  - phase: 02-06
    provides: Fail-closed GatePort, serialized dialogue runner, and HO-8 integration handoff
provides:
  - One-command reset restores the fictional profile and restarts the demo session
  - Local Chrome bridge opens the survey in a profile where the unpacked extension is installed
  - Human I2 run results recorded, with production submission tracked as a core dependency
affects: [voice-phase-2, voice-phase-3, core-executor-integration]
actuals:
  tokens: 13879
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - Reset restarts the local demo process and opens Chrome in the profile holding the unpacked bridge.
    - Development submission remains fail-closed until core provides the grant-bound Executor.
key-files:
  created:
    - fixtures/demo/profile.template.json
    - dev/mock-server/src/reset.ts
    - dev/mock-server/src/extension-id.ts
    - dev/mock-server/extension/manifest.json
    - dev/mock-server/extension/background.js
    - dev/mock-server/extension/content.js
  modified:
    - dev/mock-server/src/run-real.ts
    - dev/mock-server/src/launch-window.ts
    - apps/voice/src/stt.ts
    - packages/dialogue/src/read-fill.ts
    - .gitignore
key-decisions:
  - "Chrome 137+ requires a one-time manual unpacked-extension install; reset detects that installation and opens the form in the matching Chrome profile."
  - "The stand-in gate refusal is the expected I2 result; a real submit remains human_needed until core lands HO-8."
patterns-established:
  - "The demo reset restores fictional profile data, restarts the server and voice session, and reopens the local form without adding a network endpoint."
requirements-completed: [DEMO-01, DEMO-02]
coverage:
  - id: D1
    description: The reset command restores the fictional profile, starts a fresh demo session, and opens the broken survey in the Chrome profile with the bridge.
    requirement: DEMO-02
    verification:
      - kind: unit
        ref: dev/mock-server/src/reset.test.ts
        status: pass
      - kind: manual_procedural
        ref: npm.cmd run reset -w @blip/mock-server; user confirmed survey opens and reload clears entries
        status: pass
    human_judgment: false
  - id: D2
    description: The local broken survey bridge supports form reading, filling, read-back, required-field feedback, and the blocked confirmation flow.
    requirement: DEMO-01
    verification:
      - kind: integration
        ref: dev/mock-server/src/dialogue-runner.test.ts
        status: pass
      - kind: manual_procedural
        ref: User I2 run: read form, fill and read back, ask what's missing, arm submit, refuse non-exact phrases
        status: pass
    human_judgment: false
  - id: D3
    description: The stand-in gate refuses redemption and performs no real submission; core's production Gate/Executor integration is still pending.
    verification:
      - kind: e2e
        ref: dev/mock-server/src/dialogue-runner.test.ts
        status: pass
      - kind: manual_procedural
        ref: User I2 run: exact phrase returned the disconnected-gate refusal and left the page unsubmitted
        status: pass
    human_judgment: true
    rationale: The voice workstream cannot verify a successful production submit until core implements HO-8.
duration: multi-session
completed: 2026-10-17
status: complete
---

# Phase 02 Plan 07: Demo Reset and Human I2 Run Summary

**The one-command reset now opens the broken survey through the installed local Chrome bridge, and the human I2 run confirms the voice flow while keeping the disconnected gate fail-closed.**

## Performance

- **Duration:** Multi-session, including the human I2 run
- **Started:** 2026-10-17
- **Completed:** 2026-10-17
- **Tasks:** 3
- **Files modified:** 18 across the implementation commits

## Accomplishments

- Added a fictional profile template and a reset command that restores the working profile, restarts the local demo server, and launches a fresh form session.
- Added a local Chrome extension bridge for reading live fields and performing safe fill/select/focus actions with page-value read-back; the bridge still refuses clicks.
- Corrected Chrome profile detection so reset finds an unpacked bridge installed in the regular Chrome profile, and documented the one-time manual installation required by Chrome 137+.
- Human UAT passed for form reading, filling, read-back, required-field feedback, exact-phrase gating, refusal of other phrases, cancellation, change invalidation, and reload reset.

## Task Commits

1. **Task 1: Demo profile and reset/Chrome bridge** - `308152e` (RED), `ae4af76` (reset/profile), `b53356b` (bridge), `6f488e2` and `2c5e6e2` (Chrome install/profile detection fixes).
2. **Task 2: Automated gate and feedback fixes** - `63065e7`.
3. **Task 3: Human I2 run** - completed from the user's reported Chrome and microphone results; no source change.

**Plan metadata:** this summary is committed separately after verification.

## Human Run Results

- Focused reset/bridge and dialogue checks passed; the full suite passed with 761 tests, and `npm.cmd run typecheck` passed.
- Re-running the survey form model generator produced no fixture drift; no core-owned files changed.
- `npm.cmd run reset -w @blip/mock-server` reported that the fictional profile was restored, the server was ready, and the broken form opened in Chrome.
- The user confirmed “read the form” works, completed the form, and confirmed the read-back and required-field feedback work. “What's missing” lists empty required email, phone, and “How did you hear about us?” fields; name, age, and satisfaction are optional and are correctly omitted.
- Submit produced the full read-back and requested the distinct phrase with the BLOCKED banner. Other phrases did not submit. The exact phrase reached the stand-in gate, which said “Blocked. The safety gate is not connected, so nothing was submitted.” and left the page unsubmitted, as expected.
- The user reported that changing the form after read-back causes Blip to say the form changed and asks for a new confirmation; reload leaves the form empty; `cancel` receives “Okay, not submitting.”
- **Human-needed dependency:** successful production submission remains unverified until core implements HO-8 (tracked speak IDs, tracked stop/repeat speech, `survey` phrase-table support, and the grant-bound Gate/Executor). HO-9 remains separate and non-blocking.

## Decisions Made

- Preserve the survey's optional status for name, age, and satisfaction. “What's missing” means required fields that still block completion.
- Keep the development GatePort fail-closed until core's grant-bound Executor is available.

## Deviations from Plan

Chrome 137+ branded builds ignore `--load-extension`; first run therefore opens `chrome://extensions/` for the one-time unpacked-extension install. Reset now detects and uses the profile where the local bridge was installed. This was required for the human run on this machine.

## Issues Encountered

The first reset implementation only recognized the dedicated demo profile. The bridge had been installed in the regular Chrome profile, so detection was expanded to inspect the registered extension path in both profiles. The reset then opened the form successfully in the installed profile.

## Next Phase Readiness

The voice-owned Phase 2 implementation and reported I2 run are complete. The exact-phrase production submit path remains a core-owned HO-8 dependency; do not claim that a real survey submission succeeded until that integration is tested.

---
*Phase: 02-fill-and-gated-submit-on-the-broken-form*
*Completed: 2026-10-17*

## Self-Check: PASSED

All listed created files exist and the referenced implementation commits are present in git history.


