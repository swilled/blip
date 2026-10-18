---
phase: 4
slug: nvda-mode-and-demo-safe
status: approved
shadcn_initialized: false
preset: none
created: 2026-10-17
---

# Phase 4 — UI Design Contract

> Visual and interaction contract for the existing Blip voice window. Extend the accepted Phase 1 design system; do not redesign it.
> Sources: Phase 1 `01-UI-SPEC.md`; Phase 4 `04-CONTEXT.md` D-01–D-16, `04-RESEARCH.md`, `ROADMAP.md`, and plans 04-01–04-03.

## Design System

| Property | Value |
|----------|-------|
| Tool | none — Vite vanilla TypeScript and plain CSS |
| Preset | not applicable |
| Component library | none — semantic HTML controls |
| Icon library | none — retain the existing inline SVG status shapes |
| Font | `system-ui, "Segoe UI", sans-serif` |

There is no `components.json`, and this voice app is not a React, Next.js, or React-based Vite app. Keep the existing CSS custom properties and native HTML patterns; add no component or icon dependency.

## Window and Layout

- Keep the separate, single-column voice window at the Phase 1 default of 420 × 720 px, with a 360 px minimum width. Reflow without horizontal scrolling at 360–560 px.
- Preserve the existing dark, high-contrast panels and pinned typed-command form. Let the conversation area take the remaining height and scroll; at 200% zoom allow the window/document to scroll vertically rather than clipping controls.
- Add one compact **Speech output** section immediately after the status panel and before the notices/caption. It contains the output-mode radio group, then the agent-voice rate controls and readout. Keep the existing blocked-action banner above the caption.
- When an offline demo copy is explicitly active, show a compact, persistent offline disclosure below the status panel. Keep it separate from the blocked-action banner so both can appear together. Do not infer that the form is offline from the voice-server connection state.
- DOM order remains visual and keyboard order: start gate; header/connection; status; speech-output controls; offline disclosure when active; blocked-action notice when active; caption; conversation log; typed input and Send Command.
- Visual hierarchy: the 28px live caption of the user's current utterance is the primary focal point while the user is speaking. Whenever no current caption is visible, the labeled voice status is primary, including during idle, thinking, speaking, or offline states; mode, rate, and connection details stay secondary.

## Spacing Scale

Declared values (multiples of 4), carried forward from Phase 1:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon and label gaps |
| sm | 8px | Compact control and row gaps |
| md | 16px | Panel padding and section gaps |
| lg | 24px | Conversation-entry gaps |
| xl | 32px | Start-gate padding |
| 2xl | 48px | Minimum control target height |
| 3xl | 64px | Available for major separation; not used in this window |

Exceptions: the existing blocked-action banner reserves 96px when present. The 3px focus outline and 2px outline offset are stroke properties, not layout spacing.

## Typography

Use exactly the existing four sizes and two weights:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body and control text | 18px | 400 | 1.5 |
| Labels, connection, helper text | 14px | 600 | 1.5 |
| Heading and primary status | 24px | 600 | 1.2 |
| Live caption | 28px | 400 | 1.2 |

## Color

Keep the established dark high-contrast palette and approximate 60/30/10 surface balance:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0B0F14` | Window background and input surface |
| Secondary (30%) | `#1B2430` | Status, speech-output, caption, and conversation panels |
| Accent (10%) | `#FFD60A` | Keyboard focus, listening state, Send Command, Blip speaker tag, and the selected output-mode indicator only |
| Destructive/error | `#FF6B6B` | Blocked action and unavailable/error states |
| Primary text | `#F5F7FA` | Body and control text |
| Muted text | `#B8C2CC` | Hints and secondary labels |

Accent reserved for: visible focus rings; listening state; Send Command; the Blip speaker tag; and the selected output-mode indicator. Do not use it for every button or as body text. Every state also has a text label and must not rely on color alone.

## Interaction Contract

### Session output mode

- Render a native `<fieldset>` and `<legend>Speech output</legend>` with exactly two labeled radio choices: **Agent voice** and **Screen reader (NVDA)**. Start every new voice session with Agent voice selected. Keep the choice in memory for that session only; do not persist it across reloads or sessions.
- Keep both choices keyboard operable with the existing focus treatment. Selecting a new mode must not move focus. During a transition, show a concise “Switching speech output…” status and prevent another route change until the old route has been canceled and its tracked speech settled.
- Enforce exclusivity: cancel speech on the old route before sending any new speech to the selected route. Do not render a “both” choice or speak an acknowledgement on both routes.
- If NVDA is unavailable or cannot provide safe completion, return the selected control to Agent voice, show **“NVDA speech is unavailable. Agent voice is on.”**, and announce that fallback once through agent voice. Do not repeat the announcement on subsequent replies in the same session. Keep focus on the mode control; do not expose DLL details or imply that a DLL call return proves speech completed.

