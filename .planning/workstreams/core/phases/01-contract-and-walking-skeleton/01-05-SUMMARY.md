---
phase: 01-contract-and-walking-skeleton
plan: 05
subsystem: walking-skeleton
status: complete
tags: [fake-brain, grammar, fake-extension, repl, dev-runner, fail-closed, offline-loop]

requires:
  - phase: 01-contract-and-walking-skeleton (plan 03)
    provides: buildBaselineFormModel, summarizeFormModel, fixtures and fixtures-loader
  - phase: 01-contract-and-walking-skeleton (plan 04)
    provides: startServer, Hub (send/request/pushState), Session, role-bound origin guard
provides:
  - "matchGrammar: deterministic describe, whats_required, read_form, stop, repeat (LocalCommand excludes request_action, click_safe, set_fields by type)"
  - "createFakeBrain: injectable-sleep fake with the 1.5 s model-route delay; request_action only under a test option and never acted on"
  - "reply.ts: describeReply, requiredReply, readFormReply built from labels and counts only"
  - "handleUtterance turn pipeline (transcript, busy state, snapshot fetch, reply, state) plus handlers for speak.done, settings, ptt, control, page.changed"
  - "startFakeExtension: fixture snapshots, in-memory fill/select/check with read-back, sensitive fills refused, every gated or kindless click refused with gate-required"
  - "startRepl: typed voice-role client with /fixture /state /raw /quit and stdin-EOF draining"
  - "scripts/dev.ts behind `npm run dev -- --brain=fake`: server, fake extension and REPL in one process"
affects: [voice workstream (can retire dev/mock-server), phase 2 extension (fake extension is the behavioral reference), phase 3 Executor (act.request path is intentionally absent), phase 4 brain (IntentBrain interface)]

actuals:
  tokens: 22200
  tasks: 3
  commits: 4
plan_head_before: 33e86bb41d311c18d3a1c5ce355fdc25dcb8e380
plan_head_after: 34a01f733287ec7ee16815293fee73d4978564a7

tech-stack:
  added: []
  patterns:
    - "Turns are serialized through a promise chain in startServer; a failed turn is logged by the hub and cannot block the next"
    - "Reply text is a pure function of title, labels and counts, so no field value can reach speech or the REPL by construction"
    - "Stand-ins fail closed: the fake extension refuses any click whose kind is gated, absent or unrecognized, regardless of a gate object in the request"
    - "Integration tests use real sockets on port 0, short real delays and cursor-based frame collection; no fake timers"

key-files:
  created:
    - apps/server/src/brain/grammar.ts
    - apps/server/src/brain/fake-brain.ts
    - apps/server/src/reply.ts
    - apps/server/src/turn.ts
    - tools/fake-extension/src/fake-extension.ts
    - tools/fake-extension/src/main.ts
    - tools/repl/src/repl.ts
    - tools/repl/src/main.ts
    - scripts/dev.ts
    - apps/server/test/grammar.test.ts
    - apps/server/test/reply.test.ts
    - apps/server/test/fake-brain.test.ts
    - apps/server/test/walking-skeleton.test.ts
    - apps/server/test/dev-script.test.ts
    - tools/fake-extension/test/fake-extension.test.ts
    - tools/repl/test/repl.test.ts
  modified:
    - apps/server/src/server.ts
    - apps/server/src/session/session.ts
    - apps/server/src/main.ts
    - apps/server/test/hub.test.ts
    - apps/server/test/logging.test.ts
    - package.json

key-decisions:
  - "Every turn pushes state with busy=true right after the transcript, so a UI sees working state; tests assert order after dropping those busy pushes"
  - "Session.extensionConnected became an accessor: binding an extension (including a replacement) marks the cached model stale, so a reconnect with a different page cannot be described from the old cache"
  - "A cached model is never described while the extension is disconnected; the reply says the page cannot be seen"
  - "stop and repeat (grammar and control) are not queued behind a running turn and do not overwrite lastSpoken; filler is never recorded"
  - "startServer rejects brain claude with a shared constant and BrainUnavailableError; the server CLI and dev runner map it to exit 2"
  - "Fake extension gained version(), received(), sent() and a disabledIds option for tests; additive to the planned API"

