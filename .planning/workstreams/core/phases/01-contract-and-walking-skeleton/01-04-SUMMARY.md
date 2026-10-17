---
phase: 01-contract-and-walking-skeleton
plan: 04
subsystem: server-hub
status: complete
tags: [websocket, ws, origin-guard, role-binding, dns-rebinding, sirv, cli, logging]

requires:
  - phase: 01-contract-and-walking-skeleton (plan 01)
    provides: monorepo, registry-driven protocol (parseFrame, buildFrame, canSend/canReceive)
  - phase: 01-contract-and-walking-skeleton (plan 02)
    provides: full 24-type registry, PROTOCOL.md Origin/Host/close/error tables, EXTENSION_ID
provides:
  - "startServer(options) -> { port, url, httpServer, config, session, hub, close } on 127.0.0.1 only (port 0 for tests)"
  - "Origin + Host + path guarded WebSocket hub: hello state machine, role bound to Origin, per-role permissions from the registry, replacement with identity-checked slots, request/response correlation"
  - "Pure guard functions: hostAllowed, rolesForOrigin, parseAllowedOrigin, devVoiceOrigins"
  - "Payload-free logger (log, setLogSink, sanitize, LOG_KEYS) with no payload field by type"
  - "CLI: --port --dev --brain --fake-delay --allow-origin; optional sirv static roots; GET /healthz"
  - "Real-socket test suite (117 tests in apps/server) including the five D-26 named tests"
