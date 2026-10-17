# Stack Research

**Domain:** Voice form-filling agent for blind users (local Node/TypeScript agent server + localhost voice UI + thin Chrome MV3 extension), powered by headless Claude on a Claude subscription login
**Researched:** 2026-10-16
**Confidence:** HIGH for the agent runtime (checked against official docs and a live smoke test on this machine). MEDIUM for the extension and output paths. LOW for STT behavior when the voice page is not the focused tab (see the "Critical open risk" section).

---

## TL;DR (prescriptive)

| Layer | Use | Version | Confidence |
|---|---|---|---|
| Agent runtime | `@anthropic-ai/claude-agent-sdk` `query()` in **streaming-input mode** (one long-lived session), with in-process tools via `createSdkMcpServer()` + `tool()` | 0.3.301 (bundles Claude Code 2.1.301) | **HIGH (verified live)** |
| Tool schemas / protocol | `zod` | 4.6.x (SDK peer: `^4.0.0`) | HIGH |
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

---

## 1. Running Claude headlessly on a subscription: Agent SDK, not raw `claude -p`

### Verdict: use `@anthropic-ai/claude-agent-sdk` 0.3.301. Confidence: HIGH (verified live)

I ran a smoke test on this Windows machine (Node 24.14, SDK 0.3.301, logged-in Claude Code, `ANTHROPIC_API_KEY` removed from the child env):

- `system/init` reported `apiKeySource: "none"`, `model: "claude-haiku-5-5"` and `tools: ["mcp__blip__get_snapshot"]`, with no built-in tools at all. The MCP server status was `connected`, source `sdk`.
- Asked to run the shell command `dir`, the model replied: "I can't run `dir` because I have no shell tool in this session." So `tools: []` really removes the shell.
- **Latency, one long-lived streaming session:** about 1.0–1.6 s from spawn to init. Haiku 5.5 turns took 0.7–1.8 s, including one in-process tool round trip. Sonnet 5.5 at `effort: "low"` took 1.6–2.5 s per turn. That beats the 2–5 s assumed in PROJECT.md.
- The SDK installs its own native Claude Code binary (`@anthropic-ai/claude-agent-sdk-win32-x64`) as an optional dependency, so no separate `claude` install is needed. The logged-in subscription credential is still required, and the SDK reads it from `%USERPROFILE%\.claude\.credentials.json`.

**Why the SDK beats spawning `claude -p --input-format stream-json --output-format stream-json`:**
1. **In-process tools.** `createSdkMcpServer()` runs the tool handlers inside our Node process. The policy gate, the WebSocket to the extension and the profile store all live in the same process with no IPC. The raw CLI can only reach tools through a separate stdio or HTTP MCP server, which would then need its own channel back to our server.
2. **Typed messages and control methods:** `interrupt()` (for the "stop" command), `setModel()`, `applyFlagSettings()`, `mcpServerStatus()` and `close()`.
3. **`startup()` / `WarmQuery`** pre-spawn the process and finish the initialize handshake at server boot, so the first spoken command pays no spawn cost. `prewarm()` / `SpareProcess` exist too, but they are alpha.
4. The SDK is the documented path. Under the hood it drives the same Claude Code binary, so we lose nothing.

**When the raw CLI would make sense:** only if the agent ran in a non-JS language. That doesn't apply here.

### Exact configuration (verified option names, from the TS reference)

