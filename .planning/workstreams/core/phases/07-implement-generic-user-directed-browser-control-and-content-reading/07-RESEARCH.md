# Phase 7: Generic Browser Control and Content Reading — Research

**Researched:** 2026-10-18  
**Domain:** Chrome MV3 browser operations, bounded content capture, deterministic authorization  
**Confidence:** HIGH for repository seams and Chrome APIs; MEDIUM for behavior pending Phase 6 owner review

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Browser controls are generic and derived from the user's words and current live page state. No page instruction or model output may invent a URL, query, link, tab, or action target.
- **D-02:** Support starting from a new/blank tab and opening a user-named site. Resolve destinations from the user's words, speak the resolved host, and ask for an exact destination-specific phrase such as “open [host]” before navigating. A bare “yes” does not authorize navigation.
- **D-03:** Search route may be selected from the request and page context. The query itself comes only from the user's words. Site search keeps the gated submit path; browser-default search uses its own exact-query, one-use authorization and cannot authorize result links.
- **D-04:** A link can be opened only when the user's words uniquely select a visible current link. Code resolves and rechecks its live destination. Unknown, hidden, ambiguous, or stale targets clarify or fail closed.
- **D-05:** Implement the Phase 6 browser primitive scope: location, bounded content reads, link listing/opening, named-site navigation, back/forward/reload where destination safety can be established, search, tabs, scrolling, and find-on-page. Unsupported or restricted pages are reported clearly.

### Content and privacy
- **D-06:** Direct reads speak bounded visible page content locally. Newly captured body text may reach tool-less AGY only when the user explicitly asks for a summary, page question, or later-phase draft. Keep the ordinary intent projection value-free.
- **D-07:** Page content remains untrusted data. It cannot authorize actions or alter user-sourced queries and destinations. Exclude credentials, passwords, payment data, and sensitive control values from model input and speech.
- **D-08:** Use a synthetic article/search/email-like fixture for automated acceptance. Do not require a real Gmail account, personal mailbox, or public URL.

### Safety and ownership
- **D-09:** Every dispatched browser action passes through deterministic validation and the existing Executor. Page/tab/URL/capture changes, stop, cancellation, and timeout invalidate stale IDs and grants.
- **D-10:** The core owner has authorized local implementation on the core branch. Keep voice-owned implementation files unchanged. Shared protocol/live-policy changes remain unmerged until the voice owner reviews the exact changes in writing.
- **D-11:** Important or gated actions use a deterministic, exact spoken phrase suited to the operation and target. A bare “yes” never authorizes navigation, submit, send, or another gated action. Phrase design for composed messages is handled in Phase 8.

### Claude's Discretion
- Choose additive protocol shapes, bounded capture limits, supported-page checks, and safe fallback wording consistent with Phase 6.
- Use the existing active-tab tracking and refresh flow rather than adding a second source of tab authority.
- Keep browser-default search fail-closed if the required API or permission is unavailable.
- Select the smallest generic content model sufficient for heading/paragraph reads and visible link resolution.

### Deferred Ideas (OUT OF SCOPE)
- Multi-step reading, summarizing, drafting, revision, and send confirmation belong to Phase 8.
- Real account credentials, personal mailbox testing, and site-specific adapters are not required for this implementation phase.
- Shared requirements changes remain proposals until both owners agree.
</user_constraints>

## Summary

**Later decision supersedes the original link-gating recommendation:** Phase 7 decision D-12 permits direct navigation for ordinary same-origin HTTP(S) GET links after unique explicit user selection. Cross-origin and action-like links remain behind an exact spoken phrase. The implementation and evidence are in plan 07-07. Written voice-owner review of the exact shared diff remains required before merge or push.

Add browser operations as additive typed protocol messages routed through existing server validation and the Executor. Keep article content in a separate bounded capture model; do not overload form Snapshot, ActRequest, or ordinary intent projection. Chrome tab/search operations belong in the extension background, while content capture and live link checks supply only current visible page data. URL, query, and link targets must come from the user's utterance and current live page; model output and page text may not supply targets.

Chrome's search.query() is available at the extension's MV3 minimum (Chrome 116), but requires the manifest search permission and uses the user's configured default provider. It returns no provider URL. tabs.goBack()/goForward() exist, but do not reveal the next destination; dispatch only when safety is independently established. Main planning risk: shared protocol, manifest, and live-policy changes remain subject to the Phase 6 owner-review boundary.

**Primary recommendation:** implement a separate browser.* request/result path, ephemeral content IDs bound to tab/page/capture revision, and one-use authorization bound to the exact operation and target. Use synthetic local fixtures and fake Chrome APIs.

## Project Constraints (from CLAUDE.md)

