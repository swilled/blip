<!-- GSD:project-start source:PROJECT.md -->

## Project

**Blip**

Blip is a voice agent that helps blind users fill out web forms. A local Windows app (voice UI + agent server) talks to a thin Chrome MV3 extension over a localhost WebSocket: the user says what they want, Blip reads the page and describes the form in short spoken sentences, fills fields from dictation or a local profile, reads every value back, and submits only after a distinct spoken confirmation phrase. Built for GatorHacks by two developers in a 36–48 hour window.

**Core Value:** A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.

### Constraints

- **Timeline**: 36–48 hours of build time (GatorHacks) — everything optimizes for a reliable live demo, not completeness
- **Model access**: each developer runs the Antigravity CLI (`agy`) using their own signed-in subscription; Blip uses Gemini Flash and does not require a Gemini API key
- **Tech stack**: TypeScript everywhere (extension, agent server, voice app) — one toolchain for both developers
- **Platform**: Both machines Windows; Chrome; demo screen reader is NVDA
- **Latency**: keep response time low with grammar-first commands, background cached label repair, filler speech ("one moment"), Gemini Flash for intents, and snapshots capped at the wire limit
- **Security**: every page is untrusted input; generated AGY agents have no tools and run in isolated temporary directories; passwords/card numbers never reach the model
- **Collaboration**: two people on separate machines; each signs in to the Antigravity CLI using their own subscription

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## TL;DR (prescriptive)

| Layer | Use | Version | Confidence |
|---|---|---|---|
| Agent runtime | Antigravity CLI (`agy`) in persistent NDJSON mode with generated `tools: []` agents and Gemini Flash | CLI version checked at launch | **HIGH (verified live)** |
| Tool schemas / protocol | `zod` | 4.6.x | HIGH |
| Runtime | Node.js **24 LTS** ("Krypton") | 24.14+ (latest 24.22.0) | HIGH |
| TS runner (server) | `tsx watch` | 4.23.x | HIGH |
| WebSocket | `ws` (+ `@types/ws`) | 8.22.0 | HIGH |
| Static serving | `node:http` + `sirv` | sirv 3.0.2 | HIGH |
| Voice UI build | Vite, vanilla TypeScript template | vite 8.3.x | HIGH |
| Extension framework | **WXT** with the dev browser runner turned off. Load unpacked once into a dedicated Chrome profile. | wxt 0.21.4 | MEDIUM |
| Page model | `chrome.debugger` + CDP `Accessibility.getFullAXTree` / `queryAXTree` + `Runtime.callFunctionOn` for DOM heuristics | CDP 1.3 | HIGH (APIs exist); MEDIUM (infobar UX) |
| Actions | CDP `DOM.focus` + `Input.insertText` (trusted events), with a native-setter + `input`/`change` dispatch fallback | — | MEDIUM |
| STT | Web Speech API (`webkitSpeechRecognition`), one utterance per push-to-talk press | Chrome built-in | MEDIUM (focused page); **LOW (background)** |
| Push-to-talk hotkey | `uiohook-napi` in the Node server (real global keydown/keyup, so hold-to-talk works) | 1.5.5 (win32-x64 prebuilt, verified) | HIGH |
| TTS (agent voice mode) | `speechSynthesis` in the voice page, using the local Microsoft voices | Chrome built-in | MEDIUM |
| Screen-reader output | **NVDA Controller Client** `nvdaController_speakText` / `cancelSpeech`, called from Node through `koffi` | koffi 3.3.3 (verified on Win x64); NVDA client from `nvda_2026.2_controllerClient.zip` | HIGH (FFI); MEDIUM (end-to-end, NVDA not installed on the research machine) |
| Monorepo | **npm workspaces** (npm 11 is already installed; pnpm is not) + a shared `@blip/protocol` package of zod schemas, consumed as TS source | npm 11.9 | HIGH |
| Dev orchestration | `concurrently` for `npm run dev`; a `scripts/start.ts` for one-command demo startup | concurrently 10.0.6 | HIGH |
| Typecheck | TypeScript **6.0.3**, not 7.x (see below) | 6.0.3 | MEDIUM |

## 1. Running Gemini through the Antigravity subscription

