---
phase: 04-claude-brain-and-label-repair
plan: 04-04
subsystem: privacy
tags: [typescript, vitest, sensitive-values, extension, server]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: Extension-local sensitive-value detection and post-write read-back protection
  - phase: 04-03
    provides: Value-free page projection and the provider prompt boundary
provides:
  - Pure shared Luhn, SSN, and broad card-shape predicates exported from @blip/policy/sensitive-shapes
  - Extension sensitivity checks backed by the shared Luhn and SSN implementation
  - Typed pre-provider decisions that redact field commands or withhold secret-bearing utterances for local handoff
affects: [04-06, BRAIN-02, intent-routing]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure shared value-shape predicates, fail-closed secret handoff before provider input]

key-files:
  created:
    - packages/policy/src/sensitive-shapes.ts
    - packages/policy/test/sensitive-shapes.test.ts
    - apps/server/src/brain/claude/privacy.ts
    - apps/server/test/brain-privacy.test.ts
  modified:
    - packages/policy/package.json
    - apps/extension/src/content/sensitive.ts
    - apps/extension/test/sensitive.test.ts

key-decisions:
  - "Classify digit/space/hyphen runs containing 13-19 digits as card-shaped even when the Luhn checksum is mistyped, so a dictation error does not send a near-valid card value to the provider."
  - "Keep DOM semantics, safeValueOf, and post-write observation checks in the extension; share only pure shape predicates."
  - "Return a focus-and-type handoff only for one deterministic field target; otherwise return value-free clarification."

patterns-established:
  - "Provider-bound field commands use safePhraseForBrain, which omits fill values and select options."
  - "Secret detection returns only a typed decision and safe target metadata; it does not log, speak, cache, or pass through the source utterance."

requirements-completed: [BRAIN-02]

# Metrics
duration: 7min
completed: 2026-10-17
---

# Phase 4 Plan 04-04: Shared Sensitive-Shape Gate Summary

**Shared browser-safe shape checks now back extension protection, while a server privacy gate redacts commands and routes recognizable secrets to a value-free local handoff.**

## Performance

- **Duration:** 7 min (approximate)
- **Started:** 2026-10-17T08:20:00Z (approximate)
- **Completed:** 2026-10-17T08:26:48Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Extracted the existing Luhn and conventional SSN predicates into the dependency-free policy subpath `@blip/policy/sensitive-shapes`; added a broad 13–19 digit card-shape classifier for provider-bound utterances.
- Rewired extension classification to use the exact shared Luhn and SSN functions. Existing DOM-based sensitivity, `safeValueOf`, and post-write shape checks remain in the extension.
- Added a typed privacy decision gate. It applies `safePhraseForBrain` to field commands, catches password-labeled phrases and card/SSN-shaped spans, and returns only a unique safe field id/label for focus-and-type. Ambiguous or unresolved targets get a fixed value-free clarification.
- Added offline sentinel coverage for provider input, diagnostic text, speech, and serialized cache bytes; the withheld branch makes no provider call or cache write.

## Task Commits

1. **Task 1: Extract pure sensitive-shape predicates** - `d707d86` (test), `a6fb53c` (feat)
2. **Task 2: Reuse shared predicates in the extension** - `54ffca1` (test), `640f2fb` (refactor)
3. **Task 3: Gate secret-bearing utterances before provider input** - `5937fd4`, `c190c54` (test), `baa5fde` (feat)

## Files Created/Modified

- `packages/policy/src/sensitive-shapes.ts` - pure Luhn/SSN predicates and broad card-shape classification.
- `packages/policy/package.json` - explicit `./sensitive-shapes` export.
- `packages/policy/test/sensitive-shapes.test.ts` - boundary and Node-without-DOM tests.
- `apps/extension/src/content/sensitive.ts` - imports and re-exports the shared Luhn/SSN predicates; DOM checks remain local.
- `apps/extension/test/sensitive.test.ts` - verifies shared predicate identity and boundary parity.
- `apps/server/src/brain/claude/privacy.ts` - typed safe, redacted-command, and withhold-and-handoff decisions.
- `apps/server/test/brain-privacy.test.ts` - redaction, shape detection, handoff, ambiguity, and sentinel sink assertions.

## Decisions Made

- Broad card-shape detection intentionally includes 13–19 digit values with a bad Luhn checksum; the extension's established Luhn read-back behavior is unchanged.
- A private or shape-bearing value is withheld even when the user's command names an otherwise ordinary text field. The extension's focus-and-type and post-write protections remain the action boundary.
- No live provider, SDK adapter startup, or credential access was used.

## Deviations from Plan

None - plan executed as written.

## Verification

- `npx vitest run --project @blip/policy packages/policy/test/sensitive-shapes.test.ts` — passed, 4 tests.
- `npx vitest run --project @blip/extension apps/extension/test/sensitive.test.ts apps/extension/test/act.test.ts apps/extension/test/acts-sw.test.ts` — passed, 36 tests; includes post-write card-value refusal coverage.
- `npx vitest run --project @blip/server apps/server/test/brain-privacy.test.ts` — passed, 7 tests.
- `npm run typecheck` — passed.
- `npm run ext:typecheck` — passed.
- Stub scan found no TODO, FIXME, placeholder, or coming-soon stubs in the plan files.

## Issues Encountered

- The first server privacy test run exposed fixtures that already contained a sensitive card field, so the unique-target assertions were ambiguous. The tests now use an ordinary-field baseline for those cases and explicitly add a second password field for the ambiguity case.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-06 can call `decideUtteranceForBrain` immediately before any Claude provider call and handle the value-free focus-and-type or clarification decision locally.
- The extension still independently refuses unsafe post-write read-back; integration must retain this runtime recheck.
- The live `outputFormat` plus `startup()` spike remains unconfirmed and the D-01 fallback remains provisional.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Summary file exists at the plan output path.
- All seven task commits are present in git history.
- Stub scan found no placeholder implementations in the files created or modified by this plan.
