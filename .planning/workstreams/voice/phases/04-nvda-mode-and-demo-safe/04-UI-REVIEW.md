# Phase 4 — UI Review

**Audited:** 2026-10-17  
**Baseline:** Abstract six-pillar standards, informed by the approved Phase 1 voice-window brand contract (no Phase 4 UI-SPEC exists)  
**Screenshots:** Not captured (no server on localhost:3000, 5173, or 8080)  
**Interaction captures:** off (workflow.ui_interaction_capture is absent from configuration)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Contextual control labels and candid offline copy; the runbook is dense and its core sequence is buried in prose. |
| 2. Visuals | 3/4 | The voice window preserves the established status/caption/log hierarchy, but two new control groups compete for a short 720 px window. |
| 3. Color | 3/4 | Voice-window tokens follow the approved palette; the separate offline page adopts an unrelated light/amber palette. |
| 4. Typography | 3/4 | Voice window matches the four-size/two-weight contract; offline page and runbook introduce separate scales without visual review. |
| 5. Spacing | 2/4 | Voice-window spacing tokens are consistent, but the added controls use height inside a fixed window and have no responsive compaction rule. |
| 6. Experience Design | 2/4 | Mode switching and rate changes are keyboard-accessible in markup, but live regions can double announce in NVDA mode and rate acknowledgements bypass the selected route. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Keep rate acknowledgements on the selected output route** — In NVDA mode the rate buttons and exact spoken commands call browser TTS directly, so Blip voice unexpectedly speaks while the user selected NVDA — route the acknowledgement through the active output controller and preserve rate state without changing NVDA's rate.
2. **Mute or revise the global status live region in NVDA mode** — `#status` remains `aria-live="polite"` while NVDA is selected, despite the brand contract requiring it to be muted to avoid duplicate announcements — toggle its live behavior with the mode and verify with NVDA on the demo workstation.
3. **Protect the conversation area at the demo window size** — The output-mode group and rate group add two wrapped groups above the 28 px caption and log in a 100%-height, 360 px-minimum layout — capture and adjust the 420 × 720 and 360 px layouts so the typed command and useful log area remain visible without clipped or crowded controls.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING:** The output choices are explicit (“Blip voice” and “Screen reader (NVDA)”), the rate actions say “Slower”/“Faster,” and the offline page repeatedly identifies itself as a local practice copy. This is appropriate, task-specific copy (`apps/voice/index.html:50`, `fixtures/forms/offline/public-form.html:19`).
- **WARNING:** The runbook truthfully distinguishes the live form from the offline copy and leaves all live/device evidence pending (`04-DEMO-RUNBOOK.md:3`). Its seven-step rehearsal plus dense fallback/evidence tables make the next action hard to locate while presenting; extract a short at-a-glance sequence and keep the evidence ledger as reference.

### Pillar 2: Visuals (3/4)

- **WARNING:** The voice window keeps its primary status, caption, log, and typed-entry structure, while the output and rate controls are inserted before the caption and consume meaningful vertical area (`apps/voice/index.html:50`, `apps/voice/src/styles.css:98`). With `#app` fixed to `height: 100%`, this threatens hierarchy and log visibility at the 420 × 720 demo size. Screenshots were unavailable, so actual clipping is unverified.
- **WARNING:** The offline form has semantic headings and a prominent offline banner but uses a generic browser-form appearance rather than the dark Blip visual system (`fixtures/forms/offline/public-form.html:8`). It works as a disclosed fallback, but could be visually mistaken for a production form during a rushed demo; retain the banner and strengthen its visual distinction as a local mock.

### Pillar 3: Color (3/4)

- **WARNING:** The voice stylesheet uses the established dark palette tokens (`#0b0f14`, `#1b2430`, `#ffd60a`, `#ff6b6b`, `#f5f7fa`, `#b8c2cc`) and reserves accent for focus/listening/CTA/speaker tag (`apps/voice/src/styles.css:1`, `apps/voice/src/styles.css:126`). This aligns with the brand contract.
- **WARNING:** The offline page uses a separate light background and amber warning (`#f5f7f9`, `#fff2d7`, `#945900`) (`fixtures/forms/offline/public-form.html:8`). The deviation is defensible for fallback distinction, but no rendered contrast or 60/30/10 balance was measured. No screenshot or contrast computation was available; verify the text and status-border contrast before relying on it in the demo.

