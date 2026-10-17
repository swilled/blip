---
phase: 01-spikes-and-push-to-talk-loop
plan: 10
subsystem: voice
tags: [launcher, pin-topmost, mock-server, real-server-runner, manual-run]
requires: ["01-09"]
provides:
  - voice window launcher (buildChromeArgs, resolveChromePath, launchVoiceWindow) with periodic topmost re-pin
  - in-process mock runner (dev.ts) and in-process real-server runner (run-real.ts)
  - recorded manual push-to-talk run on the mock server
affects: [01-11]
key-files:
  created:
    - dev/mock-server/src/launch-window.ts
    - dev/mock-server/src/launch-window.test.ts
    - dev/mock-server/src/dev.ts
    - dev/mock-server/src/run-real.ts
    - dev/mock-server/src/run-real.test.ts
    - scripts/spikes/auto-repin.ts
  modified:
    - dev/mock-server/src/main.ts
    - dev/mock-server/package.json
key-decisions:
  - "The pin is re-applied every REPIN_MS = 1500 ms with SWP_NOACTIVATE. Only z-order is restored; keyboard focus is deliberately NOT taken, because stealing focus from a form would break NVDA and typing. This is a deliberate choice, not a gap."
  - "Pin matches the EXACT window title (commit 2763ee1), so other windows containing the word Blip are not pinned."
  - "Chrome is spawned with an args array and no shell:true. This also removed the red PowerShell DEP0190 warning."
requirements-completed: [VOX-01, VOX-02, VOX-03, VOX-04, VOX-05, VOX-06, VIS-01]
completed: 2026-10-16
---

# Phase 1 Plan 10: Launcher, runners and manual run Summary

One command opens the Blip voice window at http://127.0.0.1:7777/ and keeps it on top. A second command runs core's real server in-process under the same window. A human then ran the push-to-talk loop against the mock server.

## Tasks
1. Launcher, in-process dev and real runners with tests: e1f10d9
2. Manual push-to-talk run (checkpoint:human-verify): resolved by the user. See the status split below.
- Follow-up fix found during Task 2: 772eb90 (re-apply the topmost pin every 1.5 s)
- Earlier related fix: 2763ee1 (exact-title pin match)

## Manual run (Task 2): what is confirmed and by whom

Human-confirmed on the mock server (user run):
- Step 1, hold Right Ctrl + Space to talk: works.
- Step 3, typed input: works.
- Step 5, interrupting speech with Right Ctrl + Space, or typing "stop": works well.
- Step 4, slow reply ("One moment"): works well.
- Step 6, Left Ctrl + Space, and the space-leak checks: not reported as problems. The user did not describe these in detail, so they are recorded as no issue reported, not as explicitly verified.

Failed on the first run, now fixed (automated-only):
- Step 5 of the window behavior, pin / stay on top: the window did NOT return to the front after the user clicked another window. Cause: the launcher pinned only once. Fix 772eb90 re-applies the pin every 1500 ms. `scripts/spikes/auto-repin.ts` cleared the topmost flag on a real Blip window and confirmed it was raised again within 3.5 s (PASS), with a unit test for the timer.

Still pending:
- A human re-check of "click another window, and Blip returns to the front" has not been done. The user's wording was that it should be on top and refocus itself when done. The fix restores z-order only, not keyboard focus (see decisions).
- The real-server variant (`node --import tsx dev/mock-server/src/run-real.ts --fixture=broken`) was NOT run by a human. Only its automated test (run-real.test.ts) has passed.

## Deviations from Plan
- [Rule 1 - Bug] Single pin did not hold the window on top. Fixed with periodic re-pin (772eb90), found during the manual run.
- [Rule 1 - Bug] Pin matched titles too loosely, fixed to exact title (2763ee1).
- [Rule 1 - Bug] `shell:true` spawn caused the PowerShell DEP0190 warning, removed.
- Added `scripts/spikes/auto-repin.ts` as an automated check for the re-pin. It was not in the plan.

## Known Stubs
None.

## Threat Flags
None beyond the plan's register. T-01-16 is mitigated (args array, no shell, CHROME_PATH from env). T-01-17: runners import core read-only.

## Verification
- `npx vitest run dev/mock-server`: launcher and run-real tests passed (per the executed Task 1 and the re-pin test).
- Manual run: partial human confirmation, as listed above.

## Self-Check: PASSED