```ts
import { query, tool, createSdkMcpServer, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const blip = createSdkMcpServer({
  name: "blip",
  version: "0.1.0",
  alwaysLoad: true,          // full schemas in the first prompt, no ToolSearch round trip
  tools: [
    tool("get_snapshot", "Return the current repaired form model",
      { detail: z.enum(["summary", "full"]).optional() },
      async (args) => ({ content: [{ type: "text", text: JSON.stringify(await formModel(args)) }] }),
      { annotations: { readOnlyHint: true } }),
    tool("fill_field", "...", { fieldId: z.string(), value: z.string() }, fillHandler),
    tool("click", "...", { targetId: z.string() }, clickHandlerWithPolicyGate), // gate lives HERE
    tool("speak", "...", { text: z.string().max(400) }, speakHandler),
  ],
});

const env = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "blip/0.1" };
delete env.ANTHROPIC_API_KEY;        // otherwise the API key outranks the subscription login
delete env.ANTHROPIC_AUTH_TOKEN;

const q = query({
  prompt: userTurns(),               // AsyncIterable<SDKUserMessage>, fed from a push queue
  options: {
    model: "haiku",                  // conversational turns; "sonnet" for page -> form schema
    effort: "low",
    tools: [],                       // remove ALL built-in tools (Bash, Read, Write, WebFetch, Agent, ToolSearch...)
    allowedTools: ["mcp__blip__*"],  // auto-approve only our server
    permissionMode: "dontAsk",       // anything not pre-approved is denied, never prompted
    mcpServers: { blip },
    strictMcpConfig: true,           // ignore .mcp.json, user MCP servers, plugins, claude.ai connectors
    settingSources: [],              // do not load ~/.claude settings, CLAUDE.md, hooks, skills
    persistSession: false,           // don't write page content into ~/.claude/projects transcripts
    cwd: EMPTY_DIR,                  // e.g. path.join(os.tmpdir(), "blip-empty")
    systemPrompt: BLIP_SYSTEM_PROMPT,// a plain string replaces the Claude Code preset
    maxTurns: 8,
    env,
  },
});
```

Key facts from the docs:
- `tools: []` means "all built-ins are removed. Claude can only use your MCP tools." Use this rather than `disallowedTools: ["*"]`, which **also strips MCP tools** because `*` matches every tool.
- `allowedTools` grants permission only. It doesn't restrict which tools exist. Unanchored globs (`"*"`, `"mcp__*"`) are ignored. The server segment must be literal, as in `mcp__blip__*`.
- Under `bypassPermissions`, `allowedTools` doesn't constrain anything. Use `dontAsk`, never `bypassPermissions`.
- Tool search is on by default and defers SDK MCP tool schemas. `alwaysLoad: true` on the server avoids the extra ToolSearch hop. With `tools: []` no ToolSearch tool appeared anyway (verified).
- `tool()` accepts Zod 3 or 4 schemas. Return `isError: true` to compose the error text the model reads. A thrown exception becomes a raw error result, and the loop continues.
- A tool result over 25,000 tokens (or 50,000 characters) is **saved to a file**, and the model is told to Read it. Read is disabled here, so an oversized snapshot silently breaks the turn. Keep `get_snapshot` output to the trimmed form model, not the raw AX tree.
- MCP tool calls time out (`MCP_TOOL_TIMEOUT`, or the per-server `timeout` on `createSdkMcpServer`). **Don't make `ask_user` a tool that blocks waiting for speech.** End the turn with the question and send the user's answer as the next `SDKUserMessage`. Deterministic code owns the confirm-phrase wait.

### Sessions and models
- Run **one long-lived conversational session** (`haiku`, `effort: "low"`) for utterance → intent/values.
- Run a **separate session for page → form schema** (`sonnet`, `effort: "low"`, or `opus` if label repair quality is poor). Prewarm it with `startup()` at boot so it's ready when a page loads.
- On subscription accounts the aliases currently resolve to Opus 5.5, Sonnet 5.5 and Haiku 5.5. Effort levels for these models: `low|medium|high|xhigh|max`, default `medium`.

