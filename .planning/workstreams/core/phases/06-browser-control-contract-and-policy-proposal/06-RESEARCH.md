# Phase 6: Browser Control Contract and Policy Proposal - Research

**Researched:** 2026-10-18  
**Domain:** Chrome MV3 browser control, additive protocol design, untrusted page text  
**Confidence:** HIGH for repository architecture and documented Chrome APIs; MEDIUM for proposed safety boundaries pending the contract review

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Navigation and link safety
- **D-01:** For a direct URL or site the user names, resolve it from the user's words, say the resolved host, and wait for the user to confirm before navigating. For an “open link” request, the user's words must identify a specific visible link; code may resolve that element's `href`, but page text alone cannot initiate navigation or select the link, and the model cannot supply or change the destination. Cross-site link destinations require host read-back and explicit confirmation.
- **D-02:** Prepare a proposal for ungated ordinary same-site HTTP(S) GET links. Keep the live policy unchanged until the voice owner gives written approval. Define the site boundary explicitly during research; retain deterministic checks for destination, method, and gated or unsafe labels, and fail closed on unknown or malformed targets.
- **D-03:** Cross-site navigation and submit, pay, delete, or send actions retain the current read-back and purpose-specific confirmation gate. A general “yes” never substitutes for the exact submit phrase.
- **D-04:** User-reported teammate agreement is context, not the required written voice-owner approval artifact. Do not mark the contract approved until that artifact is recorded.

#### Page text and questions
- **D-05:** Newly extracted body, paragraph, or article text may be sent to AGY only as a bounded, filtered excerpt when the user explicitly asks for a summary or asks a question about the page. This does not change the existing value-free title, heading, field-label, action-label, and option-label projection used for intent parsing. Do not send new body text for unrelated commands or by default.
- **D-06:** Page text remains untrusted data, never instructions. Keep sensitive values, passwords, and card numbers out of model input and speech. Code validates outputs and remains the only path to page actions.

#### Search behavior
- **D-07:** For “search for…” requests, Blip chooses between the current site's search and the browser's default search based on the user's wording and current page context. Use only the query expressed by the user. Do not derive a query or destination from page instructions. If the route is ambiguous or cannot be validated, ask a short clarification or use the safe browser-search path.
- **D-08:** Site search remains subject to the existing gated-submit policy until a written protocol and policy approval changes it. Browser-search navigation follows the cross-site navigation gate.

#### Multi-step requests
- **D-09:** Include AGENT-01 as a separate future phase after the browser-control contract and basic browser primitives are reviewed. It may coordinate multiple steps, but every page action must still pass through the deterministic Executor and existing policy gate. It cannot confirm actions, mint grants, or treat page text as authority.
- **D-10:** Keep any changes to shared `.planning/PROJECT.md` and shared requirements as proposals until both track owners agree. Phase 6 may describe the proposed placement of AGENT-01 without changing those shared files.

### the agent's Discretion
- Choose the smallest additive schema and action vocabulary that covers the agreed capabilities without weakening existing protocol invariants.
- Define bounded extraction limits, supported-page behavior, SPA and slow-load handling, and safe fallback messages in research and planning.
- Specify an explicit, purpose-bound confirmation for a user-named destination. Never reuse a submit grant or let a generic affirmation authorize a gated action.
- Resolve a link only from a specific user-selected visible link; ask which one when labels are duplicated or ambiguous. Never let hidden text or model interpretation initiate a link action.
- Determine whether “same-site” means a stricter same-origin boundary for the first proposal or a broader registrable-domain boundary; document the choice and fail closed where it cannot be verified.
- Keep unsupported pages, frames, and ambiguous targets fail-closed and explain the limitation.

### Deferred Ideas (OUT OF SCOPE)
- Implementation of browser-control features is for follow-on phases after Phase 6's contract review.
- AGENT-01 multi-step orchestration is a separate later phase.
- Any shared project or requirements edits remain proposals until both workstream owners agree.
- Changing live same-site link policy remains blocked on written voice-owner review of the precise contract.
</user_constraints>

## Summary

