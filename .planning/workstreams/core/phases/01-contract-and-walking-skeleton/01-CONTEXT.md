# Phase 1: Contract and Walking Skeleton - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Freeze the shared `@blip/protocol` package (zod schemas + fixtures + `PROTOCOL.md`) by M0 (~h0.75), then stand up a loopback-only server hub with a fake extension, a fake brain (`--brain=fake`) and a typed REPL, so the loop "typed utterance -> server -> extension snapshot -> spoken reply" runs on one machine with no Chrome, no voice UI and no Claude. Also: baseline FormModel built in code from a Snapshot in <100 ms, and the origin/role guard on the socket.

Requirements: PROT-01, PROT-02, PROT-04, PAGE-02. Core workstream (Pranav). Voice workstream signs off the protocol at M0 and retires `dev/mock-server` against the real server.

Not in this phase: real Chrome extension (Phase 2), policy gate/Executor (Phase 3), real Claude (Phase 4), one-command startup (Phase 5).

</domain>

<decisions>
## Implementation Decisions

User delegated all four gray areas ("do whatever you think is best, consider it all"). Decisions below were made by Claude from the research docs and are open to review at M0 sign-off.

### Socket topology and port
- **D-01:** Port **7777**, bound to `127.0.0.1` only (never `localhost`; Windows can resolve it to `::1`). This resolves the 7777 vs 8787 question in ROADMAP/STATE and follows `ARCHITECTURE.md` (the detailed protocol draft). CLAUDE.md's stack table says 8787 with `/ext` + `/ui`; that is superseded and CLAUDE.md should be updated at M0 (shared file, needs both people's OK). — **Reversibility:** costly — port is hard-coded in the extension manifest/host perms, voice client, and Origin allowlist.
- **D-02:** **One endpoint `ws://127.0.0.1:7777/ws`**, role claimed in a required first `hello` frame (within 2 s). HTTP on the same port serves the voice UI and fixture pages. Matches roadmap criterion 4 ("a client that said hello as `extension`").
- **D-03:** Origin allowlist is checked on the HTTP upgrade, **before any frame is read**, and then **bound to the role**: `chrome-extension://<EXT_ID>` may only claim `extension`; `http://127.0.0.1:7777` may only claim `voice`. Any other Origin is rejected. No-Origin (Node tools: fake extension, REPL) is allowed **only with `--dev`**, and only for `extension`/`voice` fakes. A role mismatch gets an `error` frame and close.
- **D-04:** Per-role message permissions enforced in the hub router: an `utterance`, `speak.done`, `ptt`, `settings`, `control` from a connection whose role is `extension` is refused (and vice versa for `snapshot.result`, `act.result`, `page.changed`). This is the Phase 3 confirm-phrase guarantee's foundation: utterances are only ever accepted from the `voice` socket.
- **D-05:** Extension ID is pinned via a `key` in the extension manifest so the allowlisted `chrome-extension://<EXT_ID>` is stable across both developers' machines; the ID lives in one shared constant in `@blip/protocol`.
- **D-06:** Wire format: JSON text frames, each an `Envelope {v:1, id, type, replyTo?, ts, payload}`; invalid/unknown frames get an `error` reply and never crash the hub. Keepalive: extension `ping` every 20 s, server `pong`. Single active extension connection and single voice connection per session (a new one replaces the old, with a log line).

### Snapshot and FormModel shape
- **D-07:** Adopt the `Snapshot` / `RawElement` / `FormModel` / `Field` shapes from `.planning/research/ARCHITECTURE.md` ("The Form Model" section) as the starting point for the frozen schemas, with the adjustments below. `labelCandidates` stay a ranked list in the Snapshot (extension sends all candidates, server picks the winner); `labelSource` and `confidence` appear on the resolved `Field`.
- **D-08:** `RawElement.id` is the stable per-page-life id (`e<N>` carried in `data-blip-id`), assigned by the extension and **never reassigned** on re-snapshot while the element stays in the DOM. FormModel `Field.id` is the same id (no second id space). Document order is a separate `order` int.
- **D-09:** Sensitive fields: `value` is `null` whenever `sensitive != "none"`, enforced in the **schema** (refinement) and covered by a unit test, so a password/card value can never validate into a Snapshot, FormModel or log. `sensitive` is classified by the extension (password input type, `autocomplete` cc-*/one-time-code, etc.).
- **D-10:** `Snapshot` carries `snapshotId`, monotonically increasing `version` per tab, `structuralHash` (excludes values), `truncated`, and `elements` capped at 250; the ~8k-token cap is applied at the model-prompt boundary (Phase 4), not in the wire schema.
- **D-11:** Each actionable element in the Snapshot carries an `ActionKind` (`kind`, `kindReasons`). In Phase 1 the fixtures hand-set `kind`; real classification lives in `packages/policy` (Phase 2/3). `ActionKind` is defined in `@blip/protocol` and re-exported by policy so there is one enum. Fail-closed: anything unrecognized is gated.
- **D-12:** The baseline FormModel builder is a **pure function** `buildBaselineFormModel(snapshot): FormModel` in `apps/server/src/baseline/`, no I/O, picks the best label candidate (highest confidence; ties by source order aria > label > nearby-text > placeholder > inferred), derives `required` from `requiredSource`, groups by `group`, and must run <100 ms on every protocol fixture, asserted in a unit test (PAGE-02). Fields with `labelSource == "inferred"` or confidence < 0.7 are flagged for later repair/hedging (consumed in Phase 4 / voice DLG-11).
- **D-13:** Fixtures in `packages/protocol/fixtures/` (consumed as TS/JSON by both tracks): `booking.snapshot.json` (clean), `broken.snapshot.json` (unlabeled, div-buttons, color-only errors), `result-ok.snapshot.json`, `result-errors.snapshot.json`, plus the expected `booking.formmodel.json`. Core hand-writes these at M0 so voice's reducer tests can start immediately. Fixture-validity test: every fixture parses against its schema.

