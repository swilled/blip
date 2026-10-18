---
phase: 02-fill-and-gated-submit-on-the-broken-form
reviewed: 2026-10-17T18:42:04Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - apps/server/src/voice/dialogue-runner.ts
  - apps/server/src/voice/gate-port.ts
  - apps/voice/src/banner.ts
  - apps/voice/src/main.ts
  - apps/voice/src/stt.ts
  - apps/voice/src/styles.css
  - dev/mock-server/extension/background.js
  - dev/mock-server/extension/content.js
  - dev/mock-server/extension/manifest.json
  - dev/mock-server/src/extension-id.ts
  - dev/mock-server/src/launch-window.ts
  - dev/mock-server/src/reset.ts
  - dev/mock-server/src/run-real.ts
  - dev/mock-server/src/server.ts
  - fixtures/forms/broken.html
  - packages/dialogue/src/confirm.ts
  - packages/dialogue/src/effects.ts
  - packages/dialogue/src/events.ts
  - packages/dialogue/src/fields.ts
  - packages/dialogue/src/index.ts
  - packages/dialogue/src/normalize.ts
  - packages/dialogue/src/read-fill.ts
  - packages/dialogue/src/reduce.ts
  - packages/dialogue/src/state.ts
  - packages/dialogue/src/submit.ts
  - packages/dialogue/src/templates.ts
  - scripts/gen-survey-form-model.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-17T18:42:04Z  
**Depth:** standard  
**Files Reviewed:** 27  
**Status:** clean

## Summary

Re-reviewed the previous reset and direct-run findings and the final IPC shutdown change. PID ownership, history-restore invalidation, readiness identity, direct-run ownership, and Windows cleanup are addressed. The child registers IPC and OS signal handlers before startup awaits and routes them through one idempotent cleanup handler. The focused reset, bridge lifecycle, and run-real tests pass (20 tests), and typecheck passes. No current findings remain.

## Resolved Findings

### CR-01: Reset may kill an unrelated process from a stale PID file — RESOLVED in `e71e783`

**File:** `dev/mock-server/src/reset.ts:63-97,149-164`  
**Evidence:** `.demo-pid` is parsed as a structured record; reset checks that its repository, run token, and `run-real.ts --browser-extension` command line match before killing the PID. The tests cover a valid owned process and an unrelated command line. A stale numeric-only record is ignored.

### CR-02: Browser-history reset can leave stale form values and confirmation state in the server — RESOLVED in `e71e783`

**File:** `dev/mock-server/extension/content.js:212-218,306`; `dev/mock-server/extension/background.js:144-150`  
**Evidence:** The content bridge schedules `page.changed` after `pageshow`, after the page's reset handler runs, and the background listens for completed or URL-changing navigation to the demo page. `bridge-lifecycle.test.ts` covers `pageshow` notification and navigation forwarding. The runner marks the session stale on `page.changed`, invalidating an armed confirmation.

### Prior WR-01: Reset treated any HTTP 200 response on port 7777 as its child server becoming ready — RESOLVED in `e71e783`

**File:** `dev/mock-server/src/reset.ts:107-132,167-190`  
**Evidence:** Reset now requires `.demo-ready` to match the spawned child PID, per-run ID, and repository root before it calls `/healthz`; it also fails when the child exits before readiness. The added tests reject a readiness record from an unrelated service and report early child exit.

### WR-02: Direct `run-real.ts` launches are invisible to reset's ownership checks - RESOLVED in `e1a8d46`

**File:** `dev/mock-server/src/run-real.ts:121-145`  
**Evidence:** An unmanaged entry-point invocation now creates a run ID and re-executes itself with that token and repository root, so its managed child writes the ownership and readiness records reset checks. `run-real.test.ts` verifies the forwarded arguments.

### WR-03: Windows signal forwarding bypasses managed runner cleanup - RESOLVED in `e1a8d46`

**File:** `dev/mock-server/src/run-real.ts:130-135,171-187`  
**Evidence:** The wrapper now sends a shutdown message over an IPC channel instead of calling `child.kill(signal)`. The managed child uses an idempotent shutdown path to stop PTT, close the server, remove only its own markers, and exit. This avoids Node's forceful Windows signal behavior.

### WR-04: Shutdown IPC can be lost during managed-runner startup - RESOLVED in `e1a8d46`

**File:** `dev/mock-server/src/run-real.ts:58-65,173-197`  
**Evidence:** The managed child installs its IPC and OS signal handlers before calling `startReal()` or awaiting any startup work. Both paths invoke the same idempotent shutdown callback. The new `run-real.test.ts` regression test emits an early shutdown IPC message and an OS signal through an event emitter and verifies both reach the cleanup callback. Focused tests and typecheck pass.

All reviewed source files meet quality standards. No issues found.

---

_Reviewed: 2026-10-17T18:42:04Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
