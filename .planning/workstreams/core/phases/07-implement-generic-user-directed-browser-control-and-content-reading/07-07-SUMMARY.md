---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
plan: 07-07
subsystem: browser-control
tags: [safe-get, link-navigation, authorization, protocol, extension]
requires:
  - phase: 07-04
    provides: Bounded visible link records and live DOM revalidation
  - phase: 07-06
    provides: Synthetic acceptance matrix
provides:
  - Separate browser-link safe-GET classification
  - Direct same-origin user-command path for unique visible links
  - Tracked spoken phrase path for cross-origin and action-like links
  - Updated protocol, verification, roadmap, and review-gate records
affects: [phase-07-verification, phase-08-integration]
tech-stack:
  added: []
  patterns: [separate browser-link policy, live classification before navigation, one-use request authorization]
key-files:
  created:
    - .planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-07-PLAN.md
    - .planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-07-SUMMARY.md
  modified:
    - packages/policy/src/classify.ts
    - packages/protocol/src/payloads-browser.ts
    - apps/extension/src/content/browser-content.ts
    - apps/extension/src/background/browser.ts
    - apps/server/src/browser/commands.ts
    - apps/server/src/turn.ts
    - PROTOCOL.md
    - .planning/workstreams/core/phases/07-implement-generic-user-directed-browser-control-and-content-reading/07-VERIFICATION.md
key-decisions:
  - "Ordinary same-origin HTTP(S) GET links may open after explicit unique selection; this does not change form action classification."
  - "Cross-origin and action-like links require tracked read-back, exact spoken phrase, one-use authorization, and live validation."
  - "The extension navigates with tabs.update and never invokes page click handlers."
  - "The exact shared protocol/live-policy diff remains pending written voice-owner review before merge or push."
completed: 2026-10-18
---

# Phase 7 Plan 07-07: Selected Link Policy Closure

**Closed the last Phase 7 implementation gap.** A direct user command can open a uniquely selected ordinary same-origin HTTP(S) GET link. Cross-origin, same-document, and action-like links still require an exact spoken phrase. Anchors carrying a `download` attribute are refused.

## Accomplishments

- Added `classifyBrowserLink` separately from `classifyAction`, keeping form button and form submission policy unchanged.
- Added an optional `navigationSafety` hint to link records and optional `authorizationMode` to open-link requests. Older requests without a mode remain spoken-gated.
- Routed same-origin safe-GET commands directly through `BrowserExecutor` for voice and typed input. The extension rechecks the current visible anchor and rejects direct-mode escalation for action-like or cross-origin destinations.
- Kept cross-origin/action-like links in the existing tracked speech-ID, exact phrase, one-second guard, and one-use authorization flow. The host read-back includes a non-default port.
- Used `tabs.update` for navigation, never page click handlers.
- Updated `PROTOCOL.md` and phase artifacts to record the precise behavior and the remaining voice-owner review gate.

## Verification

- Root suite: 133 files passed, 16 skipped; 1,524 tests passed, 28 skipped.
- Extension suite: 33 files passed, 16 skipped; 181 tests passed, 28 skipped.
- Root and extension typechecks passed.
- Extension and test-page builds passed.
- `git diff --check` passed.

No public site, personal account, or live provider was used. The real-browser synthetic-fixture exercise remains outstanding.

## Remaining Integration Gate

The user reported teammate agreement with the safe-GET product choice. The exact shared protocol/live-policy diff still needs written voice-owner review before merge or push. This is an integration gate, not an unresolved Phase 7 implementation gap.

---

_Completed: 2026-10-18_