patterns-established:
  - "New handlers go in the defaultHandlers map in startServer; a caller-supplied handlers option overrides per type"
  - "Tests that need an unhandled allowed message use ptt.hotkey from the extension (it stays not-implemented until Phase 2)"

requirements-completed: [PROT-02]

duration: 55min
completed: 2026-10-16
---

# Phase 1 Plan 05: Fake brain, fake extension, REPL and dev runner Summary

**One command, `npm run dev -- --brain=fake`, runs the whole loop offline: a typed "what's here" goes REPL to hub to fake extension to baseline form model and comes back as `speak[answer]: Hotel booking. 9 fields, 6 required, 3 actions.`, with stand-ins that provably never open a gate.**

## Performance

- **Tasks:** 3 of 3 (tracer, TDD expansion, dev runner)
- **Commits:** 4 task commits (tracer, RED, GREEN, runner)
- **Verification:** `npm run typecheck` exits 0; `npm test` passes 28 files, 472 tests, three consecutive full runs with no flake

## Accomplishments

- **Tracer (Task 1):** a typed utterance reaches the fake extension through the real hub and returns the exact booking sentence. The tracer gate was an automated-only `<verify>`, so it was re-run end to end (typecheck plus the full suite) before expanding.
- **Expansion (Task 2, TDD):** tests were committed first and failed (28 failures), then the implementation was written to pass them.
  - Grammar: five commands, case and punctuation insensitive, exact-lookup matching (no backtracking regex), hostile 500-character input returns null, `LocalCommand` cannot express request_action, click_safe or set_fields (a `@ts-expect-error` test locks that in).
  - Replies: exact strings for describe, required and read-form on booking and broken; empty label reads "unlabeled field", guessed labels get "probably"; a sentinel value placed on every field never appears in any reply.
  - Model route: transcript (model), earcon thinking, filler "One moment.", delayed answer, state; the integration test asserts order and an elapsed lower bound. Grammar route has no earcon or filler. Identical input gives identical text across turns and across two server instances.
  - Fail closed: with `fakeRequestActionId` set, the server says "I can't do that yet.", the fake extension records zero act.request frames and the voice client never sees confirm.armed. The default brain never requests anything.
  - Fake extension: ordered checks (target-not-found, disabled, sensitive-field, stale-snapshot, kind-mismatch), read-back from the in-memory copy, null observedValue for the card field, gate-required for submit, cross-domain and kindless clicks with no mutation (verified by comparing the element list before and after), including when a `gate` object is supplied.
  - REPL: `/state`, `/fixture` (injected control or an explanatory note), `/raw` (server answers role-violation), `/quit`, over-long and unknown-command handling, and draining of in-flight turns when stdin ends.
- **Dev runner (Task 3):** `scripts/dev.ts` runs server, fake extension and REPL in one process (no concurrently), prints the listening, attached and ready lines, supports `--no-repl`, `--fixture`, `--fake-delay`, `--allow-origin`, `--fake-request-action`, `--help`. `dev-script.test.ts` spawns the real command through a shell and kills the process tree with taskkill; the first case also proves the port is closed after `/quit`.

## Roadmap success criteria to tests

| # | Criterion | Automated evidence |
|---|-----------|--------------------|
| 1 | Protocol, fixtures, Intent has no confirm variant, PROTOCOL.md matches | `packages/protocol/test/{registry,messages,intent,protocol-md,protocol-lock,fixtures}.test.ts`; M0 voice sign-off is still pending (plan 01-03 recorded `M0 approval: pending`) |
| 2 | `npm run dev -- --brain=fake`, "what's here" reply, visible 1.5 s model delay | `apps/server/test/dev-script.test.ts` (first case, exact sentence, exit 0, port closed); `walking-skeleton.test.ts` (tracer, model-route frame order and elapsed lower bound at a configurable delay) |
| 3 | Baseline form model for every fixture under 100 ms | `apps/server/test/baseline.test.ts` |
| 4 | 127.0.0.1 only, ordinary-page Origin rejected, extension-role utterance refused | `apps/server/test/security.test.ts` (the five D-26 tests) |
| 5 | Voice-role client receives welcome then state | `hub.test.ts`, `walking-skeleton.test.ts` ("the voice client receives welcome then state"), `dev-script.test.ts` (`--no-repl` case over the real command). The hookup with the voice developer's real UI is a human check (below). |

