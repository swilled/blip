---
phase: 04-nvda-mode-and-demo-safe
reviewed: 2026-10-18T03:35:05Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - apps/server/src/voice/nvda.ts
  - apps/server/src/voice/nvda.test.ts
  - apps/server/src/voice/speech-routing.ts
  - apps/voice/src/socket.ts
  - apps/voice/src/socket.test.ts
  - apps/voice/src/output-mode.ts
  - apps/voice/src/output-mode.test.ts
  - apps/voice/src/main.ts
  - apps/voice/index.html
  - apps/voice/src/styles.css
  - apps/voice/src/speech-rate.ts
  - apps/voice/src/speech-rate.test.ts
  - apps/voice/src/tts.ts
  - apps/voice/src/tts.test.ts
  - apps/voice/src/talk-controller.ts
  - apps/voice/src/speech-rate-command.test.ts
  - dev/mock-server/src/run-real.test.ts
  - dev/mock-server/src/demo-runbook.test.ts
  - fixtures/forms/offline/public-form.html
  - fixtures/forms/offline/manifest.json
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-18T03:35:05Z  
**Depth:** standard  
**Files Reviewed:** 20  
**Status:** issues_found

## Summary

Reviewed all 20 scoped Phase 4 voice files, including the integrated speech-routing path and its tests. Two accessibility/output-mode defects allow browser speech and the global status live region to remain active while screen-reader mode is selected. The fixed-height voice layout also lacks a compact path for narrow/high-zoom viewports, and the offline form's controls fall below the project's 48 px target. The planned fail-closed NVDA behavior is correctly implemented: the DLL dispatch result is not treated as completion and the current route reports NVDA unavailable. The provided automated checks passed; live NVDA, live form, venue, recording, and freeze behavior remain human-needed.

## Critical Issues

### CR-01: Rate acknowledgements bypass the selected output mode

**File:** `apps/voice/src/main.ts:223-240`
**Severity:** BLOCKER
**Issue:** Both the spoken exact-rate command handler and the rate buttons enqueue acknowledgements directly with `tts.speak()`. `tts` is the browser speech-synthesis route, and these calls do not check `outputMode.getMode()`. During the interval after a user selects screen-reader mode and before the server's unavailable response forces fallback, a rate action can therefore speak through Blip voice despite the selected route. If NVDA routing becomes available, the same code can also produce concurrent browser and screen-reader output. This violates the Phase 4 single-active-output decision (04-CONTEXT.md D-02) and risks duplicate speech for screen-reader users.
**Fix:** Route acknowledgements through the active output controller and preserve the agent-voice rate for later use. If the selected route cannot provide a safe acknowledgement/completion path, suppress the spoken acknowledgement and expose it as text rather than speaking through browser TTS.

### CR-02: Global status announcements are never muted in screen-reader mode

**File:** `apps/voice/index.html:18`; `apps/voice/src/main.ts:62-69,209-213,244-248`
**Severity:** BLOCKER
**Issue:** `#status` is permanently marked `role="status" aria-live="polite"`, while selecting screen-reader mode only updates the selected radio and its text status. No mode-change code changes the global live-region behavior. Status transitions such as listening, thinking, and speaking can therefore be announced by NVDA while NVDA is already speaking the response. This conflicts with the approved Phase 1 accessibility contract, which explicitly requires muting this status region in screen-reader mode to avoid duplicate speech.
**Fix:** Make `#status` live behavior mode-aware: disable its live announcement when screen-reader mode is selected and restore polite announcements when agent voice is active. Verify the resulting announcements with NVDA on the target workstation.

## Warnings

### WR-01: Voice controls can squeeze the conversation area at the supported minimum viewport

**File:** `apps/voice/src/styles.css:30-37,98-105,196-200,225-257,278-310`
**Severity:** WARNING
**Issue:** The app uses a fixed `height: 100%` flex column with a 360 px minimum width. The two added fieldsets, their full-width help/status rows, and the existing status, caption, and typed form all consume space before the flexible conversation area. There is no compact layout or scroll fallback for the app shell at the minimum width or at 200% zoom. When the available viewport shrinks, the log can be reduced to little or no useful area and narrow viewports can overflow horizontally, contrary to the Phase 1 layout/accessibility contract.
**Fix:** Add a responsive/zoom fallback that preserves visible controls and a usable conversation region, allowing the app to scroll or compact lower-priority helper text. Check the 360 px layout and 200% zoom against the 420 × 720 demo window.

### WR-02: Offline form controls are below the agreed 48 px target

**File:** `fixtures/forms/offline/public-form.html:13`
**Severity:** WARNING
**Issue:** Inputs, selects, and the action button use `min-height: 2.75rem` (44 px at the declared default font size), below the 48 px minimum target in the approved voice-window accessibility contract. The offline practice page is a primary fallback and its controls should remain easy to operate by touch or with limited dexterity.
**Fix:** Raise the minimum control height to at least 3rem (48 px) while retaining responsive width and readable labels.

---

_Reviewed: 2026-10-18T03:35:05Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
