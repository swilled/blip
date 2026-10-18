---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
verified: 2026-10-18T08:49:00Z
status: passed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "Selected-link authorization preserves the exact fresh list-links identity."
    - "Direct page speech screens credential-shaped text before output."
    - "Ordinary same-origin safe GET links open after explicit unique selection; cross-origin and action-like links retain spoken confirmation and live revalidation."
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 7: Generic Browser Control and Content Reading Verification Report

**Phase goal:** Implement core-owned browser primitives so users can start from a new tab, navigate to supported sites, read bounded page content, follow selected links, search, switch tabs, scroll, and find text. Targets must come from user wording or a current user-selected page item. Page content remains untrusted and actions remain deterministic.

**Verified:** 2026-10-18T08:49:00Z
**Status:** Passed locally
**Re-verification:** Yes, after closing the selected-link authorization and eligibility gap.

## Goal Achievement

| # | Observable truth | Status | Evidence |
|---|---|---|---|
| 1 | Browser operations use a bounded additive protocol separate from form actions. Intent grants no confirmation authority. | Verified | Closed `BrowserOperation` schemas and message registry. Intent has no confirmation variants. |
| 2 | Destinations and queries come from user wording. Gated navigation and search require tracked exact speech and one-use authorization. | Verified | Deterministic parser, `BrowserAuthorizationStore`, and `BrowserExecutor` dispatch path. |
| 3 | Tab, navigation, search, read, scroll, find, and history operations use current browser state and fail closed when unsupported or unsafe. | Verified | Extension validates active tabs; unknown history destinations are refused; content work is top-frame and capture-bound. |
| 4 | A user-selected visible link opens under the appropriate authorization and live revalidation. | Verified | Same-origin ordinary HTTP(S) GET uses explicit unique link selection. Cross-origin and action-like links need tracked read-back and exact spoken phrase. Content recomputes policy from the live anchor; background rejects cross-origin navigation in user-command mode. |
| 5 | Direct reads speak bounded visible text and withhold credential, payment, and SSN-shaped values. | Verified | `speakContent` filters sensitive page text; direct-read tests cover passwords, cards, SSNs, API keys, and access tokens. |
| 6 | Explicit summaries and questions alone send filtered current-page text to a tool-less model and accept prose only. | Verified | Content projection is explicit, bounded, capture-bound, filtered, lazy, and prose-only. Direct reads remain local. |
| 7 | Site search fills and verifies the observed query, then uses the existing submit gate. | Verified | `trySiteSearch` checks the observed value before arming the gated submit path. |

**Score:** 7/7 truths verified for the local implementation. The shared protocol and live-policy changes remain subject to written voice-owner review before merge or push.

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| User utterance | Browser command | Deterministic parsing and current extension capture | Verified |
| Exact confirmation speech | Gated browser action | Tracked speech ID, one-second guard, source and page binding, exact phrase, one-use consume | Verified |
| BrowserExecutor | Extension browser API | Validated `browser.request` over the extension WebSocket | Verified |
| Selected visible link | Link authorization | Fresh `list-links` identity and unique user selector | Verified |
| Content link handler | Tab navigation | Live href, visibility, target, identity and policy checks, then `tabs.update` | Verified |
| Explicit summary/question | Tool-less content role | Filtered capture-bound projection and prose-only result | Verified |
| Site-search query | Existing submit gate | Observed field value followed by the existing GatePort | Verified |

## Verification Runs

| Check | Result |
|---|---|
| Root suite: `npm test` | 133 files passed, 16 skipped; 1,524 tests passed, 28 skipped |
| Extension suite: `npm run ext:test` | 33 files passed, 16 skipped; 181 tests passed, 28 skipped |
| `npm run typecheck` | Passed |
| `npm run ext:typecheck` | Passed |
| `npm run ext:build` | Passed |
| `npm run pages:build` | Passed |
| `git diff --check` | Passed |
| Dedicated Edge E2E: selected same-origin link | Passed. The extension opened the fixture destination with no confirmation prompt; a page click handler that prevents navigation did not run. |
| Full Edge E2E suite | 15 files passed, 2 skipped. One React-fill test hit Windows `EBUSY` while removing its temporary profile; the test passed when rerun alone. |

The new coverage verifies direct same-origin selection by voice and typing, spoken confirmation for cross-origin/action-like links, refusal of direct-mode escalation, and unchanged form action classification. Tests use local synthetic pages and fake browser APIs. No public site, personal account, or live provider was used.

## Remaining External Review

At the time of this verification, review of the exact shared diff for `BrowserLinkRecord.navigationSafety`, `BrowserOperation.authorizationMode`, and the same-origin safe-GET policy remained open. On 2026-10-18, the core owner reported that the voice owner reviewed and approved the full `core/browser-control` diff, including this Phase 7 scope. The approval provenance is recorded in `../06-browser-control-contract-and-policy-proposal/06-VOICE-OWNER-APPROVAL.md`; this integration review gate is cleared.

The selected-link path was also exercised in Edge 155 with an isolated profile and a local synthetic fixture. The broader browser suite passed its test bodies; one run encountered a Windows temporary-profile cleanup lock that cleared on an isolated rerun. These checks do not substitute for review of the exact shared diff.

## Conclusion

The Phase 7 implementation goal is met. Ordinary same-origin HTTP(S) GET links open only after explicit unique selection. Cross-origin and action-like links retain exact spoken confirmation. The extension rechecks live state before navigation, and the new link policy does not change form button or action classification. Synthetic Edge browser checks passed as recorded above, and the reported voice-owner review gate is cleared for integration.

---

_Verified: 2026-10-18T08:49:00Z_
_Verifier: Codex_