## Human check still open (roadmap criterion 5)

Run `npm run dev -- --brain=fake --no-repl`, point the voice UI at `ws://127.0.0.1:7777/ws` from its served origin (the default Vite dev origins are accepted under the dev runner; otherwise pass `--allow-origin <origin>`), confirm it connects as voice and receives welcome then state, then type "what's here" in the UI and confirm a spoken reply arrives. After that the voice track can retire `dev/mock-server`. Not run here: the voice UI does not exist in this worktree.

## Task Commits

1. Task 1 tracer: `88db216` feat(01-05): tracer - what's here from REPL through hub and fake extension to a spoken-style reply
2. Task 2 RED: `0c5afb5` test(01-05): failing tests for grammar, replies, fake brain, fake extension acts, REPL and skeleton turns
3. Task 2 GREEN: `a979816` feat(01-05): full grammar, fake brain with model-route delay, fail-closed fake extension acts, REPL commands
4. Task 3: `34a01f7` feat(01-05): in-process dev runner behind npm run dev with CLI acceptance tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was branched before plans 01-01 to 01-04**
- **Found during:** startup (no hub.ts or protocol.lock.json)
- **Fix:** `git merge --ff-only main` on the worktree branch, then `npm install`
- **Commit:** none (fast-forward)

**2. [Rule 1 - Bug] Existing hub and logging tests assumed `utterance` is unhandled**
- **Found during:** Task 1 full-suite run (2 failures after registering the utterance handler)
- **Issue:** `hub.test.ts` and `logging.test.ts` used a valid utterance as the "allowed type with no handler" probe and expected `not-implemented`; the logging test also put a sentinel in utterance text, which the transcript now legitimately echoes to the voice client
- **Fix:** switched the probes to `ptt.hotkey` from the extension (stays unhandled until Phase 2); the logging test now carries its sentinel in an invalid `ptt` payload, preserving its purpose (a rejected value never reaches a log line or an error frame)
- **Files modified:** apps/server/test/hub.test.ts, apps/server/test/logging.test.ts
- **Commit:** 88db216

**3. [Rule 1 - Bug] Stale cache after an extension reconnect**
- **Found during:** Task 1 design review of the session cache
- **Issue:** a replacement or new extension connection would be described from the previous connection's cached model
- **Fix:** `Session.extensionConnected` is now an accessor that marks the model stale whenever an extension binds
- **Commit:** 88db216

### Notes (not deviations)

- The plan text says the default snapshot timeout is 8000 ms; plan 01-04 already fixed `snapshotTimeoutMs` at 5000 in `RunningServer.config`, so the turn handler uses that value. Tests set short timeouts explicitly.
- The plan's tracer step 1 limited the grammar to describe; Task 2 added the other four commands test-first, as planned.
- Fake extension API additions beyond the plan (`version()`, `received()`, `sent()`, `disabledIds` option) exist only so tests can assert act and ping traffic.

**Total deviations:** 3 auto-fixed, no scope creep. No protocol file was touched; the lock test still passes.

## Issues Encountered

None blocking. No auth gates. No package installs.

## Known Stubs

None that block the goal. The reply strings in `reply.ts` and the filler/clarify sentences are intentional offline text that the voice workstream's dialogue templates and the Phase 4 brain replace; they are documented in the file headers. `settings`, `ptt` and `speak.done` handlers are deliberate no-ops for Phase 1 (D-14), and `control reconnect-browser` answers not-implemented.

## Threat Flags

None. Mitigations from the plan's threat model are covered by tests: T-01-26 (zero act.request and confirm.armed), T-01-27 (gated, cross-domain and kindless clicks refused with no mutation), T-01-28 (sentinel value never in any reply, card field label-only, observedValue null), T-01-29 (short snapshot timeout and an immediate no-extension reply).

## Self-Check: PASSED

- FOUND files: apps/server/src/{reply,turn}.ts, apps/server/src/brain/{grammar,fake-brain}.ts, tools/fake-extension/src/{fake-extension,main}.ts, tools/repl/src/{repl,main}.ts, scripts/dev.ts, and the eight test files listed above
- FOUND commits: 88db216, 0c5afb5, a979816, 34a01f7
- `npm run typecheck` exit 0; `npm test` 28 files, 472 tests pass