The server launches the installed `agy` CLI with `--input-format stream-json --output-format stream-json`, one persistent conversation per role, and explicit Gemini Flash model IDs. The headless CLI uses credentials cached by an interactive Antigravity sign-in; the server does not use an SDK or a Gemini API key. Install the CLI, sign in once with `agy`, and verify local model slugs with `agy models`.

Each role gets a generated primary agent with `tools: []`, `mainAgent: true`, and `subagent: false` in a new temporary working directory. The CLI init payload reports its global tool inventory even when this agent has no tools, so startup validates the selected agent and restricted permission mode instead of expecting an empty inventory. Any runtime tool step closes the role. Do not pass `--dangerously-skip-permissions`; the command also runs in terminal sandbox mode.

The intent role uses `gemini-3.8-flash-low`; label repair uses `gemini-3.8-flash-medium`. Application schemas remain locally validated before any output reaches deterministic policy code. The model never has access to the page executor, GatePort, or submission grant.

## 2. Model tools: disabled

No tools or MCP server are passed to the model. The application sends only privacy-filtered projections; all browser actions and gated submission remain in deterministic code.
## 3. Local server

| Piece | Choice | Why |
|---|---|---|
| Node | **24 LTS** (24.14 installed; 24.22.0 is the latest LTS) | Active LTS. Node 26 isn't LTS until late Oct 2026, so don't switch mid-hackathon. AGY runs as a separate installed process. |
| Run TS | `tsx watch src/main.ts` (tsx 4.23.x) | Zero config, handles workspace TS imports. Node 24's native type stripping can't handle enums and needs explicit `.ts` extensions, so it's not worth the friction. |
| HTTP + static | `node:http` + `sirv` 3.0.2 serving `apps/voice/dist` | Tiny, with one port for HTTP and both WebSockets. Express or Hono add nothing here. |
| WebSocket | `ws` 8.22.0 with `noServer` + `server.on("upgrade")` routing `/ext` (extension) and `/ui` (voice page) | The standard choice. Validate every message with zod on receipt. |
| Origin check | Accept `/ext` only from `chrome-extension://<your-id>`, and `/ui` only from `http://localhost:<port>` | Any web page can open `ws://localhost`. Without the check, a hostile site could drive the agent. |
| Port | Fixed, e.g. `8787`, bound to `127.0.0.1` only | The extension hard-codes it. |
| Dev | `concurrently -k "npm:dev -w apps/server" "npm:dev -w apps/voice" "npm:dev -w apps/extension"` | One terminal per developer. |
| One-command demo | `npm start` → `scripts/start.ts`: build if needed → start the server → spawn `chrome.exe --user-data-dir=<repo>/.chrome-profile --silent-debugger-extension-api --app=http://localhost:8787` | A dedicated profile makes the flags apply even when the user's normal Chrome is open. The unpacked extension persists in that profile after a one-time "Load unpacked". |

## 4. Chrome MV3 extension

### Build tool: WXT 0.21.4. Confidence: MEDIUM

- WXT is the most actively maintained framework. It's Vite-based (peer: vite ^6.3.4 || ^7 || ^8), gives typed entrypoints (`entrypoints/background.ts`, `entrypoints/content.ts`), generates the manifest, and auto-reloads in dev.
- **Turn the dev runner off** (`web-ext.config.ts` → `disabled: true`). Load `.output/chrome-mv3-dev` once via chrome://extensions → Load unpacked in the dedicated profile. This sidesteps web-ext's fresh-profile default and the Chrome 137 `--load-extension` removal.
- Manifest permissions: `"debugger"`, `"tabs"`, `"scripting"`, `"alarms"`, `"storage"`, `host_permissions: ["<all_urls>"]`, `minimum_chrome_version: "116"`.
- Alternatives: CRXJS 3.0.0 (fine, but lower level and historically broken by Vite upgrades), or plain esbuild with a hand-written manifest. Plain esbuild is the right fallback if WXT fights you for more than 30 minutes, because the extension is small: one background file and one content script.

### Snapshot: `chrome.debugger` + CDP Accessibility as primary, a content-script DOM walk as secondary. Confidence: HIGH that the APIs exist

