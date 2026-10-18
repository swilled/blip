---
status: partial
phase: 01-contract-and-walking-skeleton
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md
started: 2026-10-17T00:23:32Z
updated: 2026-10-18T00:33:24Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing paused - 1 item outstanding: M0 sign-off]

## Tests

### 1. Cold Start Smoke Test
expected: `npm run dev -- --brain=fake` boots clean, listens on 127.0.0.1:7777, REPL prompt appears.
result: pass
verified_by: automated run (listened on 127.0.0.1:7777, REPL ready)

### 2. Grammar turn: "what's here"
expected: Typing `what's here` in the REPL prints `speak[answer]: Hotel booking. 9 fields, 6 required, 3 actions.` immediately, no filler.
result: pass
verified_by: automated run (reply matched exactly)

### 3. Model-routed turn shows filler and delay
expected: A free-form utterance (e.g. `help me book a room for two nights`) shows an earcon, the filler "One moment.", then an answer after ~1.5 s.
result: pass
verified_by: automated run (earcon, filler, offline answer seen; 1.5s delay covered by fake-brain.test.ts, not timed live)

### 4. Unsupported legacy brain option fails cleanly
expected: `npm run dev -- --brain=claude` exits nonzero and says `--brain must be fake or agy`.
result: pass
verified_by: `npm run dev -- --brain=claude` exited 1 with `--brain must be fake or agy, got "claude"`

### 5. Voice UI attaches to the server
expected: With `npm run demo -- --brain=fake` running, the local voice UI connects with speech enabled, accepts "what's here" and "what's required", displays the expected answers, and returns to ready state.
result: pass
verified_by: Actual local demo UI on an isolated Edge test tab; extension and voice connected, speech enabled, both questions returned the expected Community Survey answers, then the UI returned to ready state. The tab and demo process were closed after the check.

### 6. Voice developer M0 sign-off
expected: Voice developer has approved the M0 PR in writing; PROTOCOL.md and 01-03-SUMMARY read `M0 approval: received (<location>)`.
result: blocked
blocked_by: prior-phase
reason: waiting on voice developer written approval of M0 PR

## Summary

total: 6
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

[M0 written sign-off remains blocked; PROTOCOL.md still records `M0 approval: pending`.]
