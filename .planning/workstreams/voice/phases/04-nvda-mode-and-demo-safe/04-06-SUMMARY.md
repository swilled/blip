---
phase: 04-nvda-mode-and-demo-safe
plan: "06"
status: complete
provides: [distinct-windows-rate-presets, retained-native-utterances, item-rate-capture, synthesis-recovery]
---

# 04-06 execution summary

Speech rate now uses presets mapping to distinct inspected Windows SAPI levels. Native voice loading is bounded and observes voiceschanged, keeps a stable selected voice and active utterance reference, and defers native speak to a later task so cancellation callbacks cannot synchronously restart it. Stale native callbacks are ignored.

Speech items preserve decimals, common abbreviations, dates, URLs and email addresses. Every sentence in one logical item retains its starting rate. Startup gets an independent eight-second deadline; completion gets a conservative rate-aware allowance only after onstart. Errors/timeouts remain interrupted and cannot certify read-back success. Failure is visible and a later command can speak again.

Rate buttons and exact voice/typed commands share one controller. Rapid clicks update the displayed rate immediately and coalesce spoken acknowledgement. Existing speech finishes at its original rate, and screen-reader mode keeps browser acknowledgements silent.

Checks: 30 focused rate/native/TTS/bridge tests passed; full voice source suite passed (15 files, 114 tests); root typecheck passed. Native lifecycle tests exercise twenty cancellation/rate cycles followed by successful subsequent speech. These injected-native tests do not prove audible workstation speed.

Deviation: native adapter, onstart contract, and queue changes were committed together to retain a compiling adapter boundary. Coalesced control wiring was committed separately. The client-only acknowledgement path remains intentionally pending the server-accounting migration in 04-07; no live gated test ran with it.

## Self-Check: PASSED

Source and tests are committed. Device voice selection, audible differences, and actual Chrome recovery remain pending 04-08.
