---
phase: 01-spikes-and-push-to-talk-loop
plan: 03
subsystem: voice
tags: [spikes, koffi, nvda, uiohook-napi, web-speech]
requires: [01-02]
provides:
  - spike page and log server for spikes A, B, C2, F
  - spike scripts for D (PTT), E (pin), C1 (NVDA)
  - pinTopmost and nvdaSpeak/nvdaCancel reusable modules
affects: [01-04]
key-files:
  created:
    - scripts/spikes/spike-server.ts
    - scripts/spikes/spike.html
    - scripts/spikes/spike-ptt.ts
    - scripts/spikes/spike-pin.ts
    - scripts/spikes/spike-nvda.ts
    - apps/server/src/voice/pin-topmost.ts
    - apps/server/src/voice/nvda.ts
requirements-completed: [VOX-01, VOX-02, VOX-04, VOX-05]
completed: 2026-10-16
---

# Phase 1 Plan 03: Spike tooling Summary

Spike page and 127.0.0.1:8788 log server (Origin allowlist, name whitelist, 4 KB cap), three native spike scripts, and koffi modules for topmost pinning and NVDA speech. Spikes were not run (need human, mic, NVDA; Plan 04).

## Tasks
1. Browser spike page and log server: commit 3128334. Self-test passed (GET 200, POST /log 204, foreign origin 403, log line written then removed).
2. Native spikes and modules: commit 0531b3f. Module load test passed (pin returns ok false without throwing; nvda loads the real DLL, returns 1722 with NVDA not running). `npm run typecheck` clean.

## Run commands
- `npx tsx scripts/spikes/spike-server.ts` then open http://127.0.0.1:8788 in Chrome (title "Blip")
- `npx tsx scripts/spikes/spike-ptt.ts`, `spike-pin.ts`, `spike-nvda.ts`

## Deviations from Plan
- **[Rule 3] NVDA DLL naming:** the official zip ships `x64/nvdaControllerClient.dll` (no "64" suffix). Extracted only that file from nvda_2026.2_controllerClient.zip (official nvaccess URL) and copied to gitignored `tools/nvda-client/nvdaControllerClient64.dll`, the default path nvda.ts expects. Zip kept under tools/nvda-client/dl (gitignored). Nothing executed.
- Script imports are extensionless (tsc rejects `.ts` import paths); scripts run via tsx.

## Notes for Plan 04
- `.gitignore` has `*.log`, so spike logs in spikes/ will not be committed; use `git add -f` or copy evidence into the decision doc.
- pinTopmost window enumeration was not exercised against a real Chrome window (only the not-found path); spike E is the first real test.
- NVDA 2026.2 DLL is on this machine only; the other machine must set NVDA_DLL_PATH or download the zip.

## Known Stubs
None.

## Self-Check: PASSED