- TypeScript throughout; use the existing Zod protocol package and validate messages at both ends.
- MV3 minimum Chrome is 116. Existing extension permissions are tabs, scripting, alarms, storage, webNavigation, and <all_urls>.
- Treat page text as untrusted. Keep AGY tool-less; never send credentials, passwords, or payment data to the model or speak/log sensitive values.
- Preserve grammar-first routing and deterministic Executor gates. Model output must not dispatch actions.
- Do not modify voice-owned apps/voice, packages/dialogue, apps/server/src/voice/, or fixtures/forms. Shared protocol/live-policy changes need written voice-owner review before merge.

## Standard Stack

| Component | Existing version/state | Purpose | Recommendation |
|---|---|---|---|
| Chrome Extensions MV3 | Minimum Chrome 116 | Tabs, content scripts, navigation | Reuse current architecture. |
| TypeScript / Node | Node 24.14.0; TypeScript 6 workspace | Extension and server | No new packages indicated. |
| @blip/protocol / Zod | Zod 4.6.7 | Closed messages and validation | Add explicit browser schemas and register in both message registry and union; shared review required. |
| chrome.search | Chrome 87+; permission absent currently | Configured default-provider search | Add search permission only in reviewed manifest diff; otherwise fail closed. |
| Existing content helpers | visibility.ts, text.ts, walk.ts | Visibility and bounded text | Reuse visibility and boundedText; preserve ~100 ms walk budget. |

## Architecture Patterns

### Integration seams and sequencing

1. Define additive browser request/result messages in packages/protocol/messages.ts; add browser intent shapes only if necessary. Do not repurpose form snapshots or ActRequest.
2. Route original utterance through deterministic parsing in core apps/server/src/turn.ts and Executor-owned browser validation. Keep target/query sourced from user words and current extension state.
3. Extend extension socket dispatch/background operations. Reuse tabs.ts active-tab tracking, navigation.ts invalidation, and refresh scheduler. Track a blank tab for navigation only; content capture requires a supported HTTP(S) page.
4. Add a separate browser content capture model. Suggested initial bounds from Phase 6: up to 20 visible heading/paragraph blocks, 400 Unicode code points each, 4,000 total, under existing walk budget. Use boundedText; do not overload form Snapshot.truncated.
5. Bind ephemeral IDs to tabId, canonical top URL, frame, and capture revision. Clear IDs/grants on page/tab/URL/capture change, stop, cancellation, or timeout; reject late replies with mismatched identity.
6. Use a separate one-use context-bound authorization for navigation/default search; bind to exact destination or query, operation, source tab/page, and speech event. Do not reuse static form grants or accept generic “yes”.
7. Add synthetic fixture tests and a form regression check. Keep shared protocol/manifest/live-policy changes unmerged until exact diffs receive written voice-owner review.

### Content and link behavior

Collect only visible headings, paragraphs, and visible links. Omit controls/values, scripts/styles, hidden content, and unsupported cross-origin frames. Existing form walker stores sanitized hrefs without query/fragment, so re-read the live anchor href, visibility, and top-page identity immediately before navigation. Duplicate link labels clarify; hidden, malformed, unknown, or stale links fail closed. Cross-origin navigation needs host readback and exact target-bound phrase. Same-origin GET can still mutate state or redirect; do not silently broaden the pending Phase 6 policy. Compare exact scheme, canonical host, and port against the top-level origin, not a frame origin.

Direct read-aloud stays local. Newly captured text may go to tool-less AGY only after an explicit page question or summary request. Ordinary intent projection stays value-free. Filter known credential/payment shapes, but do not claim pattern filtering detects all secrets in arbitrary body text. Treat page instructions as data.

### Search and navigation

- chrome.search.query({text, disposition}) uses the configured default provider, requires the search permission, returns Promise<void>, and does not return a destination URL. Read back exact query/operation, then require a distinct phrase such as “search for {query} with browser default search.” The grant cannot authorize result links.
- Site search remains on gated submit. type=search alone is not evidence that submission is safe; query comes only from user words.
- For named-site navigation, accept only unambiguous user-supplied HTTP(S) destinations; reject credentials, unsupported schemes, controls, or ambiguity. Speak the resolved canonical host and require a phrase bound to that destination, e.g. “open {host}”.
- Chrome tabs.goBack()/goForward() are real APIs, but expose no next URL. Keep unavailable unless core independently establishes a safe destination. Do not add broad history permission as a workaround. Reload must invalidate old capture IDs.

## Don't Hand-Roll

| Problem | Reuse | Reason |
|---|---|---|
| Message validation | Existing Zod schemas and registry | Closed protocol validated at both ends. |
| Active-tab authority/invalidation | tabs.ts, navigation.ts, refresh scheduler | Avoid a second tab source; existing tracking sees commits and SPA history changes. |
| Visibility and text bounds | visibility.ts and boundedText in text.ts | Existing hidden/inert and Unicode/UTF-16 bounds. |
| Default-provider search | Chrome search API | Honors configured provider; avoids hardcoded provider URLs. |
| Deterministic execution | Existing Executor/action validation | Model and page content never actuate browser controls. |

