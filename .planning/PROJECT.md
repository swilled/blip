# Blip

## What This Is

Blip is a voice agent that helps blind users fill out web forms. A local Windows app (voice UI + agent server) talks to a thin Chrome MV3 extension over a localhost WebSocket: the user says what they want, Blip reads the page and describes the form in short spoken sentences, fills fields from dictation or a local profile, reads every value back, and submits only after a distinct spoken confirmation phrase. Built for GatorHacks by two developers in a 36–48 hour window.

## Core Value

A blind user can complete a real web form by voice and trust it: Blip never submits anything without a full read-back and a distinct spoken confirmation phrase, and that gate lives in deterministic code the model cannot bypass.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can ask "what's on this page?" and hear a short spoken summary of the form (title, step, field count, required fields)
- [ ] Blip builds a repaired form model from the accessibility tree + DOM heuristics, inferring labels for unlabeled fields and saying when it guessed
- [ ] User can dictate values for fields and hear each value echoed back (spelled on request)
- [ ] User can say "fill from my profile" and Blip fills matching fields from a local profile (autocomplete-token mapped)
- [ ] User can say "read back" and hear every field and value grouped, with empty required fields called out
- [ ] Submit / pay / delete / send / cross-domain navigation are hard-blocked by a policy gate until the user speaks a distinct phrase (e.g. "submit booking"), never a bare "yes"
- [ ] After submit, Blip reads the result page: confirmation or each error tied to its field
- [ ] Page content is treated as untrusted data; a seeded prompt-injection page cannot trigger a gated action
- [ ] Push-to-talk input (global hotkey) with typed-text fallback everywhere voice works
- [ ] Output works alongside NVDA on Windows (screen-reader mode) and with Blip's own voice (agent voice mode)
- [ ] Demo works on at least one real public form and one deliberately broken (inaccessible) test form
- [ ] One-command startup for the local app; extension connects automatically

### Out of Scope

- User studies with blind participants — no time in 36–48h; mention as roadmap in pitch
- FormBench (150–200 form benchmark) — replaced by a handful of hand-picked demo/test forms
- On-device STT/TTS models (Moonshine, Whisper, Kokoro) — heavy setup and VRAM; use Web Speech API / OS speech first
- Pipecat cascaded voice pipeline, barge-in with smart turn detection — too much for the timebox; push-to-talk avoids it
- Vision fallback (screenshot → vision model for unresolved fields) — stretch only if core works early
- Widget adapters for custom date pickers / comboboxes — stretch
- Encrypted profile vault — demo uses a local plaintext profile file; note as production requirement
- Passwords and card numbers — never handled; Blip announces the field is focused and the user types
- CAPTCHA solving — explicitly never; tell user / offer audio CAPTCHA
- Chrome Web Store release, Edge/Firefox ports, mobile — post-hackathon
- Direct Anthropic API usage — team has subscriptions only (see Constraints)

## Context

**Source plan:** Claude Doc "Voice Form Agent for Blind Users — Build Plan" (2026-10-15, Pranav Sivakumar). Full plan is ~8 months for a public release; this project is the hackathon slice of its core loop: read → describe → fill → confirm → submit.

**Problem:** WebAIM Million 2026 found detectable WCAG failures on 95.9% of top home pages (up from 94.8%). Forms are where the inaccessible web hurts blind users most: unlabeled inputs, placeholder-only labels, div buttons, errors shown only by color.

**Prior art (from the doc):** Nanobrowser (Apache-2.0 MV3 agent extension — reference for DOM extraction / actions), AriaPilot (works alongside JAWS/NVDA/VoiceOver), Spectra by Aqta (Gemini Live voice assistant for blind users), Diamond Access AI (July 2026 hackathon project: push-to-talk, summaries, profile fill, confirm-before-submit). Blip's differentiator: the **form model** that repairs what the site got wrong, and the **confirmation protocol** + deterministic policy gate.

**Architecture (decided in planning conversation):**

```
[Voice app: mic, STT, speech out, UI]  <->  [Agent server: Claude Code headless, MCP tools, policy gate]  <-ws->  [Chrome extension: snapshot + act]
```

- **Extension (thin):** `getSnapshot()` (accessibility tree via `chrome.debugger`/CDP + DOM heuristics), `act({type, target, value})` (focus, type, select, check, click), page-change events, field highlight. No AI logic, no credentials.
- **Agent server (TypeScript, Node):** runs Claude via the Claude Agent SDK on the user's Claude subscription login, as pre-warmed, tool-less structured-output calls (`repairFormModel`, `parseIntent`) — **intent-as-data** (decided after research; supersedes the earlier MCP-tools plan). All built-in tools, settings, claude.ai connectors and auto-memory disabled; empty working directory. A deterministic dialogue reducer + single **Executor** carry out every action; the **policy gate** lives in the Executor (and is re-checked in the extension): action `kind` (submit/pay/delete/send/cross-domain) is classified by rules, not the model, and blocked until the voice socket delivers the exact confirm phrase.
- **Voice app:** localhost web UI served by the agent server (Chrome page → Web Speech API for STT, mic permission just works on localhost). Output: Blip's own TTS and/or a screen-reader path for NVDA (ARIA live region; Windows NVDA Controller Client is a candidate — research to confirm).
- **Deterministic work in code, not the model:** read-back loop, confirm flow, fill execution, profile lookups. Model is called for (1) page → form schema (once per page, background) and (2) utterance → intent/field values.