- `chrome.debugger` exposes the **Accessibility, DOM, DOMSnapshot, Input, Runtime, Page, Overlay, Emulation and Target** domains to extensions (verified against the docs list).
- `Accessibility.getFullAXTree({depth?, frameId?})` and `queryAXTree({backendNodeId, role?, accessibleName?})` are marked *experimental* in the protocol, but they're long-standing. AXNode fields: `nodeId, ignored, role, chromeRole, name, description, value, properties, parentId, childIds, backendDOMNodeId, frameId`. `Accessibility.enable` keeps node IDs stable between calls, at some performance cost.
- **Why AX first:** it gives the computed accessible name and role, which is exactly what NVDA would announce. That's the baseline we then repair. Map `backendDOMNodeId` → `DOM.resolveNode` → `Runtime.callFunctionOn` to run DOM heuristics on each control: placeholder, nearby text, `autocomplete` token, `required`/`aria-invalid`, fieldset legend.
- Filter the full tree down to form controls, headings, landmarks, alerts/status and buttons before anything reaches the model.
- **Iframes:** since Chrome 125, use `Target.setAutoAttach({autoAttach:true, flatten:true, waitForDebuggerOnStart:false})` and pass `sessionId` to `sendCommand`. Auto-attach isn't recursive. This matters for payment and embedded forms.
- **Infobar tradeoff:** attaching shows a "Blip started debugging this browser" bar on every tab, with a Cancel button that detaches us (`onDetach` reason `canceled_by_user`). It's also detached when DevTools opens on that tab. NVDA users can land on this bar. **Mitigation for the demo:** launch the dedicated profile with `--silent-debugger-extension-api`, which suppresses it (MEDIUM: community and vendor docs confirm, and a June 2026 Claude-in-Chrome issue uses it). Also handle `onDetach` by re-attaching on the next command and speaking "I lost access to the page".
- **Secondary path:** a content-script DOM walk with `dom-accessibility-api` 0.7.1 (`computeAccessibleName`, `getRole`) gives approximate names with no infobar. Keep it as the fallback. Use the content script anyway for `MutationObserver` page-change events and the field highlight overlay.

### Service worker ↔ `ws://localhost`. Confidence: HIGH (official docs)

- Since Chrome 116, an active WebSocket keeps an extension service worker alive **if messages flow at least every ~30 s**. The docs recommend a keepalive every 20 s. Set `minimum_chrome_version: "116"`.
- Connect at service worker top level and on `runtime.onStartup` / `onInstalled`.
- Add `chrome.alarms.create("reconnect", { periodInMinutes: 0.5 })`. If the server was down and the worker went idle, nothing else would wake it to reconnect.
- Use the server's app-level ping as the keepalive, so both sides detect a dead peer.

### Actions so site validation fires. Confidence: MEDIUM

- **Text:** `DOM.scrollIntoViewIfNeeded` → `DOM.focus({backendNodeId})` → select-all and delete (`Input.dispatchKeyEvent` Ctrl+A, then Backspace) → `Input.insertText({text})`. This produces **trusted** `beforeinput`/`input` events that React, Vue and Angular controlled inputs accept. Then move focus or call `el.blur()` via `callFunctionOn` so on-blur validation runs.
- **Fallback** (no debugger, or insertText ignored): in page context, call the native value setter `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v)`, then dispatch bubbling `input` and `change` events. These are untrusted but work on most sites.
- **Select / checkbox / radio:** set the value or `el.click()` via `callFunctionOn`, then dispatch `change`. Custom comboboxes are a stretch goal.
- **Click:** compute the center from `DOM.getBoxModel`, then `Input.dispatchMouseEvent` (mousePressed, then mouseReleased). This is trusted, and it's **only reachable through the gated `click` tool.**
- **Background tab:** if the form tab isn't focused, enable `Emulation.setFocusEmulationEnabled({enabled:true})` (experimental) so focus, blur and `:focus` behave. `Page.bringToFront` is available but steals NVDA's focus.

## 5. Voice

### Critical open risk: where the voice page runs. Do a 30-minute spike in hour 1

- Chromium has a 2014-era policy that **denies new speech and media-capture sessions from background tabs**. The evidence is old (LOW confidence on current behavior), but if it holds, a voice UI in a normal tab **cannot start recognition while the user is on the form tab**.
- An ARIA live region in a background tab won't be announced by NVDA either (MEDIUM).
- **Spike these cases in order. Pick the first one that works:**
- Don't put STT in an **offscreen document**. There's no evidence `webkitSpeechRecognition` works in a hidden document. Offscreen `USER_MEDIA` is meant for raw `getUserMedia` capture, and we have no local STT engine to feed.

