# Project Research Summary

**Project:** Blip — voice form-filling agent for blind users (GatorHacks, 36–48h)
**Domain:** Accessibility / voice agents / browser automation
**Researched:** 2026-10-16
**Confidence:** MEDIUM-HIGH

## Executive Summary

Blip is a trust-first form assistant, not a general browsing agent. Blind users in the OLLA study (arXiv 2609.00524) asked for orientation and "ask before clicking anything important". Blip's two differentiators, which no surveyed competitor claims together: a **repaired form model that discloses when it guessed a label**, and a **submit gate in deterministic code** unlocked only by a distinct spoken phrase.

Architecture: thin MV3 extension ↔ Node server (holds all state, dialogue reducer, policy gate, locked-down Claude) ↔ localhost voice UI, all sharing a zod `@blip/protocol` package. Claude runs via `@anthropic-ai/claude-agent-sdk` 0.3.301 on each developer's own subscription. A live smoke test on Pranav's machine verified the lockdown (`tools: []`, `settingSources: []`, `strictMcpConfig`, `permissionMode: "dontAsk"`, empty cwd, API key stripped), `apiKeySource: "none"` (subscription auth), and Haiku 5.5 turns of 0.7–1.8 s.

Grammar-first, model-last: ~70–80% of commands (including the confirm phrase) are deterministic templates; Claude only does background label repair (cached) and free-form intent parsing.

**Top risks:** (1) speech recognition and ARIA live regions in a background tab (spike hour 1); (2) NVDA output must go through the NVDA Controller Client DLL via koffi; (3) gate bypasses — Enter-to-submit, div buttons, cross-domain links, post-read-back value changes; (4) `~/.claude` config leakage into the agent (GSD hooks, claude.ai connectors, auto memory); (5) subscription quota and live-site fragility on demo day.

## OPEN DECISION (user must decide; record in Phase 0)

**Option A — Intent-as-data (ARCHITECTURE.md).** Stateless structured-output calls with no tools: `repairFormModel(snapshot)` and `parseIntent(utterance, ctx)` via `outputFormat` + a warm `startup()` pool. Deterministic reducer + a single **Executor** choke point holds the gate. The Intent schema has no "confirm" variant.
- Pros: one round trip per utterance; nothing for prompt injection to click; fully testable with fakes; no context growth.
- Cons: `outputFormat` + `startup()` combination unverified; every capability needs an intent + handler; departs from PROJECT.md's MCP-tools decision.

**Option B — In-process MCP tools (STACK.md).** `get_snapshot` / `fill` / `click` / `speak` tools; gate inside the click handler.
- Pros: verified live at 0.7–1.8 s per turn including a tool call; matches PROJECT.md; less code for open-ended requests.
- Cons: multi-field fills chain turns (~3–8 s); context grows; each tool is an injection surface; model drives state; non-`click` paths still need gating.

**Recommendation: Option A by default.** STACK's measurements weaken the latency argument, but security and testability still favor A. Option B becomes an optional stretch "agent mode" whose tools also call the Executor. Either way the gate lives in Executor/policy code. Fallback if `outputFormat` + `startup()` fails: one streaming session per role, JSON-only replies validated with `zod.safeParse`, one retry, still `tools: []`. Update the PROJECT.md Key Decision to "gate in Executor; MCP tools optional and routed through it".

**Smaller conflicts (one pick each):**
- Push-to-talk: uiohook-napi hold-to-talk primary (verified loading on Windows/Node 24); `chrome.commands` toggle (no key-up) as backup.
- Snapshot: content-script DOM walk primary; CDP AX tree / `Input.insertText` as optional enhancement (STACK had CDP primary).
- Port: pick one (8787 vs 7777). Always bind `127.0.0.1`, never `localhost`.
- Integration: walking skeleton by hour 6–8; full end-to-end by hour 12.
- Workspaces: npm (pnpm not installed).

## Key Findings

### Recommended Stack

