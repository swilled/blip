---
phase: 02-real-page-read-and-fill
plan: 02
subsystem: testing
tags: [npm, workspaces, esbuild, jsdom, vitest, react]

# Dependency graph
requires:
  - phase: 02-real-page-read-and-fill
    provides: Human approval of the exact browser-test dependency pins
provides:
  - Extension and test-page npm workspace manifests with the approved exact dependency versions
  - Extension-local TypeScript and jsdom test configuration
affects: [02-03, 02-13, 02-14]

# Tech tracking
tech-stack:
  added: [esbuild@0.28.2, jsdom@29.1.1, @types/chrome@0.3.5, react@18.3.1, react-dom@18.3.1]
  patterns: [Keep Chrome ambient types scoped to the extension TypeScript project, use jsdom for extension unit tests]

key-files:
  created:
    - apps/extension/package.json
    - apps/extension/tsconfig.json
    - apps/extension/vitest.config.ts
    - tools/test-pages/package.json
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "Installed only the exact package pins approved in plan 02-01, in their assigned workspaces."
  - "Kept extension Chrome typings local with types set only in apps/extension/tsconfig.json."
  - "Allowed an empty initial extension test workspace to pass until later plans add tests."

patterns-established:
  - "Use the existing apps/* and tools/* npm workspace globs for new workspaces."
  - "Root extension commands delegate to scripts in @blip/extension."

requirements-completed: [PAGE-05]

# Metrics
duration: 4m
completed: 2026-10-16
---

# Phase 2 Plan 2: Browser Workspace Setup Summary

**Approved browser tooling is pinned in dedicated workspaces, with extension-only Chrome typings and a jsdom test configuration.**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-10-17T02:33:55Z
- **Completed:** 2026-10-17T02:37:51Z
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments

- Added `@blip/extension` and `@blip/test-pages` package manifests under the existing npm workspace globs.
- Installed the exact approved pins: extension `esbuild@0.28.2`, `jsdom@29.1.1`, `@types/chrome@0.3.5`; test pages `esbuild@0.28.2`, `react@18.3.1`, and `react-dom@18.3.1`.
- Added root commands for extension build, watch, typecheck, and tests; ignored the dedicated `.chrome-profile/` directory.
- Added an extension TypeScript config that scopes Chrome ambient types to this package and a jsdom Vitest config.

## Task Commits

1. **Task 1: Register workspaces and install only the approved exact pins** - `d3fcd39` (`chore`)
2. **Task 2: Add extension-only TypeScript and Vitest configuration** - `724dbc8` (`chore`)

**Additional fix:** `6420a25` points build scripts at the `build.ts` entrypoints specified by the later extension and fixture plans.

**Plan metadata:** Added with the final STATE.md and ROADMAP.md documentation commit.

## Files Created/Modified

- `package.json` - Root commands delegate to the extension workspace.
- `package-lock.json` - Locks the approved dependency versions and their transitive dependencies.
- `.gitignore` - Ignores the dedicated browser profile; existing `dist/` coverage includes generated build output.
- `apps/extension/package.json` - Extension build, watch, typecheck and test commands plus approved dev dependencies.
- `apps/extension/tsconfig.json` - Strict extension-local TypeScript settings with only Chrome ambient types.
- `apps/extension/vitest.config.ts` - jsdom test environment and extension test discovery.
- `tools/test-pages/package.json` - Fixture build command and approved React/esbuild dependencies.

## Decisions Made

- Kept all approved dependency pins exact and in the approved workspaces.
- Used the existing `apps/*` and `tools/*` workspace globs instead of changing the root workspace list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made extension checks work before source and test files exist**
- **Found during:** Task 2
- **Issue:** The initial extension TypeScript project had no input files, and Vitest exited nonzero when its new test directory was empty.
- **Fix:** Included the real `vitest.config.ts` in extension typechecking and set `passWithNoTests` for this bootstrap stage; future `src/` and `test/` files remain included.
- **Files modified:** `apps/extension/tsconfig.json`, `apps/extension/vitest.config.ts`
- **Verification:** `npm run ext:typecheck` and `npm run ext:test` passed.
- **Committed in:** `724dbc8`

**2. [Rule 1 - Bug] Corrected build script targets to match the planned builder files**
- **Found during:** Stub scan
- **Issue:** Initial manifest commands referenced nonexistent paths that disagreed with the later phase plans.
- **Fix:** Pointed both workspace builds to their planned `build.ts` entrypoints (`apps/extension/build.ts` in 02-03 and `tools/test-pages/build.ts` in 02-14).
- **Files modified:** `apps/extension/package.json`, `tools/test-pages/package.json`
- **Verification:** Confirmed the referenced builder paths in the later plans; those builders are intentionally added by those plans.
- **Committed in:** `6420a25`

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking issue).
**Impact on plan:** The setup checks pass, and future implementation plans own the builder entrypoints.

## Known Stubs

- `apps/extension/package.json:7-8` - Build and watch scripts target `apps/extension/build.ts`, which plan 02-03 creates.
- `tools/test-pages/package.json:7` - Build script targets `tools/test-pages/build.ts`, which plan 02-14 creates.

These forward references are intentional setup for the dependent plans; neither builder is required by this plan's verification.

## Issues Encountered

- The provided verification uses `&&`, which this PowerShell version does not accept. Ran the equivalent sequential checks with an exit-code guard; both passed.
- No extension unit tests exist yet. Vitest loaded the extension configuration and exited successfully with no tests found.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-03 can implement the extension builder and verify `ext:build`.
- Plans 02-13 and 02-14 can add the fixture server and `tools/test-pages/build.ts`.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- All seven planned files and this summary exist.
- Task commits `d3fcd39`, `724dbc8`, and the corrective commit `6420a25` exist in git history.