Phase 6 is a contract and policy proposal, not a browser-feature implementation. The planner should produce one reviewable artifact that maps each requested capability to an additive wire shape, deterministic authorization path, trust boundary, refusal behavior, and later owner. Keep the current extension, server, and protocol untouched. Keep same-origin links gated in the live code until the voice owner’s exact written approval is recorded.

The lowest-risk initial boundary for “same-site” is exact HTTP(S) same-origin: equal scheme, canonical hostname, and port. This matches the existing `new URL(...).origin` check in `packages/policy/src/classify.ts`, avoids treating sibling subdomains as trusted, and needs no new package or newer browser permission. An “open link” command should resolve only a unique, visible candidate selected by the user’s words. Cross-origin candidates need the existing Executor/gate path plus host read-back and a destination-bound confirmation. Ordinary same-origin links can be proposed as ungated only when the proposal defines the narrow eligible shape and its residual redirect/GET risk.

**Primary recommendation:** plan a concise contract proposal with a capability matrix, proposed additive schema/action table, confirmation and invalidation rules, privacy/data-flow diagram, compatibility/ownership gates, and adversarial acceptance evidence. Treat browser history traversal as gated or unavailable when its destination cannot be established before dispatch. Use Chrome’s default-search API instead of hardcoding a search provider, while retaining the cross-site gate.

## Project Constraints (from CLAUDE.md)

- Use TypeScript across the extension, server, and voice app. The extension is Chrome MV3; this checkout’s extension minimum is Chrome 116.
- Core owns `packages/protocol`, `packages/policy`, `apps/server` core/runtime code, and `apps/extension`. The voice owner owns `packages/dialogue`, `apps/voice`, and `apps/server/src/voice`. Do not edit voice-owned code or planning artifacts in this phase.
- Protocol changes need both developers’ approval. Shared `.planning/PROJECT.md` and master requirements also need both owners’ agreement. Phase 6 may draft proposals but must not change these shared files.
- Preserve intent-as-data: AGY has no tools, may return only schema-validated data, and never carries out a browser action. Every page action passes through the deterministic Executor and policy gate.
- Keep AGY role agents isolated and tool-less, reject unexpected tool steps, do not use API-key credentials, and do not expose browser actions, confirmation grants, or secrets to the provider.
- Treat all page content as untrusted. It cannot authorize an action or supply an instruction to AGY. Passwords and card numbers must never be sent to the model, spoken, or logged.
- Submit, pay, delete, send, and cross-domain actions remain default-deny and require a tracked read-back and purpose-specific confirmation. Do not weaken these rules without both owners agreeing.
- GSD edits must stay within the active workstream and follow the GSD workflow. This research artifact is the only Phase 6 file to create in the research step.
- No repository `AGENTS.md` or project skill index was found. `CLAUDE.md` reports no project-local skills. Its older stack-table port/path details conflict with the current frozen `PROTOCOL.md`; use the current protocol and source code as authority.

## Standard Stack

No package installation is needed for a proposal-only phase. The proposal should target existing components:

| Component | Current source | Use in proposal |
|---|---|---|
| Protocol schemas | `packages/protocol` (Zod, TypeScript) | Additive draft shapes for requests, results, intents, and action kinds. No schema edits during Phase 6. |
| Deterministic policy | `packages/policy/src/classify.ts` | Classify links from live DOM facts; do not let the model choose risk. |
| Extension | Chrome MV3 service worker and content scripts | Read visible page content, resolve the selected active tab, and perform only Executor-authorized operations. |
| Browser navigation | `chrome.tabs`, `chrome.webNavigation` | Existing event flow tracks the active tab, committed navigation, SPA history changes, tab activation, and window focus. |
| Default search | `chrome.search.query()` | Uses the browser’s configured default provider. It requires the `search` manifest permission, which is absent from `apps/extension/manifest.template.json`. |
| Model boundary | `apps/server/src/brain/agy/projection.ts` and `intent-router.ts` | Preserve the existing value-free metadata projection for intent parsing. Add body excerpts only for explicit page summaries/questions. |
| Dialogue/action boundary | `packages/dialogue` and `apps/server/src/voice/dialogue-runner.ts` | Reducer effects stay declarative; the runner and core Gate/Executor carry out actions. Phase 6 documents this interface without changing voice-owned files. |

**Permission facts verified against current Chrome for Developers documentation (2026-10-18):**