- Node 24 LTS, npm workspaces, TypeScript 6.0.3 (not 7 — no programmatic compiler API until 7.1), tsx, Vite 8, vitest.
- `@blip/protocol`: zod 4.6 schemas + fixtures, consumed as TS source (no build step).
- Agent: `@anthropic-ai/claude-agent-sdk` 0.3.301 pinned (releases ~daily; don't use `--omit=optional` — the SDK ships its Windows Claude Code binary as an optional dep). `@modelcontextprotocol/sdk` v1 if MCP tools are used.
- Server: `ws` 8.22 with Origin allowlist, `node:http` + `sirv`, bound to 127.0.0.1.
- Extension: WXT 0.21.4 with its browser runner off (fallback: esbuild); `dom-accessibility-api` for accessible names; dedicated Chrome profile; `--silent-debugger-extension-api` to hide the debugger bar (MEDIUM). `--load-extension` was removed from branded Chrome 137 — load unpacked once. Service worker keepalive: WS message every 20 s + `chrome.alarms` reconnect.
- Voice: Web Speech API, one recognition per push-to-talk press (`continuous=false`); `speechSynthesis` with a local Microsoft voice; uiohook-napi 1.5.5 for global hold-to-talk; koffi 3.3.3 + x64 `nvdaControllerClient.dll` (NVDA 2026.2, LGPL) for screen-reader mode.
- **Never:** `bypassPermissions`, `disallowedTools: ["*"]` (also kills custom tools), `--bare` / `CLAUDE_CODE_SIMPLE` (breaks subscription auth), `--load-extension`, `continuous=true`, an SDK `env` that doesn't spread `process.env` (loses login + PATH on Windows).
- **Always:** strip `ANTHROPIC_API_KEY`; set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`; assert the tool list in the `system/init` message and refuse to start if anything extra appears.
- **Terms:** Agent SDK on your own subscription on your own machine is allowed; offering claude.ai login in a product or routing others' usage through Pro/Max is not. Pitch: production uses per-user API keys.

### Expected Features

**Must have (table stakes):**
- "What's here" summary — counts first, templated
- Field enumeration; "go to field X"; "what's required"
- Dictation + profile fill (React-safe setters; profile values mapped by autocomplete token so the model never sees them)
- Select / radio / checkbox with numbered options; "change X to Y"
- Echo of the value read back from the DOM; "spell X"
- Full read-back with missing-required call-outs and sensitive-field masking
- Default-deny gate + distinct phrase + Enter-submit interception
- Result page / per-field error reading
- Sensitive-field handoff (passwords/cards: announce focus, user types)
- Push-to-talk, earcons, filler speech, "stop", typed fallback

**Differentiators:**
- Label repair with "I guessed" disclosure + confidence
- Confirmation bound to a hash of the read-back field values
- Spoken call-out when the page contains injected instructions
- Judge visibility: field highlight, live transcript, "BLOCKED: say 'submit …'" banner
- Then: where-am-I, undo, navigation commands, speech rate control, NVDA mode

**Defer (v2+):** multi-step wizards, custom widget adapters, vision fallback, encrypted vault, on-device STT/TTS, barge-in, user studies.

**Anti-features:** autonomous submit, bare "yes" confirmation, model judging risk, auto-summary on page load, always-on mic, voice entry of passwords/cards, CAPTCHA solving, broad scope.

### Architecture Approach

Pure dialogue reducer (Person B) → effect runner → **Executor** → policy gate → BrowserPort (Person A). The baseline form model is built in code in <10 ms; Claude label patches arrive in the background, cached by origin + path + structural hash, and stale patches are dropped by `snapshotVersion`. The model may only patch labels/title/grouping/error assignment for ids that exist — never kind, value or sensitivity.

**Gate layers:** action kind from fail-closed rules in `packages/policy` (a typeless `<button>` in a form = submit), checked at snapshot time and again on the live element at act time; confirm phrase from a fixed table keyed by kind, never page text; armed only after the read-back's `speak.done`; exact token match on utterances from the voice socket only; single-use grant bound to target + kind + url + values hash + snapshotVersion, 30 s TTL; WebSocket Origin check (any web page can open `ws://127.0.0.1`).

**Mocks so nobody blocks:** `tools/fake-extension`, `--brain=fake`, `tools/repl` (Person A); `dev/mock-server` for the voice UI (Person B).

**Major components:**
1. `packages/protocol` — shared zod schemas + fixtures (only shared code)
2. `apps/extension` — snapshot (DOM walk + optional CDP), act, submit interception, highlight (A)
3. `apps/server` — WS hub, Executor, `packages/policy`, brain (Claude), effect runner (A); `packages/dialogue` reducer + NVDA bridge (B)
4. `apps/voice` — voice UI: PTT, STT, TTS, transcript, BLOCKED banner (B)

### Critical Pitfalls

1. **Config leakage into the agent** — lock the config, empty cwd outside the repo, PreToolUse deny hook, `system/init` tool-list assertion.
2. **Gate bypass** — default-deny; fills never send Enter; capture-phase `submit` interception plus wrapped `form.submit`/`requestSubmit`; re-check the values hash before executing.
3. **Weak confirmation** — exact phrase match, user channel only, half-duplex audio (mic off while Blip speaks, so its own "say 'submit booking'" can't confirm itself).
4. **Background-tab voice** — spike in hours 1–3; NVDA via DLL; typed fallback; popup/app window if the background tab fails.
5. **Quota and latency** — grammar-first, pre-warmed repair cache, Haiku for intents, filler speech; pause GSD sessions before judging; teammate's laptop as hot spare.

Also: injection side channels (hidden fields; model sees profile keys only), tool results >25k tokens saved to a file the model can't read (cap snapshots ~8k tokens), MV3 service-worker suspension, React fills, sensitive data going to Google STT, offline copy of demo sites + phone hotspot + backup video, protocol drift between mocks and real code, GSD file collisions (`setx GSD_WORKSTREAM`, gitignore `.planning/active-workstream`).

## Implications for Roadmap

Phase labels are provisional; the roadmapper renames them.

### Shared P0: Contract + skeleton (hours 0–0.75, both)
**Delivers:** protocol schemas + fixtures, npm workspaces, port choice, GSD env per machine, Open Decision recorded.
**Avoids:** protocol drift, file collisions.

### Core track — Person A (Pranav)
- **C1 Server skeleton + mocks** (h 0.75–2.5)
- **C2 Extension snapshot/act** (h 2.5–7) — MV3 keepalive, React fills, shadow DOM/iframes, Enter-submit interception
- **C3 Policy gate + Executor with adversarial tests** (h 5–9) — milestone: full loop including gated submit on fakes at hour 9
- **C4 Brain** (h 7–11) — locked config, auth preflight, warm pool, structured-output spike, repair cache, watchdog; resolves the Open Decision in code
- **C5 Safety hardening + result reading + injection test page** (h 12–20)

### Voice track — Person B (teammate)
- **V0 Spikes** (h 0–3) — background STT + window layout, background TTS, live region, NVDA DLL via koffi, global PTT (uiohook vs `chrome.commands`)
- **V1 Voice UI shell + I/O** (h 0.75–9)
- **V2 Dialogue reducer** — grammar, read-back, spelling, normalizer, profile map, confirm states, templated safety text, no-forward on sensitive fields
- **V3 Demo forms + fictional profile + reset script** (h 7–11)
- **V4 NVDA screen-reader mode** — route decided by hour 16, no double speech
- **V5 Demo hardening** — two real forms, offline copies, hotspot, backup video by hour 36, timed plan-B rehearsal, pitch wording

### Integration milestones
- **I1** walking skeleton, hours 6–8
- **I2** end-to-end with the gate, ~hour 12
- **I3** real Claude + real form + label repair + injection blocked, ~hour 20
- Feature freeze ~hour 30; tag `demo-safe`

### Phase Ordering Rationale
Mocks first so nobody blocks; gate before brain so everything is demoable without Claude; spikes before the voice UI; hardening and NVDA after integration.

### Research Flags
- **Needs research / spikes:** V0; C4 (`outputFormat` + `startup()`, quota); V4 (NVDA focus vs `speakText` double speech); C2 (silent-debugger flag, Google Forms ARIA widgets, React fill on the real form).
- **Standard patterns:** P0, C1, V1, V2, V3. C3 needs tests, not research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (runtime) / MEDIUM (extension, output) | Agent SDK verified live on this machine |
| Features | MEDIUM | "AriaPilot" could not be found — do not cite it |
| Architecture | MEDIUM-HIGH | Official docs; NVDA/background behaviour unverified |
| Pitfalls | MEDIUM-HIGH | Verified mechanics; voice items flagged as spikes |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address
- The Open Decision (A vs B)
- Background-tab speech recognition
- NVDA DLL end to end (install NVDA on both machines)
- `--silent-debugger-extension-api` on the team's Chrome version
- `processLocally` on-device STT availability (optional)
- Pick two real public forms by hour 11
- Update the PROJECT.md Key Decision after the Open Decision
- Remove/verify the AriaPilot prior-art claim

## Sources

### Primary (HIGH confidence)
- Live Agent SDK smoke test on Pranav's machine (subscription auth, lockdown, latency)
- code.claude.com Agent SDK docs (TypeScript reference, custom tools, permissions, MCP, hooks, structured outputs, streaming input, hosting), headless/CLI docs, legal & compliance
- Claude support article 15036540 (Agent SDK subscription usage, updated 2026-10-07)
- developer.chrome.com: chrome.debugger, service-worker WebSockets, chrome.commands; CDP docs
- NVDA controllerClient readme; W3C WAI Before-and-After Demo; OLLA (arXiv 2609.00524); Diamond Access AI; Claude for Chrome help docs

### Secondary (MEDIUM confidence)
- Community sources for `--silent-debugger-extension-api`, WXT browser startup, React value setter, TetraLogical / WebAIM on live regions

### Tertiary (LOW confidence)
- 2014 Chromium code review on background-tab Web Speech; speechSynthesis 15 s cutoff reports; unofficial NVDA controller mirror

---
*Research completed: 2026-10-16*
*Ready for roadmap: after the Open Decision is settled*
