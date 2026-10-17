---
phase: 01-spikes-and-push-to-talk-loop
workstream: voice
verified: 2026-10-16
status: human_needed
score: 5/5 success criteria met in code (SC2 with two NVDA spikes recorded as NOT RUN); 8/8 requirements satisfied or satisfied-with-documented-deviation
re_verification: false
gaps: []
human_verification:
  - test: "Pin re-check: start run-real, click another window, wait 1.5 s"
    expected: "The Blip window returns to the front without taking keyboard focus (fix 2763ee1 + 1.5 s re-pin)"
    why_human: "Window z-order is not testable here; the spike E human run failed before the exact-title fix"
  - test: "NVDA spikes C1 (nvdaController_speakText via koffi) and C2 (live region announced with form tab focused)"
    expected: "Recorded PASS/FAIL in 01-SPIKE-DECISIONS.md"
    why_human: "NVDA is not installed. Roadmap SC2 asks for these answers; they are recorded as NOT RUN with NVDA_ROUTE=agent-voice-only. Phase 4 (VOX-08) owns the real test."
  - test: "Hold-to-listen with a long utterance while the window is fully covered"
    expected: "Recognition returns a result (spike A fully-covered case)"
    why_human: "Spike A covered case is inconclusive; the focused/hidden cases pass"
  - test: "Voice barge-in and headset echo (Spike F)"
    expected: "Only relevant once core merges GATE-08 and GATE_08_PRESENT flips to true"
    why_human: "Echo is real on speakers; headset not tested; depends on core"
---

# Phase 1: Spikes and Push-to-Talk Loop - Verification Report

**Phase goal:** With the form tab focused, the user holds a key, speaks or types a command, and hears Blip answer in its own voice with the transcript on screen; first against the mock server, then the real server at I1.
**Status: human_needed.** No blocking gaps found. Remaining items are human re-checks and out-of-scope-for-now NVDA spikes.

## Independent checks run

| Check | Result |
|---|---|
| `npx vitest run` | 43 files, 583 tests passed |
| `npm run typecheck` | clean (tsc --noEmit, no output) |
| `npm run build -w @blip/voice` | success, 124 modules, dist/index.html + css + js (110 kB) |

