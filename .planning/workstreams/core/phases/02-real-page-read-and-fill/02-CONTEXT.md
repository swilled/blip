# Phase 2: Real Page Read and Fill - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the fake extension with a real Chrome MV3 extension. On a live page it snapshots form controls (accessible-name candidates, role, value, required, options, errors), classifies every action by fail-closed rules, fills fields so site validation reacts, reads the real DOM value back after every write, highlights the active field, and keeps the server's form model fresh within about 1 s of a page change. It survives an idle MV3 service worker.

Out of scope here: the policy gate and gated clicks (Phase 3: the extension refuses anything gated), Claude/label repair (Phase 4), one-command startup and injection hardening (Phase 5). Requirements: PAGE-01, PAGE-03, PAGE-05, ACT-01..ACT-04.

The user delegated all four discussion areas ("do whatever you think best, just consider all of this"). The decisions below are Claude's, grounded in the frozen protocol and Phase 1 code. Reverse any of them before planning if you disagree.

</domain>

<decisions>
## Implementation Decisions

### Read and fill engine
- **D-01:** Primary engine is a content-script DOM walk, not `chrome.debugger`/CDP. The frozen contract already assumes it: `RawElement.id` is a stamped `data-blip-id`, `labelCandidates` come from DOM heuristics, and `page.changed` is emitted by the extension. REQUIREMENTS PAGE-01 says "content-script DOM walk". This deliberately departs from the CLAUDE.md stack table (CDP AX tree primary); it removes the "started debugging" infobar, the `--silent-debugger-extension-api` dependency and a `debugger` permission warning from Phase 2. The manifest does NOT request `debugger` in Phase 2. — **Reversibility:** costly — the wire format would not change, but fill and snapshot internals live in the extension and a CDP path would be a second implementation behind the same `ActRequest`.
- **D-02:** Fill recipe (ACT-01): scroll into view, focus, native value setter (`HTMLInputElement`/`HTMLTextAreaElement` prototype), dispatch bubbling `InputEvent("input", {inputType:"insertText"})` then `change`, then `blur()` so on-blur validation fires. Never dispatch Enter or any key event that can submit. Select: set by option value, dispatch `input` + `change`. Checkbox/radio: call `el.click()` only when the state differs (fires native events React/Vue listen to), no-op when already correct.
- **D-03:** Verify-after-write (ACT-04): after the events, wait two animation frames (about 32 ms) so controlled inputs re-render, then read the value from the DOM and return it as `ActResult.observedValue`. A maxlength-truncated or reset value is reported as it is, never as what was requested. If the DOM value differs from the requested one the result is still `ok: true` with `observedValue` set; the server/dialogue decides how to phrase it.
- **D-04:** CDP is a documented fallback, not a Phase 2 deliverable. Escalate to a CDP `Input.insertText` fill only if the React/Vue spike (a real React-controlled input plus one real public form) shows the native-setter approach cannot be made to work. The planner should put that spike first.
- **D-05:** Action classification (PAGE-03) is a pure, browser-safe function in `packages/policy` (the package already re-exports the single `ActionKind`). The extension calls it to set `kind`/`kindReasons`; the server may re-run it. Fail closed per D-11 of Phase 1: an unrecognized or typeless in-form `<button>` is `submit`; input `type=submit|image` is `submit`; text matching pay/buy/purchase/order/checkout/donate is `pay`; delete/remove/cancel-account is `delete`; send/post/publish/share is `send`; an `<a>` whose origin differs is `navigate-cross-domain`. Only fill/select/check/click-safe are ungated. Tests drive it from a table.
- **D-06:** Until Phase 3 the extension refuses any `click` whose live kind is gated or unknown, returning `gate-required` with no page mutation, and returns `kind-mismatch` when its live kind differs from `expectedKind`. Same behavior as `tools/fake-extension`, which stays as the reference.
- **D-07:** Sensitive fields (password, card number/CVC, OTP, SSN) are classified in the extension from `type`, `autocomplete` tokens (`cc-*`, `current-password`, `one-time-code`) and name/label patterns. Their value never leaves the page (`value: null`, `hasValue` only). `fill`/`select`/`check` on them returns `sensitive-field`; `focus` is allowed so the user can type. This is not a listed Phase 2 requirement but the snapshot schema requires it and the safety invariants forbid the alternative.