- `chrome.tabs.goBack()` and `goForward()` take a tab ID and return `Promise<void>`; their documented call does not return or accept the destination URL. `tabs.create`, `tabs.update`, and `tabs.reload` are available for tab operations. The existing manifest already declares `tabs` and `webNavigation`.
- `chrome.search.query({ text, disposition })` queries the browser’s default search provider and requires the `search` permission. Add that permission to a later implementation proposal if the project adopts this path; do not hardcode Google or another search host.
- `chrome.webNavigation` requires the `webNavigation` permission. Chrome documents `onHistoryStateUpdated` for History API changes, including `pushState`; this event can fire after `DOMContentLoaded`, so SPA reading must not assume a single initial load event is sufficient.
- `chrome.history` can query browsing history only with the `history` permission. It is a broad history surface and is not a safe substitute for a tab’s exact back/forward stack. Do not add it just to preview history destinations.
- Chrome’s `publicSuffix` API can return a registrable domain, but it requires the `publicSuffix` permission and Chrome 153+. The project currently supports Chrome 116. Prefer exact `URL.origin` comparison for the first proposal instead of raising the minimum version or adding a PSL dependency.
- Chrome documents `chrome://` pages as restricted from `activeTab` access. The current manifest’s content scripts also match only HTTP(S) pages. Report these pages as unsupported; do not infer that `<all_urls>` makes browser-internal pages readable.

**Installation:** none for this phase.  
**Version verification:** no new npm package or implementation dependency is recommended.

## Architecture Patterns

### Keep the Phase 6 deliverable separate from the frozen runtime

`PROTOCOL.md` labels v1 frozen and its M0 approval remains pending. `packages/protocol/protocol.lock.json` locks closed enums and message roles. Existing evolution rules permit additive optional additions after approval; enums stay closed and widening them requires both developers’ agreement. The proposal should show a possible additive diff and compatibility notes, but must not edit schemas, fixtures, the lock, or `PROTOCOL.md`, and must not run the lock generator.

There are no Phase 6 v1 requirement IDs. Do not mark new v1 requirements complete or edit either requirements file. AGENT-01 belongs in a separately sequenced future phase after the primitives and contract review; do not implement it here.

### Separate explicit body reading from the ordinary form snapshot

Current snapshots contain page title, up to 40 headings, up to 20 alerts, and up to 250 form/action elements. The extension’s composed-tree walk gathers controls/actions, headings, and alerts; it does not collect article paragraphs. `Snapshot.truncated` means only that the 250-element wire list was cut. The Phase 4 model prompt has a separate conservative 8,000-token projection budget.

Do not append arbitrary `document.body.innerText` to every ordinary snapshot. Propose an explicit content-read request/result (or another equally explicit contract) with ordered, typed text segments and a separate content-truncation indicator. Keep the existing `Snapshot.truncated` semantics unchanged. A practical starting bound is at most 20 visible content blocks, 400 Unicode code points per block, 4,000 code points total, and the existing short DOM-walk time budget. For AGY, include only the remaining room under the existing prompt-token estimator; if the excerpt cannot fit, omit or shorten it and state that the page excerpt is incomplete.

Use existing `boundedText()` for control-character removal and Unicode/code-unit bounds, and `isVisible()` for hidden/inert/aria-hidden visibility checks. Exclude form-control values, scripts/styles, extension UI, and content in unsupported frames. Keep extracted body text out of ordinary intent requests. Only explicit “summarize this page” or “answer a question about this page” requests may add the bounded excerpt to the AGY input; preserve the current metadata-only projection for ordinary intent parsing as D-05 specifies.

Reading headings/paragraphs and listing links can be deterministic reads from this bounded content/index. Do not route raw page text through an action intent. For an open-link command, first identify the user-selected visible link from the current accepted page; resolve its live `href` in code, then recheck it at dispatch. Duplicate labels or no exact candidate require a clarification. Never allow hidden text or a model response to select a candidate.

### Keep all actions behind one deterministic Executor

