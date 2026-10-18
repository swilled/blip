---
phase: 07-implement-generic-user-directed-browser-control-and-content-reading
verified: 2026-10-18T06:42:51Z
status: gaps_found
score: 6/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Selected-link authorization now reuses the link-list capture identity, including when each capture receives a new ID and revision."
    - "Direct page speech now screens credential-shaped text with the page-content privacy detector."
  gaps_remaining:
    - "Visible-link opening remains intentionally limited to same-origin links accepted by the existing click-safe policy, pending written voice-owner review."
  regressions: []
gaps:
  - truth: "A user can open user-selected visible links across the supported destinations after destination-specific authorization."
    status: partial
    reason: "The selection, identity binding, authorization, and live revalidation path works, but the existing policy permits only same-origin links classified click-safe. The roadmap's generic link capability therefore remains narrower than its stated scope. This restriction is intentionally pending written voice-owner review."
    artifacts:
      - path: "apps/extension/src/content/browser-content.ts"
        issue: "The live open-link handler rejects cross-origin destinations and refuses links unless classifyAction returns click-safe."
      - path: "packages/policy/src/classify.ts"
        issue: "The established click-safe text policy is narrower than general user-selected link navigation."
    missing:
      - "Written voice-owner review of the exact safe-GET/link eligibility policy."
      - "After review, confirm the intended supported link scope and add synthetic acceptance cases for it."
---

# Phase 7: Generic Browser Control and Content Reading Verification Report

**Phase Goal:** Implement core-owned browser primitives so users can direct Blip from a new tab to supported sites, navigate, read bounded page content, follow selected links, search, switch tabs, scroll, and find text. Targets must come from the user's words or a user-selected live page item; page text remains untrusted and actions stay in the Executor.
**Verified:** 2026-10-18T06:42:51Z
**Status:** gaps_found
**Re-verification:** Yes — after closing the link identity and direct-read privacy gaps

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Browser operations use a bounded additive protocol separate from form actions, and Intent grants no confirmation authority. | ✓ VERIFIED | `packages/protocol/src/payloads-browser.ts` defines bounded operation/result schemas and `packages/protocol/src/messages.ts` registers the messages. The Intent union has no confirmation variants. |
| 2 | Destinations and queries come from user wording; gated navigation/search requires exact tracked speech, one-use authorization, and BrowserExecutor dispatch. | ✓ VERIFIED | `apps/server/src/browser/commands.ts`, `authorization.ts`, `executor.ts`, `turn.ts`, and `apps/extension/src/background/socket.ts` implement parsing, speech-bound grants, and validated requests. |
| 3 | Supported tab, navigation, search, read, scroll, find, and history operations use current browser state and fail closed on unsupported pages or unknown history destinations. | ✓ VERIFIED | `apps/extension/src/background/browser.ts` validates current tabs, uses configured browser search, and refuses history destinations that cannot be checked. Content requests use the top-frame handler. |
| 4 | A user can select a visible current link and open it after destination-specific authorization and live revalidation. | ⚠ PARTIAL | Selection and authorization now preserve the selected capture identity, and the extension rechecks the live anchor. Opening is still restricted to same-origin destinations classified `click-safe`, so general user-selected links remain unsupported pending voice-owner policy review. |
| 5 | Direct reads speak only bounded visible text and withhold credential, payment, and SSN values. | ✓ VERIFIED | `speakContent` in `apps/server/src/turn.ts` filters blocks with `containsSensitivePageText`. Direct-read tests cover passwords, card/SSN shapes, API keys, and access tokens, asserting the private value is absent from speech and requests. |
| 6 | Explicit summaries/questions alone send a filtered current-page excerpt to a tool-less model and accept prose only. | ✓ VERIFIED | `content-projection.ts`, `provider.ts`, and `session.ts` keep the model role explicit, tool-less, capture-bound, filtered, and prose-only. Direct reads remain local. |
| 7 | Site search uses ordinary form fill, checks the observed query, and hands submission to the existing gated flow. | ✓ VERIFIED | `trySiteSearch` in `apps/server/src/turn.ts` resolves one search field and one submit action, verifies the observed exact query, then arms the existing gate. |

