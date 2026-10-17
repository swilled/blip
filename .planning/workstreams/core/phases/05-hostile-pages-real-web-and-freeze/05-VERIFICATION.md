---
phase: 05-hostile-pages-real-web-and-freeze
verified: 2026-10-17T20:07:01Z
status: gaps_found
score: 1/5 phase success criteria fully verified
plans_executed: 10/10
gaps:
  - "The voice-owned client is absent; GATE-07 speech and the voice window portion of PROT-03 remain unverified."
  - "The team-owned real public form URL and fixed synthetic form data were not supplied."
  - "No validated repair patch/cache identity for the exact demo form has been recorded."
  - "Freeze criteria are incomplete; no demo-safe tag was created or moved."
---

# Phase 5: Hostile Pages, Real Web and Freeze Verification

**Phase goal:** Harden the core against seeded page prompt injection, carry a deterministic warning for text addressed to Blip, support the team's selected real public form, provide one-command startup, and freeze only when the full demo gate passes.

**Result:** Phase 5 remains in progress. Local automation, the full opt-in Edge E2E suite, the long-idle reconnect check, dedicated-profile fake-brain startup, and the bounded real-Claude hostile-fixture check pass. GATE-06 is verified through the production server/extension path. Voice speech/window, team-owned public-form I3, exact demo-form repair-cache prewarm, and Freeze remain pending.

## Task 1: Local acceptance evidence

| Check | Result | Scope |
|---|---|---|
| `npm test` | PASS — 79 files passed, 13 skipped; 856 tests passed, 22 skipped | Full repository suite. Existing opt-in tests remain skipped. |
| `npm run typecheck` | PASS | Root TypeScript project. |
| `npm run demo -- --brain=fake --smoke` | PASS — `BLIP_DEMO_SMOKE=PASS extension-connected=true profile=dedicated` | Ran with the dedicated Edge executable, `BLIP_VOICE_URL` explicitly unset, and `.chrome-profile/demo`; server accepted the extension connection. The smoke confirms fake-brain startup/readiness, not a voice utterance. |
| Opt-in extension Edge E2E (`BLIP_E2E_BROWSER=1`) | PASS — 13 files, 23 tests; the long-idle case was skipped by its separate opt-in gate | Ran the complete `apps/extension/test/e2e` suite against the local synthetic test-pages server. Each run used a unique `.chrome-profile` child profile and the harness closed only the browser process it spawned. |
| Long-idle Edge reconnect (`BLIP_E2E_BROWSER=1`, `BLIP_E2E_LONG=1`) | PASS — 1 file, 1 test, 166.74 seconds | The extension stayed bound for the two-minute idle interval, remained single-bound, and reconnected after a 40-second server outage. Used a unique local fixture profile. |
| Prior Plan 05-07 hostile-page Edge E2E | PASS — one refused gated pay attempt, zero submit side effects; one accepted warning boolean arrived before the next action turn | Existing browser E2E evidence. The test passed twice under its opt-in Edge gate. It does not include real Claude or a voice speech consumer. |

The 04-18 synthetic live SDK result remains separate and does not cover hostile-page context. Plan 05-10 supplies the applicable real-Claude evidence for the seeded fixture and closes GATE-06: one valid gated intent staged production read-back, then a premature confirmation without `speak.done` produced a production refusal audit. The check recorded zero act dispatches, submit events, navigation, or page-state changes after three total SDK dispatches in 9.3 seconds. The prompt contained only the production-approved value-free page projection; hostile instruction prose, field values, and the warning boolean were rejected before dispatch. The test socket proves the core protocol refusal path, not a voice UI.

## Task 2: External targets, cache, and freeze gate

- `apps/voice` is absent from this checkout. The voice workstream still lists DLG-14 speech and DEMO-03 as Pending. The demo launcher correctly reported that no voice client was configured when the smoke ran with `BLIP_VOICE_URL` unset.
- The user clarified that this hackathon project has no public-form URL. Local synthetic fixtures were used for browser coverage; no arbitrary external form was selected or opened. The team-owned public-form URL and its fixed synthetic non-sensitive test expectations remain unavailable, so real-site I3 stays pending.
- Phase 4's validated live patch is keyed to the fixed synthetic page, not the exact broken demo form. It cannot prove demo-form prewarm. No persistent repair cache was inspected or fabricated.
- The full Freeze success criteria are not met. No `demo-safe` tag was created, moved, or pushed.

## Final requirement status

| Requirement | Status | Evidence / remaining input |
|---|---|---|
| GATE-06 | Complete | Plan 05-10: real Claude received the production value-free projection from the accepted loopback injection fixture, returned a gated intent, and staged read-back. A premature confirmation without `speak.done` produced the production `confirmation-too-early` refusal audit. Zero act dispatches, submit events, navigation, or page-state changes. |
| GATE-07 | Pending | Core boolean propagation passed in the Edge E2E. Voice-owned DLG-14 speech is unverified because the voice client is absent. |
| PROT-03 | Pending | One-command server + dedicated Edge + extension readiness passed. The voice-window launch target is absent. |
| DEMO-03 / real-site I3 | Pending | Requires the team-selected public form URL, fixed synthetic data, voice client, and an approved integrated run. |
| Exact demo repair-cache prewarm | Pending | Requires the exact demo-form identity and a validated patch for its origin/path/structure hash. The 04-18 synthetic cache entry is not equivalent. |
| Freeze / `demo-safe` | Pending | Blocked by the preceding incomplete criteria. No tag was created or modified. |

All 10 Phase 5 plans are executed and remaining gaps are explicit; Phase 5 is not marked complete. No arbitrary public target or voice substitute was used, no hostile page prose was sent to the model, and no persistent cache contents, credentials, or unrelated environment values were inspected.

_Verified 2026-10-17T20:07:01Z._