### STT: Web Speech API, push-to-talk, `continuous = false`. Confidence: MEDIUM

- On a `http://localhost` page the mic permission prompt appears once and is remembered, because localhost counts as a secure context.
- Default Chrome recognition is **server-based**: audio goes to Google and needs network. `processLocally` plus `SpeechRecognition.available()`/`install()` exist for on-device recognition, but stable-channel availability is unverified (LOW). Treat it as optional.
- Settings: `interimResults: true` (show a live caption for the sighted demo), `maxAlternatives: 3` (helps spelling and names), `lang: "en-US"`.
- Use **one `start()` per key press**. Call `stop()` on key release and take the final result. Continuous mode drops sessions silently, fires `no-speech`/`network` errors and stacks sessions if you restart on `onend`. Avoid it.
- Typed-text fallback goes into the same `/ui` message channel, as `{type:"utterance", source:"typed"}`.

### Push-to-talk hotkey: `uiohook-napi` 1.5.5 in the server. Confidence: HIGH (verified install and load on win32-x64 / Node 24)

- It gives global keydown/keyup, so hold-to-talk works from any window.
- `chrome.commands` with `"global": true` works on Windows, but it's limited to `Ctrl+Shift+[0-9]` and has **no keyup event**, so it's toggle-only. It's acceptable as a backup.
- Avoid NVDA's modifier keys (Insert, CapsLock). Suggested hotkey: hold Right-Ctrl or F9.

### Output paths

- **Screen-reader mode (NVDA): call the NVDA Controller Client from Node through koffi.** Confidence: HIGH that it's viable; MEDIUM until tested with NVDA running.
- **Agent voice mode:** `speechSynthesis` in the voice page. Pick a local `Microsoft *` voice; Google network voices have a long-standing cut-off on long utterances, so speak sentence by sentence anyway. Chrome requires a user activation before the first `speak()`, so add a "Press Space to start Blip" gate on page load (MEDIUM).
- **Fallback TTS from Node:** one persistent `powershell.exe` child running `System.Speech.Synthesis.SpeechSynthesizer` and reading lines from stdin. Use it only if the voice page can't speak from where it runs. Don't use the `say` npm package (0.16.0): it spawns PowerShell per utterance, which adds hundreds of milliseconds.
- **ARIA live region:** limited. It's announced only when its document is the active tab and the region existed before its content changed, and NVDA often drops the first update or updates that coincide with focus changes. Use it only for the sighted and typed-fallback UI log, not as the primary NVDA path. Injecting a live region into the *form page* through the content script would work in the foreground, but it pollutes the page and NVDA's browse-mode buffer, so treat it as a last resort.

## 6. Repo structure and shared protocol

- One `@blip/protocol` package, imported by all three apps, is the executable version of `PROTOCOL.md`. Both sides `parse()` every inbound message, so a contract drift fails loudly at the boundary.
- Vite, WXT and tsx all transpile workspace TS source directly, so the protocol package needs no build step.
- Use **zod 4** everywhere for protocol and local model-output validation. If the extension bundle size matters, `zod/mini` is available, but it isn't needed.

## Installation

# root

# packages/protocol

# apps/server

# The agent provider uses the locally installed Antigravity CLI; npm does not bundle a model SDK.

# apps/extension

# apps/voice

# test the policy gate (deterministic code deserves tests even in a hackathon)

## Alternatives Considered

