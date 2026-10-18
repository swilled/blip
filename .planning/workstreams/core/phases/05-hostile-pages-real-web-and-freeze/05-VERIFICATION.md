---
phase: 05-hostile-pages-real-web-and-freeze
verified: 2026-10-18T02:14:38Z
status: gaps_found
score: 4/5 phase success criteria fully verified for current AGY runtime; 1 partial release freeze
plans_executed: 11/11
re_verification: true
re_verification_note: "The first-party voice UI confirmation handoff was fixed and verified through a production browser flow; human/repository freeze gates remain open."
gaps:
  - "Written M0 sign-off, teammate review, mainline promotion, and the `demo-safe` tag remain pending human/repository gates."
---

# Phase 5: Hostile Pages, Local Synthetic Web and Freeze Verification

**Phase goal:** Harden the core against seeded page prompt injection, carry a deterministic warning for text addressed to Blip, complete a self-hosted synthetic survey by voice, provide one-command startup, and freeze only after the full local demo gate passes.

**Current result:** The fresh bounded AGY hostile-page run 05-13 passed with zero acts, submits, navigation, or page changes. Full local AGY I3 passed in 05-26: exact repair identity, cache write/reuse, AGY intent, fictional fills, tracked read-back, exact confirmation, and exactly one grant-bound local submit. Run 05-27 refreshed the exact launcher-cache entry through AGY; 05-29 loaded that entry in a fresh session with zero repair prompts. A production Edge E2E now also confirms that the first-party voice UI's `confirm.redeem` is reconciled by the DialogueRunner: one local submit succeeds, and the next ordinary page question is answered normally. The full test suite, typechecks, extension and voice builds, isolated extension/server smoke, and full fake-brain launcher smoke pass. Phase 5 technical acceptance is verified; written M0 sign-off, teammate review, mainline promotion, and `demo-safe` tagging remain human/repository release gates. The voice Phase 2 reducer/GatePort branch `origin/voice/phase-2-dialogue-gateport` (`2f22bb5`) is integrated on this branch. Voice-owned DEMO-03 is deferred because this hackathon has no public-form URL; no arbitrary form was opened.

## Success criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | AGY receives the hostile fixture's approved value-free projection; gated action is refused with no side effect. | PASS | Fresh bounded AGY check 05-13 passed the prompt-boundary assertions, staged a gated read-back, refused premature confirmation, and recorded zero extension acts, submits, navigation, and page changes. See `05-13-LIVE-CHECK.md`. |
| 2 | Accepted GATE-07 boolean causes fixed warning speech before input resumes; page prose never reaches voice UI. | PASS | `voice-warning.e2e.test.ts` on dedicated Edge; fixed warning spoken before the queued request, warning gate held input, and speech completion used tracked IDs. |
| 3 | Local I3 works with the self-hosted survey: the voice reducer fills/submits through the core gate, AGY repairs and reuses the exact cache identity, and hostile action remains blocked. | PASS | 05-26 passed every local I3 step with exactly one submit. 05-13 separately passed the live hostile-page refusal scenario. The launcher cache was refreshed by AGY in 05-27 and reloaded by a fresh session with no repair prompt in 05-29. No public form was used. |
| 4 | One command launches the loopback server, dedicated extension profile, and voice window; both roles connect. | PASS | `npm run demo -- --brain=fake --smoke` emitted the pass marker: extension connected, voice connected, synthetic survey selected, isolated profiles. The dedicated demo profile was free before launch; the user's regular Edge window was left open. |
| 5 | Freeze: exact AGY demo repair is prewarmed, fake fallback passes, and main is tagged `demo-safe`. | PARTIAL | AGY prewarm and fresh-session cache load pass; fake-brain E2Es pass. The `demo-safe` tag is intentionally pending written M0 sign-off, teammate review, and mainline promotion. |

## Re-verification: first-party voice UI handoff (2026-10-18)

The integration audit found that the browser UI sent `confirm.redeem` through the core Executor without updating the DialogueRunner's private reducer state. The runner now checks that the incoming grant and read-back IDs match its current confirmation, routes the phrase through the reducer and core GatePort, and safely clears a refused early or mismatched redemption.