### Subscription-auth terms (read before the pitch). Confidence: HIGH (official pages)
- The Agent SDK overview says: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."
- The Legal & Compliance page says developers building products "should use API key authentication", and that Anthropic does not permit routing "requests through Free, Pro, or Max plan credentials on behalf of their users." It also says advertised Pro/Max limits "assume ordinary, individual usage of Claude Code and the Agent SDK."
- Support article 15036540: "You can still use the Claude Agent SDK, `claude -p`, and third-party apps with your subscription limits." The previously announced change to SDK billing was **paused on 2026-06-15**. As of 2026-10-07, Max and Team plans also include monthly API credits that cover the Agent SDK and `claude -p`.
- **Implication:** each developer running Blip on their own machine with their own login is ordinary individual use, which is fine for the hackathon. **Do not** host Blip or offer "sign in with Claude" to other users. The pitch should say production would use per-user API keys, or each user's own sign-in to the unmodified Claude Code binary, which the legal page explicitly allows. Don't brand the product "Claude Code". "Blip, powered by Claude" is allowed.
- **Gotcha:** in non-interactive mode, a present `ANTHROPIC_API_KEY` is always used and outranks the subscription login. Strip it from `env` as shown above.

---

## 2. MCP server SDK: not needed

Use the Agent SDK's in-process `createSdkMcpServer()`. You will still install `@modelcontextprotocol/sdk` **1.x** (currently 1.32.1), because the Agent SDK declares it as a peer dependency (`^1.29.0`) and its types come from there.

**Don't use** the new split v2 packages (`@modelcontextprotocol/server` / `client` 2.3.1). The Agent SDK peers on v1, and mixing the two gives you type mismatches for nothing.

**Only if** you later need to debug tools from the stock Claude Code CLI or MCP Inspector should you also expose the same handlers over the v1 SDK's `McpServer` + Streamable HTTP transport on localhost. That's optional and not on the critical path. Confidence: HIGH.

---

## 3. Local server

| Piece | Choice | Why |
|---|---|---|
| Node | **24 LTS** (24.14 installed; 24.22.0 is the latest LTS) | Active LTS. Node 26 isn't LTS until late Oct 2026, so don't switch mid-hackathon. SDK engines: `>=18`. |
| Run TS | `tsx watch src/main.ts` (tsx 4.23.x) | Zero config, handles workspace TS imports. Node 24's native type stripping can't handle enums and needs explicit `.ts` extensions, so it's not worth the friction. |
| HTTP + static | `node:http` + `sirv` 3.0.2 serving `apps/voice/dist` | Tiny, with one port for HTTP and both WebSockets. Express or Hono add nothing here. |
| WebSocket | `ws` 8.22.0 with `noServer` + `server.on("upgrade")` routing `/ext` (extension) and `/ui` (voice page) | The standard choice. Validate every message with zod on receipt. |
| Origin check | Accept `/ext` only from `chrome-extension://<your-id>`, and `/ui` only from `http://localhost:<port>` | Any web page can open `ws://localhost`. Without the check, a hostile site could drive the agent. |
| Port | Fixed, e.g. `8787`, bound to `127.0.0.1` only | The extension hard-codes it. |
| Dev | `concurrently -k "npm:dev -w apps/server" "npm:dev -w apps/voice" "npm:dev -w apps/extension"` | One terminal per developer. |
| One-command demo | `npm start` → `scripts/start.ts`: build if needed → start the server → spawn `chrome.exe --user-data-dir=<repo>/.chrome-profile --silent-debugger-extension-api --app=http://localhost:8787` | A dedicated profile makes the flags apply even when the user's normal Chrome is open. The unpacked extension persists in that profile after a one-time "Load unpacked". |

**Don't use** `--load-extension` in the launcher. Branded Google Chrome removed that flag in Chrome 137. It only works in Chromium and Chrome for Testing. Confidence: HIGH (Chromium extensions PSA).

---

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

---

## 5. Voice

