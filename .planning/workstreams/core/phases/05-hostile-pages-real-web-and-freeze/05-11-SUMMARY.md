---
phase: 05-hostile-pages-real-web-and-freeze
plan: 05-11
status: executed
verified: 2026-10-17
requirements-completed: [GATE-06, GATE-07, PROT-03]
---

# Phase 5 Plan 05-11: Local Voice Integration and Synthetic Demo Summary

## Scope decision

The core owner confirmed this hackathon has no public-form URL and asked Core to test the project itself. Phase 5 I3 is therefore verified against the repository's self-hosted synthetic survey with fictional values. Voice-owned public-form requirement DEMO-03 remains deferred; this does not claim a public site was tested.

## Delivered

- Added the first-party local voice window at `/voice/`, with typed input, available browser push-to-talk, fixed GATE-07 warning speech, tracked `speakId` completion, and stop/repeat controls. Warning text is fixed client copy and never includes page prose.
- Added `confirm.redeem` for the voice reducer's current grant/read-back IDs and exact phrase. The server adapter maps it into the existing Executor. The server rechecks phrase, completed `speakId`, grant ID, page binding, cooldown, and expiry; only the server consumes a `ConsumedGrant` and passes it to GatePort.
- Kept generic mismatched utterances as cancellation. Cancel, stop, repeat, and page-change invalidate the reducer's grant; replay and stale read-back IDs do not dispatch.
- Added a same-origin synthetic survey and local submit reporter. The actual Edge voice window filled fictional fields and completed the gated local submit without reaching the submit sink.
- Updated the one-command launcher to keep the extension on the survey page and open voice in its own dedicated profile; smoke readiness requires both roles.
- Added a bounded real-Claude repair/cache check for the exact local survey identity.

## Verification

- `npm test -- --maxWorkers=1`: PASS, 82 files passed / 16 skipped; 884 tests passed / 25 skipped.
- `npm run typecheck`: PASS.
- Focused reducer, GatePort, protocol, and server-flow checks: PASS, 134 tests.
- Edge E2E matrix: PASS, 15 files / 25 tests; 2 separately gated tests skipped. The UI-driven synthetic survey test passed with the actual voice reducer and exact confirmation.
- `npm run demo -- --brain=fake --smoke`: PASS. Marker: `BLIP_DEMO_SMOKE=PASS extension-connected=true voice-connected=true survey-page-selected=true profiles=isolated`.
- Bounded Claude cache prewarm: PASS in 11.0 seconds with 3/8 SDK dispatches. Two model-sourced labels were repaired; both SDK roles accepted empty tools; the validated entry reloaded without another provider prompt. Exact page identity SHA-256: `ddecb18b6fa05cbe627dd0edafda2a38b8d231ec408bcb37ea0460848ba3c7d2`. The one-use approval and claim are recorded in `05-11-REPAIR-CACHE-LIVE-CHECK.md` and its `.used` file.
- The 05-10 real-Claude hostile-fixture check remains the evidence for GATE-06.

## Remaining release step

Local Phase 5 acceptance is complete for GATE-06, GATE-07, PROT-03, local synthetic I3, exact demo-cache prewarm, and the fake fallback. DEMO-03 remains explicitly deferred. The `demo-safe` tag is not created on this integration branch: the team's contribution rules require teammate review of changes to the Executor/gate before mainline merge and release tagging.

## HO-8 voice reducer integration follow-up

- Fetched `origin/voice/phase-2-dialogue-gateport` at `2f22bb5` and merged its Phase 2 reducer/runtime into the core integration branch.
- Connected the reducer's `arm`, `clear`, and `redeem` lifecycle through `createCoreDialogueGatePort`; the server remains the only owner of the one-use grant and `ConsumedGrant` dispatch.
- Re-verified the first-party UI's direct `confirm.redeem` handoff on 2026-10-18. The DialogueRunner now reconciles completion and accepts the next ordinary request after one local submit; see `05-VERIFICATION.md` and the `demo-form.e2e.test.ts` browser proof.
- Added automated checks for server-tracked read-back `speakId`, exact `submit survey`, refusal of bare `yes`, one-use submission, and grant invalidation on cancel, stop/repeat, PTT, or page change.
- Ran the integrated reducer through the production extension in a harness-owned browser profile against the local synthetic form. The exact phrase produced one submit and the page's confirmation result; the read-back did not reveal the fictional card number.
- Verification: `npm test -- --maxWorkers=1` passed (113 files, 1,189 tests; 16 files and 26 tests skipped); `npm run typecheck`, `npm run ext:build`, and `npm run build --workspace @blip/voice` passed; `BLIP_E2E_BROWSER=1 npx vitest run apps/extension/test/e2e/gated-flow.e2e.test.ts` passed (2/2).

The HO-8 implementation is complete on the integration branch. Teammate review and mainline promotion remain external release steps before `demo-safe` tagging. DEMO-03 stays deferred because no public-form URL exists for this hackathon.