### Extension build, load and test pages
- **D-08:** Plain esbuild with a hand-written manifest template, not WXT. The extension is one service worker plus one content script, WXT adds a framework and dev-runner config for no gain, and CLAUDE.md names plain esbuild as the right fallback. The build script injects `EXTENSION_PUBLIC_KEY` from `@blip/protocol` as the manifest `key` so every developer's id is `EXTENSION_ID`. esbuild is already present transitively through tsx, but it becomes a direct dev dependency, so the planner must gate it with the same package-legitimacy checkpoint used in Phase 1.
- **D-09:** Manifest permissions: `tabs`, `scripting`, `alarms`, `storage`, `webNavigation`, `host_permissions: ["<all_urls>"]`, `minimum_chrome_version: "116"`, content script with `all_frames: true`, `run_at: document_idle`. No `debugger`.
- **D-10:** Dev loop: `npm run ext:build` (and `ext:watch`) writes `apps/extension/dist`; the developer clicks Load unpacked once in a dedicated Chrome profile (`.chrome-profile/`, gitignored) and presses the reload button after rebuilds. A small `npm run ext:chrome` script launches that profile with the test pages open. Full one-command startup stays Phase 5.
- **D-11:** Core-owned test pages live in `tools/test-pages/` (not `fixtures/forms/`, which belongs to the voice workstream), served on a fixed local port by a tiny `tools/test-pages/serve.ts`. Pages: a React-controlled form (real React bundled by esbuild; the planner gates the React dev dependency), a vanilla form with a maxlength field, select, radio group, checkbox and a div "button", an implicit-Enter-submit form, a delayed-reveal/SPA-navigation page, and a same-origin plus a cross-origin iframe page. `injection.html` stays with Phase 5.
- **D-12:** The extension connects with the pinned origin to `ws://127.0.0.1:7777/ws`, says hello as `extension`, and reconnects with backoff. Keepalive: send an app-level `ping` every 20 s (server replies `pong`), plus a `chrome.alarms` reconnect every 30 s, per CLAUDE.md. Socket creation happens at service-worker top level and on `onStartup`/`onInstalled`.

### Page-change detection (PAGE-05)
- **D-13:** The content script runs a `MutationObserver` (childList, attributes `disabled`/`hidden`/`aria-*`/`class`, subtree) and recomputes `structuralHash` (excludes values). The background sends `page.changed` (debounced 500 ms, per the contract) when the hash changes or a new alert/error text appears. Value-only changes never send it.
- **D-14:** Navigation signals: `webNavigation.onCommitted`, `onHistoryStateUpdated` (SPA routes) and `tabs.onActivated`/`onUpdated` map to `page.changed` with reason `navigation` or `tab-activated`.
- **D-15:** The extension is the signal source; the server owns policy. On `page.changed` the server debounces and issues `snapshot.request {reason: refresh}`, then updates the cached form model and `state` push. After every successful act the extension also re-captures and reports `newSnapshotVersion`. Target: change to updated model in about 1 s (500 ms debounce plus capture, the 100 ms baseline budget, and a round trip).
- **D-16:** Snapshot `version` is monotonic per tab and increments only when the content actually changed; a stale `snapshotVersion` on an act is rejected with `stale-snapshot` only when the target element also changed, as the contract says.