affects: [01-05 skeleton (handlers, fake brain, pushState), voice workstream (can retire dev/mock-server), phase 2 extension (Origin must be chrome-extension://EXTENSION_ID)]

actuals:
  tokens: 19500
  tasks: 3
  commits: 4
plan_head_before: f70a445abe0dc53036b75abc6178b5e6f9c178e1
plan_head_after: 0a6b627f1662dec4f71b91f8499e467bd44c5d7c

tech-stack:
  added: []
  patterns:
    - "Guard before handleUpgrade: Host, then path, then Origin; a refused upgrade is answered with a bare HTTP status and no frame is ever read"
    - "Pure policy functions (guard.ts) unit tested without sockets, then covered again end to end over real sockets"
    - "Slot cleared by identity comparison so a replaced socket's late close cannot wipe its successor (Pitfall 10)"
    - "Logger takes a typed field object with no payload member; attacker strings are sanitized and truncated"
    - "Error text built only from failure code, zod issue paths and messages; never input values"

key-files:
  created:
    - apps/server/src/log.ts
    - apps/server/src/hub/guard.ts
    - apps/server/src/hub/hub.ts
    - apps/server/src/hub/static.ts
    - apps/server/src/session/session.ts
    - apps/server/src/server.ts
    - apps/server/src/main.ts
    - apps/server/test/helpers.ts
    - apps/server/test/guard.test.ts
    - apps/server/test/hub.test.ts
    - apps/server/test/security.test.ts
    - apps/server/test/logging.test.ts
    - apps/server/test/static.test.ts
    - apps/server/test/cli.test.ts
  modified:
    - apps/server/package.json

key-decisions:
  - "RunningServer also exposes httpServer (so the bind address is asserted from server.address()) and config (fakeDelayMs, snapshotTimeoutMs, extensionId, dev, brain) for plan 01-05; the plan listed port/url/session/hub/close only"
  - "RunningServer.url is the WebSocket URL ws://127.0.0.1:<port>/ws, matching the CLI listening line"
  - "A role-wrong frame with an invalid payload still answers role-violation (checked before payload errors), so the refusal reason never depends on payload shape"
  - "Hub.request rejects with HubRequestError (code timeout | disconnected | no-connection); messages start with 'request timeout', 'disconnected' and 'no <role> connection'"
  - "Hub also exposes pushState() so plan 01-05 can push session changes without reaching into the connection table"
  - "Binary frames get error code bad-json (fatal) then close 1003, reusing a documented code rather than adding one to the frozen list"
  - "A handler that throws is logged (role, type, id) and does not produce an error frame, to avoid adding an undocumented error code to the frozen contract"

patterns-established:
  - "Test client helper connect({port, origin, headers, path}) with nextMessage(), send(), sendUnchecked(), sendRaw(), hello(), closed; bindClient(port, role, {origin}) consumes welcome (and state for voice)"
  - "Tests start servers on port 0 with real ws clients, short real timeouts and no fake timers; cleanup terminates clients then closes servers"

requirements-completed: [PROT-04]

duration: 45min
completed: 2026-10-16
---

# Phase 1 Plan 04: Loopback hub with origin and role guard Summary

**A 127.0.0.1-only WebSocket hub that refuses hostile Origins and rebound Hosts before reading a frame, binds each connection to the single role its Origin permits, refuses any frame the registry does not let that role send, and logs nothing from payloads.**

## Performance

- **Tasks:** 3 of 3 (tracer, TDD, auto)
- **Commits:** 4 task commits (tracer, RED, GREEN, CLI/static/logging)
- **Verification:** `npm run typecheck` exits 0; `npm test` passes 17 files, 294 tests (117 in apps/server, run three times with no flake)

## Accomplishments

- **Tracer (Task 1):** guarded upgrade to hello to welcome to state over real sockets; evil Origin gets 403; the listener reports 127.0.0.1 and a connection to `::1` is refused; the guard is pure and table tested (hostAllowed, rolesForOrigin, parseAllowedOrigin).
- **Hardening (Task 2, TDD):** tests were written first and failed (39 failures), then the hub was built to pass them.
  - Hello state machine: 2 s timeout gives `hello-timeout` + close 4001; non-hello first frame `hello-required`, bad JSON `bad-json`, protocolVersion 2 `invalid-payload`, all with close 4002; role not permitted by Origin gives `role-origin-mismatch` + close 4003 (both directions).
  - Per-role permissions come from the registry (`canSend`): utterance, speak.done, ptt, settings, control from the extension and snapshot.result, act.result, page.changed, ping, ptt.hotkey from voice get `role-violation`; spy handlers are asserted never called. This is the property Phase 3's confirm-phrase matching rests on.
  - Malformed input (bad JSON, bad envelope with replyTo, unknown type, invalid payload) gives non-fatal errors and the connection survives; a rejected-value sentinel never appears in an error frame; binary frames close 1003; an oversized frame closes 1009 and a fresh connection still works.
  - Replacement: same-role newcomer replaces the old connection (old gets `replaced` + 4004); the old socket's late close does not clear the slot, `extensionConnected` stays true and voice sees it; closing the only extension flips it false and voice receives that state.
  - Request/response: `hub.request` resolves on a matching replyTo, rejects on timeout, on disconnect and when the role is absent; a wrong-type reply gets `unexpected-reply` and the request stays pending; unsolicited snapshot.result or act.result gets `unexpected-reply`; unhandled allowed types get `not-implemented` with replyTo; extension ping gets pong.
- **CLI, static and logging (Task 3):** `main.ts` uses `parseArgs`, prints exactly one `listening on ws://127.0.0.1:<port>/ws (brain=<brain>, dev=<bool>)` line, exits 2 for `--brain=claude`, unknown flags, bad numbers, `--allow-origin` without `--dev` and non-loopback origins, exits 1 on EADDRINUSE, handles SIGINT. Static roots (voice dist at `/`, fixtures at `/fixtures/forms`) are added only when the directories exist, via sirv, behind the Host check, with `/healthz` ahead of them. Traversal attempts (plain, encoded, backslash) never return an outside file. The logging test places `SENTINEL-NAME-7731` in a snapshot text field and `SENTINEL-CARD-9042` in a rejected sensitive value, drives five failure paths, and asserts neither appears in any captured log line or any frame either client received; every log key is in the allowed set.

## Task Commits

1. Task 1 tracer: `5a87737` feat(01-04): tracer - guarded upgrade to hello to welcome to state over real sockets
2. Task 2 RED: `a4eadc9` test(01-04): failing tests for role binding, permissions, hello machine, malformed frames, replacement and request correlation
3. Task 2 GREEN: `2198d70` feat(01-04): harden hub - role binding, per-role permissions, hello machine, replacement, request correlation
4. Task 3: `0a6b627` feat(01-04): CLI flags, optional static serving and payload-free logging proof

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was branched before plans 01-01 and 01-02**
- **Found during:** startup (no PROTOCOL.md or packages/protocol/src)
- **Fix:** `git merge --ff-only main` on the worktree branch, then `npm install`
- **Commit:** none (fast-forward)

**2. [Rule 1 - Bug] Control characters stripped by the file writer in the sanitizer regex**
- **Found during:** Task 1 typecheck (TS1161 unterminated regex)
- **Issue:** a literal U+2028/U+2029 in the regex source broke parsing
- **Fix:** use Unicode property escapes `[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]` instead of literal characters; tested in logging.test.ts
- **Commit:** 5a87737

**3. [Rule 1 - Bug] Test assumed the next voice frame was the error**
- **Found during:** Task 3 (logging test)
- **Issue:** the voice client also receives a `state` push when the extension binds, so `nextMessage()` returned state
- **Fix:** the test skips state frames with a `nextError` helper; the hub behavior is correct
- **Commit:** 0a6b627

### Notes (not deviations)

- `RunningServer` gained `httpServer` and `config`, and `Hub` gained `pushState()`; additive, needed for the bind-address assertion and plan 01-05.
- Test timing for the request errors: the first GREEN run failed two assertions on error message wording (`timeout`, `disconnect`); messages were adjusted to start with those words. No behavior change.
- The plan's `files_modified` lists `apps/server/package.json` only for the `start` script; done.

**Total deviations:** 3 auto-fixed, no scope creep.

## Issues Encountered

None blocking. No auth gates. No package installs (ws 8.22.0 and sirv 3.0.2 were approved at the plan 01-01 gate).

## Known Stubs

None. `--fake-delay` is parsed and stored in `RunningServer.config.fakeDelayMs` but has no behavior until plan 01-05 (documented in the plan). `snapshotTimeoutMs` is likewise stored for plan 01-05.

## Threat Flags

None. The surface added is the one the plan's threat model covers (T-01-16 to T-01-25). Residual risk accepted per T-01-21: any local process may connect without an Origin only when the server runs with `--dev`.

## Follow-ups for other plans and the voice developer

- Real Chrome extension service workers are assumed to send `Origin: chrome-extension://<id>` (research A3); the hub logs rejected origins verbatim (sanitized) so Phase 2 can see a mismatch immediately.
- Handler exceptions currently produce a log line only (no error frame) to keep the frozen error-code list unchanged. If the voice UI wants an `internal-error` frame, that is a PROTOCOL.md change for M0.
- The voice developer can point their UI at `ws://127.0.0.1:7777/ws` (served from `http://127.0.0.1:7777`), or run Vite on `localhost:5173` against a server started with `--dev`.

## Self-Check: PASSED

- FOUND files: apps/server/src/{log,server,main}.ts, apps/server/src/hub/{guard,hub,static}.ts, apps/server/src/session/session.ts, apps/server/test/{helpers,guard,hub,security,logging,static,cli}.test.ts
- FOUND commits: 5a87737, a4eadc9, 2198d70, 0a6b627
- `npm run typecheck` exit 0; `npm test` 17 files, 294 tests pass