`apps/server/src/turn.ts` routes intents and currently sends page actions through `executeUngated`, `executeGatedAction`, or the voice Gate adapter. The reducer’s `Effect` union in `packages/dialogue/src/effects.ts` is declarative; the runner executes `fill`/`select`/`focus`, refreshes through the shared refresher, and calls a `GatePort` for arm/clear/redeem. New navigation, scrolling, and search actions should use this same core authority path. Do not add model tools, a second tab authority, or a shortcut that dispatches from `Intent` directly.

For a direct URL/site named by the user, parse only the original utterance with deterministic code, accept only supported HTTP(S) destinations, read the resolved host to the user, and wait for explicit confirmation. Bind that confirmation to the canonical destination and operation, with a separate navigation purpose/grant; never reuse a form-submit grant. Keep `speakId`, utterance, expiry, active tab, and page-change invalidation in the same tracked gate flow. A generic “yes” is not sufficient for a gated action.

For page links, exact same-origin is the recommended first boundary: require HTTP(S), compare the link’s canonical `URL.origin` against the active top-level page origin, and fail closed for malformed URLs, unsupported protocols, unknown targets, risky labels, or an unverified method/target shape. Existing policy checks text and destination for payment/delete/send terms and treats “next”, “continue”, “save”, “confirm”, and “finish” as unsafe. The live policy must remain unchanged until written voice-owner approval.

The current classifier derives link origin from the link’s document. When applying a proposed same-origin rule to framed content, compare against the active top-level page origin. A same-origin link inside a third-party iframe is still cross-origin to the user’s active page and must not be accidentally treated as safe.

Ordinary same-origin anchor traversal has a residual limitation: an HTTP GET can have server-side effects or redirect to another origin, and a same-origin URL does not prove otherwise. The proposal must call this out and define “ordinary” narrowly. It should use a deterministic browser navigation to the selected href, not call an arbitrary page `click()` handler as an authority mechanism. Any redirect is detected only after navigation begins by the existing navigation event path; the browser API does not provide a general preflight for server redirects.

### Search and history are browser actions too

Use request wording and current context to choose site search or browser-default search. The user’s utterance supplies the query. Page text and AGY output may not rewrite it or supply a destination. A model may at most classify a route; code must validate the route and take the query from user text.

- **Site search:** choose only a unique, current, visible search control. Keep its submission under the existing gated-submit flow until the protocol/policy change is approved. Do not mark every `<input type="search">` as a safe GET: the current site may submit with POST, or its action can be destructive.
- **Browser search:** prefer `chrome.search.query()` so the configured default provider is used. Its `search` permission is a future manifest dependency. Treat the resulting external navigation as gated under D-08; the query and destination operation must be bound to the gate.
- **Back/forward:** because `tabs.goBack()`/`goForward()` do not expose the history destination before dispatch, the proposed policy should gate every voice-requested history traversal or refuse it when it cannot maintain the cross-site gate. Do not add the broad `history` permission merely to inspect it.
- **Tabs:** use the existing selected-tab tracking in `apps/extension/src/background/navigation.ts`. Switching tabs changes the page authority: invalidate pending read-backs/grants, then refresh the newly active tab before accepting page-dependent commands. User-visible tab titles are untrusted data; duplicate titles need a numeric choice or clarification.
- **Reload:** preserve browser-native navigation/unload prompts. The proposal should specify how the user confirms possible loss of unsaved work; do not bypass a page’s native warning.

`chrome.webNavigation` reports committed navigation and History API transitions, and the existing listener already tracks `onCommitted`, `onHistoryStateUpdated`, `tabs.onUpdated`, `tabs.onActivated`, tab removal, and window focus. Reuse that state and the existing refresh scheduler. A tab switch or URL change makes previous content excerpts and action IDs stale.

### Page text and model outputs stay data-only

Page body content can contain prompt injection. Put it in a clearly delimited data field and retain a direct instruction that all page text is untrusted data. AGY remains tool-less; its output stays a plain schema-validated answer, never an action or target. The server must continue to validate model output and current page identity after every await. If text is stale, unavailable, truncated, or ambiguous, say so rather than infer.

Do not send field values or sensitive control data. The existing extension snapshot detects password/card/CVC/OTP/SSN controls and nulls sensitive values, while the AGY intent router rejects obvious secret/card/SSN-shaped model outputs. New body excerpts need equivalent conservative filtering before sending and before speech. Shape filters cannot prove arbitrary article text contains no private data; fail closed or redact when a sensitive shape is detected, and do not promise perfect PII detection. Do not log excerpts, URLs, search text, or transcripts.