**Interaction design (from the doc):** short sentences; counts before lists; options read in page order with numbers; never describe colors/positions unless asked; say "I don't know" rather than guess; keep a "where am I" (site, step, field). Commands: what's here, read the form, fill from profile, go to field X, change X to Y, spell X, what's required, what went wrong, read back, undo, stop, submit.

**Team / two-machine workflow:**
- **Person A — Pranav (core track, the more complex role):** Chrome extension (snapshot + actions), MCP tool server, policy gate, Claude subprocess management, form-model prompt and label repair, prompt-injection defenses.
- **Person B — teammate (voice track, the simpler role):** voice app UI, push-to-talk, STT, speech output + NVDA path, read-back / confirm-phrase dialogue flow, profile file, demo forms, demo script and polish.
- Shared contract first: `PROTOCOL.md` (WebSocket + tool message schemas), agreed in the first ~30–45 min. Each side builds against mocks of the other (mock agent for voice track; typed-text console for core track) and integrates by ~hour 12.
- GSD runs in **workstreams**: `core` (Pranav) and `voice` (teammate), each with its own ROADMAP/STATE/phases under `.planning/workstreams/`; each machine sets `GSD_WORKSTREAM`. Shared files (`PROJECT.md`, `REQUIREMENTS.md`, `research/`, `config.json`, `PROTOCOL.md`) change rarely and only by agreement.
- Repo: https://github.com/swilled/blip — feature branches per person, merge to `main` small and often; code in separate top-level dirs to avoid conflicts.

**Demo goals (all four):** real-site form fill end to end; broken-form label repair; safety gate blocking an accidental submit and a prompt-injection attempt; live use alongside NVDA.

## Constraints

- **Timeline**: 36–48 hours of build time (GatorHacks) — everything optimizes for a reliable live demo, not completeness
- **Model access**: Claude subscription only, no API key — agent must run through Claude Code headless / Claude Agent SDK on each developer's logged-in subscription; subject to subscription rate limits and Anthropic's terms for subscription auth (fine for personal hackathon use on own machine; do not ship as hosted product)
- **Tech stack**: TypeScript everywhere (extension, agent server, voice app) — one toolchain for both developers
- **Platform**: Both machines Windows; Chrome; demo screen reader is NVDA
- **Latency**: measured Agent SDK turns: Haiku 5.5 0.7–1.8 s, Sonnet 5.5 (low effort) 1.6–2.5 s; keep it low with grammar-first commands, background cached label repair, filler speech ("one moment"), Haiku for intents, snapshots capped ~8k tokens
- **Security**: every page is untrusted input; Claude Code built-in tools must be disabled so prompt injection can't reach a shell or filesystem; passwords/card numbers never sent to the model
- **Collaboration**: two people on separate machines; both have Claude subscriptions and can run the agent locally

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Local app + thin extension over localhost WebSocket (not extension-only) | Cleaner two-person split; avoids Chrome side-panel mic permission issues; keeps Claude process and logic out of MV3 | — Pending |
| Headless Claude via Agent SDK on subscription (not Messages API) | Team has subscriptions only; verified live: `apiKeySource: none`, Haiku turns 0.7–1.8 s | ✓ Good |
| Intent-as-data: Claude gets only tool-less structured-output calls (`repairFormModel`, `parseIntent`); deterministic Executor runs every action (supersedes "MCP tools") | One round trip per utterance; nothing for prompt injection to click; fully testable with a fake brain. MCP-tools agent mode deferred to v2 (AGENT-01), routed through the Executor if built | — Pending |
| All built-in tools, settings, connectors and auto-memory disabled; empty cwd; init tool-list assertion | Pages are untrusted; research found the default SDK config leaks claude.ai connectors and memory | — Pending |
| Policy gate in the Executor + extension (default-deny, kind from fail-closed rules, grant bound to target/kind/URL/values hash, 30 s TTL) | Core value: model cannot bypass the submit gate; Enter-to-submit and div buttons bypass a click-only gate | — Pending |
| Grammar first, model last | ~70–80% of commands (incl. confirm phrase) are code templates; keeps latency and quota down | — Pending |
| Vertical MVP phase structure in each workstream | Always-demoable state; integration milestones at ~h6–8, ~h12, ~h20 | — Pending |
| Distinct confirm phrase ("submit booking"), never bare "yes" | Irreversible actions need deliberate intent (from source plan) | — Pending |
| TypeScript for everything | One toolchain shared by both developers | — Pending |
| Web Speech API + push-to-talk first; on-device models out of scope | Fastest path to working voice in timebox | — Pending |
| GSD workstreams `core` and `voice`, one per developer | Separate STATE/ROADMAP per machine avoids planning merge conflicts | — Pending |
| Project and agent named "Blip" | Humanizes the agent | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-16 after initialization*
