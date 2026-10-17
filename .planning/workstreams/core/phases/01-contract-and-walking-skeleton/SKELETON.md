# Walking Skeleton - Blip

**Phase:** 1 (core workstream)
**Generated:** 2026-10-16

## Capability Proven End-to-End

A typed utterance, `what's here`, entered in the REPL (the stand-in for the voice window) travels over the Origin-guarded loopback WebSocket hub, makes the server ask the fake extension (the stand-in for Chrome) for a page snapshot, is turned into a baseline form model in code in under 100 ms, and comes back as a spoken-style reply with the field count and required count: `Hotel booking. 9 fields, 6 required, 3 actions.` No Chrome, no voice UI, no Claude.

Run: `npm run dev -- --brain=fake`

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language and runtime | TypeScript 6.0.3 (not 7.x), Node 24 LTS, `tsx` to run TS directly | One toolchain for both developers (CLAUDE.md); TS 7 has no programmatic compiler API yet |
| Repo layout | npm workspaces: `packages/*`, `apps/*`, `tools/*`; core owns `packages/protocol` (author), `packages/policy`, `apps/server`, `tools/fake-extension`, `tools/repl`; voice picks its own folder under `apps/` | Matches ARCHITECTURE.md and ownership split; globs never name the voice folder (D-19) |
| Contract | `@blip/protocol`: zod 4 schemas consumed as TypeScript source (no build step), one message registry (`type -> senders, receivers, payload`) from which the Message union, role permissions, `canSend`/`canReceive` and the PROTOCOL.md check all derive | One executable contract; parse at every boundary (D-18); permissions in code, not convention (D-04) |
| Transport | `ws` 8.22 with `noServer`; single endpoint `ws://127.0.0.1:7777/ws`; JSON text frames in an `Envelope {v:1, id, type, replyTo?, ts, payload}`; role claimed in a first `hello` within 2 s; ping every 20 s | D-01, D-02, D-06; replaces CLAUDE.md's 8787 with `/ext` + `/ui` (update by agreement at M0) |
| Trust boundary | Loopback bind only; Host allowlist; Origin allowlist checked on the HTTP upgrade before any frame is read; role bound to Origin; per-role message permissions; no-Origin only under `--dev` | PROT-04, D-03, D-04, D-26; the foundation of the Phase 3 confirm-phrase guarantee |
| Data layer | In-memory `Session` (latest Snapshot, baseline FormModel, last spoken text, presence); no database in Phase 1 | The skeleton needs state, not persistence; the repair cache arrives in Phase 4 |
| Baseline form model | Pure function `buildBaselineFormModel(snapshot): FormModel` in `apps/server/src/baseline/`, under 100 ms, golden-file tested | PAGE-02, D-12; code answers instantly, the model only patches later |
| Brain | `--brain=fake`: deterministic grammar plus a configurable ~1.5 s sleep on model-routed turns; `--brain=claude` rejected until Phase 4 | PROT-02, D-21, D-23; never returns `request_action` unless a test option asks |
| Test runner | vitest 5 with `projects` globs; real sockets on port 0 for hub and integration tests | D-20; Origin behavior is only real on a real handshake |
| Dev runner | `scripts/dev.ts` runs server, fake extension and REPL in one process | `concurrently` mangles `--brain=fake` on Windows and orphans processes |
| Deployment | Local: `npm run dev -- --brain=fake`. One-command Chrome + voice startup is Phase 5 | Documented local full-stack run command, as the skeleton template allows |

## Stack Touched in Phase 1

- [x] Project scaffold (workspaces, tsconfig, vitest, TS source consumption across packages) - plan 01-01
- [x] Routing - one real route, `/ws`, plus `/healthz` - plan 01-04
- [x] State - one real read (snapshot -> form model) and one real write (in-memory fill applied by the fake extension, read back as `observedValue`) - plans 01-03, 01-05. No database exists in this project's skeleton.
- [x] UI - the REPL stands in for the voice UI: one interactive element wired to the hub - plan 01-05
- [x] Run command - `npm run dev -- --brain=fake` exercises the full stack - plan 01-05

## Out of Scope (Deferred to Later Slices)

- Real Chrome extension, DOM snapshot, kind classification rules, real fills (Phase 2)
- Policy gate, Executor, grants, confirm-phrase matching, audit log, result reading (Phase 3)
- Real Claude brain, label repair, `FormRepair` schema, repair cache (Phase 4)
- Injection defense, `injection.html`, real public form, one-command Chrome + voice startup, `demo-safe` tag (Phase 5)
- Voice UI, `packages/dialogue`, NVDA bridge, `fixtures/forms` pages (voice workstream)
- Editing CLAUDE.md's 8787 / `/ext` + `/ui` references (shared file; needs both developers' agreement at M0)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: A real Chrome extension replaces the fake one behind the same hub: live snapshot, fail-closed kinds, DOM-verified fills.
- Phase 3: Gated actions run only through the Executor after read-back and the exact spoken phrase; Blip reads the result page.
- Phase 4: Real, locked-down Claude replaces the fake brain for free-form intents and background label repair.
- Phase 5: Hostile pages, a real public form, one-command startup and the `demo-safe` freeze.