## Don't Hand-Roll

| Problem | Avoid | Use instead |
|---|---|---|
| Same-site boundary | A hand-maintained public-suffix list or naïve suffix comparison | Exact canonical `URL.origin` for the initial policy. This also fails safely for unsupported values. |
| Current tab and page-change ownership | A parallel active-tab cache or a new background navigation authority | `findTargetTab`, `rememberTargetTab`, and the existing navigation listeners/scheduler. |
| Browser back/forward destination | Reading all browser history with a broad permission to guess a tab’s stack | Keep traversal gated or unavailable when destination cannot be checked before dispatch. |
| Default search provider | Hardcoded Google/Bing URL construction | `chrome.search.query()` with its declared permission, after the core gate authorizes it. |
| Page text normalization and visibility | New parsing package or an unbounded `innerText` snapshot | Existing `boundedText()`, `isVisible()`, and a bounded explicit capture path. |
| Model-driven actions | Giving AGY browser tools or accepting model-provided URLs/queries | Existing Zod Intent validation plus the deterministic Executor and live extension checks. |
| Confirmation | A new generic confirmation boolean or reuse of a submit grant | The tracked speech/confirmation flow, with a destination- and purpose-bound navigation authorization. |

## Common Pitfalls

### Pitfall 1: Letting page text choose the target
**What goes wrong:** A prompt-injection paragraph, hidden link, or model guess changes the requested URL or query.  
**How to avoid:** Keep the user utterance as the only source of direct URLs and search queries. For links, let the user select one visible candidate; code resolves only that candidate’s live `href`. Add adversarial evidence that injected text alone cannot navigate and that duplicate labels cause clarification.

### Pitfall 2: Treating empty capture as an empty page
**What goes wrong:** `chrome://`, extension, file, restricted, cross-origin-frame, or failed pages look like a blank document.  
**How to avoid:** Distinguish unsupported/permission-denied from a successfully captured page with no readable text. Return a short refusal and do not claim the page is empty.

### Pitfall 3: Confusing element caps with body-text caps
**What goes wrong:** Article text is added to `Snapshot.elements`, or content truncation changes the meaning of `Snapshot.truncated` and existing Phase 2 criteria.  
**How to avoid:** Keep the 250-element/40-heading/20-alert caps intact. Give explicit body captures their own item/character/time and truncation fields, and keep AGY input within the existing 8,000-token projection budget.

### Pitfall 4: Comparing a frame to itself
**What goes wrong:** A link in an embedded third-party frame looks same-origin relative to the frame, even though it leaves the top-level site.  
**How to avoid:** Use the active top-level origin as the same-origin baseline; fail closed for unsupported frames. Preserve frame IDs to revalidate the exact selected element.

### Pitfall 5: Assuming a same-origin GET is side-effect-free
**What goes wrong:** The path mutates server state, an anchor handler changes the target, or the server redirects to another origin.  
**How to avoid:** Narrow the proposed eligible link set, navigate deterministically to the selected URL, and state the residual GET/redirect risk. Do not claim policy can pre-verify the server’s eventual response.

### Pitfall 6: Stale page after SPA or tab changes
**What goes wrong:** A command uses an old heading/link ID after `pushState`, a slow load, or a switch to another tab.  
**How to avoid:** Bind content results to tab, URL, snapshot/version and page identity. Reuse `onHistoryStateUpdated` and the current refresh scheduler. Clear pending gates on every page/tab change. Bound waits and say when content is still loading.

### Pitfall 7: Assuming history methods disclose the next host
**What goes wrong:** `goBack()` or `goForward()` is dispatched as a harmless same-site action, but the browser traverses to another origin without the cross-site confirmation.  
**How to avoid:** Treat the unpreviewable traversal as gated (or refuse it) unless a future approved implementation can prove the destination before dispatch. Avoid `history` permission as a shortcut.

