---
phase: 04-nvda-mode-and-demo-safe
reviewed: 2026-10-18T07:50:18Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - apps/extension/src/content/act.ts
  - apps/extension/src/content/observer.ts
  - apps/extension/src/content/walk.ts
  - apps/server/src/voice/dialogue-runner.ts
  - apps/server/src/voice/local-whisper.ts
  - apps/server/src/voice/ptt-hook.ts
  - apps/server/src/voice/ptt-sidecar.ts
  - apps/server/src/voice/ptt-state.ts
  - apps/server/src/voice/transcription-http.ts
  - apps/voice/src/earcons.ts
  - apps/voice/src/hold-client.ts
  - apps/voice/src/recorded-stt.ts
  - apps/voice/src/stt.ts
  - packages/dialogue/src/index.ts
  - packages/dialogue/src/live-read.ts
  - packages/dialogue/src/read-fill.ts
  - packages/dialogue/src/templates.ts
  - tools/fake-extension/src/fake-extension.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-18T07:50:18Z  
**Depth:** deep  
**Files Reviewed:** 18  
**Status:** issues_found

## Summary

Reviewed the current dirty Phase 4 implementation, including the live snapshot refresh path, transcription lifecycle, native ARIA radio support, value-change observation, and dialogue read-back changes. One freshness failure can leave the server answering a request for current page state from an older snapshot. The deferred human acceptance checks remain pending and are not treated as passed here.

## Narrative Findings (AI reviewer)

### CR-01: Fresh-page read can fall back to stale form data

**File:** `apps/server/src/voice/dialogue-runner.ts:384-385`  
**Severity:** BLOCKER  
**Issue:** Commands such as “read the form,” “what’s required,” and named field-value questions now force a snapshot refresh, but the result is ignored. If the extension refresher fails while `session.stale` is still false, `currentForm(session)` continues returning the previous model. The command is then reduced against that older page state and can confidently announce an outdated value or required-field status; the same path also covers the `submit` utterance. The refresher branch of `refreshSnapshot` returns false without marking the session stale, so this fallback is reachable.  
**Fix:** For requests matched by `requiresFreshFormSnapshot`, stop and report that the page could not be refreshed when `refreshSnapshot` returns false. Also mark the session stale (or otherwise make `currentForm` return null) on refresher failure so downstream dialogue cannot consume the old snapshot.

---

_Reviewed: 2026-10-18T07:50:18Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_