| Recommended | Alternative | When to use the alternative |
|---|---|---|
| Antigravity CLI NDJSON sessions | Gemini API SDK with an API key | Not for the subscription-backed local demo. |
| No model tools | MCP tools or shell commands | Tools would let page injection cross the deterministic model boundary. |
| Separate persistent Gemini Flash sessions for intent and label repair | One session for both roles | Keep role prompts and failure recovery isolated. |
| WXT | Plain esbuild + static manifest | When WXT config or reload problems cost more than 30 minutes. The extension is tiny. |
| WXT | CRXJS 3.0.0 | When the team already knows CRXJS |
| CDP AX tree | Content-script DOM walk + `dom-accessibility-api` | When the debugger infobar is unacceptable and the flag can't be used |
| CDP `Input.insertText` | Native setter + `input`/`change` dispatch | When there's no debugger session or insertText is ignored |
| NVDA Controller Client via koffi | ARIA live region in the voice page | When NVDA isn't installed, or for the visual log only |
| `speechSynthesis` | Persistent PowerShell SAPI child | When the voice page can't speak where it runs |
| uiohook-napi global PTT | `chrome.commands` `"global": true` (Ctrl+Shift+digit, toggle only) | When the native module fails to load |
| npm workspaces | pnpm workspaces | When a developer already uses pnpm. It works, but isn't installed here. |
| TypeScript 6.0.3 | TypeScript 7.0.2 (Go-native `tsc`) | Fine for `tsc --noEmit` only. 7.0 has no programmatic compiler API until 7.1, so typescript-eslint and ts-morph break, and strict mode is on by default. |
| Node 24 LTS | Node 26 | After it becomes LTS, which is after the hackathon |

## What NOT to Use

| Avoid | Why | Use instead |
|---|---|---|
| AGY tool permissions | Untrusted page text could trigger local or browser tools | Generated `tools: []` agents and stop on any tool step |
| `--dangerously-skip-permissions` | Auto-approves every CLI tool | Never use it |
| API-key credentials in the child environment | Could bypass the signed-in subscription path | Strip API-key variables and preserve the CLI account cache |



| `--load-extension` in the launcher | Removed from branded Chrome since 137 | Load unpacked once into a dedicated `--user-data-dir` profile |
| `SpeechRecognition.continuous = true` | Silent drops, `no-speech`/`network` errors, duplicate sessions on restart | One `start()`/`stop()` per PTT press |
| STT in an offscreen document | No evidence Web Speech works in hidden documents | A visible voice window or the side panel |
| `say` npm package | Spawns PowerShell per utterance (slow) | `speechSynthesis`, or a persistent PowerShell child |

| Plasmo | Parcel-based and partially maintained | WXT |
| Unauthenticated `ws://localhost` | Any website can connect to localhost sockets | Check the `Origin` header; bind to 127.0.0.1 |

## Stack Patterns by Variant

- Use the voice app window docked beside the form window, with the global uiohook PTT, and NVDA stays on the form.
- This is the best demo: the user stays in the real page while NVDA and Blip cooperate.
- The user stays in Blip's window and uses in-page Space-hold PTT. Blip drives the form tab over CDP with focus emulation.
- Use the NVDA `speakText` path for all output, and offer "switch to page" (`Page.bringToFront`) for manual verification.
- Switch automatically to agent voice mode (`speechSynthesis`) and say so.
- Fall back to content-script snapshot (`dom-accessibility-api`) and synthetic-event actions, and announce "reduced accuracy mode".

## Version Compatibility

| Package | Compatible with | Notes |
|---|---|---|
| Antigravity CLI | Installed per developer and authenticated with their Antigravity subscription | No model SDK package is bundled in npm dependencies. |
| wxt@0.21.4 | vite ^6.3.4 \|\| ^7 \|\| ^8, typescript >=5.4 | Runner uses web-ext (10.8.0); disable it |
| koffi@3.3.3 | Node 24 win32-x64 (prebuilt) | Verified with `kernel32!lstrlenW(char16_t*)` |
| uiohook-napi@1.5.5 | Node 24 win32-x64 / arm64 (prebuilds) | Verified load |
| nvdaControllerClient.dll (2026.2) | NVDA ≥ 2024.1 for `speakSsml`; ≥ 2026.3 for `isSpeaking` | Use the x64 DLL for 64-bit Node |
| ws@8.22.0 | Node 24 | Chrome ≥ 116 for service-worker WebSocket keepalive |
| typescript@6.0.3 | All of the above | TS 7.0.2 is "latest" on npm, but its programmatic compiler API isn't there until 7.1 |

## Sources