**Score:** 6/7 truths verified; one partially achieved because link eligibility remains under policy review.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/protocol/src/payloads-browser.ts` | Closed browser operation/result and bounded content schemas | ✓ VERIFIED | Substantive schemas are exported and registered separately from form `Snapshot`, `ActRequest`, and `Intent`. |
| `apps/server/src/browser/commands.ts`, `authorization.ts`, `executor.ts` | Deterministic commands, one-use exact authorization, single dispatch path | ✓ VERIFIED | Connected through the server turn handler; selected-link identity is preserved through the authorization prompt. |
| `apps/extension/src/background/browser.ts` and `socket.ts` | Validated browser API operations and typed WebSocket dispatch | ✓ VERIFIED | Navigation, tabs, search, content, scrolling, find, and link operation dispatch are implemented with identity checks. Link eligibility remains narrow at the content/policy boundary. |
| `apps/extension/src/content/browser-content.ts` | Bounded visible content and current link/content revalidation | ⚠ PARTIAL | Capture bounds, visible link IDs, and live href/page checks are substantive. Opening remains limited to same-origin `click-safe` links. |
| `apps/server/src/turn.ts` | Browser routing, local read privacy boundary, search gate integration | ✓ VERIFIED | Direct speech filters sensitive page text; selected-link authorization reuses the just-listed identity; site search uses the existing gated submit route. |
| `apps/server/src/brain/agy/content-projection.ts` and provider/session content role | Explicit-only filtered model path with prose output | ✓ VERIFIED | Present, substantive, lazy/tool-less, capture-bound, and separately schema-checked. |
| `tools/test-pages/public/browser-control.html` and browser acceptance tests | Synthetic local page and integrated adversarial coverage | ✓ VERIFIED | Fixture and acceptance tests exist. The acceptance rig now simulates fresh identity allocation between capture reads and tests credential-shaped direct-read filtering. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| User utterance | Browser command | `parseBrowserCommand` and current capture | ✓ WIRED | User text supplies URL/query; links and tab labels resolve against current extension data. |
| Exact confirmation speech | BrowserExecutor | `BrowserAuthorizationStore.consume` then `createBrowserExecutor` | ✓ WIRED | Tracked speech completion, guard window, voice source, exact phrase, source identity, expiry, and one-use consumption precede dispatch. |
| BrowserExecutor | Extension browser API | Validated `browser.request` over extension WebSocket | ✓ WIRED | Schemas are checked and extension handlers recheck tab/page state. |
| Link selection | Link authorization | Fresh `list-links` result → selected identity → destination-specific grant | ✓ WIRED | `beginBrowserAuthorization` verifies the selected link against the current cached capture and does not take a second capture. The acceptance regression allocates new capture IDs/revisions on reads and observes `list-links`, then `open-link` using that same identity. |
| Extension link handler | Destination navigation | Live anchor check → origin/policy check → background tab update | ⚠ PARTIAL | Live checks are present, but the handler rejects cross-origin URLs and links not classified `click-safe`. |
| Page content capture | Direct speech | `captureVisibleContent` → `speakContent` | ✓ WIRED | Bounded visible DOM text reaches speech only after page-content sensitive-shape filtering; private text is omitted and a fixed notice is spoken. |
| Explicit summary/question | Tool-less content role | Filtered projection → prose schema → current-identity check | ✓ WIRED | Only explicit requests enter this flow; output cannot carry browser operations or authority. |
| Site-search query | Existing submit gate | Observed field value → `VoiceGateAdapter.arm` | ✓ WIRED | Exact query fill/read-back precedes deterministic submit authorization. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `browser-content.ts` → direct read | `BrowserContentBlock.text` | Connected visible DOM headings/paragraphs, bounded and re-read by content ID | Yes | ✓ FLOWING — `speakContent` screens sensitive page text before speech or model routing. |
| `content-projection.ts` → AGY content role | Filtered `projection.blocks` | Same-capture bounded visible DOM text | Yes | ✓ FLOWING — explicit requests only; stale and sensitive content fails closed. |
| Link list → selected link | `BrowserLinkRecord` / `linkId` | Visible current anchors with sanitized labels and host hints | Yes | ✓ FLOWING — selection remains bound to the just-listed identity through authorization; extension repeats live checks before opening. |
| Site search → form Executor | Observed field value | Fresh accepted form snapshot and extension result | Yes | ✓ FLOWING — exact user query is compared with observed value before the existing submit gate is armed. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Browser acceptance, direct content privacy, authorization, and command suites | `npm test -- --run apps/server/src/browser/acceptance.test.ts apps/server/src/browser/content.test.ts apps/server/src/browser/authorization.test.ts apps/server/src/browser/commands.test.ts` | 4 files; 89 tests passed, including fresh-capture identity and API-key/access-token read cases | ✓ PASS |
| Server typecheck | `npm run typecheck` | Completed successfully | ✓ PASS |
| Phase-reported full checks | Full tests, typechecks, extension build, and page build listed in `STATE.md`/summaries | Reported as passing; not rerun for this focused re-verification | ✓ REPORTED |
| Real Chrome/provider integration | No live provider, public site, or account used | Fake API/jsdom tests do not verify actual Chrome runtime behavior | ? SKIP — constrained by task scope |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| None assigned | All six plans declare `requirements: []`; Phase 07 roadmap has no shared requirement changes | Phase goal is verified from roadmap goal and plan must-haves | N/A | No Phase 07 requirement IDs or orphaned Phase 07 mappings appear in the core requirements file. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| — | — | No TODO/FIXME/placeholder or empty user-visible implementation found in the reviewed Phase 07 paths. | — | The unknown-operation fallback is defensive; supported operations use typed handlers. |

### Human Verification Required

1. **Review safe-GET/link eligibility.** The voice owner should review the exact same-origin and `click-safe` policy boundary in writing. The current implementation intentionally keeps that policy unchanged until review.
2. **Exercise the synthetic fixture in the dedicated Chrome profile after policy review.** Confirm real extension permissions, tracked speech completion timing, accessibility announcements, and page-change behavior. This review used no external sites/accounts or live provider calls.

### Gaps Summary

The protocol, user-sourced browser routing, gated navigation/search, bounded local content reading, explicit filtered page questions, tab controls, scroll/find operations, and site-search submit integration are present. The two prior implementation gaps are closed: the link authorization path now stays bound to the fresh `list-links` identity even when capture IDs/revisions advance on each capture, and direct speech filters credential-shaped values before speech. The remaining goal gap is link breadth: the extension opens only same-origin links accepted by the existing `click-safe` allowlist, so ordinary links and cross-origin search results remain unavailable. This is an intentional limitation pending written voice-owner review of the safe-GET policy; this report does not request changing that policy before review. Shared browser protocol changes and the `search` manifest permission also remain local pending the required written voice-owner review before merge or push.

---

_Verified: 2026-10-18T06:42:51Z_  
_Verifier: Codex (gsd-verifier)_
