---
phase: 04-nvda-mode-and-demo-safe
plan: "08"
status: complete
completed: 2026-10-18
provides: [microsoft-forms-required-state, current-repair-evidence, phase-4-acceptance-ledger]
---

# 04-08 execution summary

Microsoft Forms required-field extraction now reads the empty `requiredStar` accessibility note from the control's nearest `questionItem`. A regression test verifies that the required state is detected and does not leak to the adjacent optional question. The source fix and test are in commit `f6ec6c9` (`fix(extension): read Microsoft Forms required markers`). The submit gate was not changed.

The user rechecked the restarted updated demo build `67114f9-dirty-2026-10-18T07:00:58.786Z` and confirmed that Blip listed exactly Employment type, Department, Leave type, Leave date, and Return date as required, while excluding optional questions. No public-form submission was attempted. The user also reports that microphone input and faster/slower speech work. No per-route hold counts, diagnostic audio trace, or three-level timing measurements were retained; the verification ledger records these as user-reported behavior and keeps quantitative evidence open.

Validation passed:

- `npm.cmd test` — 127 test files passed, 16 skipped; 1,316 tests passed, 28 skipped.
- `npm.cmd run typecheck` and `npm.cmd run typecheck --workspace @blip/extension` — passed.
- `npm.cmd run build --workspace @blip/voice` and `npm.cmd run build --workspace @blip/extension` — passed.
- `npm.cmd test -- dev/mock-server/src/demo-runbook.test.ts` — 2 tests passed.

The plan's evidence update records VOX-01, VOX-02, and VOX-07 as user-confirmed working and identifies the Microsoft required-field subcheck as passed. The full Phase 4 goal remains open: NVDA exact completion or D-16 disposition, live negative validation and three consecutive submissions, fallback/hotspot/recorder rehearsal, three-minute video, and freeze review are not established. No `demo-safe` tag was created.

The hold-to-talk documentation now reflects the user's no-fixed-time-limit requirement: capture ends on button release or release of both Right Ctrl and Space. Device loss, cancellation, replacement, and capture/flush failure still discard incomplete audio.
