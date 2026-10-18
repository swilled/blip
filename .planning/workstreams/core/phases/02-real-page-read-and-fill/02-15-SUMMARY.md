---
phase: 02-real-page-read-and-fill
plan: 15
subsystem: testing
tags: [test-pages, chrome, edge, iframe, mv3]

# Dependency graph
requires:
  - phase: 02-13
    provides: Loopback fixture server with alternate localhost origin and bounded report endpoint
  - phase: 02-14
    provides: Shared page reporter and stable native/React fixture patterns
provides:
  - Delayed reveal, SPA, same-origin/cross-origin iframe, CSP, and shadow DOM fixtures
  - Dedicated-profile browser launcher with dry-run and URL/port controls
affects: [02-11, 02-20, real-page-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Use 127.0.0.1 and localhost on one loopback server to create distinct fixture origins
    - Keep browser smoke profiles in unique children of .chrome-profile
key-files:
  created:
    - scripts/ext-chrome.ts
    - tools/test-pages/public/csp.css
    - tools/test-pages/public/csp.html
    - tools/test-pages/public/delayed-reveal.html
    - tools/test-pages/public/frame-cross.html
    - tools/test-pages/public/frame-inner.html
    - tools/test-pages/public/frame-same.html
    - tools/test-pages/public/shadow.html
    - tools/test-pages/public/spa.html
  modified:
    - package.json
    - tools/test-pages/public/index.html
key-decisions:
  - "Use the existing resolveBrowser export; the plan's findBrowser key-link pattern is stale."
  - "Keep the cross-origin fallback for frames the extension cannot reach, even though injection succeeded in the loopback probe."
requirements-completed: [PAGE-01, PAGE-05]

# Metrics
duration: 7min
completed: 2026-10-16
---

# Phase 2 Plan 15: Dynamic Page Fixtures and Browser Launcher Summary

**Dynamic, SPA, iframe, CSP, and shadow fixtures now report page events, and `ext:chrome` launches the test pages in a dedicated browser profile.**

## Performance

- **Duration:** 7 minutes
- **Started:** 2026-10-17T02:56:00Z
- **Completed:** 2026-10-17T03:03:43Z
- **Tasks:** 2/2
- **Files modified:** 11

## Accomplishments

- Added a delayed email reveal with a later validation error, a `pushState` two-step form, same-origin and alternate-host iframe forms, a strict CSP form, and open/closed shadow fields. The index also links to the generated `/large.html` page.
- Added `ext:chrome` with `--dry-run`, `--no-serve`, `--port`, and repeatable `--url` options. It reuses `resolveBrowser`, builds the extension only when its manifest is absent, serves the fixture pages by default, and prints the one-time Load unpacked instructions.
- Confirmed cross-origin injection in Edge 155 using an isolated `.chrome-profile` child: the Blip content script ran in both the top page and the out-of-process `localhost` iframe, and the frame reported to `/__report`.

## Task Commits

1. **Task 1: Add reveal, SPA, iframe, CSP and shadow fixtures** - `f714326` (`feat`)
2. **Task 2: Add the dedicated browser launcher and dry-run** - `5b94ef2` (`feat`)

## Files Created/Modified

- `tools/test-pages/public/delayed-reveal.html` - Delayed field and error state with bounded page-side reports.
- `tools/test-pages/public/spa.html` - Two-step form that changes history with `pushState` and handles back navigation.
- `tools/test-pages/public/frame-same.html`, `frame-cross.html`, and `frame-inner.html` - Same-origin and alternate-host iframe pages with frame-origin reports.
- `tools/test-pages/public/csp.html` and `csp.css` - Same-origin-only scripts, styles, reports, and form action.
- `tools/test-pages/public/shadow.html` - Labeled open and closed shadow-root fields.
- `tools/test-pages/public/index.html` - Links the new fixtures and generated large page; reports page events.
- `scripts/ext-chrome.ts` - Dedicated-profile browser launcher.
- `package.json` - Registers the `ext:chrome` command.

## Decisions Made

- Used `resolveBrowser` from `scripts/browser.ts`, which already honors `BLIP_BROWSER` and prefers Chrome before Edge.
- The cross-origin fixture uses `localhost` while the parent page uses `127.0.0.1` at the same port; the browser treats these as separate origins while the server can report both.
- Kept the launcher profile stable at `.chrome-profile/ext-chrome` so a developer can load the unpacked extension once. Browser probes used unique sibling directories and closed only the child browser process they launched.

## Cross-Origin Outcome and Fallback

The Edge 155 probe confirmed extension content-script injection into the `localhost` iframe under the current `<all_urls>` host permission and `all_frames` manifest setting. The fixture's `frame-context` report also reached the local server. This verifies injection only: the current content script is still a shell, and frame snapshot/read/fill behavior belongs to the outstanding 02-11 frame aggregation work. Keep the bounded fallback from that plan for frames that cannot be reached: **“Part of this page could not be read.”**

## Deviations from Plan

### Plan-link clarification

The plan's key link expects `findBrowser`, but `scripts/browser.ts` exports `resolveBrowser`. The launcher imports and uses `resolveBrowser`; no alias was added.

### Verification note

Task 1 has `tdd="true"` but no `<behavior>` block or test file in its owned path list. The existing fixture-host suite was run, and browser probes covered delayed validation, SPA history behavior, CSP resources, shadow roots, and cross-origin injection. No extra test file outside the plan's owned paths was added.

**Total deviations:** 1 plan-link clarification; no auto-fixed code deviations.
**Impact on plan:** All planned artifacts shipped. Cross-origin injection works in the tested browser; frame read/fill is still pending 02-11 and retains its documented fallback.

## Verification

- `npm run typecheck` passed.
- `npx vitest run tools/test-pages` passed: 1 file, 9 tests.
- `npm run ext:chrome -- --dry-run` printed the resolved Edge path, dedicated profile, default page URL, primary and alternate origins, and cross-origin iframe URL without starting a browser or fixture server.
- A fixture-host probe returned all expected fixture pages with stable titles/headings, the page report helper, the generated large-page link, and the substituted `localhost` iframe URL.
- A headless Edge probe confirmed delayed reveal/error reporting, SPA pushState/back navigation, CSP form and stylesheet loading, and open/closed shadow behavior.
- A separate isolated-profile Edge probe found the Blip content-script context in both the top page and cross-origin iframe. Only each probe's spawned Edge child was closed; the user's default Edge window was left untouched.
- No `/healthz` endpoint was added and the human launcher does not pass `--load-extension`.

## Issues Encountered

- Chromium exposes the cross-origin iframe as a separate out-of-process DevTools target rather than a child in the top page's frame tree. The probe was adjusted to inspect that iframe target; the page and extension injection both passed.

## User Setup Required

Load the unpacked extension once from `apps/extension/dist` in the dedicated `.chrome-profile/ext-chrome` browser profile. The launcher prints this path and the readiness log signal.

## Next Phase Readiness

The dynamic fixtures and human launcher are ready for the frame aggregation and end-to-end tests. 02-11 should retain its fallback sentence for any unreachable frame and test read/fill against the working alternate-host fixture.

---
*Phase: 02-real-page-read-and-fill*
*Completed: 2026-10-16*

## Self-Check: PASSED

- The summary, launcher, root script registration, and all nine fixture-page files exist.
- Task commits `f714326` and `5b94ef2` are present in git history.
- No Edge process remains for any `.chrome-profile/02-15-*` probe profile.
