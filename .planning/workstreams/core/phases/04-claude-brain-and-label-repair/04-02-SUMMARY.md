---
phase: 04-claude-brain-and-label-repair
plan: 04-02
subsystem: brain
tags: [claude-agent-sdk, streaming, zod, provider-isolation]

# Dependency graph
requires:
  - phase: 03-gated-submit-and-result-reading
    provides: Deterministic action authority and the tool-less model boundary
  - phase: 04-01
    provides: Exact SDK pin and the provisional streaming/Zod fallback decision
provides:
  - Isolated intent and repair SDK roles with prewarm, init tool validation, abort, recreation, and shutdown
  - Typed JSON/Zod provider operations backed by an offline injectable SDK adapter
  - Server startup selection for fake or Claude mode, preserving the offline fake path
affects: [04-06, 04-07, BRAIN-01, BRAIN-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Dynamic SDK import only for Claude mode", "Empty temporary cwd per role", "Generation-checked role recreation"]

key-files:
  created:
    - apps/server/src/brain/claude/provider.ts
    - apps/server/src/brain/claude/session.ts
    - apps/server/test/claude-provider.test.ts
    - apps/server/test/server-brain.test.ts
  modified:
    - apps/server/src/server.ts
    - apps/server/src/main.ts
    - scripts/dev.ts
    - apps/server/test/cli.test.ts
    - apps/server/test/dev-script.test.ts
    - apps/server/test/walking-skeleton.test.ts

key-decisions:
  - "Use the documented streaming-input, JSON-only prompt, and local Zod fallback provisionally; the live outputFormat plus startup composition remains unmeasured."
  - "Keep the existing raw-text turn seam blocked for Claude until Plan 04-06 installs the privacy-gated projection router."
  - "Leave BRAIN-03 incomplete until the watchdog is integrated and verified by Plan 04-06."

patterns-established:
  - "The Agent SDK is imported dynamically only when Claude mode creates an SDK session; fake mode remains SDK-independent."
  - "Each role has its own empty temporary working directory, environment/config policy, process lifecycle, and model setting."
  - "Role recreation invalidates the old generation before closing it, so late results cannot be accepted by a replacement role."

requirements-completed: [BRAIN-01]

# Metrics
duration: 8m
completed: 2026-10-17
---

# Phase 4 Plan 2: Isolated Claude Provider Summary

**Separate, prewarmed intent and repair roles now fail closed on unexpected tools and remain testable through an offline SDK adapter.**

## Performance

- **Duration:** 8m
- **Started:** 2026-10-17T08:12:00Z (approximate)
- **Completed:** 2026-10-17T08:19:48Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added separately configured Haiku intent and Sonnet repair roles. Both use `tools: []`, `settingSources: []`, strict empty MCP config, `permissionMode: "dontAsk"`, an empty temporary `cwd`, disabled auto-memory and Claude.ai connectors, and a copied host environment without `ANTHROPIC_API_KEY`.
- Added an injectable SDK boundary with startup init-tool validation, strict JSON/Zod parsing, role abort/recreation, and generation checks against late results.
- Made fake and Claude brain selection available in the server CLI and dev runner. The fake path remains independent of SDK import or startup.
- Prewarm both Claude roles before the HTTP listener accepts work and close both on server shutdown. A Claude init event that reports any tool rejects startup.
- Blocked the old raw-utterance turn seam from reaching the provider until Plan 04-06 installs the privacy gate and sanitized projection.

## Task Commits

1. **Task 1: Define the isolated Claude role provider and fail-closed SDK session** - `ad3fe91` (`feat(04-02): add isolated Claude role sessions`)
2. **Task 2: Select the provider at server startup and prewarm both roles** - `28aee85` (`feat(04-02): select Claude provider at startup`)

## Files Created/Modified

- `apps/server/src/brain/claude/session.ts` - SDK role config, session lifecycle, clean temporary working directories, init tool refusal, and generation invalidation.
- `apps/server/src/brain/claude/provider.ts` - typed Intent/repair calls, local JSON/Zod validation, and role lifecycle API.
- `apps/server/test/claude-provider.test.ts` - offline assertions for both role configs, schema rejection, init refusal, and recreation races.
- `apps/server/test/server-brain.test.ts` - fake-mode independence, prewarm-before-listen, fail-closed startup, and raw-turn privacy guard tests.
- `apps/server/src/server.ts` - mode selection, startup/close lifecycle, and interim privacy guard for the legacy turn seam.
- `apps/server/src/main.ts`, `scripts/dev.ts` - expose Claude mode through the two existing server entry points.
- `apps/server/test/cli.test.ts`, `apps/server/test/dev-script.test.ts`, `apps/server/test/walking-skeleton.test.ts` - remove obsolete expectations that Claude mode is unavailable; never test the real SDK in those subprocess tests.

## Decisions Made

- Plan 04-01 did not receive confirmation for a live SDK request, so this plan uses the documented streaming-input fallback with JSON-only prompts and local schema parsing. This is a safe provisional choice, not a measured live spike result. No model request was sent.
- The old `turn.ts` path sends raw unmatched text to its `IntentBrain`; Claude mode fails closed there until Plan 04-06 routes through the privacy gate and page projection.
- BRAIN-01 is implemented. BRAIN-03 remains pending because the watchdog's spoken fallback and turn-queue recovery are implemented by Plan 04-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Kept raw utterances off the provider before the privacy router exists**
- **Found during:** Task 2 (provider startup integration)
- **Issue:** The current legacy turn seam could pass raw unmatched text directly into Claude before Plan 04-04's privacy gate and Plan 04-06's router are integrated.
- **Fix:** Claude mode injects a failing compatibility brain into the old turn seam; the provider remains available for the sanitized router. Added a sentinel test asserting no provider call or echoed secret.
- **Files modified:** `apps/server/src/server.ts`, `apps/server/test/server-brain.test.ts`
- **Verification:** `server-brain.test.ts` passed with the injected adapter and sentinel utterance.
- **Committed in:** `28aee85`

**2. [Rule 3 - Blocking Compatibility] Enabled the existing server and dev entry points for Claude mode**
- **Found during:** Task 2 (server selection)
- **Issue:** Both entry points still rejected `--brain=claude` before calling `startServer`, so the new provider could not be selected through the product commands.
- **Fix:** Allow `fake|claude` in `main.ts` and `scripts/dev.ts`, preserve fake as the default, and update outdated tests to reject only an unknown mode. The dev-script suite is not allowed to start the real SDK in tests.
- **Files modified:** `apps/server/src/main.ts`, `scripts/dev.ts`, `apps/server/test/cli.test.ts`, `apps/server/test/dev-script.test.ts`, `apps/server/test/walking-skeleton.test.ts`
- **Verification:** Typecheck passed; the offline dev-runner invalid-mode test passed.
- **Committed in:** `28aee85`

---

**Total deviations:** 2 auto-fixed (one Rule 2, one Rule 3). **Impact:** Required for safe intermediate operation and usable server mode selection; no protocol or action authority changes.

## Verification

- `npx vitest run --project @blip/server apps/server/test/claude-provider.test.ts apps/server/test/server-brain.test.ts` — passed, 8 tests.
- `npx vitest run --project @blip/server apps/server/test/dev-script.test.ts -t "unknown brain mode"` — passed, 1 test (6 skipped by filter).
- `npm run typecheck` — passed.
- An earlier full server-suite attempt passed 284 tests but failed one stale dev-runner test that still expected Claude mode to exit. That test was updated to use an invalid mode. The full suite was not rerun because its former path started the real SDK; no model prompt was sent. No credentials were inspected.
- D-01's live `outputFormat` + `startup()` composition and real SDK streaming behavior remain untested. Do not claim the fallback was selected from live measurements.

## User Setup Required

None for offline/fake mode. A live provider call is still gated by the separate owner-use confirmation; this plan did not access credentials or send a model prompt.

## Next Phase Readiness

- Plan 04-06 can call `parseIntent`, `abortRole`, and `recreateRole` through the provider API after its privacy-approved prompt construction is installed.
- Plan 04-07 can use `repairFormModel` for the isolated descriptive repair role.
- Keep D-01 provisional. The implementation is based on the documented fallback, and BRAIN-03 remains incomplete until the watchdog and next-turn recovery tests land.

---
*Phase: 04-claude-brain-and-label-repair*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Provider, session, both offline test files, and this summary exist.
- Task commits `ad3fe91` and `28aee85` exist in repository history.
- Stub scan found no TODO, FIXME, placeholder, or coming-soon implementations in the plan's provider/session source and tests.