## Success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | M0 sign-off; mock server speaks frozen protocol, window runs with no core code | MET (stub rule, not Pranav approval) | M0-SIGNOFF.md lists every message used and checks them against messages.ts; `dev/mock-server/src/server.ts:16-35` imports only `@blip/protocol`, `@blip/dialogue`, and core's read-only `hub/guard`; uses `buildFrame`/`parseFrame`/`canSend` (server.ts:152-176). Approval itself pending (flagged, not a gap). |
| 2 | Spike results written as decisions | MET with open items | 01-SPIKE-DECISIONS.md has LAYOUT, PTT_ROUTE, STT/TTS_UNFOCUSED, PIN_METHOD, NVDA_ROUTE, LIVE_REGION, BARGE_IN_MODE with evidence in spikes/*.md. C1 and C2 (NVDA) are NOT RUN (NVDA not installed); recorded honestly with a default route. Human item. |
| 3 | Hold key with form tab focused, speak, release: transcript shows said + reply; typed gives same reply | MET | Hook `apps/server/src/voice/ptt-hook.ts:38-55` -> sidecar `ptt-sidecar.ts:46-49` -> `hold-client.ts:41-44` -> `talk-controller.ts:139-162` (sendPtt, listening earcon, stt.press) -> `stt.ts` final -> `talk-controller.ts:72-97` sendUtterance + log. Log via `ui-log.ts:63-78`. Typed path `main.ts:214-232` sends `source:"typed"`. Human-confirmed on mock and real server. |
| 4 | Own voice, earcons, "one moment" at ~1.5 s, interrupt by speaking or holding PTT, "stop" cuts off | MET (PTT interrupt; voice barge-in deliberately off) | `tts.ts:38,161-167` ONE_MOMENT_MS=1500 via markSent, cleared by markReplied (speak-bridge.ts:18); earcons listening/thinking/blocked in `earcons.ts:16-19`; hold during speech cancels (`state.ts:49`, `talk-controller.ts:154-157`); stop phrase `talk-controller.ts:74-78`, typed stop `main.ts:219-222`. Server never accepts confirm phrase while speaking depends on core GATE-08 (pending); Phase 1 has no confirm flow. |
| 5 | I1: real server, "what's here" gives counts-first summary | MET | `packages/dialogue/src/reduce.ts:37-43,55-61` ("<title>. N fields, R required, A actions."); parity test in `dev/mock-server/src/run-real.test.ts`; `run-real.ts:26-47` starts core's server with fake extension. Human-confirmed spoken: "Customer survey. 5 fields, 2 required, 2 actions." |

## Requirements

| ID | Status | Evidence |
|---|---|---|
| VOX-01 global PTT while form tab focused | Satisfied | uiohook global hook, keycodes 29/57/3613 only (`ptt-hook.ts:7-9,34-36`); human-confirmed. Runs only in voice's dev runner (`ptt-wire.ts`); core's product launcher must call it (HO-3, pending core). |
| VOX-02 per-press Web Speech STT sent as utterance | Satisfied | `stt.ts:129-133` one `start()` per press, `continuous=false`, never restarted on end; `talk-controller.ts:80-87`. |
| VOX-03 typed command | Satisfied | `main.ts:214-232`; human-confirmed. |
| VOX-04 own voice, earcons, "one moment" | Satisfied | `tts.ts`, `earcons.ts:16-19` (blocked defined; server-triggered), `tts.ts:161-167`. Human-confirmed. |
| VOX-05 (amended) barge-in with confirm guard | Partial (by design) | Interrupt by PTT hold and typed/voice "stop" works. Voice barge-in code exists (`talk-controller.ts:163-168`, echo filter) but `GATE_08_PRESENT=false` forces ptt-only (`config.ts:22,34-39`). Server-side guard not present: `apps/server/src/server.ts:119` `"speak.done": () => {}`. Voice sends speak.done for every speak (`speak-bridge.ts:22-25`). Acceptable for Phase 1 (no confirm flow); MUST be closed before Phase 2 relies on it. |
| VOX-06 "stop" cuts speech | Satisfied | `echo-filter.ts:16-19`, `talk-controller.ts:74-78`, typed `main.ts:219-222`; human-confirmed. |
| VIS-01 live transcript | Satisfied | `ui-log.ts:37-78`, role=log in `index.html:59`, caption in `index.html:50-52`. |
| DLG-01 "what's here" | Satisfied | `reduce.ts:7-17,55-61`, tests in `reduce.test.ts`. |

## Safety invariants

| Invariant | Result | Evidence |
|---|---|---|
| Window never decides a confirm match | OK | No confirm logic in apps/voice/src; `confirm.armed/cleared` ignored (`main.ts:149-151`); comments in `speak-bridge.ts:2`, `talk-controller.ts:2`. |
| Passwords/cards never spoken or logged | OK for Phase 1 | `reduce.ts` speaks only a sanitized title and counts (`reduce.ts:28-43`); no console/log calls in apps/voice/src or apps/server/src/voice (grep clean). |
| Hook interprets only 29/57/3613 | OK | `ptt-hook.ts:34-36`; no other key stored or logged. |
| Page text via textContent only | OK | `ui-log.ts:39,46,56,58,83`; no innerHTML in the log path. |
| Origin 127.0.0.1 only | OK | Sidecar binds 127.0.0.1 and `verifyClient` requires exact Origin (`ptt-sidecar.ts:23-29,39`), rejects inbound messages (line 33), `ptt-wire.ts` passes `http://127.0.0.1:<port>`; hub guard reused by mock. |

## Anti-patterns

No TBD/FIXME/XXX/TODO stubs found in the scanned voice paths; no stubbed handlers. Dev-runner-only wiring of the PTT hook is a documented hand-off (HO-3/HO-7), not a stub in voice code.

## Gaps

None blocking.

## Warnings / hand-offs (not gaps)

1. VOX-05 server guard (GATE-08) and ptt.hold are core-pending; B sidecar is a stub until core's launcher calls `startPttHook` + `startPttSidecar` (HO-3) and serves `apps/voice/dist` (HO-7).
2. Plan 01-01 closed on the stub rule, not Pranav's approval.
3. Spike A hold-to-listen on a fully covered window is unconfirmed; Spike F headset untested.

## Human-needed

See frontmatter: pin re-check, NVDA C1/C2 (Phase 4), covered-window STT, headset/barge-in after GATE-08.
