# Repair plan review

Reviewed: 2026-10-18. Scope: 04-04 through 04-08. Review type: inline source-grounded review plus deterministic static checks. No independent-agent checker pass is claimed.

## Results

| Check | Actual result |
|---|---|
| GSD plan-structure, each of five plans | All five valid; three tasks per plan; zero errors/warnings after revision |
| Task completeness | Fifteen tasks include read_first, files, action, acceptance_criteria, verification, and done |
| Dependency order | Five sequential repair waves (4–8), each depends on an existing earlier plan; shared main.ts edits are serialized |
| User-report coverage | Every unresolved voice/input/speed/launch report is mapped in 04-REPAIR-OVERVIEW.md; earlier form and gate issues are regressions |
| GSD failure-direction probe | Zero blockers; two orphan warnings on the explicitly manual checkpoint/evidence-review tasks |
| GSD command-path probe | Returned not_applicable for Windows npm.cmd command forms; this is not a path-validation pass |
| Additional static path/script check | Thirteen automated command blocks; nineteen distinct targets: seventeen exist and two are explicitly declared future tests; zero errors |
| New helper tests pending creation | apps/voice/src/speech-diagnostics.test.ts and apps/voice/src/native-synth.test.ts, owned by 04-04 and 04-06 |
| Source grounding | Official browser documentation plus inspected code from annyang, react-speech-recognition, uiohook-napi, Chromium, react-speech-kit, react-say, and mdn/dom-examples |
| Requirement/status honesty | VOX-01/02/04/07 reopened from user reports; original Phase 4 human rehearsal and freeze evidence remain open |
| Application commands executed | Zero during this planning pass |

## Revisions made during review

1. Added the required what-built, how-to-verify, and resume-signal fields to 04-08's human checkpoint after the first structural check rejected it.
2. Explicitly distinguished automatic browser end from a confirmed runtime root cause; instrument permission, service, native-key, and watchdog paths before claiming this machine's cause.
3. Added capture generation isolation, release-during-restart, terminal-error-without-end, missing end, mixed hold ownership, and disconnect cases that the interrupted draft does not yet prove.
4. Replaced ineffective small linear rate steps with presets derived from inspected Chromium Windows source, while requiring actual installed-voice measurements.
5. Included decimal-aware segmentation, startup-aware deadlines, one rate per logical speech item, and post-failure queue recovery.
6. Included existing settings.rate and server speech accounting so local acknowledgements cannot escape the one-second speech guard.
7. Added a full PTT start/end plus exact-confirmation test; a typed-only successful submit cannot establish the repaired voice path.
8. Kept the user check sequential and simple; the executor captures timings and stops at the first failure.

## Reproduce static checks

From the repository root:

    node .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-REPAIR-CHECK.cjs

The script only reads plans, manifests, and paths. It does not execute any command found in a plan.

For individual plan structure:

    node C:/Users/befit/.codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-08-PLAN.md

For failure directions:

    node C:/Users/befit/.codex/gsd-core/bin/gsd-tools.cjs check verify-failure-directions 4 --ws=voice

The two manual orphan warnings are retained: their failure statements describe human observations rather than an automated command. They are not fabricated test passes.

## Remaining limits

- The exact cause of this machine's early termination is unobserved until a new-build trace exists.
- The installed Windows Chrome voice must confirm that the selected rate levels are perceptibly useful.
- Browser background-capture restrictions can defeat global-key delivery even when the key hook works. The plan requires a focus-ready implementation or an honest unresolved criterion, not a hidden fallback counted as success.
- Native speech recovery must preserve the server gate; no estimated completion, guessed text, or automatic retry can authorize submission.
- The existing dirty stt.ts implementation draft remains outside the planning commit. It must be reconciled and tested in 04-05.

Disposition: the five repair plans are structurally valid and ready for execution, with the explicit runtime uncertainties and manual evidence requirements above.