### Critical open risk: where the voice page runs. Do a 30-minute spike in hour 1
- Chromium has a 2014-era policy that **denies new speech and media-capture sessions from background tabs**. The evidence is old (LOW confidence on current behavior), but if it holds, a voice UI in a normal tab **cannot start recognition while the user is on the form tab**.
- An ARIA live region in a background tab won't be announced by NVDA either (MEDIUM).
- **Spike these cases in order. Pick the first one that works:**
  1. **Voice UI as its own small Chrome app window** (`--app=http://localhost:8787`), visible next to the form window. Trigger `recognition.start()` from a uiohook global hotkey relayed over `/ui` while the *form* window has focus. A visible but unfocused window isn't a background tab, so this likely works. It must not be minimized or fully covered, because Chrome on Windows treats occluded windows as hidden.
  2. **The voice window holds focus.** The user talks to Blip in its window (in-page Space hold = push-to-talk, which always works), and Blip drives the form tab remotely over CDP, with `Emulation.setFocusEmulationEnabled`. NVDA speech then comes from `speakText`, not from the page.
  3. **Extension side panel** hosts the recognition code, granting mic permission once from an extension tab page. It's always visible beside the form tab. This costs more work and moves voice code into the extension.
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
  - Download `nvda_2026.2_controllerClient.zip` from https://download.nvaccess.org/releases/stable/ and vendor the **x64** `nvdaControllerClient.dll`. The DLL must match Node's architecture. It's LGPL-2.1, so redistribution is fine.
  - Exports: `nvdaController_testIfRunning()`, `nvdaController_speakText(const wchar_t*)`, `nvdaController_cancelSpeech()`, `nvdaController_brailleMessage(const wchar_t*)`, and `nvdaController_speakSsml(...)` (NVDA 2024.1+). `nvdaController_isSpeaking` needs NVDA 2026.3 or later. All return 0 on success, or a Win32 error code; 1717 means NVDA is too old.
  - Koffi 3.3.3 loaded from prebuilt binaries with no compiler and called a UTF-16 Win32 function on this machine. Declaration: `lib.func("uint32_t __stdcall nvdaController_speakText(const char16_t *text)")`.
  - Speech goes through the user's own NVDA voice and rate, works no matter which window is focused, supports `cancelSpeech` for "stop", and avoids two voices talking at once.
  - Call `testIfRunning` at startup and fall back to agent-voice mode if it fails.
- **Agent voice mode:** `speechSynthesis` in the voice page. Pick a local `Microsoft *` voice; Google network voices have a long-standing cut-off on long utterances, so speak sentence by sentence anyway. Chrome requires a user activation before the first `speak()`, so add a "Press Space to start Blip" gate on page load (MEDIUM).
- **Fallback TTS from Node:** one persistent `powershell.exe` child running `System.Speech.Synthesis.SpeechSynthesizer` and reading lines from stdin. Use it only if the voice page can't speak from where it runs. Don't use the `say` npm package (0.16.0): it spawns PowerShell per utterance, which adds hundreds of milliseconds.
- **ARIA live region:** limited. It's announced only when its document is the active tab and the region existed before its content changed, and NVDA often drops the first update or updates that coincide with focus changes. Use it only for the sighted and typed-fallback UI log, not as the primary NVDA path. Injecting a live region into the *form page* through the content script would work in the foreground, but it pollutes the page and NVDA's browse-mode buffer, so treat it as a last resort.

---

## 6. Repo structure and shared protocol

**Use npm workspaces.** npm 11 is already installed on Windows and pnpm isn't. Corepack is being phased out of Node, and pnpm's symlink layout adds nothing for three packages. Confidence: HIGH.

