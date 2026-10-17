# Walking Skeleton — Blip (voice workstream)

**Phase:** 1
**Generated:** 2026-10-16 (revised against the frozen v1 protocol on disk)

## Capability Proven End-to-End

A user can open the Blip popup window beside a form, type (or hold Right Ctrl + Space and say) "what's here", and both see and hear Blip's counts-first reply ("<title>. N fields, R required, A actions.", e.g. "Customer survey. N fields, R required, A actions.") produced by the dialogue reducer through the loopback WebSocket `ws://127.0.0.1:7777/ws` (the mock server first, core's real server at I1). The reply wording is identical to core's `describeReply` in `apps/server/src/reply.ts`, so I1 passes whichever side produces it.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Voice UI | Vite vanilla TypeScript app in `apps/voice`, plain CSS, semantic HTML, built to `apps/voice/dist` | CLAUDE.md stack; UI contract in 01-UI-SPEC.md; no framework needed |
| Window | Separate Chrome `--app` popup at `http://127.0.0.1:7777/` in the dedicated `.chrome-profile`, pinned topmost with Win32 `SetWindowPos` via koffi (fallback: docked beside the form) | D-01; Chrome has no always-on-top flag; core's `rolesForOrigin` grants voice only to `http://127.0.0.1:<port>` (localhost only under `--dev`); confirmed or reversed by spike E |
| Transport | One endpoint `ws://127.0.0.1:7777/ws` (`DEFAULT_PORT`, `WS_PATH`, `LOOPBACK_HOST` from `@blip/protocol`); first frame `hello {role:"voice", clientVersion, protocolVersion:1}` within `HELLO_TIMEOUT_MS`, then `welcome`; every frame is an envelope built with `buildFrame` and read with `parseFrame`; window uses `location.host`, so the same build works against mock and real server | Frozen v1 protocol (PROTOCOL.md, `protocol.lock.json`); CLAUDE.md security rules |
| Message types | Always derived from `PayloadOf<"...">`: `utterance {utteranceId,text,source,sttConfidence?,alternatives?}`, `ptt {state:start\|end}`, `speak`, `speak.done {speakId,interrupted}`, `earcon`, `state` (no "thinking" value; window derives Thinking locally and from `busy`), `transcript` | No local copies of payload shapes; contract drift fails in tests |
| Push-to-talk | `uiohook-napi` in the server process; pure `createPttState` (Right Ctrl 3613 + Space 57, either release ends, 10 s watchdog) emitting start/end; fallback `chrome.commands` toggle (core maps `ptt.hotkey`) | D-02; spike D |
| Hold delivery | Frozen `ptt` flows voice to server, so the server-to-window hold needs a new additive message `ptt.hold {state:start\|end}` (server to voice) via a Pranav-approved protocol PR with a `protocol.lock.json` update (PTT_DELIVERY = A). Fallback B: a voice-owned sidecar socket on 127.0.0.1:7778, Origin-checked, no protocol change. The window then reports the hold to the server with the frozen `ptt` message | Closes the missing-direction gap; decided at the M0 sign-off |
| Speech in | `webkitSpeechRecognition`, one `start()` per press, `continuous = false`, best text plus confidence and up to 3 alternatives | CLAUDE.md section 5; spike A |
| Speech out | `speechSynthesis` with a local Microsoft voice, sentence by sentence, onend plus 400 ms tail, timeout fallback; the window sends `speak.done` for every `speak` (completed or interrupted) | CLAUDE.md section 5; spike B; core's GATE-08 needs speak.done |
| Interruption | Barge-in (D-03): PTT hold always cuts speech; voice "stop"/speech-over mode chosen by spike F with a text-overlap echo filter (convenience only). The confirm-phrase guard is core's GATE-08 (server ignores a confirm match while a speak is outstanding and for 1 s after speak.done); the window never matches phrases | Amended VOX-05; safety invariant that code, not the UI, matches confirm phrases |
| Dialogue | Pure `reduce(state, event, ctx) -> { state, effects }` in `packages/dialogue`, grammar first, unmatched text becomes a `parseIntent` effect; types derive from `@blip/protocol` (`FormModel`, `PayloadOf`) | ROADMAP working rules |
| Fixture | `fixtures/forms/broken-form.model.json` generated from core's `broken.snapshot.json` with core's baseline builder, validated by `FormModel.parse`, with a drift test | Hand-written model did not match the real `FormModel` |
| Stand-in server | `dev/mock-server`: `ws` + `node:http` + `sirv`, reuses core's `hostAllowed`/`rolesForOrigin`, speaks hello/welcome and envelopes, calls the real reducer | Voice never waits on core; no re-implemented rules |
| Real-server run | `dev/mock-server/src/run-real.ts`: core's `startServer` + fake extension + window, in one process (no `concurrently`, which mangles flags and orphans processes on Windows) | Cutover without waiting on core editing `scripts/dev.ts` (HO-7) |
| Tests | Root `npx vitest run <path>`; root `vitest.config.ts` projects and `tsconfig.json` include extended additively for `dev/*`, `packages/dialogue`, `apps/voice` (Plan 02) | Pure modules with injected timers and fakes |
| Directory layout | `apps/voice`, `packages/dialogue`, `apps/server/src/voice` (hook, sidecar, pin, NVDA), `dev/mock-server`, `fixtures/forms`, `scripts/spikes` | CLAUDE.md ownership table |

## Stack Touched in Phase 1

- [x] Project scaffold (workspaces incl. `dev/*`, TypeScript, vitest, Vite) — Plan 02
- [x] Routing — the `/ws` WebSocket route and static serving of the window — Plan 05
- [x] Data layer — not applicable; the generated form model fixture stands in for page data — Plan 05
- [x] UI — typed input, live caption, log, status, start gate wired to the socket — Plans 06, 07
- [x] Voice I/O — global PTT, STT, TTS, earcons, barge-in, speak.done — Plans 07, 08, 09
- [x] Local full-stack run command — `npm run dev -w @blip/mock-server` (mock) and `npm run real -w @blip/mock-server` (core's server) — Plan 10
- [x] Real-server cutover — Plan 11

## Out of Scope (Deferred to Later Slices)

- Reading or filling fields, read-back, confirm phrase handling, the BLOCKED banner (Phase 2; the banner slot exists but stays empty)
- Profile fill, spell, change, undo, guessed-label and injection warnings (Phase 3)
- NVDA screen-reader output mode in the product, speech rate control, the real public form, fallback kit (Phase 4); only the NVDA spike runs in Phase 1
- Extension code, protocol schemas, policy gate, GATE-08 implementation (core workstream)

## Subsequent Slice Plan

- Phase 2: dictate and read back on the broken form, then submit only with the distinct phrase and a BLOCKED banner
- Phase 3: profile fill and corrections with real Claude, honest warnings for guessed labels and injected text
- Phase 4: NVDA mode, speech rate, real public form, demo-safe fallback kit
