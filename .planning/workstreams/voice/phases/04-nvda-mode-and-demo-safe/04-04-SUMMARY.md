---
phase: 04-nvda-mode-and-demo-safe
plan: "04"
status: complete
provides: [current-build-launch, content-free-speech-diagnostics, microphone-check, safe-reopen]
---

# 04-04 execution summary

Built-client identity is emitted by Vite, printed by the launcher, shown in troubleshooting, and captured immutably by the server. The standalone entry uses dist instead of the legacy UI. Reopening verifies the running process build, preserves the form profile, and gives a restart instruction for a stale process.

An opt-in 100-event recorder observes native recognition events without replacing application handlers. It excludes transcript/page/audio content. The explicit microphone check stops every temporary track, including a late permission result after pagehide. Shortcut connectivity is reported separately.

Task commits: 9c60910, 7a88d8e, and the following safe-reopen commit (see git log).

Checks: launcher/static 24 tests passed; diagnostic 3 tests passed; launcher/hold-client 22 tests passed; root typecheck passed after both UI changes. These overlap and are not a count of unique project tests. No actual microphone capture or audible success was inferred.

Deviation: added apps/voice/build-info.ts and a narrow server runtime-identity endpoint; these are necessary to distinguish a still-running old process from mutable dist files. Source readiness state changes are completed in 04-05. The preexisting dirty stt.ts draft was preserved and excluded from task commits.

## Self-Check: PASSED

Production commits and created source/tests exist. Device behavior remains for 04-08.