### Agent-voice rate

- Provide native **Slower** and **Faster** buttons in the Speech output section and a visible, non-live readout such as **“Speech rate: 1.0× · Agent voice only.”** Each button has a minimum 48px target and an explicit accessible name.
- Match exact normalized “slower” and “faster” voice or typed commands to the same rate changes as the buttons. Change by 0.1 from 1.0, clamp to 0.8–1.5, and show one decimal place in the readout.
- Apply changes to the next agent-voice item. Never restart current speech. Queue a short acknowledgement at the new rate; at a limit say **“Already at the slowest speed.”** or **“Already at the fastest speed.”**
- These controls affect agent voice only. In NVDA mode, keep the rate for a later switch back and never change NVDA's own rate. The readout remains visible and identifies its scope.

### Status, captions, log, and fallback disclosure

- Preserve the labeled status panel and its text-plus-shape states. Keep the current live caption visual-only with `aria-live="off"`; interim recognition must never be announced as a stream.
- Keep each completed conversation exchange as one log insertion and retain the existing typed/speech attribution and interrupted marker. Never append a reply once per output route.
- When Screen reader (NVDA) is selected, set the status and log live announcements off while keeping their content visible and navigable; the tracked NVDA speech item is the reply output. This prevents DOM status/log changes from echoing routed speech. Restore the established polite status/log behavior in Agent voice mode, except for the one-time NVDA-fallback notice, which is announced only by agent voice.
- Show a persistent text disclosure only after switching to a locally served demo copy: **“OFFLINE DEMO — this is a local copy; the live form is unavailable.”** Announce the offline switch once through the currently selected speech output (tracked NVDA route in Screen reader mode, agent voice in Agent voice mode). Keep the visible disclosure non-live so it does not trigger a second announcement. Keep the offline label visible for the duration of that fallback. Do not show this disclosure merely because the Blip server is disconnected.
- Render page validation errors with their observed field labels. Read only the page-observed result; if no confirmation is observed, say **“Success can’t be verified because no confirmation was found.”** Never style or copy a missing result as success.
- Keep the start-gate text **“Press Space to start Blip”**, the “Nothing yet” empty state, and the existing visible typed-input fallback. A clear speech-recognition miss tells the user they can type and keeps typed input on the same command path.

### Focus and keyboard

- Preserve the current start gate: it is the only focusable element before activation. After activation, focus moves to the typed input as in Phase 1.
- Add the mode radios and rate buttons to normal Tab order. Do not add custom keyboard shortcuts, focus traps, or automatic focus movement on mode fallback, rate change, server update, or offline disclosure.
- Keep focus outlines at 3px with a 2px offset. Maintain minimum 48px interactive targets and visible labels at 200% zoom.

## Accessibility Contract

- Use semantic `<header>`, `<main>`, labeled `<section>`, `<fieldset>`, `<legend>`, `<label>`, native radio inputs, buttons, `<form>`, and `<ol>`. Never emulate controls with clickable `<div>` elements.
- Keep `lang="en"`, the page title “Blip,” text connection/status labels, and non-color state indicators.
- In NVDA mode, only the selected NVDA route speaks Blip replies; suppress live caption/status/log duplication while leaving all transcript text available for navigation. Preserve the session's tracked `speakId` and settle each rendered exchange once after completion or cancellation.
- Offline disclosure is both visible and announced once. Do not represent a locally served copy as the live form or claim successful submission without an observed result.
- Honor `prefers-reduced-motion`; only the existing listening pulse may animate, and it stops when reduced motion is requested.

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | “Send Command” |
| Start gate | “Press Space to start Blip” |
| Output choices | “Agent voice”; “Screen reader (NVDA)” |
| Rate readout | “Speech rate: {rate}× · Agent voice only.” |
| Rate limit feedback | “Already at the slowest speed.” / “Already at the fastest speed.” |
| NVDA fallback | “NVDA speech is unavailable. Agent voice is on.” |
| Offline disclosure | “OFFLINE DEMO — this is a local copy; the live form is unavailable.” |
| Empty state heading | “Nothing yet” |
| Empty state body | “Hold Right Ctrl + Space and say what you want, or type it below. Try: what’s here.” |
| Error state | “I didn’t catch that. Hold the keys and try again, or type it.” |
| Destructive confirmation | None added in Phase 4. Preserve the existing submit gate and its exact server-owned confirmation phrase. |

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — vanilla TypeScript app |
| third-party | none | not applicable |

## Verification Boundary

This contract specifies UI behavior; it does not verify live-form completion, NVDA device audibility or completion callbacks, venue connectivity, hotspot behavior, or demo rehearsal. Those remain explicit human-evidence items in the Phase 4 runbook and must not be marked passed from this design spec or automated mock checks.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-17
