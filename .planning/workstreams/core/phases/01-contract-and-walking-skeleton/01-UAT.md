---
status: testing
phase: 01-contract-and-walking-skeleton
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md
started: 2026-10-17T00:23:32Z
updated: 2026-10-17T00:23:32Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Stop anything on port 7777. From the repo root run `npm run dev -- --brain=fake`.
  Server boots with no errors and prints that it is listening on 127.0.0.1:7777; a REPL prompt appears.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: `npm run dev -- --brain=fake` boots clean, listens on 127.0.0.1:7777, REPL prompt appears.
result: [pending]

### 2. Grammar turn: "what's here"
expected: Typing `what's here` in the REPL prints `speak[answer]: Hotel booking. 9 fields, 6 required, 3 actions.` immediately, no filler.
result: [pending]

### 3. Model-routed turn shows filler and delay
expected: A free-form utterance (e.g. `help me book a room for two nights`) shows an earcon, the filler "One moment.", then an answer after ~1.5 s.
result: [pending]

### 4. --brain=claude refuses cleanly
expected: `npm run dev -- --brain=claude` exits with code 2 and a clear message that the Claude brain arrives in Phase 4.
result: [pending]

### 5. Voice UI attaches to the server
expected: With `npm run dev -- --brain=fake --no-repl` running, the voice UI pointed at ws://127.0.0.1:7777/ws receives welcome then state, and speaks a reply to "what's here".
result: [pending]

### 6. Voice developer M0 sign-off
expected: Voice developer has approved the M0 PR in writing; PROTOCOL.md and 01-03-SUMMARY read `M0 approval: received (<location>)`.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]