### Coverage limits
- **D-17:** In scope: text-like inputs (text, email, tel, url, search, number, date/time via ISO string), textarea, native select, checkbox, radio groups (one `RawElement` per group), open shadow DOM (walked), same-origin iframes and, because the content script runs with `all_frames`, cross-origin iframes on a best-effort basis. Elements carry `frameId`; element ids are unique per tab and resolved to (frame, node) by the background. Required: top frame and same-origin iframes. Cross-origin frames get a time-boxed spike; if it is not working by the Phase 2 midpoint it becomes a deferred item with a spoken "I can't read that part of the page".
- **D-18:** Stubbed with an honest refusal rather than silent failure: custom ARIA combobox/listbox widgets, contenteditable, file inputs, canvas widgets. They appear in the snapshot (so Blip can say they exist) but `fill` returns `exception` with `detail: "unsupported-widget"`. The planner must not invent new error codes (the error enum is frozen; use `detail`).
- **D-19:** Highlight (ACT-03): a fixed-position overlay box in a closed shadow root attached to `document.documentElement`, `pointer-events: none`, maximum z-index, high-contrast 3 px outline that follows scroll/resize. It does not touch the page's own styles or focus. `highlight {targetId: null}` clears it. Moved on every `fill`/`focus`/`select`/`check` automatically.
- **D-20:** Snapshot size: the wire cap is 250 elements, 40 headings and 20 alerts (frozen). The roughly 8k-token trim belongs at the model-prompt boundary in Phase 4; Phase 2 only sets `truncated: true` when it hits the wire caps. Hidden/off-screen elements are included with `visible: false`.

### Amendments from research (02-RESEARCH.md flags F1-F5, accepted)
- **A-01 (F1):** Server-side act path is IN scope. Add `executeUngated` in the turn handler (fill/select/check only, never gated), fake-brain phrases like `fill <label> with <value>`, and `npm run dev -- --no-fake-extension` so the REPL drives the real extension. Required for success criterion 3.
- **A-02 (F2, amends D-03):** Script writes ignore `maxlength`, so the fill clamps to `maxLength` itself before writing; `observedValue` then reports the truncated value.
- **A-03 (F3, amends D-02):** When the page is not OS-focused, native focus/blur do not fire. The fill dispatches synthetic `focus`/`focusin`/`blur`/`focusout` when the native ones were not observed, so on-blur validation runs.
- **A-04 (F4, amends D-20):** `visible` means rendered and not hidden, never viewport intersection (the baseline builder drops `visible: false`). Below-the-fold fields stay `visible: true`.
- **A-05 (F5, amends D-15):** No server debounce on top of the extension's 500 ms. The server always re-snapshots after an act (version may not change). Re-snapshot on read-back/requirements intents when the cached model is older than about 2 s, to catch values the user typed themselves.
- **A-06:** `classifyAction` lives in a zod-free module (own ungated-kinds set plus a parity test against `@blip/protocol`), because a runtime import adds about 464 KB of zod to the content script. The server does not re-run it.
- **A-07:** Test stack: vitest + jsdom 29.1.1 (not 30.x) for pure DOM logic, a roughly 60-line `ws` + headless `--load-extension` script for real-browser checks, no Playwright. New dev dependencies (jsdom, @types/chrome, react, react-dom) need the package-legitimacy checkpoint.
- **A-08:** The demo browser on this machine is Edge 155 (Chrome is not installed); `ext:chrome` honors a `BLIP_BROWSER` override and falls back to Edge.

### Claude's Discretion
- Exact label-candidate heuristics and confidence numbers (aria-labelledby, label[for], wrapping label, placeholder, nearby text, legend), as long as the server's baseline builder in `apps/server/src/baseline` stays unchanged.
- Backoff schedule, overlay styling, and internal module layout of `apps/extension`.
- Whether the React test page uses real React or a faithful value-tracker shim, decided by the spike result.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contract (frozen, additive-only)
- `PROTOCOL.md` - message registry, origin/role rules, close codes, error codes, FormModel conventions
- `packages/protocol/src/snapshot.ts` - `RawElement`, `Snapshot`, sensitivity rules
- `packages/protocol/src/act.ts` - `ActOp`, `ActRequest`, `ActResult`, closed error enum
- `packages/protocol/src/action-kind.ts` - single `ActionKind` enum, fail-closed `isGatedKind`
- `packages/protocol/src/extension-id.ts` - pinned key and id for the manifest
- `packages/protocol/protocol.lock.json` and `packages/protocol/test/protocol-lock.test.ts` - freeze enforcement

