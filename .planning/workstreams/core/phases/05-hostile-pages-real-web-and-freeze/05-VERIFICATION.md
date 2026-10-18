---
phase: 05-hostile-pages-real-web-and-freeze
verified: 2026-10-17T22:35:35Z
status: gaps_found
score: 4/5 phase success criteria fully verified; release freeze pending review and mainline tag
plans_executed: 11/11
gaps:
  - "The `demo-safe` tag is not on main. The voice Phase 2 reducer is integrated and verified on this branch; teammate review and mainline promotion are still required before release tagging."
---

# Phase 5: Hostile Pages, Local Synthetic Web and Freeze Verification

**Phase goal:** Harden the core against seeded page prompt injection, carry a deterministic warning for text addressed to Blip, complete a self-hosted synthetic survey by voice, provide one-command startup, and freeze only after the full local demo gate passes.

**Result:** Local Phase 5 acceptance passed for hostile-page refusal, GATE-07 speech, the first-party voice window, the voice Phase 2 reducer integrated through the core Gate/Executor, the self-hosted synthetic survey, the exact Claude repair-cache identity, the one-command fake fallback, and dedicated Edge startup. `startServer({ dialogueRunner: true })` now installs that runner for both the documented fake-brain I2 and real-Claude I3 demo paths. The reducer/GatePort branch `origin/voice/phase-2-dialogue-gateport` (`2f22bb5`) is integrated and verified on this branch. Teammate review, mainline promotion, and `demo-safe` tagging remain pending. Voice-owned DEMO-03 is deferred because this hackathon has no public-form URL; no arbitrary form was opened.

## Success criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Real Claude receives the hostile fixture's approved value-free projection; gated action is refused with no side effect. | PASS | Plan 05-10 bounded real-Claude check and existing hostile-page Edge matrix. The check recorded zero act dispatches, submit events, navigation, and state change after premature confirmation. |
| 2 | Accepted GATE-07 boolean causes fixed warning speech before input resumes; page prose never reaches voice UI. | PASS | `voice-warning.e2e.test.ts` on dedicated Edge; fixed warning spoken before the queued request, warning gate held input, and speech completion used tracked IDs. |
| 3 | Local I3 works with the self-hosted survey: the voice reducer fills/submits through the core gate, Claude repairs and reuses the exact cache identity, and hostile action remains blocked. | PASS | Existing `demo-form.e2e.test.ts`, bounded 05-11 cache check, 05-10 hostile check, and the new production-extension reducer-to-core-gate E2E. The survey uses fictional values and a local report sink; no external form was used. |
| 4 | One command launches the loopback server, dedicated extension profile, and voice window; both roles connect. | PASS | `npm run demo -- --brain=fake --smoke`; marker confirmed extension, voice, selected survey page, and isolated profiles. |
| 5 | Freeze: exact demo repair is prewarmed, fake fallback passes, and main is tagged `demo-safe`. | PARTIAL | Cache prewarm and fake fallback pass. Tag remains pending the required teammate review and merge of the integration branch. |

## Local test evidence

- `npm test`: 114 files passed, 16 skipped; 1,192 tests passed, 26 skipped.
- `npm run typecheck`: passed; `npm run ext:build` and `npm run build --workspace @blip/voice`: passed.
- `npx vitest run apps/server/test/voice-gate-adapter.test.ts apps/server/test/gated-flow.test.ts apps/server/test/act-path.test.ts --maxWorkers=1`: 3 files and 32 tests passed. Covers core-owned tracked read-back, exact `submit survey`, one-use grant-bound dispatch, grant-specific clear, and cancel/stop/repeat/page-change invalidation.
- `BLIP_E2E_BROWSER=1` with `BLIP_BROWSER` set to Edge, then `npx vitest run apps/extension/test/e2e/demo-form.e2e.test.ts --maxWorkers=1`: passed against the local synthetic form after the adapter change.
- Opt-in Edge suite `npx vitest run apps/extension/test/e2e --maxWorkers=1`: 15 files passed, 2 separately gated tests skipped; 25 tests passed, 2 skipped. The suite used only harness-owned browser profiles.
- Focused voice reducer/GatePort/protocol/server-flow tests and the direct WebSocket integration test cover tracked speech IDs, exact `submit survey`, one-use grant dispatch, stale IDs, replay, and invalidation on cancel, stop, repeat, and page change.
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/gated-flow.e2e.test.ts`: 2 passed using harness-owned isolated browser profiles. The reducer/core-gate test uses the production extension, asserts the tracked read-back ID, refuses bare `yes`, accepts exact `submit survey`, reports the page result, and records one submit.
- `npm run demo -- --brain=fake --smoke`: passed with `BLIP_DEMO_SMOKE=PASS extension-connected=true voice-connected=true survey-page-selected=true profiles=isolated`.
- `npm run demo -- --brain=claude`: real provider started with the dedicated Edge extension and voice UI connected. One synthetic voice question was routed through the reducer fallback and returned a tracked answer speech frame (one model-routed prompt; no retry). This checks the real-Claude launch and fallback, not a full spoken I3 rehearsal.
- `apps/server/test/dialogue-runner-server.test.ts`: verifies the production `dialogueRunner` option installs the reducer, model gated-action suggestions do not start a parallel confirmation flow, and reducer-unmatched utterances reach the configured Claude provider adapter.
- 05-11 bounded real-Claude prewarm: 3/8 dispatches, 2 repaired labels, both empty-tool roles accepted, exact identity cache reloaded without a new provider prompt. Elapsed 11,037 ms. Identity SHA-256: `ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2`.

## Requirement status

| Requirement | Status | Evidence / remaining input |
|---|---|---|
| GATE-06 | Complete | 05-10 real-Claude hostile-fixture check; zero gated dispatch and side effects. |
| GATE-07 | Complete | Fixed local warning speech before input enabled; no page prose displayed or spoken. |
| PROT-03 | Complete | Dedicated Edge extension + voice startup and readiness smoke passed. |
| Local synthetic I3 | Complete | The core voice UI and the integrated voice Phase 2 reducer both submit the local synthetic form only after tracked read-back and the exact phrase; result evidence and one-submit behavior passed. Claude cache identity validated and reused. |
| DEMO-03 public form | Deferred | User confirmed there is no public-form URL for this hackathon. No substitute public page was opened. |
| Exact demo repair-cache prewarm | Complete | 05-11 one-use report and claim record. |
| Fake fallback | Complete | One-command fake-brain smoke passed with both roles connected. |
| Freeze / `demo-safe` | Pending release | The voice reducer is integrated on `integration/ho8-voice-gate`; teammate review and mainline promotion remain before tagging main. |

No credentials, account state, public form data, or unrelated environment values were inspected. The `.chrome-profile` demo cache is local and ignored by Git; the report records only a structural identity hash and sanitized counts.

_Rechecked 2026-10-17 after integrating `origin/voice/phase-2-dialogue-gateport` (`2f22bb5`)._
