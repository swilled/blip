---
phase: 01-spikes-and-push-to-talk-loop
plan: 05
subsystem: voice
tags: [dialogue, reducer, mock-server, websocket, protocol]
requires: ["01-01", "01-02"]
provides:
  - fixtures/forms/broken-form.model.json (generated FormModel)
  - "@blip/dialogue reduce() with 'what's here' grammar"
  - createMockServer (dev/mock-server) speaking protocol v1
affects: [voice window plans, core I1 integration]
key-files:
  created:
    - scripts/gen-broken-form-model.ts
    - fixtures/forms/broken-form.model.json
    - packages/dialogue/src/reduce.ts
    - packages/dialogue/src/reduce.test.ts
    - packages/dialogue/src/index.ts
    - dev/mock-server/src/server.ts
    - dev/mock-server/src/main.ts
    - dev/mock-server/src/server.test.ts
key-decisions:
  - "Fixture counts: title 'Customer survey', 5 fields, 2 required, 2 actions; reply 'Customer survey. 5 fields, 2 required, 2 actions.'"
  - "Mock reuses hostAllowed/rolesForOrigin from apps/server/src/hub/guard (read-only)"
requirements-completed: [DLG-01, VOX-03]
completed: 2026-10-16
---

# Phase 1 Plan 05: Reducer and mock server Summary

Generated the broken-form FormModel fixture, built a pure counts-first "what's here" reducer matching core's describeReply wording, and a mock server enforcing the real Host/Origin/hello rules; typed "what's here" returns a schema-valid speak frame over a real WebSocket.

## Tasks
1. Fixture generator: 8e097a1
2. Reducer (TDD): RED 340eeef, GREEN f5e872d (12 tests)
3. Mock server (TDD): RED a874495, GREEN 63fb5e9 (13 tests)

`npx vitest run packages/dialogue dev/mock-server`: 25/25 pass. `tsc --noEmit` clean.

## Deviations from Plan
None. Notes: wrong path returns 404 (as the real hub does) rather than a generic 403; the mock answers `control repeat` with the last spoken text, and ignores settings/other controls.

## Known Stubs
None. The parseIntent fallback "I can only describe the page right now." is the intended mock answer.

## Self-Check: PASSED