```
blip/
  package.json            { "private": true, "workspaces": ["packages/*", "apps/*"], "type": "module" }
  tsconfig.base.json      strict, module/moduleResolution "bundler" (Vite/WXT) / "nodenext" (server)
  packages/
    protocol/             @blip/protocol: zod schemas + inferred types for /ext and /ui messages
      package.json        { "name": "@blip/protocol", "exports": { ".": "./src/index.ts" } }  // TS source, no build step
      src/ext.ts          Snapshot, ActRequest/ActResult, PageEvent, Hello{role,version}
      src/ui.ts           Utterance{source:"voice"|"typed"}, Speak{text,priority,interrupt}, Mode, ConfirmPrompt, Status
      src/index.ts        discriminated unions: z.discriminatedUnion("type", [...]) + envelope {id, type, ts}
  apps/
    server/   (Person A core; Person B owns src/voice/*)  Agent SDK, tools, policy gate, ws hub, sirv, uiohook, NVDA bridge
      src/voice/nvda.ts   koffi bridge (Person B)
      vendor/nvda/x64/nvdaControllerClient.dll
    extension/ (Person A)  WXT: entrypoints/background.ts (ws + CDP), entrypoints/content.ts (mutations, highlight)
    voice/     (Person B)  Vite vanilla-TS: PTT UI, STT, speechSynthesis, transcript log, typed input
  scripts/start.ts        one-command demo launcher
  fixtures/forms/         broken test form + prompt-injection page (served by the server at /fixtures)
  profile.json            local plaintext demo profile (gitignored real one, committed example)
```

- One `@blip/protocol` package, imported by all three apps, is the executable version of `PROTOCOL.md`. Both sides `parse()` every inbound message, so a contract drift fails loudly at the boundary.
- Vite, WXT and tsx all transpile workspace TS source directly, so the protocol package needs no build step.
- Use **zod 4** everywhere, matching the Agent SDK peer. If the extension bundle size matters, `zod/mini` is available, but it isn't needed.

---

## Installation

```bash
# root
npm init -y && npm pkg set private=true type=module
npm pkg set workspaces[0]="packages/*" workspaces[1]="apps/*"
npm i -D typescript@~6.0.3 tsx@^4.23 concurrently@^10 @types/node@^24 @biomejs/biome@^2.5

# packages/protocol
npm i zod@^4.6 -w @blip/protocol

# apps/server
npm i @anthropic-ai/claude-agent-sdk@0.3.301 @modelcontextprotocol/sdk@^1.32 @anthropic-ai/sdk zod@^4.6 \
      ws@^8.22 sirv@^3 koffi@^3.3 uiohook-napi@^1.5 -w apps/server
npm i -D @types/ws -w apps/server
# DO NOT install with --omit=optional: it drops @anthropic-ai/claude-agent-sdk-win32-x64 (the bundled CLI)

# apps/extension
npm i -D wxt@^0.21.4 vite@^8 -w apps/extension
npm i dom-accessibility-api@^0.7 -w apps/extension          # fallback name computation

# apps/voice
npm i -D vite@^8 @types/dom-speech-recognition -w apps/voice

# test the policy gate (deterministic code deserves tests even in a hackathon)
npm i -D vitest@^5 -w apps/server
```

---

## Alternatives Considered

