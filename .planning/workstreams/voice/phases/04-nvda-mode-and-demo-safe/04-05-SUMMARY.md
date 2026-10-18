---
phase: 04-nvda-mode-and-demo-safe
plan: "05"
status: complete
provides: [generation-scoped-capture, bounded-recognition-recovery, complete-final-transcripts, disconnect-safe-holds]
---

# 04-05 execution summary

Reconciled the interrupted STT draft into a capture-generation state machine. Automatic ends/no-speech recover only inside the current hold, at most once per second and five retries. Release finalizes once; fatal errors, lost input, 8-second startup timeout, missing finalization, and the 10-second hold limit discard incomplete commands. Old callbacks cannot mix text into a later capture.

Native readiness drives the listening cue. One owner arbitrates button versus shortcut, and sidecar/hub loss, pointer cancellation, pagehide, and window replacement abort capture. Expiry travels through the hook/sidecar with an explicit reason rather than looking like an ordinary release. Previous reply-caption cleanup cannot erase a new hold.

Checks: 15 STT regressions passed; 46 ownership/state/hook/sidecar tests passed; full voice source suite passed (14 files, 106 tests); root typecheck passed. Initial state-test failures exposed assertions that incorrectly treated a requested microphone as ready; updated tests explicitly observe native readiness before expecting the cue.

Task commits: 76d06ee, 7aa77df, and the integrated-readiness test commit immediately before this summary.

Deviation: added hold-owner.ts and forwarded expiry reasons through the existing native sidecar/wire. These were required for the planned ownership/expiry semantics. No protocol authorization shape was changed.

## Self-Check: PASSED

Injected-native integration proves one complete command and aborts stale callbacks on disconnect. Actual workstation microphone/global-focus behavior remains pending in 04-08.