### Pitfall 8: Adding permission without documenting it
**What goes wrong:** Site search is implemented through an undocumented permission, or the implementation hardcodes a search provider contrary to the user’s default-provider decision.  
**How to avoid:** Include `search` in the proposed manifest/permission delta and keep it separate from already-present `tabs` and `webNavigation`. Confirm the query still uses the cross-site gate.

## Code Examples

### Strict same-origin candidate validation

Illustrative future policy helper. The selected link identity must already come from the user’s request and accepted visible page data; the model never supplies `href`.

```ts
function sameOriginHttpCandidate(pageUrl: string, selectedHref: string): URL | null {
  try {
    const page = new URL(pageUrl);
    const target = new URL(selectedHref, page);
    if (!/^https?:$/.test(page.protocol) || !/^https?:$/.test(target.protocol)) return null;
    if (target.username || target.password) return null;
    if (target.origin !== page.origin) return null;
    return target;
  } catch {
    return null;
  }
}
```

This matches the current policy’s use of `URL.origin`, but the future implementation must compare against the active top-level origin for framed links and must still apply text/method checks.

### Default browser search after gate authorization

```ts
// Called only after the Executor consumes a grant bound to this user query and search operation.
await chrome.search.query({ text: userQuery, disposition: "NEW_TAB" });
```

The Chrome API uses the configured default provider; the extension must declare the `search` permission. The API call itself does not replace Blip’s cross-site confirmation gate.

## State of the Art

| Current approach | Phase 6 proposal direction | Reason |
|---|---|---|
| Snapshot contains form controls, title, headings, and alerts | Add explicit, separately bounded page-content capture | Avoid sending or budgeting body text on every form snapshot. |
| All same-origin links except a short allowlist are gated | Propose only eligible ordinary same-origin HTTP(S) GET links as ungated | User decision; keep live behavior gated pending written voice-owner review. |
| Browser navigation mostly observes changes | Add explicit user-originated navigation/search actions through the Executor | Preserve one authority path and tracked page refreshes. |
| Model sees value-free metadata for intent parsing | Keep that projection; add body excerpts only for explicit summary/page-question requests | Matches D-05 and preserves Phase 4 behavior. |

## Open Questions

1. **Exact eligible same-origin link shape:** The research recommendation is exact top-level same-origin, HTTP(S), visible, uniquely user-selected anchors, safe text, and deterministic direct navigation. The proposal should document whether `_blank`, `download`, `target`, `rel`, JavaScript handlers, or form-associated links are excluded. Even an ordinary GET can mutate state or redirect.
2. **Back/forward confirmation wording:** Chrome does not provide the next history destination from `tabs.goBack()`/`goForward()`. The proposal should choose a distinct purpose-bound confirmation for these transitions or mark them unsupported until the destination can be verified.
3. **Search route confirmation:** Site search remains on the existing gated submit phrase. Browser-default search needs the `search` permission and remains cross-site gated; the proposal should make the read-back and phrase refer to the exact query and selected default-search operation.
4. **URL normalization and host speech:** Decide the exact canonicalization rule for bare hostnames, trailing dots, IDNs, credentials, ports, and paths. The spoken host and confirmation must bind to one canonical HTTP(S) URL; ambiguous names should be clarified rather than guessed.
5. **Content excerpt filtering:** Visibility and secret-shape checks reduce leakage but cannot reliably identify every private datum in arbitrary article text. Define a fail-closed fallback and avoid claiming complete PII detection.
6. **Frames and restricted pages:** Recommend top-level plus same-origin frame support first, with cross-origin frames and browser-internal pages returning an honest limitation. Do not broaden host permissions as a substitute for browser restrictions.
7. **Written protocol approval:** Pranav reports the teammate is comfortable with the direction, but this is not the required written approval artifact. Leave the proposal explicitly pending voice-owner review and do not touch the protocol lock or live classifier.

## Environment Availability

Skipped: this phase produces a proposal only. No external runtime, browser session, package installation, or test execution is needed. Chrome API behavior was checked against current official documentation.

## Validation Architecture

Omitted because `.planning/config.json` sets `workflow.nyquist_validation` to `false`.