| Recommended | Alternative | When to use the alternative |
|---|---|---|
| Agent SDK `query()` + `createSdkMcpServer` | `claude -p --input-format stream-json --output-format stream-json` with a stdio/HTTP MCP server | Never for this project. Only for a non-JS host. |
| In-process SDK MCP tools | `@modelcontextprotocol/sdk` v1 `McpServer` over Streamable HTTP | To debug the tools from MCP Inspector or the stock CLI |
| One long-lived Haiku session plus a prewarmed Sonnet schema session | One Sonnet session for everything | When Haiku misparses intents too often. It costs roughly +1 s per turn. |
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
| `permissionMode: "bypassPermissions"` | `allowedTools` doesn't constrain it, so every tool gets approved | `tools: []` + `allowedTools: ["mcp__blip__*"]` + `permissionMode: "dontAsk"` |
| `disallowedTools: ["*"]` to kill built-ins | `*` also matches and removes your MCP tools | `tools: []` |
| Default `settingSources` (all sources) | Loads the developer's `~/.claude` settings, hooks, CLAUDE.md, skills and plugins into an agent that reads untrusted pages | `settingSources: []` + `strictMcpConfig: true` |
| Leaving `ANTHROPIC_API_KEY` in the env | Outranks the subscription login in `-p`/SDK mode, so usage bills to the API key | Delete it from `options.env` |
| Single-message `query()` per utterance | Respawns the process (~1–1.6 s) and loses conversation context each time | Streaming input from an async queue |
| A blocking `ask_user` tool that waits for speech | Hits the MCP tool timeout, and the model ends up driving the confirm flow | End the turn with the question; deterministic code awaits the phrase |
| Raw full AX tree as a tool result | Results over 25k tokens are written to a file the model can't read (Read is disabled) | Trimmed form model, a few KB |
| `--load-extension` in the launcher | Removed from branded Chrome since 137 | Load unpacked once into a dedicated `--user-data-dir` profile |
| `SpeechRecognition.continuous = true` | Silent drops, `no-speech`/`network` errors, duplicate sessions on restart | One `start()`/`stop()` per PTT press |
| STT in an offscreen document | No evidence Web Speech works in hidden documents | A visible voice window or the side panel |
| `say` npm package | Spawns PowerShell per utterance (slow) | `speechSynthesis`, or a persistent PowerShell child |
| `@modelcontextprotocol/server` v2 packages | The Agent SDK peers on `@modelcontextprotocol/sdk` ^1.29 | The v1 SDK (types only) |
| Plasmo | Parcel-based and partially maintained | WXT |
| Unauthenticated `ws://localhost` | Any website can connect to localhost sockets | Check the `Origin` header; bind to 127.0.0.1 |

## Stack Patterns by Variant

**If the spike shows recognition works from a visible but unfocused app window:**
- Use the voice app window docked beside the form window, with the global uiohook PTT, and NVDA stays on the form.
- This is the best demo: the user stays in the real page while NVDA and Blip cooperate.

**If recognition only works in the focused page:**
- The user stays in Blip's window and uses in-page Space-hold PTT. Blip drives the form tab over CDP with focus emulation.
- Use the NVDA `speakText` path for all output, and offer "switch to page" (`Page.bringToFront`) for manual verification.

**If NVDA isn't running (`testIfRunning` ≠ 0):**
- Switch automatically to agent voice mode (`speechSynthesis`) and say so.

**If `chrome.debugger` gets detached or blocked (infobar Cancel, DevTools open, enterprise policy):**
- Fall back to content-script snapshot (`dom-accessibility-api`) and synthetic-event actions, and announce "reduced accuracy mode".

## Version Compatibility

| Package | Compatible with | Notes |
|---|---|---|
| @anthropic-ai/claude-agent-sdk@0.3.301 | zod ^4.0.0, @modelcontextprotocol/sdk ^1.29.0, @anthropic-ai/sdk >=0.93.0 (peers); Node >=18 | Bundles Claude Code 2.1.301 as an optional dependency `-win32-x64`. Pin the exact version; it releases almost daily. |
| wxt@0.21.4 | vite ^6.3.4 \|\| ^7 \|\| ^8, typescript >=5.4 | Runner uses web-ext (10.8.0); disable it |
| koffi@3.3.3 | Node 24 win32-x64 (prebuilt) | Verified with `kernel32!lstrlenW(char16_t*)` |
| uiohook-napi@1.5.5 | Node 24 win32-x64 / arm64 (prebuilds) | Verified load |
| nvdaControllerClient.dll (2026.2) | NVDA ≥ 2024.1 for `speakSsml`; ≥ 2026.3 for `isSpeaking` | Use the x64 DLL for 64-bit Node |
| ws@8.22.0 | Node 24 | Chrome ≥ 116 for service-worker WebSocket keepalive |
| typescript@6.0.3 | All of the above | TS 7.0.2 is "latest" on npm, but its programmatic compiler API isn't there until 7.1 |

## Sources

