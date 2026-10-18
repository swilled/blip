# I1 Hand-offs (voice to core)

Status line: Pranav has not answered the M0 sign-off. origin/main has no new commits, `ptt.hold` is NOT in the protocol registry, and `apps/extension` does not exist yet. Voice proceeds on stubs per the docs/WORK-SPLIT.md 30-minute rule (more than 30 minutes late). Nothing below is an edit to core code; these are requests.

Decisions in force: PTT_DELIVERY = B (sidecar on 127.0.0.1:7778), GATE_08_PRESENT = false (barge-in forced to ptt-only), NVDA route = agent-voice only.

| ID | What | Owner | File to touch | Status | How voice verified |
|----|------|-------|---------------|--------|--------------------|
| HO-1 | Form-tab content script suppresses Space while Ctrl is held (capture phase, keydown and keyup, all frames). Without it Right Ctrl + Space may type a space into a focused field. Likely unnecessary: no space leak was observed in the Plan 10 manual run. | core | apps/extension content script (directory not created yet) | pending | Plan 10 manual run on the mock: no leak reported |
| HO-2 | uiohook-napi and koffi in apps/server/package.json and package-lock.json. Pranav approval not yet given. | core (approve) | apps/server/package.json, package-lock.json | done (edit in 940d424, approval pending) | Hook loads on win32-x64 in the Plan 09 and 10 runs |
| HO-3 | Hold delivery. Under PTT_DELIVERY B (chosen) the hook and sidecar run only in voice's dev runners (`startPttWire` in dev/mock-server). Core's product launcher (`npm start` / `npm run dev`, scripts/dev.ts) must call `startPttHook` + `startPttSidecar` from apps/server/src/voice/, otherwise B stays a dev-only stub. Required under B. If `ptt.hold` is later merged, switch to A: call `hub.send("voice","ptt.hold",{state})` from startPttHook. | core | scripts/dev.ts, apps/server/src/main.ts | stub in use (`npm run real -w @blip/mock-server`) | Plan 09 sidecar tests, Plan 10 manual run |
| HO-4 | "what's here" wording. Core's describeReply (apps/server/src/reply.ts) answers "<title>. N fields, R required, A actions." and voice's reduce emits the identical wording, so I1 passes with no swap. If core changes describeReply, the parity test in dev/mock-server/src/run-real.test.ts fails and names the drift. | voice and core | apps/server/src/reply.ts (no change needed) | done | run-real.test.ts parity test, I1 automated run |
| HO-5 | chrome.commands toggle mapping, only if the PTT route says so. The route is the global hook, so not needed. | core | n/a | not needed (done) | n/a |
| HO-6 | GATE-08 server-side confirm guard: the server ignores a confirm match while a speak is outstanding and for 1 s after speak.done. Voice already sends speak.done for every speak (Plan 07); core's speak.done handler is currently a no-op. Pending until core Phase 3, so Phase 2 must not rely on it before then. Voice's apps/voice/src/config.ts has `GATE_08_PRESENT = false`, which forces the effective barge-in mode to ptt-only regardless of the Spike F BARGE_IN_MODE result. Flipping it to true is a one-line change after core merges GATE-08; barge-in stays off until then. Phase 1 has no confirm flow, so this is a forward guard. No new behavior is requested. | core | apps/server (speak/speak.done handling), GATE-08 in core REQUIREMENTS.md | pending (stub in use: GATE_08_PRESENT = false) | Plan 07 tests send speak.done; config test for the forced mode |
| HO-7 | scripts/dev.ts adds apps/voice/dist as a static root (as apps/server/src/main.ts already does, lines 75-79) so `npm run dev -- --no-repl` serves the window. | core | scripts/dev.ts (startServer call passes no staticRoots) | pending (stub in use: `npm run real -w @blip/mock-server`) | run-real.ts passes staticRoots itself |

## Cutover

Both servers use port 7777, so stop the mock server first. The window URL is http://127.0.0.1:7777/ (core's rolesForOrigin grants voice only to that origin; http://localhost:7777 works only under --dev, which scripts/dev.ts and the voice runner always enable). The port is DEFAULT_PORT 7777. No voice code changes: the same window build connects to ws://127.0.0.1:7777/ws on either server.

Now (HO-7 pending):

    npm run real -w @blip/mock-server

This is voice's in-process runner: core's startServer with dev true and the fake brain, the fake extension (broken fixture), the PTT hook and sidecar, and the window.

After HO-7 is done:

    npm run dev -- --no-repl
    npm run window -w @blip/mock-server

All commands use `npm run` or `node --import tsx`, never `npx` (script execution is blocked in the user's PowerShell).
