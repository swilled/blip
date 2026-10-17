---
phase: 05-hostile-pages-real-web-and-freeze
verified: 2026-10-17T21:18:00Z
status: gaps_found
score: 4/5 phase success criteria fully verified
plans_executed: 11/11
gaps:
  - "The `demo-safe` tag is not on main. Teammate review and merge are still pending; the fetched voice branch has Phase 1 dialogue code and Phase 2 plans, but not the Phase 2 DialogueRunner/GatePort implementation this adapter is meant to serve."
---

# Phase 5: Hostile Pages, Local Synthetic Web and Freeze Verification

**Phase goal:** Harden the core against seeded page prompt injection, carry a deterministic warning for text addressed to Blip, complete a self-hosted synthetic survey by voice, provide one-command startup, and freeze only after the full local demo gate passes.

**Result:** Local Phase 5 acceptance passed for hostile-page refusal, GATE-07 speech, the first-party voice window and its server-owned confirmation reducer, the core-side arm/clear/redeem adapter, the self-hosted synthetic survey, the exact Claude repair-cache identity, the one-command fake fallback, and dedicated Edge startup. The separate voice workstream's Phase 2 DialogueRunner/GatePort implementation is not present on fetched `origin/voice/vox-05-barge-in` (`18ebb67`); this integration branch is ready for that reducer to adopt. Mainline promotion and `demo-safe` tagging remain pending teammate review. Voice-owned DEMO-03 is deferred by the core owner's decision because this hackathon has no public-form URL; no arbitrary form was opened.

## Success criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Real Claude receives the hostile fixture's approved value-free projection; gated action is refused with no side effect. | PASS | Plan 05-10 bounded real-Claude check and existing hostile-page Edge matrix. The check recorded zero act dispatches, submit events, navigation, and state change after premature confirmation. |
| 2 | Accepted GATE-07 boolean causes fixed warning speech before input resumes; page prose never reaches voice UI. | PASS | `voice-warning.e2e.test.ts` on dedicated Edge; fixed warning spoken before the queued request, warning gate held input, and speech completion used tracked IDs. |
| 3 | Local I3 works with the self-hosted survey: real voice UI fills/submits through the gate, Claude repairs and reuses the exact cache identity, and hostile action remains blocked. | PASS | `demo-form.e2e.test.ts`, bounded 05-11 cache check, and 05-10 hostile check. The app's `ConfirmationReducer` exercises the server-owned Gate/Executor path. The survey uses fictional values and a local report sink; no external form was used. |
| 4 | One command launches the loopback server, dedicated extension profile, and voice window; both roles connect. | PASS | `npm run demo -- --brain=fake --smoke`; marker confirmed extension, voice, selected survey page, and isolated profiles. |
| 5 | Freeze: exact demo repair is prewarmed, fake fallback passes, and main is tagged `demo-safe`. | PARTIAL | Cache prewarm and fake fallback pass. Tag remains pending the required teammate review and merge of the integration branch. |

## Local test evidence

- `npm test -- --maxWorkers=1`: 83 files passed, 16 skipped; 886 tests passed, 25 skipped.
- `npm run typecheck`: passed.
- `npx vitest run apps/server/test/voice-gate-adapter.test.ts apps/server/test/gated-flow.test.ts apps/server/test/act-path.test.ts --maxWorkers=1`: 3 files and 32 tests passed. Covers core-owned tracked read-back, exact `submit survey`, one-use grant-bound dispatch, grant-specific clear, and cancel/stop/repeat/page-change invalidation.
- `BLIP_E2E_BROWSER=1` with `BLIP_BROWSER` set to Edge, then `npx vitest run apps/extension/test/e2e/demo-form.e2e.test.ts --maxWorkers=1`: passed against the local synthetic form after the adapter change.
- Opt-in Edge suite `npx vitest run apps/extension/test/e2e --maxWorkers=1`: 15 files passed, 2 separately gated tests skipped; 25 tests passed, 2 skipped. The suite used only harness-owned browser profiles.
- Focused voice reducer/GatePort/protocol/server-flow tests and the direct WebSocket integration test cover tracked speech IDs, exact `submit survey`, one-use grant dispatch, stale IDs, replay, and invalidation on cancel, stop, repeat, and page change.
- `npm run demo -- --brain=fake --smoke`: passed with `BLIP_DEMO_SMOKE=PASS extension-connected=true voice-connected=true survey-page-selected=true profiles=isolated`.
- 05-11 bounded real-Claude prewarm: 3/8 dispatches, 2 repaired labels, both empty-tool roles accepted, exact identity cache reloaded without a new provider prompt. Elapsed 11,037 ms. Identity SHA-256: `ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2`.

## Requirement status

| Requirement | Status | Evidence / remaining input |
|---|---|---|
| GATE-06 | Complete | 05-10 real-Claude hostile-fixture check; zero gated dispatch and side effects. |
| GATE-07 | Complete | Fixed local warning speech before input enabled; no page prose displayed or spoken. |
| PROT-03 | Complete | Dedicated Edge extension + voice startup and readiness smoke passed. |
| Local synthetic I3 | Complete | Real Edge core voice UI submitted the local survey only after tracked read-back and exact phrase; Claude cache identity validated and reused. The separate voice Phase 2 reducer still needs to adopt the adapter on its branch. |
| DEMO-03 public form | Deferred | User confirmed there is no public-form URL for this hackathon. No substitute public page was opened. |
| Exact demo repair-cache prewarm | Complete | 05-11 one-use report and claim record. |
| Fake fallback | Complete | One-command fake-brain smoke passed with both roles connected. |
| Freeze / `demo-safe` | Pending release | Requires teammate review and merge of `integration/ho8-voice-gate`, adoption/review of the voice Phase 2 reducer against the adapter, then tagging main. |

No credentials, account state, public form data, or unrelated environment values were inspected. The `.chrome-profile` demo cache is local and ignored by Git; the report records only a structural identity hash and sanitized counts.

_Rechecked 2026-10-17 after integration commit `bc6d2f0`._