- Live smoke test, this machine, 2026-10-16: SDK 0.3.301, `apiKeySource: "none"`, tools list = `mcp__blip__get_snapshot` only, Haiku 5.5 / Sonnet 5.5 turn latencies (HIGH)
- https://code.claude.com/docs/en/agent-sdk/typescript: `query`, Options (`tools`, `allowedTools`, `disallowedTools`, `strictMcpConfig`, `settingSources`, `persistSession`, `env`, `effort`, `permissionPrompts`), `startup()`/`WarmQuery`/`prewarm()`, `tool()`/`createSdkMcpServer()` signatures (HIGH)
- https://code.claude.com/docs/en/agent-sdk/custom-tools: `tools: []` semantics, `alwaysLoad`, `isError`, annotations (HIGH)
- https://code.claude.com/docs/en/agent-sdk/permissions: evaluation order, `dontAsk`, the `bypassPermissions` warning, `disallowedTools: ["*"]` removes everything (HIGH)
- https://code.claude.com/docs/en/agent-sdk/mcp: connection timing, `mcp__server__tool` naming, the 25k-token output-to-file behavior, timeouts (HIGH)
- https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode: streaming input recommended (HIGH)
- https://code.claude.com/docs/en/agent-sdk/overview: the third-party claude.ai-login restriction and branding rules (HIGH)
- https://code.claude.com/docs/en/legal-and-compliance: OAuth vs API key policy (HIGH)
- https://code.claude.com/docs/en/authentication: credential precedence, Windows credential path, `setup-token` (HIGH)
- https://support.claude.com/articles/15036540: SDK usage still draws on subscription limits; change paused 2026-06-15; Max/Team API credits 2026-10-07 (HIGH)
- https://code.claude.com/docs/en/model-config: aliases → Opus/Sonnet/Haiku 5.5, effort levels (HIGH)
- https://developer.chrome.com/docs/extensions/reference/api/debugger: allowed CDP domains, flat sessions (Chrome 125+), detach reasons (HIGH)
- https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets: Chrome 116+ service-worker WebSocket keepalive every 20 s (HIGH)
- https://developer.chrome.com/docs/extensions/reference/api/commands: global commands, Ctrl+Shift+[0-9], no keyup (HIGH)
- CDP `browser_protocol.json` (ChromeDevTools/devtools-protocol master): Accessibility/Input/Emulation signatures and experimental flags (HIGH)
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY: `--load-extension` removed in branded Chrome 137 (HIGH)
- https://help.httpwatch.com/cancelled_by_user_error.html, https://help.dictanote.co/help/general/hiding-the-voice-in-started-debugging-this-browser-message, https://claudeissues.com/issue/69287-claude-in-chrome-started-debugging-this-browser-banner-shows-on-every-tab-please: `--silent-debugger-extension-api` hides the infobar (MEDIUM)
- https://wxt.dev/guide/essentials/config/browser-startup.html: web-ext runner, disabling it, persistent profile (HIGH)
- https://wxt.dev/guide/resources/compare and https://merginit.com/blog/23082026-plasmo-vs-wxt-vs-crxjs-extension-js: framework landscape (MEDIUM; vendor and opinion sources)
- https://github.com/nvaccess/nvda/blob/master/extras/controllerClient/readme.md, the `example_python.py` in the same repo, and https://download.nvaccess.org/releases/stable/ (`nvda_2026.2_controllerClient.zip`): exports, versions, LGPL (HIGH)
- https://codereview.chromium.org/431433006: Web Speech blocked in background tabs (LOW; 2014, needs a spike)
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally and the "Intent to Ship: On-device Web Speech API" thread on blink-dev: on-device STT (LOW for stable availability)
- https://webaim.org/discussion/mail_message?id=35362: live-region injection caveats (MEDIUM)
- https://braindetox.kr/en/posts/typescript_v7_go_release_2026.html and https://developersdigest.tech/blog/typescript-7-native-compiler-migration-guide: TS 7 has no compiler API until 7.1 (MEDIUM)
- npm registry, 2026-10-16: all version numbers above (HIGH)

---
*Stack research for: voice form-filling agent (Blip)*
*Researched: 2026-10-16*