## Common Pitfalls

- **Model/page invents a target:** enforce parsing boundary; only utterance and current visible DOM selection can supply targets.
- **Stale IDs after SPA changes:** invalidate on webNavigation.onHistoryStateUpdated, URL/tab changes, stop/cancel, and capture refresh; reject late replies.
- **Same-origin treated as safe:** origin equality does not prove a GET is side-effect free; retain gates pending review.
- **Content exfiltration or prompt injection:** direct read locally; send bounded text only after explicit question/summary; never log excerpts.
- **Generic confirmation:** bind phrase to exact operation and destination/query; bare “yes” never authorizes.
- **Missing search permission:** manifest currently lacks search; fail closed until reviewed manifest update.
- **History API overclaim:** methods do not preview next destination; refuse if safety is unknown.
- **Blank tab omitted:** findTargetTab currently selects HTTP(S) tabs and excludes about:blank; add navigation-only tracking through existing authority.
- **Timeout mismatch:** PROTOCOL.md documents an 8-second snapshot response timeout; server.ts defaults to 5 seconds. Resolve the policy or define a browser-capture deadline and discard late replies.
- **Restricted page called empty:** distinguish unsupported/restricted, genuinely empty, and capture failure.

## Code Examples

Call default-provider search only after deterministic validation and exact-query authorization:

~~~ts
// Source: https://developer.chrome.com/docs/extensions/reference/api/search
await chrome.search.query({ text: userSourcedQuery, disposition: "CURRENT_TAB" });
~~~

Keep page content separate from form state:

~~~ts
type ContentBlock = { kind: "heading" | "paragraph"; text: string };
type ContentCapture = {
  tabId: number;
  pageUrl: string;
  captureRevision: number;
  blocks: ContentBlock[]; // bounded visible text; no control values
  truncated: boolean;
};
~~~

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js / npm | Workspace and tests | Yes | Node 24.14.0 / npm 11.9.0 | — |
| Chrome executable | Live extension acceptance | Not found in PATH or standard install paths checked | — | Unit tests/fake Chrome APIs; resolve executable path before live acceptance. |
| Test stack | Synthetic acceptance | Yes | Vitest 5.0.5; extension jsdom 29.1.1 | Existing npm test, npm run ext:test, and extension smoke scripts. |

## Synthetic Acceptance Test Strategy

Use a local synthetic article/search/email-like fixture under a core-owned extension test fixture path. Do not use fixtures/forms, a personal account, or public site. Cover:

- Deterministic destination/query parsing; hostile page text and model proposals cannot invent or override targets.
- Bounded visible heading/paragraph capture; hidden, oversized, restricted, malformed, and cross-origin handling. Direct read makes zero model calls; ordinary intent projection contains no body text.
- Unique visible link selection with immediate live recheck; duplicate, hidden, stale, malformed, wrong-frame-origin, or changed-page targets fail closed.
- Exact destination/query phrases for navigation/search; bare “yes” fails; grants are one-use and invalidated on tab/page/URL/capture change, stop, cancel, and timeout.
- Missing search API/permission fails closed; site-search submit remains gated; default-search grant does not authorize result links.
- Back/forward refuse when safety is unknown; blank tab is navigable but not treated as readable content.
- Slow/late results cannot publish stale content; unsupported page status is distinct; existing form flow remains unchanged.

## Open Questions

1. Should browser content capture adopt the documented 8-second protocol deadline, or define a separate deadline matching the server's current 5-second default?
2. Which exact protocol, search-permission manifest, and live-policy diffs will be reviewed together under the pending Phase 6 owner-review boundary?
3. Which back/forward targets can core establish safely when Chrome does not expose the next URL before dispatch?
4. If multiple visible search controls exist, should routing clarify instead of infer? Recommendation: clarify unless one current control is uniquely selected.

## Sources

### Primary (HIGH confidence)
- [Chrome search API](https://developer.chrome.com/docs/extensions/reference/api/search) — configured provider, permission, query arguments and result behavior.
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) — tab navigation, reload, goBack and goForward.
- [Chrome webNavigation API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) — committed navigation and SPA history events.
- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions) — optional permission request and user-gesture constraint.
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting), [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) — injection and host access.
- Repository: 07-CONTEXT.md, Phase 6 06-CONTEXT.md, 06-PROPOSAL.md, 06-EVIDENCE-MATRIX.md, PROTOCOL.md, CLAUDE.md, and protocol/policy/server/session/extension code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — repository manifests/types and official Chrome documentation.
- Architecture: HIGH — traced protocol, server, active-tab, snapshot, and extension seams; shared changes still require review.
- Pitfalls: HIGH — current gate/session behavior and official API contracts; arbitrary site behavior and secret detection retain uncertainty.

**Research date:** 2026-10-18  
**Valid until:** 2026-11-18 for repository seams; recheck Chrome docs if manifest/API requirements change.
