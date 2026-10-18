---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-04
subsystem: browser-control
tags: [extension, browser-content, privacy, typed-protocol]

requires:
  - phase: 07-01
    provides: Typed browser operations and page identity contract
  - phase: 07-03
    provides: Extension browser dispatcher and core authorization path
provides:
  - Bounded visible heading/paragraph capture and local identity-bound reads
  - Visible link listing and explicitly authorized, live-revalidated link navigation
  - User-targeted scrolling through uniquely resolved current content IDs, plus directional scroll/find
  - Sensitive-content speech filtering
affects: [07-05, 07-06, 08-multi-step-web-reading, voice-owner-protocol-review]

tech-stack:
  added: []
  patterns: [top-frame-only content messages, bounded visible DOM text, one-use link authorization]

key-files:
  created:
    - apps/extension/src/content/browser-content.ts
    - apps/extension/src/content/browser-content.test.ts
    - apps/server/src/browser/content.test.ts
    - apps/server/src/browser/commands.test.ts
  modified:
    - apps/extension/src/content/index.ts
    - apps/extension/src/shared/messages.ts
    - apps/extension/src/background/browser.ts
    - apps/extension/src/background/dispatch.ts
    - apps/server/src/turn.ts
    - apps/server/src/browser/commands.ts
    - apps/server/src/brain/agy/privacy.ts
    - packages/protocol/src/payloads-browser.ts
    - packages/protocol/test/browser-control.test.ts
    - packages/protocol/test/permissions.test.ts
    - packages/protocol/test/protocol-lock.test.ts

key-decisions:
  - "Direct reads and targeted scrolling use current extension content IDs; selected text is screened before any speech."
  - "Only the top frame contributes content, and selected links retain the existing click-safe policy plus core authorization."
  - "Keep shared protocol changes local until written voice-owner review."

patterns-established:
  - "Content blocks and links carry capture identity and frame ID; reads and actions revalidate live page state."
  - "Page text stays untrusted and never supplies a link target or browser action."

requirements-completed: []

duration: 15min
completed: 2026-10-18
---

# Phase 7 Plan 07-04: Bounded Browser Content Summary

**Visible page content is captured within strict bounds, read locally by current content ID, and screened for sensitive shapes before speech; links and targeted scrolling use user-selected, live-checked content IDs.**

## Performance

- **Duration:** 15 minutes
- **Started:** 2026-10-18T05:58:35Z
- **Completed:** 2026-10-18T06:13:50Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Added top-frame capture of visible headings, paragraphs, and anchor labels with 20-block, 400-code-point-per-block, and 4,000-code-point aggregate bounds. Hidden/inert/nested content, controls, values, and unsupported frames are excluded.
- Routed reads, link lists, directional scroll, find, targeted scroll-to-block, and authorized link opening through typed messages with page/capture identity checks and current DOM revalidation.
- Added user-phrased `scroll to heading/paragraph containing …`; core resolves exactly one current block ID, while ambiguous or stale targets stop before scrolling.
- Screened page text for password, payment-card, and SSN shapes before speech. Sensitive blocks are omitted and replaced by a fixed privacy notice; direct reads do not call AGY.

## Task Commits

1. **Task 1: Add bounded visible content capture and local reading operations** - `3ccebc4` (`feat`)
2. **Task 2: Add visible-link selection with live revalidation** - `eccf7a6` (`feat`)

## Files Created/Modified

- `apps/extension/src/content/browser-content.ts` - bounded visible capture, content IDs, live reads, link records, scroll, find, and link validation.
- `apps/extension/src/content/index.ts` and `apps/extension/src/shared/messages.ts` - typed isolated-world content request handling.
- `apps/extension/src/background/browser.ts` and `apps/extension/src/background/dispatch.ts` - top-frame routing, stale-page checks, and authorized background link navigation.
- `apps/extension/src/content/browser-content.test.ts` - DOM bounds, hidden content, stale links, authorization, and page identity tests.
- `apps/server/src/turn.ts` and `apps/server/src/brain/agy/privacy.ts` - local content routing and sensitive-shape screen before speech.
- `apps/server/src/browser/content.test.ts` - confirms direct and selected-block reads omit private text and do not call intent parsing.
- `apps/server/src/browser/commands.ts` and `apps/server/src/browser/commands.test.ts` - parse user-targeted scroll requests and preserve bare-yes refusal.
- `packages/protocol/src/payloads-browser.ts` and protocol tests - identity-bound content/link shapes and current 27-message contract expectations.

## Decisions Made

- Content capture and direct reads remain local. Captured body text is not passed to AGY for direct reading.
- Link navigation requires a one-use core authorization, a current selected link ID, matching page identity, and the existing live click-safe policy. The background tab API performs navigation; page click handlers do not run.
- Shared protocol changes remain local pending written voice-owner review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Privacy bug] Recognized the `Password is ...` sensitive shape**
- **Found during:** Task 1 (local reading privacy test)
- **Issue:** The existing sensitive-utterance matcher missed text shaped as `Password is hunter2.`.
- **Fix:** Added a password-value pattern so the content speech boundary omits the block.
- **Files modified:** `apps/server/src/brain/agy/privacy.ts`
- **Verification:** Server content privacy test passes for password, card-number, and SSN shapes.
- **Committed in:** `3ccebc4`

**2. [Rule 1 - Protocol test regression] Updated test contracts for identity-bound content and the 27-message registry**
- **Found during:** Overall verification
- **Issue:** Browser payload fixtures lacked the new content identity fields, and protocol count assertions omitted the two browser message types already added by Plan 07-01.
- **Fix:** Updated browser payload fixtures, permission matrix, and protocol-lock count assertions to match the current contract.
- **Files modified:** `apps/server/src/browser/commands.test.ts`, `packages/protocol/test/browser-control.test.ts`, `packages/protocol/test/permissions.test.ts`, `packages/protocol/test/protocol-lock.test.ts`
- **Verification:** server typecheck passes; `npm test -- packages/protocol` passes all 283 tests.
- **Committed in:** `3ccebc4`

---

**Total deviations:** 2 auto-fixed (2 Rule 1)
**Impact on plan:** Both fixes keep the privacy guarantee and protocol verification aligned with the implemented contract.

## Issues Encountered

- The first protocol test run exposed stale payload fixtures and message-count expectations. Those were updated, and the complete protocol suite passed.

## User Setup Required

None - no external service configuration required.

## Verification

- `npm run ext:test -- src/content/browser-content.test.ts src/background/browser.test.ts` - 23 passed
- `npm test -- apps/server/src/browser/content.test.ts apps/server/src/browser/commands.test.ts` - 46 passed
- `npm test -- packages/protocol` - 283 passed
- `npm run typecheck` - passed
- `npm run ext:typecheck` - passed
- `npm run ext:build` - passed

## Next Phase Readiness

- Plans 07-05 and 07-06 can use the bounded content model and typed operation path.
- Written voice-owner review is still required before shared protocol changes are merged. No push or merge was performed.

## Self-Check: PASSED

- Summary file exists at the plan output path.
- Task commits `3ccebc4` and `eccf7a6` are present in git history.

---
*Phase: 07-implement-generic-user-directed-browser-control-and-content-reading*
*Completed: 2026-10-18*
