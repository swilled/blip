# Phase 2: Real Page Read and Fill - Research

**Researched:** 2026-10-16
**Domain:** Chrome MV3 extension; content-script DOM snapshot, synthetic fills that satisfy React/Vue, page-change detection, service-worker WebSocket
**Confidence:** HIGH on the fill/connect mechanics (reproduced in a real Chromium 155 build this session), MEDIUM on label/classification heuristics (design, not yet run on real sites), LOW on three items flagged `[ASSUMED]`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Read and fill engine**
- **D-01:** Primary engine is a content-script DOM walk, not `chrome.debugger`/CDP. The frozen contract already assumes it: `RawElement.id` is a stamped `data-blip-id`, `labelCandidates` come from DOM heuristics, and `page.changed` is emitted by the extension. REQUIREMENTS PAGE-01 says "content-script DOM walk". This deliberately departs from the CLAUDE.md stack table (CDP AX tree primary); it removes the "started debugging" infobar, the `--silent-debugger-extension-api` dependency and a `debugger` permission warning from Phase 2. The manifest does NOT request `debugger` in Phase 2. â€” **Reversibility:** costly â€” the wire format would not change, but fill and snapshot internals live in the extension and a CDP path would be a second implementation behind the same `ActRequest`.
- **D-02:** Fill recipe (ACT-01): scroll into view, focus, native value setter (`HTMLInputElement`/`HTMLTextAreaElement` prototype), dispatch bubbling `InputEvent("input", {inputType:"insertText"})` then `change`, then `blur()` so on-blur validation fires. Never dispatch Enter or any key event that can submit. Select: set by option value, dispatch `input` + `change`. Checkbox/radio: call `el.click()` only when the state differs (fires native events React/Vue listen to), no-op when already correct.
- **D-03:** Verify-after-write (ACT-04): after the events, wait two animation frames (about 32 ms) so controlled inputs re-render, then read the value from the DOM and return it as `ActResult.observedValue`. A maxlength-truncated or reset value is reported as it is, never as what was requested. If the DOM value differs from the requested one the result is still `ok: true` with `observedValue` set; the server/dialogue decides how to phrase it.
- **D-04:** CDP is a documented fallback, not a Phase 2 deliverable. Escalate to a CDP `Input.insertText` fill only if the React/Vue spike (a real React-controlled input plus one real public form) shows the native-setter approach cannot be made to work. The planner should put that spike first.
- **D-05:** Action classification (PAGE-03) is a pure, browser-safe function in `packages/policy` (the package already re-exports the single `ActionKind`). The extension calls it to set `kind`/`kindReasons`; the server may re-run it. Fail closed per D-11 of Phase 1: an unrecognized or typeless in-form `<button>` is `submit`; input `type=submit|image` is `submit`; text matching pay/buy/purchase/order/checkout/donate is `pay`; delete/remove/cancel-account is `delete`; send/post/publish/share is `send`; an `<a>` whose origin differs is `navigate-cross-domain`. Only fill/select/check/click-safe are ungated. Tests drive it from a table.
- **D-06:** Until Phase 3 the extension refuses any `click` whose live kind is gated or unknown, returning `gate-required` with no page mutation, and returns `kind-mismatch` when its live kind differs from `expectedKind`. Same behavior as `tools/fake-extension`, which stays as the reference.
- **D-07:** Sensitive fields (password, card number/CVC, OTP, SSN) are classified in the extension from `type`, `autocomplete` tokens (`cc-*`, `current-password`, `one-time-code`) and name/label patterns. Their value never leaves the page (`value: null`, `hasValue` only). `fill`/`select`/`check` on them returns `sensitive-field`; `focus` is allowed so the user can type. This is not a listed Phase 2 requirement but the snapshot schema requires it and the safety invariants forbid the alternative.

**Extension build, load and test pages**
- **D-08:** Plain esbuild with a hand-written manifest template, not WXT. The extension is one service worker plus one content script, WXT adds a framework and dev-runner config for no gain, and CLAUDE.md names plain esbuild as the right fallback. The build script injects `EXTENSION_PUBLIC_KEY` from `@blip/protocol` as the manifest `key` so every developer's id is `EXTENSION_ID`. esbuild is already present transitively through tsx, but it becomes a direct dev dependency, so the planner must gate it with the same package-legitimacy checkpoint used in Phase 1.
- **D-09:** Manifest permissions: `tabs`, `scripting`, `alarms`, `storage`, `webNavigation`, `host_permissions: ["<all_urls>"]`, `minimum_chrome_version: "116"`, content script with `all_frames: true`, `run_at: document_idle`. No `debugger`.
- **D-10:** Dev loop: `npm run ext:build` (and `ext:watch`) writes `apps/extension/dist`; the developer clicks Load unpacked once in a dedicated Chrome profile (`.chrome-profile/`, gitignored) and presses the reload button after rebuilds. A small `npm run ext:chrome` script launches that profile with the test pages open. Full one-command startup stays Phase 5.
- **D-11:** Core-owned test pages live in `tools/test-pages/` (not `fixtures/forms/`, which belongs to the voice workstream), served on a fixed local port by a tiny `tools/test-pages/serve.ts`. Pages: a React-controlled form (real React bundled by esbuild; the planner gates the React dev dependency), a vanilla form with a maxlength field, select, radio group, checkbox and a div "button", an implicit-Enter-submit form, a delayed-reveal/SPA-navigation page, and a same-origin plus a cross-origin iframe page. `injection.html` stays with Phase 5.
- **D-12:** The extension connects with the pinned origin to `ws://127.0.0.1:7777/ws`, says hello as `extension`, and reconnects with backoff. Keepalive: send an app-level `ping` every 20 s (server replies `pong`), plus a `chrome.alarms` reconnect every 30 s, per CLAUDE.md. Socket creation happens at service-worker top level and on `onStartup`/`onInstalled`.

**Page-change detection (PAGE-05)**
- **D-13:** The content script runs a `MutationObserver` (childList, attributes `disabled`/`hidden`/`aria-*`/`class`, subtree) and recomputes `structuralHash` (excludes values). The background sends `page.changed` (debounced 500 ms, per the contract) when the hash changes or a new alert/error text appears. Value-only changes never send it.
- **D-14:** Navigation signals: `webNavigation.onCommitted`, `onHistoryStateUpdated` (SPA routes) and `tabs.onActivated`/`onUpdated` map to `page.changed` with reason `navigation` or `tab-activated`.
- **D-15:** The extension is the signal source; the server owns policy. On `page.changed` the server debounces and issues `snapshot.request {reason: refresh}`, then updates the cached form model and `state` push. After every successful act the extension also re-captures and reports `newSnapshotVersion`. Target: change to updated model in about 1 s (500 ms debounce plus capture, the 100 ms baseline budget, and a round trip).
- **D-16:** Snapshot `version` is monotonic per tab and increments only when the content actually changed; a stale `snapshotVersion` on an act is rejected with `stale-snapshot` only when the target element also changed, as the contract says.

**Coverage limits**
- **D-17:** In scope: text-like inputs (text, email, tel, url, search, number, date/time via ISO string), textarea, native select, checkbox, radio groups (one `RawElement` per group), open shadow DOM (walked), same-origin iframes and, because the content script runs with `all_frames`, cross-origin iframes on a best-effort basis. Elements carry `frameId`; element ids are unique per tab and resolved to (frame, node) by the background. Required: top frame and same-origin iframes. Cross-origin frames get a time-boxed spike; if it is not working by the Phase 2 midpoint it becomes a deferred item with a spoken "I can't read that part of the page".
- **D-18:** Stubbed with an honest refusal rather than silent failure: custom ARIA combobox/listbox widgets, contenteditable, file inputs, canvas widgets. They appear in the snapshot (so Blip can say they exist) but `fill` returns `exception` with `detail: "unsupported-widget"`. The planner must not invent new error codes (the error enum is frozen; use `detail`).
- **D-19:** Highlight (ACT-03): a fixed-position overlay box in a closed shadow root attached to `document.documentElement`, `pointer-events: none`, maximum z-index, high-contrast 3 px outline that follows scroll/resize. It does not touch the page's own styles or focus. `highlight {targetId: null}` clears it. Moved on every `fill`/`focus`/`select`/`check` automatically.
- **D-20:** Snapshot size: the wire cap is 250 elements, 40 headings and 20 alerts (frozen). Phase 2 sets `truncated: true` only when the 250-element cap cuts the element list; heading, alert, option or walk-time limits do not set this flag. The roughly 8k-token trim belongs at the model-prompt boundary in Phase 4. Hidden/off-screen elements are included with `visible: false`.

### Claude's Discretion
- Exact label-candidate heuristics and confidence numbers (aria-labelledby, label[for], wrapping label, placeholder, nearby text, legend), as long as the server's baseline builder in `apps/server/src/baseline` stays unchanged.
- Backoff schedule, overlay styling, and internal module layout of `apps/extension`.
- Whether the React test page uses real React or a faithful value-tracker shim, decided by the spike result.

### Deferred Ideas (OUT OF SCOPE)
- CDP accessibility-tree snapshot and `Input.insertText` fill (only if the D-04 spike fails).
- Custom ARIA combobox/listbox filling and contenteditable.
- File upload fields.
- Cross-origin iframe support beyond best effort.
- Model-prompt token trimming to about 8k tokens (Phase 4).
- One-command startup, `--silent-debugger-extension-api` launch flags and the injection page (Phase 5).
- Updating CLAUDE.md's stack table to reflect D-01 and the 7777 `/ws` port (needs both developers).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Snapshot of the active tab's form controls via content-script DOM walk (names, roles, values, required, options, errors), capped | Walk design, label/required/error heuristics, frame aggregation, size caps (sections "Snapshot walk", "Label heuristics", "Frame aggregation", Pitfalls 6, 7, 8) |
| PAGE-03 | Every actionable element gets a kind from fail-closed rules, never the model | `classifyAction` table in `packages/policy`, zod-free module requirement (Pitfall 3), parity test |
| PAGE-05 | Page changes re-snapshot and the model updates within ~1 s | MutationObserver + change-signature strategy, SPA signals, server single-flight refresh (sections "Change detection", "Server changes") |
| ACT-01 | Type a value so React/Vue validation fires, never Enter | Native-setter recipe verified on React 18.3.1 and Vue 3.5.44 (jsdom) and on React in real Chromium 155 |
| ACT-02 | Select options in selects, radio groups, checkboxes | `select`/`check` ops: setter + `input`/`change`, `click()` only on state difference |
| ACT-03 | Active field visibly highlighted | Closed-shadow overlay, CSSOM-only styling, text-free by design |
| ACT-04 | Read the value back from the DOM after every fill | `settle()` then `el.value`; maxlength emulation is REQUIRED (Flag F2) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript everywhere; one toolchain; Windows + Chrome; npm workspaces; zod 4 at every boundary (`parse()` inbound).
- Every page is untrusted input. Passwords and card numbers are never spoken, logged or sent to the model (`value: null`, `hasValue` only).
- The model never acts: every page action goes through the Executor; gated kinds are default-deny. Phase 2 extension refuses gated clicks (`gate-required`).
- Never `--omit=optional` (drops the bundled native binaries). Never `bypassPermissions`. `ANTHROPIC_API_KEY` stripped (not relevant to this phase).
- Shared files (root `package.json`, `package-lock.json`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `CLAUDE.md`) are shared with the voice developer: the root `package.json` script additions this phase needs are the only shared-file edits; do not edit `CLAUDE.md` or `packages/protocol` (needs both sign-offs).
- Core owns `apps/extension`, `packages/policy`, `tools/test-pages`; the voice workstream owns `fixtures/forms/` and `apps/voice`.
- GSD workflow enforcement: file edits happen through a GSD command (the planner/executor), not directly.