- AGY CLI integration, this machine, 2026-10-17: subscription-backed Gemini Flash bootstrap for both isolated roles plus synthetic no-tools request (HIGH)
- https://www.antigravity.google/docs/cli/headless/: cached login, NDJSON streaming, model selection, and headless permissions (HIGH)
- https://antigravity.google/docs/cli/subagents: custom agent tool permissions and `tools: []` configuration (HIGH)
- https://developer.chrome.com/docs/extensions/reference/api/debugger: allowed CDP domains, flat sessions (Chrome 125+), detach reasons (HIGH)
- https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets: Chrome 116+ service-worker WebSocket keepalive every 20 s (HIGH)
- https://developer.chrome.com/docs/extensions/reference/api/commands: global commands, Ctrl+Shift+[0-9], no keyup (HIGH)
- CDP `browser_protocol.json` (ChromeDevTools/devtools-protocol master): Accessibility/Input/Emulation signatures and experimental flags (HIGH)
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY: `--load-extension` removed in branded Chrome 137 (HIGH)
- https://wxt.dev/guide/essentials/config/browser-startup.html: web-ext runner, disabling it, persistent profile (HIGH)
- https://wxt.dev/guide/resources/compare and https://merginit.com/blog/23082026-plasmo-vs-wxt-vs-crxjs-extension-js: framework landscape (MEDIUM; vendor and opinion sources)
- https://github.com/nvaccess/nvda/blob/master/extras/controllerClient/readme.md, the `example_python.py` in the same repo, and https://download.nvaccess.org/releases/stable/ (`nvda_2026.2_controllerClient.zip`): exports, versions, LGPL (HIGH)
- https://codereview.chromium.org/431433006: Web Speech blocked in background tabs (LOW; 2014, needs a spike)
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally and the "Intent to Ship: On-device Web Speech API" thread on blink-dev: on-device STT (LOW for stable availability)
- https://webaim.org/discussion/mail_message?id=35362: live-region injection caveats (MEDIUM)
- https://braindetox.kr/en/posts/typescript_v7_go_release_2026.html and https://developersdigest.tech/blog/typescript-7-native-compiler-migration-guide: TS 7 has no compiler API until 7.1 (MEDIUM)
- npm registry, 2026-10-16: all version numbers above (HIGH)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

## Team, Workstreams & Ownership

Two developers on separate Windows machines share this repo. **Pranav is working on the `core` workstream.** The current developer on this checkout is working on the **voice** workstream (Person B). GSD planning is split into two workstreams so neither machine edits the other's STATE/ROADMAP/phases:

| Workstream | Owner | Owns (code) | Planning dir |
|------------|-------|-------------|--------------|
| `core` | Person A — Pranav | `packages/protocol` (author), `packages/policy`, `apps/server` (hub, Executor, brain), `apps/extension`, `tools/fake-*`, `tools/repl` | `.planning/workstreams/core/` |
| `voice` | Person B — teammate | `apps/voice`, `packages/dialogue`, `apps/server/src/voice/` (NVDA bridge), `dev/mock-server`, `fixtures/forms/` (except `injection.html`), demo assets | `.planning/workstreams/voice/` |

Rules:
- Each machine sets its workstream once: `setx GSD_WORKSTREAM core` (Pranav) or `setx GSD_WORKSTREAM voice` (teammate), then restarts the terminal/editor. Never commit `.planning/active-workstream`.
- Only touch the other track's code or planning files by agreement. `packages/protocol` changes need both people's sign-off (it is the contract).
- Shared, rarely-edited files: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` (master), `.planning/research/`, `.planning/config.json`, root `package.json`, `CLAUDE.md`.
- Branches: `core/*` and `voice/*`; merge to `main` small and often. Integration milestones: M0 ~h0.75 (protocol frozen), I1 ~h6–8, I2 ~h12, I3 ~h20, freeze ~h30 (tag `demo-safe`).

Safety invariants (never weaken without both people agreeing):
- The model never acts: AGY Gemini returns data through tool-less structured-output calls (`repairFormModel`, `parseIntent`). Every page action goes through the Executor.
- Gated kinds (submit/pay/delete/send/cross-domain) are default-deny; the server matches the fixed phrase after the tracked read-back. The voice reducer sends `confirm.redeem` with its current grant/read-back IDs, while only the server holds the consumed proof sent to GatePort.
- AGY CLI sessions: generated `tools: []` agent per role, restricted permission mode, isolated temporary working directory, cached subscription auth, API-key environment variables stripped, and every tool step rejected. Never use `--dangerously-skip-permissions`.
- Passwords/card numbers are never spoken, logged, or sent to the model.

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