### Pillar 4: Typography (3/4)

- **WARNING:** The voice window uses the Phase 1 system font and declared 18, 14, 24, and 28 px sizes with 400/600 weights (`apps/voice/src/styles.css:17`, `apps/voice/src/styles.css:30`, `apps/voice/src/styles.css:259`). The new rate controls inherit 18 px body text.
- **WARNING:** The offline page inherits `1rem` body text but has no size/weight hierarchy beyond a bold offline notice; the runbook is long and table-heavy. This is adequate in source form, but presentation/readability at the demo screen size remains unverified. Give the offline form clear field-group hierarchy and an at-a-glance runbook summary.

### Pillar 5: Spacing (2/4)

- **WARNING:** The voice window defines the 4/8/16/24/32/48 px spacing scale and uses tokens through the mode/rate controls (`apps/voice/src/styles.css:9`, `apps/voice/src/styles.css:196`). No arbitrary layout spacing is visible in those controls.
- **WARNING:** The controls add two wrapped fieldsets and full-width helper/status text ahead of the caption. `#app` remains a fixed-height flex column with 16 px gaps and no compact breakpoint (`apps/voice/src/styles.css:98`, `apps/voice/src/styles.css:196`, `apps/voice/src/styles.css:230`). At 360 px width or high zoom this can squeeze the log/caption and crowd input controls. No responsive capture was available; test 360/420 px widths and 200% zoom, then compact or collapse low-priority helpers while preserving visible labels and focus targets.
- **WARNING:** Offline form controls have 44 px minimum height (`2.75rem`), below the voice-window brand target of 48 px (`fixtures/forms/offline/public-form.html:13`). Raise them to at least 48 px for consistent touch access.

### Pillar 6: Experience Design (2/4)

- **WARNING:** The native radio fieldset, explicit labels, help text, status text, and focus-visible outline provide a reasonable keyboard path; the offline page uses labeled fields and polite result feedback (`apps/voice/index.html:50`, `apps/voice/src/styles.css:40`, `fixtures/forms/offline/public-form.html:19`).
- **WARNING:** `#status` is permanently `role="status" aria-live="polite"` (`apps/voice/index.html:18`); mode switching does not update its announcement behavior (`apps/voice/src/main.ts:244`). This conflicts with the Phase 1 accessibility contract that status announcements be muted in screen-reader mode. Make live-region behavior mode-aware and test actual announcements with NVDA.
- **WARNING:** Both exact “faster/slower” commands and the rate buttons call `tts.speak(...)` directly (`apps/voice/src/main.ts:223`, `apps/voice/src/main.ts:233`). When screen-reader mode is selected this sends the acknowledgement through browser speech instead of the selected route, contrary to the plan's selected-route requirement; send it through the active route with matching completion handling.
- **WARNING:** The fallback controls are present, but meaningful NVDA audible completion/cancellation, three live-form runs, hotspot behavior, and the three-minute recording are still marked pending in the runbook (`04-DEMO-RUNBOOK.md:67`). These are live-browser and assistive-technology judgments and remain unverified by this audit; do not treat source or unit coverage as proof of an accessible demo.

---

## Files Audited

- `apps/voice/index.html`
- `apps/voice/src/main.ts`
- `apps/voice/src/output-mode.ts`
- `apps/voice/src/speech-rate.ts`
- `apps/voice/src/styles.css`
- `apps/voice/src/ui-log.ts`
- `apps/voice/src/tts.ts`
- `apps/server/src/voice/nvda.ts`
- `apps/server/src/voice/speech-routing.ts`
- `fixtures/forms/offline/public-form.html`
- `.planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-DEMO-RUNBOOK.md`
- `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/01-UI-SPEC.md` (brand baseline)
- Phase 4 plans, summaries, and context
