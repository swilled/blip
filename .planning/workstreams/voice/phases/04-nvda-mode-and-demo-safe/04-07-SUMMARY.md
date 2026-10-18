---
phase: 04-nvda-mode-and-demo-safe
plan: "07"
status: complete
provides: [tracked-rate-acknowledgements, eligible-voice-confirmation, combined-recovery-regression]
---

# 04-07 execution summary

Rate acknowledgements now use the existing settings.rate protocol and a unique ordinary server-tracked speakId. Shared finite presets are validated even when output mode is unchanged. Rate-only settings preserve current speech; screen-reader output remains exclusive. Integrated browser-local filler is disabled in favor of the tracked server path.

A server-owned single-use capture record binds the current voice connection, grant, page snapshot, speech revision and hold start/end. A fresh hold after all output and the one-second guard preserves its armed grant. Captures begun early or invalidated by output, page edit or replacement cannot authorize the exact phrase. Interrupted tracked output cancels armed authority. Reconnection clears old speech/grants and reducer state.

Checks: the initial real-PTT regression failed before the fix because PTT start cleared the grant. After repair, 85 focused server/dialogue tests passed with root typecheck. The combined suite passed 26 files / 305 tests with root typecheck. An injected actual-STT-to-core-GatePort sequence covers two automatic recognition restarts per hold, no interim dispatch, failed rate output, a fresh readback/prompt, unknown completion rejection, then exactly one gated act. Negative phrases, cooldown, stale rate capture, output failure, connection replacement and page edits dispatch zero gated acts.

Task commits: 79fbc8a (tracked acknowledgements), fdec9ce (capture eligibility), plus the following dedicated combined-regression commit recorded in git history. No new runtime dependencies, remote submission or hardware pass is claimed.

## Self-Check: PASSED

Source and regression checks are complete. Actual Chrome microphone/speaker behavior remains the 04-08 human checkpoint; original NVDA, live-form rehearsal, fallback/video and freeze evidence remains open.