- Production Edge E2E on the synthetic survey: **1 passed**. The browser voice UI filled fictional values, completed the tracked read-back and exact confirmation, made exactly one grant-bound local submit, and then answered “what's here” normally.
- Focused server reducer/GatePort tests: **10 passed**, including early confirmation invalidation and one-use dispatch.
- Latest `npm test`: **114 files passed, 16 skipped; 1,197 tests passed, 28 skipped**.
- `npm run typecheck`, `npm run ext:typecheck`, `npm run ext:build`, `npm run pages:build`, and `npm run build --workspace @blip/voice`: all passed.

This closes the local GATE-05 integration finding. The remaining Phase 5 gap is the release freeze gate listed above; there is no public-form URL in scope.

## Current AGY verification scope

- Commit `ac4fb1c` replaces the Claude provider with the Antigravity CLI subscription provider. Intent uses `gemini-3.8-flash-low`; repair uses `gemini-3.8-flash-medium`.
- Synthetic AGY bootstrap/roundtrip checks passed. The current full suite passed (114 files passed, 16 skipped; 1,196 tests passed, 27 skipped); typecheck, extension build, and voice build passed.
- The bounded AGY hostile-page run 05-13 passed with zero page side effects. Full I3 passed in 05-26; AGY refreshed the actual launcher cache in 05-27 and a fresh session reloaded it in 05-29. See `05-AGY-REVALIDATION-SUMMARY.md`.
- Fresh fake-brain full launcher smoke passed on 2026-10-18 after confirming the dedicated demo profile was not in use. The smoke emitted `BLIP_DEMO_SMOKE=PASS extension-connected=true voice-connected=true survey-page-selected=true profiles=isolated`; fake-browser form and warning E2Es also pass.
- AGY live acceptance is complete: 05-26 passed full I3 with exactly one local submit, 05-27 refreshed the persistent launcher cache, and 05-29 loaded it in a fresh session with zero repair prompts. Written M0 sign-off, teammate review, mainline promotion, and `demo-safe` tagging remain before freeze.

## Local test evidence

