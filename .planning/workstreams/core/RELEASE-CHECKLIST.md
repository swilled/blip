# Core Release Checklist

**Updated:** 2026-10-18 01:51 UTC
**Branch:** `integration/ho8-voice-gate`
**Branch tip at reconciliation start:** `ac4fb1c`
**Release state:** Technical Phase 5 acceptance is ready for human review. Do not tag or merge until the remaining written sign-off and teammate review gates are complete.

This checklist records the current evidence and separates it from the remaining human/repository gates. The checks used only loopback fixtures, fictional values, isolated browser profiles, and temporary caches. No credentials or auth state were inspected. Commits `25015c7` and `c6dacf7` are pushed to `origin/integration/ho8-voice-gate` for teammate review. The branch has not been merged or tagged.

## Core acceptance

- [x] **Hostile page:** bounded AGY check 05-13 passed the prompt boundary and refused the premature confirmation with zero acts, submits, navigation, or page changes. See [05-13-LIVE-CHECK.md](phases/05-hostile-pages-real-web-and-freeze/05-13-LIVE-CHECK.md).
- [x] **Warning signal:** GATE-07 fixed warning speech and input gating passed in the dedicated Edge E2E; page prose is not sent to the voice UI.
- [x] **Full AGY I3:** 05-26 verified exact repair identity, AGY cache reuse, intent, fictional fills, tracked read-back, exact phrase, and exactly one local submit. See [the revalidation summary](phases/05-hostile-pages-real-web-and-freeze/05-AGY-REVALIDATION-SUMMARY.md).
- [x] **Launcher cache prewarm:** AGY refreshed the exact `.chrome-profile/demo-repair-cache-v1` entry in 05-27; 05-29 loaded it in a fresh session with zero repair prompts.
- [x] **Fake-brain browser E2Es:** `demo-form.e2e.test.ts` and `voice-warning.e2e.test.ts` passed on the current code.
- [~] **One-command smoke:** a prior run emitted the pass marker. The latest rerun did not emit its completion marker after Edge reused an existing profile; the user's Edge process was left open. Treat a fresh marker as outstanding before freeze.

## Automated checks from this reconciliation

- [x] `npm test` - 114 files passed, 16 skipped; 1,196 tests passed, 27 skipped.
- [x] `npm run typecheck`.
- [x] `npm run ext:build`.
- [x] `npm run build --workspace @blip/voice`.
- [x] `npm run ext:smoke` — fresh isolated Edge profile connected the production extension to the local server. This verifies the extension/server handshake and does not replace the outstanding full demo-launcher smoke.
- [x] Focused repair diagnostics and cache-refresh tests - 8 passed; 2 browser-gated tests skipped in the non-live run.
- [x] Offline I3 preflight for 05-29 - passed with the fake brain, zero provider prompts, and an isolated empty cache.
- [x] Bounded live AGY checks 05-13 (hostile refusal), 05-26 (full I3), and 05-29 (launcher-cache reload) passed.
- [x] `git diff --check` — passed after the final documentation updates.
- [x] Current fake-brain Edge E2Es rerun after the final source changes — 2 files, 2 tests passed.

## Human and repository gates

- [ ] Record the voice owner’s written M0 protocol sign-off in `PROTOCOL.md`; the current file still says approval is pending.
- [ ] Teammate reviews `integration/ho8-voice-gate`, including the AGY live-check evidence and the read-back harness fix.
- [x] Complete the full AGY I3 and launcher-cache prewarm before human release review.
- [ ] Promote the reviewed branch to `main` after acceptance gates pass.
- [ ] Create `demo-safe` on the accepted `main` commit only after the gates above pass.
- [ ] Decide whether to publish the branch/tag to the remote as a separate team release action.

## Deferred scope

- Public-form DEMO-03 remains deferred because the hackathon has no team-owned public-form URL. The local synthetic survey is the Core I3 target; no arbitrary external form was opened.

## Current recommendation

The branch is technically ready for human review. Keep the GSD phase and milestone open until written M0 sign-off, teammate review, mainline promotion, and `demo-safe` tagging are complete. The latest one-command smoke rerun remains inconclusive because Edge reused an existing profile, but an earlier run emitted the pass marker and current fake-brain browser E2Es pass.