### Intent union and message set
- **D-14:** Message set is the `PROTOCOL.md` draft in `ARCHITECTURE.md` (extension: `snapshot.request/result`, `act.request/result`, `page.changed`, `announce`, `highlight`, `ptt`, `ping/pong`; voice: `utterance`, `ptt`, `speak.done`, `settings`, `control`, `speak`, `earcon`, `confirm.armed`, `confirm.cleared`, `state`, `transcript`; shared: `hello`, `welcome`, `error`). All are defined in Phase 1 even when their server behavior lands later, so the contract is frozen once. Unimplemented handlers reply with a typed `error {code:"not-implemented"}`.
- **D-15:** `Intent` union exactly as drafted, with **no confirm/approve/submit_now variant** (a type-level test asserts no such `type` exists). `request_action` only *requests*; `click_safe` is re-checked by the Executor. `ActRequest`/`ActResult` as drafted, including `snapshotVersion`, `expectedKind`, optional `gate {grantId, kind}`, `observedValue`, `liveKind`.
- **D-16:** `DialogueStateName` enum and the `state` push payload are frozen in Phase 1 (voice's UI renders from them). `welcome` includes `brain: "claude"|"fake"` so the UI can show plan-B mode.
- **D-17:** After M0 the protocol changes **additively and optionally only**, agreed in a PR that both approve plus the matching `PROTOCOL.md` edit. Protocol version stays `v: 1`; no breaking renames. M0 sign-off = voice dev approves the PR (written approval on the PR is enough). — **Reversibility:** one-way — consumed by both workstreams; a breaking change means re-syncing two machines mid-hackathon.
- **D-18:** Both sides `parse()` every inbound frame with the zod schemas (parse at the boundary); `PROTOCOL.md` is generated-or-checked against the schemas by a test that fails if a message `type` exists in one but not the other.

### Fakes, REPL and scaffold
- **D-19:** Repo layout follows `ARCHITECTURE.md`: `packages/protocol`, `packages/policy` (stub in Phase 1), `apps/server`, `tools/fake-extension`, `tools/repl`, `fixtures/`. npm workspaces (npm 11, no pnpm), `tsconfig.base.json`, TypeScript 6.0.3, Node 24, `tsx` to run, protocol consumed as TS source (no build step). Voice's app folder name (`apps/voice` vs `apps/voice-ui`) is theirs to pick; core does not create it.
- **D-20:** Test runner: **vitest** (workspace-aware, TS-native, works with zod 4 and the tsx toolchain). `npm test` at the root runs everything; each package has its own `test/`. Policy-style deterministic code gets tests first.
- **D-21:** `npm run dev -- --brain=fake` starts the server with `--dev` (allows no-Origin fakes), then the fake extension and the REPL attach as separate processes (or the server spawns the fake extension). Server flags: `--brain=fake|claude` (claude rejected with a clear message until Phase 4), `--dev`, `--port`.
- **D-22:** **Fake extension** (`tools/fake-extension`): connects as `extension`, serves a chosen fixture snapshot (`--fixture=booking|broken`), answers `snapshot.request`, applies `act.request` fills/selects/checks to an in-memory copy and reports `observedValue`, emits `page.changed`. In Phase 1 `click` of a gated kind returns `gate-required` (no submit path exists yet).
- **D-23:** **Fake brain** (`--brain=fake`): grammar-only intent routing plus the baseline form model; for any turn that would go to a model it sleeps a **configurable ~1.5 s** (default 1500 ms, `--fake-delay`) so filler speech/earcons are exercised. It never returns `request_action` unless a test flag asks, and a Phase 3 adversarial test will use that flag. Its replies must be deterministic (same input, same output) so demo plan B is reliable.
- **D-24:** Minimal Phase 1 grammar: "what's here"/"describe", "what's required", "read the form", "stop", "repeat". Example acceptance: "what's here" -> reply built from the fixture form (field count, required count). Everything else routes to the fake brain's `unknown`/`clarify`.
- **D-25:** **REPL** (`tools/repl`): connects as `voice` (so it exercises exactly the path voice will), stdin line -> `utterance {source:"typed"}`, prints `speak` text, `state`, and `confirm.armed`; auto-replies `speak.done`; slash commands: `/fixture <name>`, `/state`, `/raw <type> <json>` for sending raw frames (used to try forbidden-role cases), `/quit`. Output is plain text, one line per event, easy to paste into bug reports.
- **D-26:** Security tests in Phase 1 (PROT-04): bind address is `127.0.0.1`; ordinary-page Origin rejected; `extension` hello from the voice Origin rejected and vice versa; `utterance` from an `extension` connection refused.

### Claude's Discretion
- Exact file/module names inside each package, internal logging format, and ids (uuid vs nanoid).
- Hub internals (session store shape, reconnect/replace logic) as long as D-03/D-04/D-06 hold.
- Ordering of fixture authoring vs schema authoring at M0, and whether `PROTOCOL.md` is hand-written or generated, as long as D-18's consistency test exists.
- Whether the server spawns the fake extension/REPL or the dev script uses `concurrently`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contract and architecture
- `.planning/research/ARCHITECTURE.md` — "The Form Model" (Snapshot/RawElement/Field zod), "PROTOCOL.md (draft)" (transport, Origin allowlist, envelope, message tables, ActOp/ActRequest/ActResult, Intent union, DialogueStateName), recommended project structure, mockability matrix.
- `.planning/PROJECT.md` — core value, Key Decisions (intent-as-data, distinct confirm phrase), constraints.
- `.planning/workstreams/core/ROADMAP.md` — Phase 1 goal and 5 success criteria.
- `.planning/workstreams/core/REQUIREMENTS.md` — PROT-01/02/04, PAGE-02, and the Cross-Track Dependencies table (what fakes stand in for).
- `.planning/workstreams/core/STATE.md` — Phase 1 decision notes (port at M0).

### Stack and safety
- `CLAUDE.md` — Technology Stack (note: its 8787 / `/ext` + `/ui` topology is superseded by D-01/D-02 here), Safety invariants (model never acts, gated kinds default-deny, secrets never logged).
- `.planning/research/STACK.md` — versions (ws 8.22, zod 4.6, tsx 4.23, TS 6.0.3, Node 24).
- `.planning/research/PITFALLS.md` — pitfalls on localhost WebSocket exposure and fail-closed classification.

### Team process
- `docs/WORK-SPLIT.md` — work packages C1 (protocol), C3 (fakes, REPL), hand-offs and M0 timing.
- `CONTRIBUTING.md` — branch naming (`core/*`), small PRs, protocol change rule.

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield: the repo contains only docs and planning (`CLAUDE.md`, `CONTRIBUTING.md`, `docs/`, `.planning/`). No `apps/`, `packages/`, `tools/` or `fixtures/` yet; no spike/sketch findings; no codebase maps.

### Reusable Assets
- `.planning/research/ARCHITECTURE.md` contains near-final zod snippets for Snapshot, RawElement, Field, ActOp, ActRequest, ActResult, Intent, Envelope, Hello/Welcome. Copy these into `packages/protocol/src/*` and refine per the decisions above.

### Established Patterns
- Parse every inbound message with zod at the boundary; discriminated unions on `type`/`op`.
- Pure functions for anything security- or correctness-critical (baseline builder, later classify/phrases/grant) with unit tests.
- Protocol package consumed as TS source by server, extension and voice (no build step).

### Integration Points
- `apps/server/src/hub/` is the single place roles/Origin are enforced; Phase 2 swaps the fake extension for the real one with no server change; Phase 3 adds Executor/gate behind the same router.
- Voice track connects with `role=voice` to the same `/ws`; `tools/repl` is its stand-in until I1.

</code_context>

<specifics>
## Specific Ideas

- Acceptance demo for the phase: run `npm run dev -- --brain=fake`, type "what's here" in the REPL, get a spoken-style reply with field count and required count from the `booking` fixture, with the ~1.5 s fake-brain delay visible on a model-routed turn.
- The REPL's `/raw` command doubles as the manual attack tool for the PROT-04 role/Origin checks.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Open item to raise at M0: update CLAUDE.md's 8787 / `/ext`+`/ui` references to 7777 / `/ws`; shared file, needs both people's agreement.)

</deferred>

---

*Phase: 1-Contract and Walking Skeleton*
*Context gathered: 2026-10-16*