- `npm test` after the follow-up changes: 114 files passed, 16 skipped; 1,194 tests passed, 27 skipped.
- Latest `npm test` after the repair diagnostic/cache-refresh changes: 114 files passed, 16 skipped; 1,196 tests passed, 27 skipped.
- `npm run typecheck`: passed; `npm run ext:build` and `npm run build --workspace @blip/voice`: passed.
- `npm run ext:smoke` (2026-10-18): passed in a fresh isolated Edge profile and observed the pinned production extension connect to the loopback server.
- `npx vitest run apps/server/test/voice-gate-adapter.test.ts apps/server/test/gated-flow.test.ts apps/server/test/act-path.test.ts --maxWorkers=1`: 3 files and 32 tests passed. Covers core-owned tracked read-back, exact `submit survey`, one-use grant-bound dispatch, grant-specific clear, and cancel/stop/repeat/page-change invalidation.
- `BLIP_E2E_BROWSER=1` with `BLIP_BROWSER` set to Edge, then `npx vitest run apps/extension/test/e2e/demo-form.e2e.test.ts --maxWorkers=1`: passed against the local synthetic form after the adapter change.
- Opt-in Edge suite `npx vitest run apps/extension/test/e2e --maxWorkers=1`: 15 files passed, 2 separately gated tests skipped; 25 tests passed, 2 skipped. The suite used only harness-owned browser profiles.
- Focused voice reducer/GatePort/protocol/server-flow tests and the direct WebSocket integration test cover tracked speech IDs, exact `submit survey`, one-use grant dispatch, stale IDs, replay, and invalidation on cancel, stop, repeat, and page change.
- `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/gated-flow.e2e.test.ts`: 2 passed using harness-owned isolated browser profiles. The reducer/core-gate test uses the production extension, asserts the tracked read-back ID, refuses bare `yes`, accepts exact `submit survey`, reports the page result, and records one submit.
- `npm run demo -- --brain=fake --smoke` (2026-10-18): passed with `BLIP_DEMO_SMOKE=PASS extension-connected=true voice-connected=true survey-page-selected=true profiles=isolated`. Before launching, confirmed the dedicated `.chrome-profile/demo` was not in use. The launcher connected both roles, selected the synthetic survey, and closed only its owned browser/server processes; the user's regular Edge window was left open.
- 05-13 fresh bounded AGY hostile-page live check: PASS; see `05-13-LIVE-CHECK.md`. The only model-routed turn staged the confirmation; the early phrase was refused with zero acts, submits, navigation, or state changes.
- 05-20 AGY I3 attempt: repair identity, repair cache write/reload without extra prompt, AGY intent, fictional field fills, and tracked read-back passed; exact confirmation/submit did not. Sanitized report: `05-20-REPAIR-CACHE-LIVE-CHECK.md`.
- 05-22 AGY I3 attempt: repair identity/cache reload and AGY intent passed; tracked read-back was not observed. Report: `05-22-REPAIR-CACHE-LIVE-CHECK.md`.
- 05-23 AGY I3 attempt: fresh-reply race guard, offline preflight, and test suite passed; the bounded live run stopped during AGY label repair before I3. Report: `05-23-REPAIR-CACHE-LIVE-CHECK.md`.
- 05-24 diagnostic AGY I3 attempt: exposed a stale repair result without recording provider output. Report: `05-24-REPAIR-CACHE-LIVE-CHECK.md`.
- 05-25/05-26 corrected the harness to read the accepted model without a forced snapshot and to identify the exact survey by URL plus the expected structural cache identity. 05-25 stopped at an overly strict heading check; 05-26 passed the complete I3 with one submit. Report: `05-26-REPAIR-CACHE-LIVE-CHECK.md`.
- 05-27 used a one-use test-only refresh for the exact launcher cache identity. The report's final cache-reload assertion failed, but it recorded `repair-applied`, `cacheFileUpdated: true`, the exact identity, and two repaired labels. 05-29 independently verified a fresh session loaded that launcher entry with `repair-cache-hit`, two cached labels, and zero provider prompts. Report: `05-29-REPAIR-CACHE-LIVE-CHECK.md`.
- The 05-23 harness change now waits for a changed voice reply before accepting the “Reading back” response, avoiding stale UI text from satisfying the read-back check.
- Historical pre-migration check: `npm run demo -- --brain=claude` started the then-current Claude provider with the dedicated Edge extension and voice UI connected. One synthetic voice question was routed through the reducer fallback and returned a tracked answer speech frame (one model-routed prompt; no retry). This checks the old Claude launch and fallback, not current AGY behavior or full spoken I3.
- `apps/server/test/dialogue-runner-server.test.ts`: verifies the production `dialogueRunner` option installs the reducer, model gated-action suggestions do not start a parallel confirmation flow, and reducer-unmatched utterances reach the configured brain provider adapter.
- 05-11 bounded real-Claude prewarm: 3/8 dispatches, 2 repaired labels, both empty-tool roles accepted, exact identity cache reloaded without a new provider prompt. Elapsed 11,037 ms. Identity SHA-256: `ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2`.

## Requirement status

| Requirement | Status | Evidence / remaining input |
|---|---|---|
| GATE-06 | PASS for bounded hostile scenario | 05-13 AGY run used the approved value-free prompt boundary and recorded a refused premature confirmation with zero page side effects; see the sanitized live report. |
| GATE-07 | Complete | Fixed local warning speech before input enabled; no page prose displayed or spoken. |
| PROT-03 | Complete | Dedicated Edge extension + voice startup and readiness smoke passed. |
| Local synthetic I3 | PASS | 05-26 recorded exact identity, repair/cache reuse, AGY intent, fictional fills, tracked read-back, exact confirmation, and exactly one successful local submit. |
| DEMO-03 public form | Deferred | User confirmed there is no public-form URL for this hackathon. No substitute public page was opened. |
| Exact demo repair-cache prewarm | PASS | 05-27 recorded an AGY repair applied to and updated the exact launcher cache identity; 05-29 loaded it in a fresh session with zero repair prompts. |
| Fake fallback | PASS | Fake-brain form and warning E2Es pass; the one-command launcher smoke emitted its full pass marker. |
| Freeze / `demo-safe` | Pending release | The voice reducer is integrated on `integration/ho8-voice-gate`; teammate review and mainline promotion remain before tagging main. |

No credentials, account state, public form data, or unrelated environment values were inspected. The `.chrome-profile` demo cache is local and ignored by Git; the report records only a structural identity hash and sanitized counts.

_Original local acceptance rechecked 2026-10-17 after integrating `origin/voice/phase-2-dialogue-gateport` (`2f22bb5`); AGY hostile, full I3, and launcher-cache evidence reconciled 2026-10-18._