For the proposal’s review evidence, the plan should include a source-to-proposal crosswalk and an adversarial acceptance matrix (not executed in this research step): direct URL from user words; hostile page text alone cannot navigate; hidden links are not candidates; duplicate visible labels clarify; cross-site host read-back precedes one purpose-bound grant; same-origin links are rechecked live; site search remains gated; browser search uses the default provider and remains gated; tab/SPA changes invalidate old IDs/grants; restricted pages and slow loads give honest refusals; model/body text cannot trigger a page action.

## Sources

### Primary: repository evidence

- `.planning/workstreams/core/phases/06-browser-control-contract-and-policy-proposal/06-CONTEXT.md` — locked decisions, discretion, proposal-only boundary.
- `.planning/workstreams/core/ROADMAP.md` and `.planning/workstreams/core/REQUIREMENTS.md` — Phase 6 placement and unchanged v1 requirement set.
- `PROTOCOL.md`, `packages/protocol/src/{intent,action-kind,snapshot,act}.ts` — frozen v1 semantics, message caps, sensitive value rules, and action contract.
- `packages/policy/src/classify.ts` — current same-origin comparison and fail-closed link/text classifier.
- `apps/extension/src/content/{snapshot,walk,text,visibility}.ts` — current capture scope, sanitization, visibility, and lack of article extraction.
- `apps/extension/src/background/navigation.ts` — active-tab, committed navigation, SPA history, tab activation/removal, and window-focus listeners.
- `apps/extension/manifest.template.json` — current permissions include `tabs`, `scripting`, `alarms`, `storage`, and `webNavigation`; no `search` or `history` permission.
- `apps/server/src/turn.ts`, `apps/server/src/brain/agy/{intent-router,privacy,projection}.ts` — current intent path, value-free metadata projection, sensitive-shape checks, and server validation.
- `packages/dialogue/src/{effects,events,reduce}.ts` and `apps/server/src/voice/dialogue-runner.ts` — reducer/effect boundary and core GatePort execution.
- `.planning/workstreams/core/phases/02-real-page-read-and-fill/02-CONTEXT.md`, `.planning/workstreams/core/phases/03-gated-submit-and-result-reading/03-CONTEXT.md`, `.planning/workstreams/core/phases/04-claude-brain-and-label-repair/04-CONTEXT.md`, `.planning/workstreams/core/phases/05-hostile-pages-real-web-and-freeze/05-CONTEXT.md`, and the Phase 4/5 research docs — snapshot cap, privacy, Executor, hostile-page, and cross-track precedents.
- `CLAUDE.md` — repository safety, ownership, technology, and GSD workflow constraints.

### Primary: official Chrome documentation (checked 2026-10-18)

- [Chrome `tabs` API](https://developer.chrome.com/docs/extensions/reference/api/tabs) — `goBack`, `goForward`, `create`, `update`, `reload`, active-tab events. The history methods accept a tab ID and expose no destination in their documented return shape.
- [Chrome `search` API](https://developer.chrome.com/docs/extensions/reference/api/search) — default-provider search, `search` permission, `Chrome 87+` availability.
- [Chrome `webNavigation` API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) — permission requirement, navigation event order, and SPA `onHistoryStateUpdated` behavior.
- [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) — permission categories, optional permissions, host permission behavior.
- [Chrome `activeTab` permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) — temporary access scope and restricted-page limitation.
- [Chrome `publicSuffix` API](https://developer.chrome.com/docs/extensions/reference/api/publicSuffix) and [Chrome Extensions What's New](https://developer.chrome.com/docs/extensions/whats-new) — PSL API requires permission and is available from Chrome 153.
- [Chrome `history` API](https://developer.chrome.com/docs/extensions/reference/api/history) — browser-history access requires the `history` permission.

## Metadata

**Confidence breakdown:**
- Repository architecture: HIGH — verified directly in current source and frozen contract.
- Chrome API availability/permissions: HIGH — checked against current Chrome for Developers references.
- Same-origin recommendation: HIGH for a conservative boundary; MEDIUM for product semantics of “same-site.”
- Ungated GET residual risk and arbitrary-page text filtering: MEDIUM — contract can narrow and test behavior, but cannot prove remote server semantics or detect every private datum.

**Research date:** 2026-10-18  
**Valid until:** 2026-11-18 for stable repo architecture; recheck Chrome API permissions and minimum-version support before a later implementation phase.