## Flags on CONTEXT.md (read before planning)

Decisions D-01..D-20 are respected; the items below are places where a locked decision, taken literally, will fail a ROADMAP success criterion or contradict code that already exists. Each cites its evidence. None requires changing a decision's intent; they need an added step or a sharper definition.

| # | Flag | Evidence | What to do |
|---|------|----------|------------|
| F1 | **No server path issues `act.request`, and nothing can produce one.** CONTEXT's integration points list only `page.changed -> snapshot.request`. Success criterion 3 ("From the REPL, the developer fills...") needs a server act path, a brain that emits `set_fields`, and a dev runner that does not also spawn the fake extension. | `turn.ts:109-111` `default:` branch speaks `MSG_NOT_YET` for `set_fields`; `fake-brain.ts` only returns `clarify` (or `request_action` under a test flag); `scripts/dev.ts:101` `const extension = startFakeExtension({ url: server.url, fixture });` always runs; `grammar.ts` types `LocalCommand` as read-only intents "so the grammar cannot request or perform any page action". | Add three server tasks: (a) `executeUngated` in `turn.ts` for `set_fields` / `go_to_field` on fill/select/check/focus only (no gated kinds; Phase 3 replaces it with the Executor); (b) deterministic fake-brain phrases (`fill <label> with <value>`, `select <label> <option>`, `check|uncheck <label>`, `focus <label>`) that resolve to `set_fields`/`go_to_field` using the current model; (c) `npm run dev -- --no-fake-extension` (the real extension attaches; same server, same REPL). Keep `walking-skeleton.test.ts:237-255` (`request_action` still never reaches the extension) green. |
| F2 | **Setting `.value` does not enforce `maxlength`.** D-03 says the DOM value "is reported as it is", but with the native setter the DOM holds the full untruncated string, so criterion 3 ("a maxlength-truncated value is reported truncated") can never be observed. | Reproduced: jsdom 29 and real Chromium 155 both returned `"abcdefghij"` for a `maxlength=4` input after the prototype setter [VERIFIED: spike, see Sources]. | Emulate typing: clamp to `el.maxLength` before writing (code example 1), and put `truncated to N characters` in `ActResult.detail`. Report the post-write DOM value as `observedValue`. |
| F3 | **`blur()` does nothing observable when the page window is not OS-focused, which is the normal case** (the voice window or NVDA holds focus). D-02's "blur() so on-blur validation fires" would silently skip every `onBlur`/`focusout` handler. | Chromium 155 spike with `document.hasFocus() === false`: `focus()` set `activeElement` but fired no `focus`/`focusin`; `blur()` fired no `blur`/`focusout`; a synthetic `focusout` was delivered [VERIFIED: spike]. Same behavior documented in a 2013 Chromium change [CITED: codereview.chromium.org/26149002]. | Dispatch synthetic `focus`,`focusin` / `blur`,`focusout` when the native ones were not observed (code example 2). Add a manual-checklist row "fill while the voice window has focus". |
| F4 | **D-20 "off-screen elements get `visible: false`" would delete below-the-fold fields.** The baseline builder drops invisible elements. | `build.ts:77` `const visible = byOrder(snapshot.elements).filter((e) => e.visible);` | Define `visible=false` as: not rendered (`checkVisibility`), `visibility:hidden`, `[hidden]`/`inert` ancestor, zero-size box, or a box entirely at negative document coordinates (the `left:-9999px` honeypot idiom; the broken fixture's `honeypot` field is `visible:false`). Never use viewport intersection. |
| F5 | **Freshness gaps in D-13/D-15.** (a) A server-side debounce on top of the extension's 500 ms eats the 1 s budget. (b) Value-only changes never signal, so a password the user typed after a `focus` handoff leaves `hasValue`/`requiredEmpty` stale. (c) `newSnapshotVersion` after a fill may equal the old version because values are excluded from the version, so "version changed" cannot trigger the post-act refresh. | `server.ts:134-136` page.changed handler only sets `s.stale = true`; `session.ts:41-44` stale only on rebind. | (a) Server coalesces with single-flight only, no timer. (b) `ensureSnapshot` re-snapshots when the cached model is older than ~2 s or the intent is a read-back; Phase 3 needs this anyway. (c) After every successful act the server always requests `snapshot.request {reason: "post-act"}`; order snapshots by `(version, capturedAt)`. |
| F6 | **D-05 "the server may re-run classifyAction" will diverge.** `RawElement` carries no `aria-expanded`/disclosure hint and the page origin the extension used. | `snapshot.ts:61-67` action fields. | Server trusts `RawElement.kind` as `build.ts:62-65` already does (missing kind becomes `submit`). Do not re-run it. Export `classifyField` next to `classifyAction` so server (from `Field.type`) and extension derive the same field kind. |
| F7 | **Manifest additions D-09 does not list.** The content script also injects into Blip's own voice page and into `about:blank` iframes; the `tabs` permission is redundant with `<all_urls>`. | Voice UI is served at `http://127.0.0.1:7777/` (`guard.ts:51`). | Add `exclude_matches` for `127.0.0.1:7777`, `localhost:7777`, and the two Vite 5173 origins; add `match_about_blank` and `match_origin_as_fallback`. Keep `tabs` (harmless). |
| F8 | **Target-tab trap.** "Active tab" via `tabs.query({active:true, lastFocusedWindow:true})` returns Blip's own voice window whenever it has focus. | CLAUDE.md voice window design (`--app=http://localhost:...` window in the same profile). | Track `targetTabId` = last activated non-Blip http(s) tab (exclude by origin), persisted in `chrome.storage.session`. |
| F9 | **Id scheme.** `PROTOCOL.md` says ids are `e<N>`. One counter per frame collides across frames. | `snapshot.ts:31` `id: z.string(),` (no pattern); server src has no id parsing (grep found none). | Top frame: `e<N>`; other frames: `f<frameId>e<N>`, qualified by the background so content scripts stay frame-agnostic. Opaque to the server. |
| F10 | **ROADMAP criterion 1 says the snapshot is "trimmed to about 8k tokens"; D-20 and `PROTOCOL.md` put that in Phase 4.** | `PROTOCOL.md` Conventions "Caps". | Follow D-20. Phase 2 verifies `truncated: true` only when the 250-element wire cap cuts the element list; Phase 4 trims to about 8k tokens at the model-prompt boundary. |
| F11 | **Chrome is not installed on this machine** (only Edge 155). CONTEXT, CLAUDE.md and the voice demo assume Chrome. | `Program Files*\Google\Chrome` and `%LOCALAPPDATA%` probes found nothing; `msedge.exe` 155 is present. | `ext:chrome` must accept `BLIP_BROWSER` and fall back to Edge. The pinned key yields the same id in Edge (see Environment Availability). Confirm on the teammate's Chrome before I1. |
| F12 | **D-04's spike is already answered for the native-setter question.** Naive `el.value=` + `input` worked in the isolated world too, and the prototype setter works in both worlds. | Chromium 155 spike; React 18.3.1 jsdom. | The "put the spike first" step shrinks to a 30-minute confirmation on real Chrome using the React test page; CDP stays deferred. |

## Summary

The content-script approach (D-01) is sound and the riskiest assumptions are now measured, not guessed. In a real Chromium 155 build (Edge) the unpacked extension, built with the pinned `EXTENSION_PUBLIC_KEY`, got id `gipmmdbdhebfpfoabhdpkenijaljeclp` (equal to `EXTENSION_ID`), and its service-worker WebSocket arrived at a Node `ws` server with `Origin: chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp`, which the existing `rolesForOrigin` accepts as role `extension` with no change. The same service worker bundled `@blip/protocol` (zod 4.6.7) and `parseFrame`/`buildFrame`/`Snapshot.safeParse` ran inside it even though MV3 forbids `eval`.

For fills: a React 18.3.1 controlled input accepts the prototype-setter recipe; the naive `el.value = x` recipe fails in the page world and (surprisingly) succeeds in a content script's isolated world, so the prototype setter is correct in both and is what to ship. Vue 3.5.44 `v-model` (text, `.lazy`, select, checkbox, radio) is satisfied by `input` then `change` plus `click()` for checkable controls. Three things D-02/D-03 do not cover were found and measured: `maxlength` is not enforced by script writes (F2), focus/blur events do not fire while the page is not OS-focused (F3), and any runtime import from `@blip/protocol` or `@blip/policy` adds about 464 KB (all of zod) to a bundle, which is unacceptable for a script injected into every frame (Pitfall 3).

The largest piece of unplanned work is server-side (F1): the repo has no act path at all. Plan it as an explicit slice, otherwise the REPL cannot drive the real extension and success criterion 3 cannot be demonstrated.

**Primary recommendation:** Build in this order: (1) policy `classifyAction`/`classifyField` plus the parity test; (2) extension skeleton that connects, says hello and answers `ping`/`pong` (proves Origin, key, id, reconnect on real Chrome); (3) content-script walk with jsdom tests; (4) act ops plus overlay; (5) frame aggregation, change detection, `page.changed`; (6) server refresh, act path, fake-brain phrases, `--no-fake-extension`; (7) test pages and the manual checklist. Use the native prototype setter + `InputEvent("input")` + `change` + synthetic-focus-aware blur + maxlength clamp, read back after a `settle()` that does not depend on `requestAnimationFrame` alone.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DOM walk, label/required/error heuristics, sensitive detection | Content script (per frame) | `packages/policy` (pure classifiers) | Only the content script can see the DOM and shadow roots; classifiers are pure so they are table-tested without a browser |
| Fill / select / check / focus / click-refusal | Content script | Service worker (routing, id resolution) | Needs live element identity, native setters, events |
| Highlight overlay | Content script (each frame draws its own) | Service worker (broadcast) | Overlay must live in the document that contains the target |
| Frame fan-out, id qualification, snapshot version, target-tab choice | Service worker | `chrome.storage.session` | Only the SW sees all frames (`webNavigation.getAllFrames`) and tabs; state must survive SW termination |
| WebSocket, hello, ping/pong, reconnect | Service worker | `chrome.alarms` | Content scripts cannot hold the socket (their Origin is the page's); SW lifetime is extended by socket traffic |
| Zod validation of outbound snapshot | Service worker | Server (parse on receipt) | Content script output is page-derived and untrusted; the SW fails closed before sending |
| Page-change signal source | Content script (MutationObserver) + SW (`webNavigation`, tab events) | â€” | Per D-13/D-14 |
| Refresh policy, model cache, act dispatch, spoken reply | Server | â€” | Server owns policy (D-15); extension never decides what to say |
| Gate / grant | (Phase 3) server Executor + extension live re-check | â€” | Out of scope; Phase 2 refuses gated clicks |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | 0.28.2 | Bundle SW (IIFE) and content script (IIFE), copy manifest | Already installed at 0.28.2 as a tsx dependency [VERIFIED: `node_modules/esbuild/package.json` "version": "0.28.2"]; D-08 |
| `@blip/protocol` | workspace | Message/Snapshot/Act schemas | Frozen contract; SW only (runtime). Content script: `import type` only |
| `@blip/policy` | workspace | `classifyAction`, `classifyField` (new, zod-free) | D-05 |
| zod | 4.6.7 (already pinned) | Validate frames in SW | Already the repo standard; verified working inside an MV3 SW (no `eval`) |
| ws | 8.22.0 (already pinned) | Server side only | unchanged |

### Supporting (dev only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsdom | 29.1.1 | DOM for walk/label/fill unit tests via `// @vitest-environment jsdom` | Pure-DOM logic. Pick 29.1.1, not 30.x: 30.x declares `node ^22.22.2 \|\| ^24.15.0 \|\| >=26` and this machine runs 24.14.0; 29.1.1 declares `>=24.0.0` [VERIFIED: `npm view jsdom@29.1.1 engines`; run under vitest 5.0.5 in a scratch project: 1 passed] |
| @types/chrome | 0.3.5 | `chrome.*` typings for `apps/extension` (own tsconfig, `types: ["chrome"]`) | Typecheck only. Seam verdict SUS ("too-new"); see audit |
| react, react-dom | 18.3.1 (exact) | Real React-controlled test page in `tools/test-pages` | D-11. 18.x is what most deployed forms run; 19.3.1 is `latest` and uses the same value tracker design, but test the version the world actually ships |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written per-source label candidates | `dom-accessibility-api` 0.7.x `computeAccessibleName` | Returns one final name, but the contract needs every candidate with its source and confidence. Seam verdict OK, so it may be added later as an extra `aria` candidate. Not needed for Phase 2 |
| vitest + jsdom + manual Chrome checklist + `ext:smoke` script on `ws` | Playwright (`@playwright/test`) or `puppeteer-core` | See "Testing strategy": ~150 MB browser download, new flaky layer, seam verdict SUS; the same real-browser coverage is available with a ~60-line Node script because `--load-extension` works in Edge/Chromium/Chrome for Testing (verified) |
| jsdom | happy-dom 21.0.3 | Faster, but `labels`, `getComputedStyle` and `InputEvent` fidelity matter here and jsdom is the established reference. Not tested |
| `vue` test page | none | Vue is verified by a scratch jsdom test only. Add `vue` 3.5.44 as a dev dependency only if a committed Vue regression test is wanted (extra legitimacy checkpoint) |

**Installation (after the human-verify checkpoint):**
```bash
# apps/extension/package.json devDependencies (exact pins, no ranges)
npm install -D -w @blip/extension esbuild@0.28.2 jsdom@29.1.1 @types/chrome@0.3.5
# tools/test-pages/package.json dependencies (exact pins)
npm install -w @blip/test-pages react@18.3.1 react-dom@18.3.1
```
Never `--omit=optional`.

**Version verification:** run this session: `npm view react version` 19.3.1 (latest) / `react@18.3.1` exists; `jsdom` latest 30.1.3, chosen 29.1.1; `@types/chrome` latest 0.3.5 (published 2026-10-09); `esbuild` latest 0.28.2 (2026-08-08).

## Package Legitimacy Audit

Seam output: `gsd-tools query package-legitimacy check --ecosystem npm ...` (run this session). "too-new" reflects only that the registry's *latest* version is under about a month old; the pinned versions below are older. Same situation and same checkpoint as Phase 1 (01-01 Task 1).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| esbuild 0.28.2 | npm | published 2026-08-08, years old project | 303M/wk | github.com/evanw/esbuild | OK (has `postinstall: node install.js`, the standard binary check; already installed transitively) | Approved |
| jsdom 29.1.1 | npm | 29.1.0 published 2026-04-27 | 114M/wk | github.com/jsdom/jsdom | SUS (latest 30.1.3 "too-new"; 29.1.1 is older) | Flagged, planner adds checkpoint:human-verify |
| @types/chrome 0.3.5 | npm | 2026-10-09 | 4.4M/wk | github.com/DefinitelyTyped/DefinitelyTyped | SUS (too-new) | Flagged, checkpoint. Deps `@types/filesystem` and `@types/har-format` are OK |
| react 18.3.1 / react-dom 18.3.1 | npm | 18.3.1 is from 2024; registry metadata touched 2026-10-15 | 188M / 177M per wk | github.com/facebook/react | SUS (latest 19.3.1 "too-new") | Flagged, checkpoint (test pages only, never in the extension bundle) |
| vue 3.5.44 | npm | 2026-10-13 | 17.6M/wk | github.com/vuejs/core | SUS | Optional, not required; gate only if added |
| dom-accessibility-api | npm | 2025-11-27 | 137M/wk | github.com/eps1lon/dom-accessibility-api | OK | Not adopted |
| playwright, @playwright/test, puppeteer-core, chrome-launcher | npm | recent releases | 22M-114M/wk | github.com/microsoft/playwright etc. | SUS (too-new) | Not adopted (see Testing strategy) |
| happy-dom | npm | 2026-10-15 | 21M/wk | github.com/capricorn86/happy-dom | SUS | Not adopted |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** jsdom 29.1.1, @types/chrome 0.3.5, react 18.3.1, react-dom 18.3.1 (and vue if added). The planner inserts ONE `checkpoint:human-verify` task before the first `npm install`, listing exact pins, and has the executor print `npm view <name>@<version> version time.modified repository.url scripts.postinstall dist.integrity` per pin, mirroring 01-01 Task 1. Pins and sha512 integrity values seen this session: react@18.3.1 `sha512-wS+hAgJShR0KhEvPJArfuPVN1+Hz1t0Y6n5jLrGQbkb4urgPE/0Rve+1kMB1v/oWgHgm4WIcV+i7F2pTVj+2iQ==`, @types/chrome@0.3.5 `sha512-7HYsK7xalNxzLwGrP9lkCQPAA6V56VtPpOmv2CQnBnMzX5/Hpr+Iv5fqaIOIY/H/Q6ZBksLmurWh7zXPcZ4B7Q==`.

All package names above came from CLAUDE.md, the repo, or official docs and were checked with the seam; none is `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
 voice UI / REPL (role voice)                 Blip server  127.0.0.1:7777/ws                Chrome (dedicated profile)
 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 utterance "fill name with Jane" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º grammar / fake brain â”€â–º Intent set_fields
                                                    â”‚
                                                    â–¼
                                              executeUngated (NEW)  â”€â”€ act.request{actId,tabId,snapshotVersion,
                                                    â”‚                     action, expectedKind} â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                                    â”‚                                                          â–¼
                                                    â”‚                                   SERVICE WORKER (background.js)
                                                    â”‚                                   â€¢ socket: hello, ping/20s, pong, backoff, alarm 30s
                                                    â”‚                                   â€¢ parseFrame every inbound frame (zod)
                                                    â”‚                                   â€¢ resolve id â†’ (frameId, localId)
                                                    â”‚                                   â€¢ tabs.sendMessage(tabId, msg, {frameId})
                                                    â”‚                                                          â”‚
                                                    â”‚                                                          â–¼
                                                    â”‚                       CONTENT SCRIPT (content.js, every frame incl. cross-origin)
                                                    â”‚                       â€¢ walk DOM + open/closed shadow roots â†’ RawElement[]
                                                    â”‚                       â€¢ classifyAction/classifyField (zod-free policy module)
                                                    â”‚                       â€¢ live re-check: sensitive? disabled? kind == expectedKind?
                                                    â”‚                       â€¢ fill: focus â†’ clamp maxlength â†’ prototype setter â†’
                                                    â”‚                         input â†’ change â†’ blur (+ synthetic events) â†’ settle â†’ read DOM
                                                    â”‚                       â€¢ overlay (closed shadow root, text-free)
                                                    â”‚                       â€¢ MutationObserver â†’ change signature â†’ "mutated" msg
                                                    â”‚                                                          â”‚
              act.result{observedValue,â€¦} â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                                    â”‚
 speak "Name is now Jane" â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ reply built from observedValue (non-sensitive only)
                                                    â”‚
   page changes (user, SPA, reveal) â”€â–º content "mutated" â”€â–º SW debounce 500 ms â”€â–º page.changed â”€â–ºâ”‚ server single-flight
                                                    â”‚                                              â”‚ snapshot.request{refresh}
                                                    â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ snapshot.result (aggregated frames, zod-checked in SW)
                                              session.applySnapshot â†’ state push to voice
```

### Recommended Project Structure
```
packages/policy/src/
â”œâ”€â”€ classify.ts          # classifyAction, classifyField, UNGATED parity set. ONLY `import type` from protocol (zod-free)
â”œâ”€â”€ index.ts             # existing re-export; ADD `export * from "./classify"` and package.json exports "./classify"
apps/extension/
â”œâ”€â”€ package.json         # name @blip/extension, private, type module, devDeps (pinned)
â”œâ”€â”€ tsconfig.json        # extends ../../tsconfig.base.json, types ["chrome"], include src + test
â”œâ”€â”€ vitest.config.ts     # include test/**/*.test.ts (jsdom chosen per file by docblock)
â”œâ”€â”€ manifest.template.json
â”œâ”€â”€ build.ts             # esbuild + manifest (key, version) -> dist/ ; --watch
â”œâ”€â”€ scripts/chrome.ts    # ext:chrome launcher
â”œâ”€â”€ src/shared/messages.ts   # SW <-> content message types (type-only imports of protocol)
â”œâ”€â”€ src/content/{index,walk,labels,sensitive,required,errors,visibility,hash,fill,overlay,observer,ids}.ts
â”œâ”€â”€ src/background/{index,socket,frames,tabs,versions,navigation}.ts
â””â”€â”€ test/...             # jsdom tests (walk, labels, fill vs real React/Vue not required), node tests (hash, ids)
tools/test-pages/
â”œâ”€â”€ package.json         # react, react-dom pinned
â”œâ”€â”€ serve.ts             # node:http + sirv on fixed port, two hostnames for cross-origin
â”œâ”€â”€ build.ts             # esbuild react-app.jsx -> public/react-app.js (gitignored dist)
â””â”€â”€ public/*.html        # react-form, vanilla, enter-submit, delayed-reveal, spa, frame-same, frame-cross, csp, large
apps/server/src/
â”œâ”€â”€ session/refresh.ts   # NEW single-flight refresher
â”œâ”€â”€ act/ungated.ts       # NEW executeUngated (replaced by the Executor in Phase 3)
```

### Pattern 1: Fill recipe (verified)
**What:** prototype value setter bypasses React's per-instance tracker; bubbling `input` makes React and Vue notice; `change` covers `.lazy` and non-input listeners; `blur` triggers on-blur validation.
**When to use:** text-like inputs and textarea. Select: `HTMLSelectElement.prototype` `value` setter then `input`+`change`. Checkbox/radio: `el.click()` only when `el.checked` differs.
**Why it works (React):** `track(node)` redefines `value`/`checked` as an own property on the node whose setter records `currentValue = '' + value; set.call(this, value);`, and `updateValueIfChanged` compares `lastValue = tracker.getValue()` with `nextValue = getValueFromNode(node)` [CITED: github.com/facebook/react v18.3.1 packages/react-dom/src/client/inputValueTracking.js]. Calling the prototype descriptor's setter leaves the tracker stale, so the next `input` event reports a change. Checkables compare `checked` as the string `'true'`/`'false'`, and a native `click()` toggles without touching the tracked property, so React fires `onChange`.
**Measured:** React 18.3.1 in jsdom: naive instance setter `onChange` fired = false; prototype setter = true; select = true; checkbox/radio via `click()` = true; a controlled input that rejects the change is restored by React (value read back after the event shows `fixed`). Real Chromium 155 content script on a React 18.3.1 page: both naive and prototype setter fired `onChange` (isolated world), select/checkbox/radio fired, `err` text cleared, so the prototype setter is correct everywhere [VERIFIED: spike].

### Pattern 2: Snapshot walk (per frame)
1. `collect(root)`: `root.querySelectorAll(FIELD_AND_ACTION_SELECTOR)` for candidates; separately find shadow hosts: elements whose `localName` contains `-` or that have `shadowRoot`; use `chrome.dom.openOrClosedShadowRoot(host)` to reach closed roots (exists in content scripts and returned the root of a **closed** shadow host in the spike). Recurse into each root. Skip the Blip overlay host.
2. Fields: `input` except `type` in `hidden|submit|button|image|reset`, `select`, `textarea`; stub-as-unsupported (still reported, `category: "field"`, role preserved): `[contenteditable]`, `[role=combobox|listbox|textbox|searchbox|slider|spinbutton|switch]` on non-native elements, `input[type=file]`. **Never read `type=hidden` inputs** (CSRF tokens, session ids).
3. Actions: `button`, `input[type=submit|button|image|reset]`, `a[href]`, `summary`, `[role=button|link|menuitem]`, `[onclick]`, plus the div-"button" heuristic: leaf-ish element, text length 1-40, `getComputedStyle(el).cursor === "pointer"`, not inside an already-collected action. Time-box the heuristic (stop at ~150 ms total walk budget); this alone does not set Snapshot.truncated.
4. Radio group = ONE element: group key = `form || root` + `name`; `inputType: "radio"`, `role: "radiogroup"`, `options[]` per radio with `selected`, `value` = selected option value or `null` (matches `booking.snapshot.json` e6: `value=null`, 2 options). Every radio in the group maps to the same id in the content script's id table.
5. Per-element: `visible` (F4), `disabled` (`el.disabled || ancestor fieldset[disabled]`), `value`/`hasValue`/`checked`, `options` (cap 200, always include the selected one; label clamp), `required`/`requiredSource`, `invalid`/`errorText`, `describedBy`, `autocomplete`, `name`, `group`, `order`, sensitive, `kind`/`kindReasons`.
6. Headings (`h1-h6`, `[role=heading]`, cap 40), alerts (`[role=alert|status]`, `[aria-live]` regions with visible non-empty text, cap 20), `title`, `url`, `origin`.
7. Selection under the 250-element cap: keep every visible field first, then buttons, then links (links capped at ~40); preserve document order inside the kept set. Set Snapshot.truncated true only if the 250-element cap cuts the output. Dropped headings, alerts, options or walk-time heuristic candidates do not set this flag.

### Pattern 3: Label heuristics mapped to `RawElement`
Confidence values follow the existing fixtures (`booking`/`broken` use 0.95 aria/label, 0.6 nearby-text, 0.5 placeholder, 0.3 inferred). Candidates are emitted for every source that yields text, best first; the server picks. Text clamp 200 (`snapshot.ts:40` `text: z.string().max(200),`). Strip control characters, collapse whitespace, remove a trailing `*` / `(required)` and record it for `requiredSource`.

| Source (`LabelSource`) | Where the text comes from | Confidence |
|---|---|---|
| `aria` | `aria-labelledby` ids resolved in the element's own root (`getRootNode().getElementById`), joined in order; excluded: the control itself when it references itself | 0.95 |
| `aria` | `aria-label` | 0.95 |
| `label` | `el.labels` (covers `label[for]` and wrapping `<label>`); clone the label, remove nested controls (a `<select>` inside a label otherwise contributes all its option texts), take text | 0.95 |
| `label` | radio/checkbox group: `fieldset > legend`, or `[role=radiogroup\|group]` `aria-labelledby`/`aria-label` | 0.9 |
| `aria` | `title` attribute | 0.6 (below 0.7, so the baseline hedges) |
| `placeholder` | `placeholder` attribute | 0.5 |
| `nearby-text` | closest preceding text: previous sibling text or element, or table `th`/previous `td`, climbing at most 3 ancestors, text length 1-80 and containing no control | 0.6 |
| `inferred` | humanized `autocomplete` token (`given-name` to "given name") | 0.35 |
| `inferred` | humanized `name`/`id` (split camelCase, `_`, `-`; drop generated-looking ids with 4+ digits or hex runs) | 0.3 |

Actions: `text` = visible text (clamp 200) else `value` (input buttons) else `aria-label` else `title` else `img alt` / SVG `<title>`; also emit the same as a `label` candidate.
`requiredSource` (`snapshot.ts:49` `requiredSource: z.enum(["attr", "aria", "asterisk", "none"]),`): `attr` when `el.required` (radio group: any member), else `aria` when `aria-required="true"` (also on the radiogroup), else `asterisk` when the label/legend text had a stripped `*`/"(required)" or contains `abbr[title*=required i]`, else `none`. Precedence attr over aria over asterisk. The baseline derives `required` as `requiredSource !== "none"` (`build.ts:40`), so a mislabeled `none` hides a required field: when in doubt choose `asterisk`.
`invalid` / `errorText` (clamp 300): `invalid` = `aria-invalid="true"` or `el.matches(":user-invalid")` (supported in Chromium 155, did not throw in the spike; jsdom returns false) . Never use bare `:invalid` (every empty required field matches on load). `errorText` = first non-empty of: text of `aria-errormessage` target; `aria-describedby` targets when `invalid`; the nearest following sibling/descendant within the field's container whose `role=alert` or class/id matches `/error|invalid|danger|help-block/i` and is visible; native `validationMessage` when `:user-invalid`. `describedBy` = remaining `aria-describedby` text that is not the error (clamp 300).

### Pattern 4: Frame aggregation and ids
- Content script runs in every frame (`all_frames`, `match_about_blank`, `match_origin_as_fallback`). It never knows its `frameId`; it returns local ids `e<N>` from a per-document counter.
- SW on `snapshot.request`: `tabId = req.tabId ?? targetTabId`; `frames = await chrome.webNavigation.getAllFrames({tabId})`; `Promise.allSettled` of `chrome.tabs.sendMessage(tabId, {t:"snapshot", topOrigin}, {frameId})`, each raced against 1.5 s; on "Receiving end does not exist" run `chrome.scripting.executeScript({target:{tabId, frameIds:[frameId]}, files:["content.js"]})` once and retry. Missing frames are reported as absent, never as an error.
- Qualify ids: frameId 0 keeps `e<N>`; others become `f<frameId>e<N>`. `RawElement.frameId` is set by the SW. Acts parse the prefix back to `(frameId, localId)`. `order` is re-numbered across the merged list (top frame first; discretion to splice iframes in at their position later).
- Subframe `pageOrigin` for classification is the **top** page origin (SW passes `topOrigin`), so a link out of an embedded widget to its own vendor still counts as cross-domain relative to what the user thinks they are on. Hidden frames (`innerWidth === 0 || innerHeight === 0`) report every element `visible: false`.
- Version: `version` is the top-level counter in SW state, persisted to `chrome.storage.session` per tab, bumped only when the merged **change signature** changes (below). `snapshotId = `${tabId}-${version}-${capturedAt}``.
- Stale check (D-16): the content script keeps `fingerprints: Map<version, Map<id, fp>>` for the last 4 versions (`fp = hash(tag,type,name,role,label0,visible,disabled)`). On `act` with `snapshotVersion !== currentVersion`: compare the target's recorded fingerprint at the requested version with its current one; equal means proceed, different or unknown version means `stale-snapshot` with `newSnapshotVersion`.
- Id continuity: the id table is `Map<string, WeakRef<Element>>` plus `WeakMap<Element,string>`; `data-blip-id` is stamped for debuggability only and **never read back as authority** (Security, S3). When an unstamped element matches the fingerprint of a disconnected one, reuse its id (frameworks that re-create nodes would otherwise churn ids mid-conversation).

### Pattern 5: Change detection (PAGE-05)
- **Two hashes.** `structuralHash` (sent in `Snapshot`, used by the Phase 4 repair cache) stays exactly the contract: per element `(tag,type,name,role,labelCandidate[0])`, no values (`snapshot.ts:88` `structuralHash: z.string(), // hash of (tag,type,name,role,labelCandidate[0]) per element; EXCLUDES values`). The **change signature** (internal, drives `version` and `page.changed`) = `structuralHash` plus per element `visible`, `disabled`, `required`, `invalid`, `errorText`, option list, plus the alert texts and headings. Reason: revealing an already-present hidden field changes none of the contract tuple but must trigger a refresh, and a new error must trigger one without invalidating cached label repairs. Values never enter either.
- Observer: `MutationObserver` on `document` and on every shadow root found (WeakSet), `{childList, subtree, attributes, attributeFilter: ["disabled","hidden","aria-hidden","aria-invalid","aria-expanded","aria-required","aria-describedby","required","class","style","open","type","name"], characterData: true}`. The callback only sets a dirty flag and schedules one pass (leading throttle 250 ms, minimum 500 ms between passes). A pass recomputes the signature; unchanged means silence. `data-blip-id` writes are excluded by the filter; our overlay lives in a closed shadow root so its updates are invisible to the observer.
- SW debounces content "mutated" messages 500 ms (trailing) per tab and sends `page.changed {tabId, url, reason: "mutation", structuralHash}`. Navigation: `webNavigation.onCommitted` (frameId 0), `onHistoryStateUpdated` and `onReferenceFragmentUpdated` (top frame) send reason `navigation`; subframe events send `mutation`. `tabs.onActivated` and `windows.onFocusChanged` (resolve the focused window's active tab; ignore Blip's tab) send `tab-activated` and update `targetTabId`.
- Not-yet-injected content script after navigation: the content script posts `{t:"ready"}` at idle; a `snapshot.request` that arrives before it waits up to 3 s for `ready`, then falls back to `scripting.executeScript`.
- Budget: 500 ms SW debounce + ~10-30 ms SW to content round trip + walk (target under 50 ms for 250 elements) + localhost RTT + baseline under 100 ms (PAGE-02) is about 0.7 s. SPA route changes may need a second refresh when rendering finishes after the route event; the observer provides it within ~1.1 s.
- On `welcome`, the SW sends one `page.changed {reason: "tab-activated"}` for the target tab so the server snapshots proactively and the voice UI shows the page without an utterance.

### Pattern 6: MV3 service worker + WebSocket
- All listeners (`runtime.onMessage/onStartup/onInstalled`, `alarms.onAlarm`, `webNavigation.*`, `tabs.*`, `windows.onFocusChanged`) registered synchronously at top level; the socket manager is idempotent (`ensureConnected()` called on every SW wake, alarm, startup, installed).
- Chrome limits: idle timeout 30 s; "Receiving an event or calling an extension API resets this timer"; "Chrome 116: active WebSocket connections extend service worker lifetimes. Sending or receiving WebSocket messages resets the idle timer"; "Any global variables you set will be lost if the service worker shuts down" [CITED: developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]. The official keepalive is a message every 20 s with `minimum_chrome_version: "116"` [CITED: developer.chrome.com/docs/extensions/how-to/web-platform/websockets]. `PING_INTERVAL_MS` is 20000 already (`constants.ts:14`).
- `chrome.alarms`: "Chrome limits alarms to at most once every 30 seconds" so `periodInMinutes: 0.5` is the floor [CITED: developer.chrome.com/docs/extensions/reference/api/alarms]. Create it idempotently on every SW start. That an alarm wakes a terminated worker is standard but not stated on that page `[ASSUMED]`; the first-day manual check is: stop the server, wait for SW termination in `chrome://serviceworker-internals` or `chrome://extensions`, start the server, expect a reconnect within ~30 s.
- Backoff 0.5, 1, 2, 4, 8, 10 s (cap) with jitter while the SW is alive; the alarm covers the dead-worker case.
- Dead peer: expect a `pong` within 10 s of each `ping`, else `ws.close()` and reconnect.
- Close/`error` with code `replaced` (4004): do **not** reconnect immediately (two browser instances would replace each other in a loop); wait 30 s.
- `welcome` before work: queue nothing; ignore `snapshot.request`/`act.request` until welcomed (the server only sends them after bind anyway).
- Origin: the browser sets it; the extension code cannot and need not. Measured value: `Origin: chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp` with `Host: 127.0.0.1:7791` [VERIFIED: spike; matches `guard.ts:50` `if (origin === extensionOrigin(rules.extId)) return ["extension"];`].
- Never call `buildFrame`/`newId`/`crypto.randomUUID` in a content script: `crypto.subtle` and `randomUUID` are secure-context only and the content script inherits the page's context (insecure `http://` pages). The SW is always a secure context.

### Pattern 7: Server refresh (PAGE-05) and ungated acts (F1)
Single-flight refresher (no timer; the extension already debounced):
```ts
// apps/server/src/session/refresh.ts
export function createRefresher(deps: { hub: Hub; session: Session; timeoutMs: number }) {
  let inFlight: Promise<void> | null = null;
  let again = false;
  async function once(reason: "refresh" | "post-act"): Promise<void> {
    try {
      const r = await deps.hub.request("extension", "snapshot.request", { reason }, { expect: "snapshot.result", timeoutMs: deps.timeoutMs });
      if (!r.payload.ok) { deps.session.stale = true; return; }
      if (deps.session.applySnapshot(r.payload.snapshot, { updateDialogue: false })) deps.hub.pushState();
    } catch { deps.session.stale = true; } // logged by hub; never speaks
  }
  return function request(reason: "refresh" | "post-act"): Promise<void> {
    if (inFlight) { again = true; return inFlight; }
    inFlight = once(reason).finally(() => { inFlight = null; if (again) { again = false; void request("refresh"); } });
    return inFlight;
  };
}
```
`reason` values are the enum members quoted below. `Session.applySnapshot` changes: take `{updateDialogue}` (today `session.ts:59` unconditionally sets `this.dialogue = "ready"`, which would stomp a turn in progress or, in Phase 3, `awaiting-confirm`); store `tabId`; return `false` and ignore the snapshot if it is older than the cached one by `(version, capturedAt)`. `turn.ts` `ensureSnapshot` must share the same in-flight promise. The `"page.changed"` handler becomes `s.stale = true; refresh("refresh")`.
`executeUngated` (new): for each `{fieldId, value}` from `set_fields`: look up the `Field`; if `sensitive !== "none"` speak a handoff and send only `focus`; derive `expectedKind` with the shared `classifyField` mapping (text/email/tel/url/number/date/time/textarea to `fill`; select and radio-group to `select`; checkbox to `check`); `hub.request("extension","act.request", {actId:newId(), tabId: session.tabId, snapshotVersion: model.snapshotVersion, action, expectedKind}, {expect:"act.result", timeoutMs: 5000})`; speak `"<label> is now <observedValue>"` or, if `observedValue !== value`, `"<label> shows <observedValue>"`. Values are spoken only for non-sensitive fields (`reply.ts` header: "a field value never reaches a reply"; this slice is the first deliberate exception and must keep the sensitive guard). After any `ok` result always call `refresh("post-act")`.

### Pattern 8: Build, manifest, launch
- `build.ts` (run with tsx): esbuild with `bundle: true, format: "iife", target: "chrome116", platform: "browser"`, entries `background` and `content`; manifest template copied with `key: EXTENSION_PUBLIC_KEY` and `version` from `package.json`. The service worker may be IIFE (no `"type": "module"` needed, one file); content scripts must be classic scripts so IIFE. `sourcemap: "linked"` only in `--watch`. esbuild resolves workspace TS (`@blip/protocol` `exports` points at `./src/index.ts`) [VERIFIED: bundled in the spike].
- Reload: pressing the reload icon on `chrome://extensions` orphans every already-open tab's content script (its `chrome.runtime` becomes invalid) and Chrome does not re-inject. In `runtime.onInstalled` re-inject `content.js` into all `http(s)` tabs with `allFrames`, and make the content script idempotent via a global `dispose()` handle left by the previous instance (`globalThis.__blipDispose?.()` then install). `[ASSUMED]` from general MV3 experience; the manual checklist row confirms it.
- Launch (`ext:chrome`): resolve the browser from `BLIP_BROWSER`, else `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\...`, `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`, else `...\Microsoft\Edge\Application\msedge.exe`. Args: `--user-data-dir=<repo>\.chrome-profile --no-first-run --no-default-browser-check <test page urls>`; `spawn(..., {detached:true, stdio:"ignore"}).unref()`. If a browser already runs on that profile, the URLs open in it and the new process exits. One-time per profile: `chrome://extensions`, Developer mode on, Load unpacked, `apps/extension/dist`, then check the id reads `gipmmdbdhebfpfoabhdpkenijaljeclp`. Branded Chrome 137+ ignores `--load-extension` [CITED: groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY]; `--disable-features=DisableLoadExtensionCommandLineSwitch` is reported to bring it back [CITED: github.com/seleniumbase/SeleniumBase/issues/3778]. Do not pass both (a flag-loaded copy plus a Load-unpacked copy share one id and conflict); keep Load unpacked for humans and reserve the flag for the automated smoke script.

### Anti-Patterns to Avoid
- **Reading `data-blip-id` from the DOM to find a target.** A page can pre-stamp a decoy (Security S3).
- **`<style>` elements or `setAttribute("style")` for the overlay.** Page CSP `style-src` can block them `[ASSUMED]`; assign via CSSOM (`box.style.outline = ...`).
- **Importing runtime values from `@blip/protocol`/`@blip/policy` index in the content script.** +464 KB per frame.
- **Viewport intersection for `visible`.** Drops below-the-fold fields (F4).
- **Treating `requestAnimationFrame` as the only settle signal.** Hidden/occluded tabs throttle it; race it against a timeout.
- **Sending the full `href`/query to the server.** Strip query/fragment/userinfo in `RawElement.href` (S6).
- **Waiting for Enter or dispatching key events.** Never.
- **A server-side debounce stacked on the extension's.** F5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundling TS workspaces for MV3 | A custom loader or tsc emit pipeline | esbuild (already installed) | Resolves workspace `exports` to TS source (verified), IIFE output, 30 ms builds |
| Message validation | Ad-hoc shape checks in SW | `parseFrame`/`buildFrame`/`Snapshot.safeParse` from `@blip/protocol` | Verified to run inside an MV3 SW; rejects leaked sensitive values (`sensitiveLeakRejected: true`) |
| Per-frame discovery | Walking iframes from the parent | `all_frames` content script + `webNavigation.getAllFrames` | Cross-origin frames are unreachable from the parent but get their own script |
| Closed shadow root access | `attachShadow` monkey-patching in the page world | `chrome.dom.openOrClosedShadowRoot(host)` | Returned the root of a closed host in the spike; no page-world injection needed |
| Element visibility | Manual ancestor walks | `el.checkVisibility({ visibilityProperty: true })` with a manual ancestor fallback only when `typeof el.checkVisibility !== "function"` (jsdom) | `visibilityProperty:true` returned false for `visibility:hidden`; default call only checks `display`/`content-visibility` [CITED: MDN Element.checkVisibility] |
| Post-interaction invalid state | Custom "touched" tracking | `:user-invalid` (+ `aria-invalid`) | Native; supported in Chromium 155 (spike) |
| Content hashing | `crypto.subtle` | A 20-line synchronous non-crypto hash (cyrb53, example 4) | `subtle` is undefined on insecure-context pages; hashing here is a change detector, not security |
| Service-worker keepalive | Offscreen document or `runtime.connect` ping tricks | App-level `ping` every 20 s that the protocol already defines | Chrome 116+ extends the worker on WebSocket traffic |
| Real-browser e2e framework | Playwright wiring | `ws` + `spawn(browser --headless=new --load-extension=...)` | Verified pattern with zero new dependencies (Testing strategy) |
| Focus-event synthesis for unfocused pages | Relying on `blur()` | The detect-then-dispatch helper (example 2) | Native events are suppressed when the page is not focused (F3) |

**Key insight:** every "browser behaves like a user" gap found this session (setter tracker, maxlength, unfocused focus, isolated world) is a three-line shim once you know it exists; the cost is in discovering them, which is why the manual checklist and the smoke script matter more than more unit tests.

## Common Pitfalls

### Pitfall 1: React/Vue appear to ignore a fill
**What goes wrong:** value visible in the box but state/validation unchanged; reverts on next render.
**Why:** page-world `el.value = x` updates React's tracker so `input` looks like no change.
**How to avoid:** prototype setter + bubbling `InputEvent` + `change`. Read the DOM after `settle()`; a rejecting controlled input snaps back and `observedValue` shows it.
**Warning signs:** `observedValue` differs from requested on a field with no maxlength.

### Pitfall 2: Reported value is the requested value, not the page's
**What goes wrong:** ACT-04 violated; `maxlength=4` field "accepted" a 10-char string (script writes are not truncated, verified).
**How to avoid:** clamp to `maxLength` for text-like types; always return `el.value` read after the write; add `detail: "truncated to 4 characters"`.

### Pitfall 3: Content script bundle contains zod
**What goes wrong:** every page and frame loads ~464 KB of JS, slowing page load and risking timeouts on heavy pages.
**Why:** measured: importing `isGatedKind`, `PING_INTERVAL_MS`, or `buildFrame` from `@blip/protocol`, or anything from `@blip/policy`'s index, produced 464,215 / 464,124 / 465,353 / 464,215 bytes minified; `import type` produced 30 bytes [VERIFIED: esbuild JS API run this session].
**How to avoid:** `classify.ts` defines its own `UNGATED` set (4 strings) and imports only types; a policy test asserts parity with `isGatedKind` for every `ActionKind` option plus junk strings; the build script asserts `dist/content.js` is under 100 KB (fail the build otherwise). The SW bundle (~475 KB) is fine.

### Pitfall 4: Focus/blur events silently missing
See F3. Warning sign: `onBlur` validation messages never appear after a Blip fill although `onChange` ones do.

### Pitfall 5: Wrong tab
See F8. Warning sign: the REPL describes the Blip voice page ("Press Space to start Blip") instead of the form.

### Pitfall 6: Snapshot rejected by the server
**What goes wrong:** one over-long label (10 000 chars), a 5 000-option `<select>`, or a leaked sensitive value makes `Snapshot` invalid or exceeds the 2 MiB frame cap (`constants.ts:15` `export const MAX_FRAME_BYTES = 2 * 1024 * 1024;`), and the hub closes the socket with 1009 (`maxPayload` in `hub.ts`).
**How to avoid:** clamp every string to its schema cap in the content script (`text` 200, `describedBy` 300, `errorText` 300, `group` 120, `title` 200, headings 200, alerts 300, `stepHint` 100); cap options at 200 (selected always kept) with label clamp 120; option trimming does not set Snapshot.truncated. The SW checks `JSON.stringify(frame).length < 1.5e6` before sending and trims options further; only cutting the 250-element list sets the Snapshot.truncated flag. The SW builds the frame with `buildFrame` inside `try`, replying `{ok:false, error:{code:"invalid-snapshot", message}}` on failure (fail closed, typed reply, no timeout).

### Pitfall 7: Orphaned content scripts after "reload"
See Pattern 8. Warning sign: after reload, `tabs.sendMessage` fails "Receiving end does not exist" on already-open tabs until they are refreshed.

### Pitfall 8: SW state vanishes
**What goes wrong:** version counters and `targetTabId` reset after 30 s idle, so snapshot versions go backwards.
**How to avoid:** persist per-tab `{version, lastSignature}` and `targetTabId` in `chrome.storage.session` with write-through; derive everything else from the live DOM. Server guard ignores strictly older snapshots.

### Pitfall 9: Cross-frame id collisions / duplicate ids on radios
Qualified ids (F9). Radios in a group deliberately share one id; resolving a group id must pick the radio by `optionValue`.

### Pitfall 10: Hostile or noisy pages flood the observer
Animated style changes or tickers cause constant mutations. Throttle (min 500 ms between passes), signature comparison suppresses unchanged results, and cap walk time. Warning sign: CPU spike on a page with a ticking clock.

### Pitfall 11: `button` effective type
`<button>` outside a form defaults to `type=submit`, and React SPAs routinely put `onClick` submit logic on formless buttons. Key the rule on the effective `el.type` (`buttonType`), not on `inForm` alone.

## Code Examples

### Verbatim contract values used below
```ts
// packages/protocol/src/act.ts:5-10 (ActOp)
  z.object({ op: z.literal("fill"), targetId: z.string(), value: z.string() }),
  z.object({ op: z.literal("select"), targetId: z.string(), optionValue: z.string() }),
  z.object({ op: z.literal("check"), targetId: z.string(), checked: z.boolean() }),
  z.object({ op: z.literal("focus"), targetId: z.string() }), // used for password/card: the user types
  z.object({ op: z.literal("click"), targetId: z.string() }),
  z.object({ op: z.literal("scroll-into-view"), targetId: z.string() }),
// packages/protocol/src/act.ts:33-40 (ActResult.error, detail, observedValue)
    .enum([
      "target-not-found", "stale-snapshot", "kind-mismatch", // live re-classification disagreed
      "gate-required", "sensitive-field", "disabled", "exception",
    ])
    .optional(),
  detail: z.string().max(300).optional(),
  observedValue: z.string().nullable().optional(), // DOM value read back after fill/select (verify-after-write)
// packages/protocol/src/action-kind.ts:5-9
export const ActionKind = z.enum([
  "fill", "select", "check", // field operations (always ungated)
  "click-safe", // ungated button/link (e.g. "show password", "add another")
  "submit", "pay", "delete", "send", "navigate-cross-domain", // GATED
// packages/protocol/src/snapshot.ts:7
export const Sensitivity = z.enum(["none", "password", "card-number", "card-cvc", "otp", "ssn"]);
// packages/protocol/src/payloads-extension.ts:9 and :32
  reason: z.enum(["page-load", "user", "post-act", "refresh"]),
  reason: z.enum(["navigation", "mutation", "tab-activated"]),
// packages/protocol/src/payloads-extension.ts:17-23 (snapshot.result)
export const SnapshotResultPayload = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), snapshot: Snapshot }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1).max(64), message: z.string().max(300) }),
  }),
]);
// packages/protocol/src/constants.ts:7,8,10,14,15
export const DEFAULT_PORT = 7777;
export const LOOPBACK_HOST = "127.0.0.1";
export const WS_PATH = "/ws";
export const PING_INTERVAL_MS = 20000;
export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
// packages/protocol/src/extension-id.ts:14
export const EXTENSION_ID = "gipmmdbdhebfpfoabhdpkenijaljeclp";
// tools/fake-extension/src/fake-extension.ts:170 and :182 (hello and ping shapes)
      send("hello", { role: "extension", clientVersion: "fake-extension", protocolVersion: 1 });
            pingTimer = setInterval(() => send("ping", {}), options.pingMs ?? PING_INTERVAL_MS);
```
The error `code` strings `invalid-snapshot` and `unsupported-page` used below are NEW names; the wire field is an open string, so they are allowed, but add them to the PROTOCOL.md documentation list only with the voice developer's agreement.
[VERIFIED: Read this session at the cited lines.]

### 1. Text fill with maxlength emulation (content script)
```ts
// apps/extension/src/content/fill.ts   (spike-validated mechanics)
const SETTERS = {
  input: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!,
  textarea: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!,
  select: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!,
};
const MAXLEN_TYPES = new Set(["text", "search", "url", "tel", "email", "password"]);

function clampMaxLength(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const applies = el instanceof HTMLTextAreaElement || MAXLEN_TYPES.has(el.type);
  const max = el.maxLength; // -1 when the attribute is absent
  if (!applies || max < 0 || v.length <= max) return { value: v, truncated: false, max };
  let cut = v.slice(0, max); // maxlength counts UTF-16 code units [ASSUMED]
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // never leave half a surrogate pair
  return { value: cut, truncated: true, max };
}

export async function fillText(el: HTMLInputElement | HTMLTextAreaElement, requested: string) {
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  focusWithEvents(el);
  const { value, truncated, max } = clampMaxLength(el, requested);
  (el instanceof HTMLTextAreaElement ? SETTERS.textarea : SETTERS.input).call(el, value);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  blurWithEvents(el);                      // never a key event, never Enter
  await settle();
  return { observedValue: el.value, detail: truncated ? `truncated to ${max} characters` : undefined };
}

export function settle(): Promise<void> {   // rAF can be throttled in hidden/occluded tabs: race a timer
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 120);
  });
}
```

### 2. Focus/blur that work when the page is not OS-focused
```ts
function eventsOf(el: Element, types: string[], act: () => void): Set<string> {
  const seen = new Set<string>();
  const on = (e: Event) => seen.add(e.type);
  for (const t of types) el.addEventListener(t, on, true);
  act();
  for (const t of types) el.removeEventListener(t, on, true);
  return seen;
}
export function focusWithEvents(el: HTMLElement): void {
  if (document.activeElement === el) return;
  const seen = eventsOf(el, ["focus", "focusin"], () => el.focus({ preventScroll: true }));
  if (!seen.has("focus")) el.dispatchEvent(new FocusEvent("focus", { composed: true }));
  if (!seen.has("focusin")) el.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
}
export function blurWithEvents(el: HTMLElement): void {
  if (document.activeElement !== el) return;
  const seen = eventsOf(el, ["blur", "focusout"], () => el.blur());
  if (!seen.has("blur")) el.dispatchEvent(new FocusEvent("blur", { composed: true }));
  if (!seen.has("focusout")) el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
}
```
React's `onBlur` listens to `focusout`, Vue's `@blur` to `blur`; dispatch both.

### 3. Select, checkbox, radio
```ts
export async function fillSelect(el: HTMLSelectElement, optionValue: string) {
  const opt = [...el.options].find((o) => o.value === optionValue)
    ?? [...el.options].find((o) => o.label.trim().toLowerCase() === optionValue.trim().toLowerCase());
  if (!opt) return { error: "exception" as const, detail: "no such option" };
  focusWithEvents(el);
  SETTERS.select.call(el, opt.value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  blurWithEvents(el);
  await settle();
  return { observedValue: el.value };
}
export async function setChecked(el: HTMLInputElement, want: boolean) {
  if (el.type === "radio" && !want) return { error: "exception" as const, detail: "radio cannot be unchecked" };
  if (el.checked !== want) el.click();     // native click fires what React/Vue listen to; no-op when already correct
  await settle();
  return { observedValue: String(el.checked) };   // same convention as tools/fake-extension
}
```

### 4. Synchronous hash (no `crypto.subtle`)
```ts
// cyrb53 (public domain). Change detector only, not a security primitive.
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
```

### 5. Service-worker socket manager (skeleton)
```ts
// apps/extension/src/background/socket.ts  (runtime imports from @blip/protocol are fine here)
import { buildFrame, parseFrame, PING_INTERVAL_MS, DEFAULT_PORT, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
const URL_ = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;
let ws: WebSocket | null = null, welcomed = false, pingTimer: number | undefined, pongTimer: number | undefined, backoff = 500, blockedUntil = 0;

export function ensureConnected(): void {
  if (Date.now() < blockedUntil) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(URL_);                       // browser adds Origin: chrome-extension://<id>
  welcomed = false;
  ws.onopen = () => {
    backoff = 500;
    ws!.send(JSON.stringify(buildFrame("hello", { role: "extension", clientVersion: chrome.runtime.getManifest().version, protocolVersion: 1 })));
    pingTimer = setInterval(() => {
      send("ping", {});
      clearTimeout(pongTimer); pongTimer = setTimeout(() => ws?.close(), 10_000) as unknown as number;
    }, PING_INTERVAL_MS) as unknown as number;
  };
  ws.onmessage = (ev) => {
    const r = parseFrame(String(ev.data));
    if (!r.ok) return;
    if (r.message.type === "welcome") { welcomed = true; onWelcome(); }
    else if (r.message.type === "pong") clearTimeout(pongTimer);
    else if (r.message.type === "error" && r.message.payload.code === "replaced") blockedUntil = Date.now() + 30_000;
    else if (welcomed) dispatch(r.message);       // snapshot.request, act.request, highlight; ignore the rest
  };
  ws.onclose = () => {
    clearInterval(pingTimer); clearTimeout(pongTimer); welcomed = false; ws = null;
    setTimeout(ensureConnected, Math.min(10_000, backoff) * (0.8 + Math.random() * 0.4)); backoff *= 2;
  };
}
chrome.alarms.create("blip-reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "blip-reconnect") ensureConnected(); });
chrome.runtime.onStartup.addListener(ensureConnected);
chrome.runtime.onInstalled.addListener(ensureConnected);
ensureConnected();                                 // top level: runs on every SW wake
```
Declare `send`, `onWelcome`, `dispatch` in the same module; `buildFrame` throws on an invalid payload, which is correct inside the SW (our own bug). The hello shape is the one `tools/fake-extension` already sends (quoted above).

### 6. Manifest template and build
```json
{
  "manifest_version": 3,
  "name": "Blip",
  "version": "0.0.1",
  "minimum_chrome_version": "116",
  "permissions": ["tabs", "scripting", "alarms", "storage", "webNavigation"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "exclude_matches": ["http://127.0.0.1:7777/*", "http://localhost:7777/*", "http://127.0.0.1:5173/*", "http://localhost:5173/*"],
    "js": ["content.js"],
    "all_frames": true, "match_about_blank": true, "match_origin_as_fallback": true,
    "run_at": "document_idle"
  }]
}
```
```ts
// apps/extension/build.ts (tsx)
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EXTENSION_PUBLIC_KEY } from "@blip/protocol";
const watch = process.argv.includes("--watch");
const opts = { entryPoints: { background: "src/background/index.ts", content: "src/content/index.ts" }, outdir: "dist", bundle: true, format: "iife", target: "chrome116", platform: "browser", sourcemap: watch ? "linked" : false, logLevel: "info", metafile: true } as const;
function manifest() {
  const m = JSON.parse(readFileSync("manifest.template.json", "utf8"));
  m.key = EXTENSION_PUBLIC_KEY; m.version = JSON.parse(readFileSync("package.json", "utf8")).version;
  mkdirSync("dist", { recursive: true }); writeFileSync("dist/manifest.json", JSON.stringify(m, null, 2));
}
if (watch) { const ctx = await context(opts); await ctx.watch(); manifest(); }
else { const r = await build(opts); manifest();
  const size = r.metafile!.outputs["dist/content.js"]!.bytes;
  if (size > 100_000) throw new Error(`content.js is ${size} bytes: a runtime import dragged in zod (see Pitfall 3)`); }
```

### 7. Action classification (policy, zod-free) as a table
Precedence: sensitive/unsupported is not this function; here pay > delete > send > submit-default. Match against the concatenation of visible text, `aria-label`, `value`, `title`, `name`, `id` (lower-cased, word boundaries).

| Input signal | Kind | Reason string |
|---|---|---|
| text matches `\b(pay\|payment\|buy\|purchase\|order\|checkout\|check out\|donate\|subscribe\|place order)\b` | `pay` | `text matches pay pattern` |
| text matches `\b(delete\|remove\|erase\|destroy\|deactivate\|close account\|cancel (account\|subscription\|membership\|order)\|unsubscribe\|clear all\|reset)\b`, or `input[type=reset]` | `delete` | `text matches delete pattern` |
| text matches `\b(send\|post\|publish\|share\|reply\|invite\|message)\b` | `send` | `text matches send pattern` |
| `input[type=submit\|image]` | `submit` | `input type submit` |
| `<button>` with effective `buttonType === "submit"` (form or not) | `submit` | `button defaults to submit` |
| `a[href]` with `new URL(href, base).origin !== topOrigin`, or scheme `mailto:`/`tel:`/other non-http | `navigate-cross-domain` | `link leaves origin` |
| `a[href]` with `javascript:` or `<a>` without href | `submit` | `unrecognized link, fail closed` |
| `a[href]` same origin (including `#fragment`) and no gated text match | `click-safe` | `same-origin link` |
| explicit `<button type="button">`/`input[type=button]`, or `summary`, or element with `aria-expanded`/`aria-haspopup`, **and** text matches the allowlist `\b(show\|hide\|reveal\|toggle\|expand\|collapse\|more\|less\|add (another\|more\|row)\|previous\|back\|close\|dismiss)\b` | `click-safe` | `explicit type=button with safe text` |
| anything else (div "button", `role=button` without allowlist text, unknown) | `submit` | `unrecognized, fail closed` |
Fields: `fill` (text-like/textarea/stubbed widgets), `select` (select, radio group), `check` (checkbox). "next/continue/save/confirm/finish" are deliberately **not** on the allowlist. Whether `Next` in a wizard should be ungated is a product decision (Assumption A8). Test file drives the table with at least: typeless in-form button, formless `<button>` with `onClick` text "Place order", `<input type=image>`, `href="https://other.example/x"`, `href="javascript:void 0"`, `mailto:`, text "Show password" as `type=button`, same text as a `div`, all-caps/odd-spacing variants ("P A Y" is not matched; the fail-closed default catches it), empty text, 10 000-character text (linear regexes only), and a parity test: for every member of `ActionKind.options` plus `""`, `"SUBMIT"`, `"__proto__"`, `classify.isGatedKindLocal(k) === isGatedKind(k)`.

### 8. Vitest wiring
```ts
// apps/extension/vitest.config.ts   (root vitest.config.ts already globs apps/*)
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
// in a DOM test file: first line
// @vitest-environment jsdom
```
Verified in a scratch project: vitest 5.0.5 + jsdom 29.1.1, docblock environment, native setter and `el.labels` work. Baseline today: `npx vitest run` is 28 files / 472 tests in ~6 s [VERIFIED: ran this session].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Persistent background page; unload after 5 min limit | Event-driven SW, 30 s idle; WebSocket traffic extends lifetime | Chrome 110/116 | Ping every 20 s is the supported keepalive |
| `--load-extension` for branded Chrome | Removed in 137; Chromium/Chrome for Testing/Edge unaffected in our test | Chrome 137 | Load unpacked once in a dedicated profile |
| Page-world `el.value =` for React | Prototype setter + `input` | 2017 onward (React 15.6+) | Required in page world; harmless in isolated world |
| `checkVisibility` absent | `Element.checkVisibility()` baseline widely available | 2024 | Use with jsdom fallback |
| Opt-in `:invalid` styling hacks | `:user-invalid` | Chrome 119 | Interaction-aware invalid state |

**Deprecated/outdated:** `checkOpacity` / `checkVisibilityCSS` option names are historic aliases of `opacityProperty` / `visibilityProperty` (both worked in the spike; prefer the new names).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Branded Chrome (not Edge) behaves like the Edge 155 spike for every measured item (Origin, id from key, setter, maxlength, unfocused events, `checkVisibility`, `chrome.dom`) | Summary, Pattern 1, F3 | Medium: re-run the React test page and the smoke script on the teammate's Chrome before I1 |
| A2 | `--disable-features=DisableLoadExtensionCommandLineSwitch` restores `--load-extension` on branded Chrome 137+ (worked on Edge 155 headless; the SeleniumBase thread says it helped but may not for every mode) | Pattern 8 | Low: only affects the optional smoke script; humans use Load unpacked |
| A3 | A page CSP `style-src` can block extension-created `<style>` elements and style attributes, but not CSSOM property writes | Anti-patterns, S7 | Low-Medium: overlay invisible on strict-CSP sites; the CSP test page checks it |
| A4 | Chrome's Local Network Access prompt does not gate an extension service worker's WebSocket to `127.0.0.1` (Edge spike connected with no prompt; Chrome's own post lists WebSockets as not yet gated, dated June 2025) | Pattern 6 | Medium: would block all traffic; plan 02-03 proves the local Edge connection, and the teammate Chrome repeat is retained in 02-20 before I1 |
| A5 | A `chrome.alarms` event wakes a terminated service worker (not stated on the alarms page; standard MV3 behavior) | Pattern 6 | Medium: reconnect after long idle; manual check in the checklist |
| A6 | After "reload" in `chrome://extensions`, Chrome does not re-inject content scripts into open tabs | Pattern 8, Pitfall 7 | Low: only costs a re-injection helper |
| A7 | `maxlength` counts UTF-16 code units in Chrome | Example 1 | Low: emoji at the boundary |
| A8 | Which texts are ungated `click-safe` (allowlist above; "Next/Continue/Save" excluded) | Example 7 | Product/safety call: user confirmation wanted before Phase 3 hard-codes phrase kinds |
| A9 | The `cursor: pointer` heuristic finds most framework-built div "buttons" | Pattern 2 | Low: undetected div buttons are simply not clickable by Blip (safe direction) |
| A10 | Mutation volume on typical forms is low enough that a 500 ms-throttled full walk is cheap | Pattern 5 | Low: measure on the "large" test page |
| A11 | `requestAnimationFrame` is throttled for hidden or fully occluded windows (observed to fire for visible-but-unfocused) | Example 1 | Low: `settle()` races a timer anyway |

## Resolved Questions

1. **Which browser is the demo browser on Pranav's machine?**
   - Known: only Edge 155 is installed here; CLAUDE.md, TEAM-SETUP.md and the demo assume Chrome with NVDA.
   - Unclear: whether Chrome will be installed; the voice workstream's docked-window plan was also written for Chrome.
   - **Decision â€” RESOLVED:** Edge 155 is the local demo browser because Chrome is absent here. Keep `BLIP_BROWSER` and the Edge fallback; a teammate repeats connection and fill checks on Chrome before I1. The pinned key/id and WebSocket Origin are verified on Edge, so local progress does not depend on installing Chrome here.
2. **Freshness of values the user types themselves** (F5b).
   - Known: D-13 forbids value-only `page.changed`.
   - Unclear: whether to add an optional additive field later.
   - **Decision â€” RESOLVED:** retain D-13's no-value-change `page.changed` rule. Re-snapshot on `read_form` and `whats_required` when the cached model is older than about 2 seconds. This catches manual edits when the user asks for fresh information without a protocol change or a value-change push channel.
3. **Where iframe elements sit in document order.**
   - **Decision â€” RESOLVED:** append iframe elements after all top-frame elements, preserving order within each frame. This is deterministic and sufficient for the current demo; splice at iframe positions only if a selected demo form requires it.
4. **Cross-origin iframe midpoint decision (D-17).**
   - Known: the same content script runs in each frame, so reading works by construction; the unknowns are `getAllFrames` coverage of late-created frames and fill inside them.
   - **Decision â€” RESOLVED:** make one time-boxed best-effort implementation and test of cross-origin read and fill. If unsupported or still failing by the Phase 2 midpoint, retain same-origin support, return `Part of this page could not be read.` once per unreachable visible frame, and record the limitation without blocking Phase 2.
5. **Does `ext:chrome` need a `/healthz` readiness signal? â€” RESOLVED.** Do not add `/healthz`; the server log line `connection bound role=extension` is the readiness evidence for the human checklist.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 24.14.0 | - |
| npm | workspaces | yes | 11.9.0 | - |
| esbuild | extension build | yes (transitive) | 0.28.2 | - |
| Google Chrome | teammate I1 check | **no on this machine** (not found under `Program Files`, `Program Files (x86)`, `%LOCALAPPDATA%`; no App Paths registry key) | - | Microsoft Edge 155 is the local demo browser; teammate repeats connection and fill checks on Chrome before I1 |
| NVDA | not needed this phase | not checked | - | - |
| jsdom, @types/chrome, react, react-dom | tests, typecheck, test page | not installed yet | - | pins above after checkpoint |
| Port 7777 / test-page port | server / test pages | free at research time | - | pick a fixed test-page port (suggest 7790) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Chrome (use Edge 155 for local demo work and confirm on the teammate's Chrome before I1).

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`; this section is included because the request asked for it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.5 (root `projects: ["packages/*", "apps/*", "tools/*"]`) |
| Config file | root `vitest.config.ts`; new `apps/extension/vitest.config.ts` |
| Quick run command | `npx vitest run apps/extension packages/policy` |
| Full suite command | `npm test` (28 files / 472 tests green today, ~6 s) and `npm run typecheck` (add `apps/extension/tsconfig.json` as a second `tsc -p`, because `types: ["chrome"]` must not leak into server code) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-03 | Table of button/link/div cases returns the right kind and reasons; parity with `isGatedKind`; no runtime protocol import | unit (node) | `npx vitest run packages/policy` | Wave 0 (`packages/policy/test/classify.test.ts`) |
| PAGE-01 | Walk returns label candidates by source, required source, options, errors, sensitive detection, radio group as one element, shadow DOM, hidden skip, caps and `truncated`, string clamps | unit (jsdom) | `npx vitest run apps/extension/test/walk.test.ts` | Wave 0 |
| PAGE-01 | Output validates against `Snapshot` and the existing fixtures' conventions | unit | same | Wave 0 |
| ACT-01 | Prototype setter + events: real React 18 and Vue render fns in jsdom, onChange fired, no key events dispatched | unit (jsdom, uses react/vue only if committed; otherwise a fake tracker that mimics `inputValueTracking`) | `npx vitest run apps/extension/test/fill.test.ts` | Wave 0 |
| ACT-02 | select by value, label fallback, checkbox no-op when already correct, radio via group id | unit (jsdom) | same | Wave 0 |
| ACT-04 | maxlength clamp reported truncated; rejecting controlled input reports page value; sensitive returns `sensitive-field` with null | unit (jsdom) | same | Wave 0 |
| ACT-03 | Overlay host is closed-shadow, `pointer-events:none`, has no text, positions on target, clears on `targetId: null` | unit (jsdom, layout-less: assert styles, not geometry) | `npx vitest run apps/extension/test/overlay.test.ts` | Wave 0 |
| PAGE-05 | Signature ignores value changes, changes on reveal/disabled/new error/new alert; hash determinism | unit | `npx vitest run apps/extension/test/signature.test.ts` | Wave 0 |
| PAGE-05 | `page.changed` leads to `snapshot.request {reason:"refresh"}` and an updated model within a few ms of fake-extension time; single-flight under burst; older snapshot ignored; dialogue not stomped | server unit with the existing fake extension | `npx vitest run apps/server/test/refresh.test.ts` | Wave 0 |
| F1 | `set_fields` through the fake brain sends `act.request` with correct `expectedKind` and speaks the observed value; sensitive field only gets `focus`; `request_action` still never acts (existing `walking-skeleton.test.ts:237-255`) | server integration | `npx vitest run apps/server/test` | Wave 0 (extend) |
| D-12 | Backoff/dead-peer/`replaced` logic as a pure state machine | unit (node) | `npx vitest run apps/extension/test/socket-state.test.ts` | Wave 0 (extract pure part) |
| Real Chrome | everything the above cannot see (isolated world, unfocused events, SW lifecycle, CSP, iframes) | manual checklist + `ext:smoke` | see below | Wave N |

jsdom limits to design around: no layout (all rects zero), no `checkVisibility`, `getComputedStyle` does not propagate `display:none` to descendants, `:user-invalid` always false. Therefore `isVisible` takes an injectable strategy; tests set `hidden`/`display:none` ancestors and assert the fallback, and assert Chrome-only paths by stubbing `checkVisibility`.

### Manual Chrome checklist (dedicated profile, REPL driving, voice window focused)
| # | Check | Pass criterion |
|---|-------|----------------|
| M1 | Load unpacked `apps/extension/dist` | `chrome://extensions` id equals `gipmmdbdhebfpfoabhdpkenijaljeclp`; server log `connection bound role=extension`; no `ws origin rejected` line |
| M2 | React form: fill name, then email via REPL while the REPL/voice window has OS focus | field value changes, page's own validation message appears and clears; `onBlur`-driven message appears (F3); reply states the DOM value |
| M3 | Vanilla form: fill a `maxlength=5` field with 12 characters | reply says the page kept 5 characters; DOM has 5 |
| M4 | Select, radio, checkbox via REPL | page reacts; checking an already-checked box is a no-op |
| M5 | Implicit-Enter-submit page: fill every field | page does not submit; no key events (page-side event log shows none) |
| M6 | Delayed-reveal page: click reveal; watch REPL `/state` | field count updates within ~1 s without any utterance |
| M7 | SPA page: `history.pushState` route change | model refreshes (new title/fields) within ~1.1 s |
| M8 | Stop server 40 s, restart it | extension reconnects without touching Chrome (alarm path); `welcome` seen |
| M9 | Leave idle 2 min with server up | socket still connected (ping keeps SW alive); server shows no new `connection bound` |
| M10 | Press reload on the extension, do not refresh the tab | snapshot still works (re-injection) |
| M11 | Same-origin iframe page, then cross-origin (second hostname) | both frames' fields appear with qualified ids; fill inside each works or the documented fallback sentence is spoken |
| M12 | Strict-CSP page (`style-src 'self'`) | highlight outline still visible |
| M13 | Click a div "button", an `<a>` to another origin, a typeless `<button>` via REPL | all three refused `gate-required`; page unchanged |
| M14 | Password field: `focus` only; type by hand; `/state` shows `hasValue` true, value never in any log | no value in server logs or replies |
| M15 | 300-field page | snapshot has 250 elements and `truncated: true` only because the 250-element cap cut the page; fields are prioritized over links |
| M16 | Open the voice page in a tab of the same profile and switch to it | REPL still describes the form tab, not the voice page |

### Automated real-browser smoke (optional, recommended, no new dependency)
`ext:smoke` (or the plan-2 spike harness kept as a script): start the real server on an ephemeral port, serve `tools/test-pages`, spawn `BLIP_BROWSER --headless=new --user-data-dir=<tmp> --no-first-run --load-extension=<dist> --disable-features=DisableLoadExtensionCommandLineSwitch <react page url>`, drive the server's hub from a vitest file exactly like the existing tests drive the fake extension, assert snapshot contents and `act.result.observedValue`, kill the child by pid. Skipped unless `BLIP_E2E_BROWSER` is set. This exact launch line ran headless on Edge 155 in the spike (SW socket, content script, React page). Cost estimate 45-60 minutes; it doubles as the D-04 confirmation. Do not use Playwright: no gain over this and a new SUS dependency plus a browser download.

### Sampling Rate
- **Per task commit:** `npx vitest run apps/extension packages/policy` (+ server tests when touched)
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** full suite green, manual checklist M1-M16 recorded in the verification doc, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/policy/test/classify.test.ts` - PAGE-03 table + parity
- [ ] `apps/extension/test/{walk,labels,fill,overlay,signature,socket-state}.test.ts` - PAGE-01/05, ACT-01..04
- [ ] `apps/server/test/refresh.test.ts` and an extension of `walking-skeleton.test.ts` - PAGE-05 server side, F1
- [ ] `apps/extension/vitest.config.ts`, `apps/extension/tsconfig.json` (types chrome), root `typecheck` script edit
- [ ] `tools/test-pages/*` pages and `serve.ts` (the manual checklist depends on them)
- [ ] Dependency checkpoint and install (jsdom, @types/chrome, esbuild direct, react, react-dom)

## Security Domain

`security_enforcement` is not set in `.planning/config.json` (treated as enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no user auth in this phase) | - |
| V3 Session Management | no | - |
| V4 Access Control | yes | Origin-bound role (existing); `runtime.onMessage` accepts only `sender.id === chrome.runtime.id` with `sender.tab`; act refusals (`gate-required`, `kind-mismatch`, `sensitive-field`); no `externally_connectable`, no `web_accessible_resources` |
| V5 Input Validation | yes | Content-script output is page-derived: clamp in the content script, `buildFrame`/`Snapshot` zod in the SW before sending, `parseFrame` on every inbound frame, server `cleanText` (exists) |
| V6 Cryptography | no | The hash is a change detector only |
| V8 Data Protection | yes | Sensitive values never leave the page; skip `type=hidden`; strip query/fragment from `href` |
| V13/V14 API & Configuration | yes | Fixed `ws://127.0.0.1:7777/ws`; minimal permissions (no `debugger`); `exclude_matches` for Blip's own pages |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **S1 Sensitive value exfiltration** (password, card, OTP, SSN typed by the user or prefilled) | Information disclosure | Classify from `type`, `autocomplete` (`cc-number` to `card-number`, `cc-csc` to `card-cvc`, `current-password`/`new-password` to `password`, `one-time-code` to `otp`), and whole-word name/label patterns (the words password, passcode, pwd, cvv, cvc, csc, ssn, "social security", otp, "one-time"; whole words only, so "passport" never matches); `cc-exp*`/`cc-name` have no enum value and stay `none` (documented, risk accepted). Read `value` only when `sensitive === "none"`; for sensitive compute `hasValue = el.value.length > 0` and drop the string in the same expression. Optional defense in depth: a non-sensitive text field whose value is 13-19 digits passing Luhn, or `###-##-####`, is reclassified `card-number`/`ssn`. The `RawElement` refine already rejects a leak and the SW fails the whole snapshot closed (verified: `sensitiveLeakRejected: true`) |
| **S2 Fill into a sensitive field** by a confused or injected request | Tampering | Extension re-checks live sensitivity on every `fill`/`select`/`check`, returns `sensitive-field`, `observedValue: null`; `focus` is the only op allowed |
| **S3 Decoy id**: page pre-stamps `data-blip-id="e5"` on a "Pay" button | Spoofing / Elevation | Resolve ids only through the content script's own `Map<string, WeakRef<Element>>`; always overwrite the attribute on stamping; never `querySelector('[data-blip-id=...]')` for authority |
| **S4 Label/text spoofing** ("Show more" on a button that submits) | Spoofing | Fail-closed classification (effective `buttonType`, allowlist-only `click-safe`), live re-classification at act time so a later text swap produces `kind-mismatch`, and Phase 3 capture-phase submit interception as the second layer |
| **S5 Prompt-injection text** in labels, alerts, headings | Tampering | Treated as data: clamped lengths, control characters stripped server-side (`cleanText`), never executed; the later phases keep it out of any instruction channel. Not solved here (Phase 5) but Phase 2 must not add a path where page text becomes a command |
| **S6 Secrets in URLs** | Information disclosure | `RawElement.href` sent as `origin + pathname`; keep full `href` in the content script only for classification. `Snapshot.url` stays whole (contract, grant binding); server never logs payloads (existing) |
| **S7 Overlay leakage / interference** | Information disclosure, Tampering | Closed shadow root; host `pointer-events: none`, `aria-hidden="true"`, `inert`; no text, label or value ever inside the overlay (box only); styled through CSSOM; excluded from the walk; host has no page-readable state beyond its existence (a page can see an extra `blip-overlay` element; accepted) |
| **S8 Hostile socket / website opening ws://localhost** | Spoofing | Already blocked by the hub (Origin + Host + role binding). The extension never reads configuration from a page |
| **S9 DoS from huge or mutating pages** | Denial of service | Walk time budget (~150 ms) and `truncated`; mutation throttle; option cap 200; frame size guard 1.5 MB; per-frame 1.5 s timeout |
| **S10 `eval`/remote code** | Elevation | MV3 default CSP, no `unsafe-eval`; bundled code only; zod fell back correctly without `eval` in the spike |
| **S11 `file://`/browser-internal pages** | - | Content scripts do not run; reply `{ok:false, error:{code:"unsupported-page"}}` (open string code) |

## Sources

### Primary (HIGH confidence)
- Reproduced this session in Microsoft Edge 155.0 (Chromium 155) headless and headful with an unpacked MV3 extension built with `EXTENSION_PUBLIC_KEY`, a Node `ws` server and an esbuild-bundled React 18.3.1 page: extension id, WebSocket `Origin`, isolated-world React behavior, maxlength, focus/blur when `document.hasFocus()` is false, `checkVisibility`, `:user-invalid`, `chrome.dom.openOrClosedShadowRoot` on a closed root, `@blip/protocol` (zod) inside the SW. Harness lived in the session scratchpad (not committed); launch line recorded in the smoke-script section.
- React 18.3.1 and Vue 3.5.44 recipes run in jsdom 29/30 scratch projects (results quoted in Pattern 1).
- esbuild JS API bundle-size measurements of `@blip/protocol` / `@blip/policy` imports.
- Repo files read this session: `packages/protocol/src/{snapshot,act,messages,payloads-extension,action-kind,extension-id,constants,form-model}.ts`, `PROTOCOL.md`, `apps/server/src/{server,turn,hub/hub,hub/guard,session/session,baseline/*,brain/*,reply}.ts`, `scripts/dev.ts`, `tools/fake-extension/src/fake-extension.ts`, `tools/repl/src/repl.ts`, fixtures `booking`/`broken`, `packages/policy/src/index.ts`, root `package.json`, `vitest.config.ts`, `tsconfig*.json`.
- gsd-tools `package-legitimacy check` output (this session).

### Secondary (MEDIUM confidence)
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (idle timer, WebSocket extends lifetime, globals lost)
- https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets (20 s keepalive, `minimum_chrome_version` 116)
- https://developer.chrome.com/docs/extensions/reference/api/alarms (30 s floor)
- https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts (`all_frames`, `match_about_blank`, `match_origin_as_fallback`, `world`)
- https://developer.chrome.com/docs/extensions/reference/api/webNavigation (event order, `getAllFrames`, frame 0)
- https://developer.chrome.com/docs/extensions/reference/api/dom (`chrome.dom`, Chrome 88+)
- https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility
- https://raw.githubusercontent.com/facebook/react/v18.3.1/packages/react-dom/src/client/inputValueTracking.js
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY (`--load-extension` removal in branded Chrome 137)

### Tertiary (LOW confidence)
- https://github.com/seleniumbase/SeleniumBase/issues/3778 (`DisableLoadExtensionCommandLineSwitch` workaround)
- https://codereview.chromium.org/26149002 (2013; focus/blur not dispatched on unfocused pages; behavior re-measured here)
- https://developer.chrome.com/blog/local-network-access (WebSockets not yet gated as of June 2025; extension treatment not stated)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - esbuild/zod/ws already in the repo; new dev deps are well-known and version-pinned, gated by the checkpoint
- Architecture: HIGH for socket/SW/frames/fill (measured), MEDIUM for change-signature and id-continuity design (not yet run on real sites)
- Pitfalls: HIGH for items marked verified (maxlength, unfocused events, bundle size, setter), MEDIUM for CSP, reload, alarms (`[ASSUMED]`)
- Classification/label heuristics: MEDIUM - sound defaults, need the table tests and the manual checklist

**Research date:** 2026-10-16
**Valid until:** 2026-10-23 for dependency versions (fast-moving registry), 30 days for the MV3 mechanics