### Planning
- `.planning/workstreams/core/ROADMAP.md` - Phase 2 goal and success criteria (section "Phase 2")
- `.planning/workstreams/core/REQUIREMENTS.md` - PAGE-01, PAGE-03, PAGE-05, ACT-01..04, GATE-08 (relevant to Phase 3)
- `.planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-CONTEXT.md` - Phase 1 decisions (D-08 ids, D-09 sensitive, D-11 kinds, D-17 additive-only)
- `.planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-03-SUMMARY.md` and `01-05-SUMMARY.md` - baseline builder and fake extension behavior to match
- `CLAUDE.md` - Technology Stack section 4 (Chrome MV3 extension) and "What NOT to Use"; safety invariants
- `.planning/research/` - research behind the CLAUDE.md stack

### Reference implementation
- `tools/fake-extension/src/fake-extension.ts` - the behavior the real extension must match (fail-closed refusals, sensitive handling)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@blip/protocol`: every message, snapshot and act schema; fixtures in `packages/protocol/fixtures/` to compare real captures against.
- `apps/server/src/baseline/`: turns a `Snapshot` into the FormModel; real snapshots must feed it unchanged.
- `tools/fake-extension`: reference semantics for acts and refusals.
- `tools/repl` and `npm run dev -- --brain=fake`: how the developer drives the real extension in Phase 2 (typed utterances, `set_fields`).
- `apps/server` hub: `hub.request`, `pushState`, hello/role binding, Origin guard (already allows the pinned extension origin).

### Established Patterns
- zod `parse()` on every inbound message; no `.default()` on wire schemas; additive-only protocol changes.
- Tests in vitest; pure logic in browser-safe packages with no `node:` imports (enforced by `browser-safe.test.ts` for protocol).

### Integration Points
- New `apps/extension` workspace (service worker, content script, build script, manifest template).
- `packages/policy`: add `classifyAction` (pure, browser-safe).
- `apps/server` session: handle `page.changed` -> `snapshot.request` and keep the cached model fresh; today `Session` only reacts to utterances.
- Root `package.json`: `ext:build`, `ext:watch`, `ext:chrome`, test-page server scripts.

</code_context>

<specifics>
## Specific Ideas

- Roadmap spike list: React/Vue-safe fills, MV3 service-worker keepalive and reconnect, shadow DOM and iframes. Run the fill spike first because it decides D-04.
- Success criterion 3 requires a maxlength-truncated value to be reported truncated: include a maxlength field in the vanilla test page.
- An implicit-Enter-submit page proves "no Enter is ever sent".
- Open item from Phase 1: confirm the real service worker sends `Origin: chrome-extension://<EXTENSION_ID>`; rejected Origins are logged verbatim by the hub.

</specifics>

<deferred>
## Deferred Ideas

- CDP accessibility-tree snapshot and `Input.insertText` fill (only if the D-04 spike fails).
- Custom ARIA combobox/listbox filling and contenteditable.
- File upload fields.
- Cross-origin iframe support beyond best effort.
- Model-prompt token trimming to about 8k tokens (Phase 4).
- One-command startup, `--silent-debugger-extension-api` launch flags and the injection page (Phase 5).
- Updating CLAUDE.md's stack table to reflect D-01 and the 7777 `/ws` port (needs both developers).

</deferred>

---

*Phase: 02-real-page-read-and-fill*
*Context gathered: 2026-10-16*
