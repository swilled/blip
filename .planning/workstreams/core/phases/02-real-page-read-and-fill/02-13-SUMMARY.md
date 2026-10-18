---
phase: 02-real-page-read-and-fill
plan: 13
subsystem: testing
tags: [node-http, loopback, fixture-server, vitest, npm-workspaces]

# Dependency graph
requires:
  - phase: 02-02
    provides: Test-pages workspace and approved esbuild dependencies
provides:
  - Loopback-only fixture host for public and generated page assets
  - Traversal-safe path resolution, origin-token replacement, SPA routing, and a generated large page
  - A 64 KB report endpoint backed by a newest-first 500-record ring
  - Root pages:build/pages:serve commands and an ext:smoke alias
affects: [02-14, 02-15, 02-20]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Use node:http with explicit loopback listeners and realpath containment checks for local fixtures"]

key-files:
  created:
    - tools/test-pages/serve.ts
    - tools/test-pages/test/serve.test.ts
  modified:
    - package.json
    - tools/test-pages/package.json

key-decisions:
  - "Bind IPv4 on 127.0.0.1 and add ::1 only when available; use localhost as the alternate fixture origin."
  - "Serve public files first, fall back to dist, route /spa/* to public/spa.html, and synthesize /large.html."
  - "When build.ts exists, the default server start builds assets first; an absent future builder does not prevent serving static fixtures."

patterns-established:
  - "Decode and reject unsafe request paths before filesystem resolution, then verify the real target remains under its declared root."
  - "Bound both report payload bytes and the in-memory report ring; expose newest reports first."

requirements-completed: [PAGE-01]

# Metrics
duration: 4min
completed: 2026-10-16
---

# Phase 2 Plan 13: Loopback Page Host Summary

**Loopback-only fixture host serves public and generated pages safely, with bounded page-side evidence for browser tests.**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-10-17T02:40:50Z
- **Completed:** 2026-10-17T02:45:07Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added a `node:http` server bound to `127.0.0.1` with a best-effort `::1` listener and an alternate `localhost` origin.
- Added safe static serving from `public` and `dist`, including traversal and symlink containment checks, origin token replacement, SPA fallback, and a 300-field/60-link page.
- Added `/__report` with a 64 KB JSON limit and `/__reports` with page filtering and a 500-record newest-first bound.
- Registered `pages:build`, `pages:serve`, and the integration-required `ext:smoke` root commands.

## Task Commits

1. **Task 1: Test-first server coverage** - `d58baae` (`test`)
2. **Task 1: Loopback host implementation** - `5d2e726` (`feat`)
3. **Integration fix: expose the extension smoke command** - `d523708` (`fix`)
4. **Task 2: Add fixture workspace commands** - `ec04fd4` (`chore`)

The final documentation commit contains this summary.

## Files Created/Modified

- `tools/test-pages/serve.ts` - Loopback static host, path containment, fixture routes, and bounded report API.
- `tools/test-pages/test/serve.test.ts` - Tests for server binding, static roots, token replacement, traversal, SPA/large routes, and report limits.
- `tools/test-pages/package.json` - Added the workspace `serve` command; retained its existing `build` command.
- `package.json` - Added page build/serve delegates and `ext:smoke`.

## Decisions Made

- Bound only explicit loopback addresses and treated IPv6 as best effort.
- Checked canonical filesystem paths after resolving symlinks so static requests cannot escape `public` or `dist`.
- Kept the host independent of fixture contents so later plans can add files without changing its path policy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the root extension smoke alias required by the concurrent extension plan**
- **Found during:** Task 2
- **Issue:** The extension smoke script existed, but root `npm run ext:smoke` was not registered, so the planned verification command could not invoke it.
- **Fix:** Added `ext:smoke: tsx scripts/ext-smoke.ts` in a separate commit.
- **Files modified:** `package.json`
- **Verification:** `npm run` lists `ext:smoke`; commit `d523708`.

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Added the missing command needed by the parallel extension plan; no dependency or lockfile changes.

## Issues Encountered

- The focused server suite passed: 9 tests passed.
- An isolated TypeScript check of `serve.ts` and `serve.test.ts` passed.
- Root `npm run typecheck` was blocked by concurrent extension edits in `apps/extension/src/background/socket.ts:54,108` (`Timeout` is not assignable to `number`). These files are outside this plan; the parent will rerun root checks after the parallel wave.
- `npm run pages:serve` started on `127.0.0.1:7790`; `GET /__reports` returned `200 []`.

## Known Stubs

- `tools/test-pages/package.json:6` - `build` points to `tools/test-pages/build.ts`, which plan 02-14 creates. The command is registered here; fixture bundling becomes runnable with that follow-on plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-14 can add the fixture files and builder; the host resolves them at request time and keeps serving within the same declared roots.
- Plan 02-15 can use the alternate loopback origin for cross-origin iframe fixtures.
- The root typecheck needs a rerun after the concurrent extension workspace edit is resolved.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Focused test and implementation files exist and were committed.
- Task commits `d58baae`, `5d2e726`, `d523708`, and `ec04fd4` exist in git history.
- Root page scripts and workspace `serve` registration are present.
