# Phase 1: Contract and Walking Skeleton - Research

**Researched:** 2026-10-16
**Domain:** TypeScript monorepo, zod 4 wire protocol, loopback `ws` hub with Origin/role guard, pure baseline form-model builder, offline fakes (extension, brain, REPL)
**Confidence:** HIGH (every stack claim below was exercised in a scratch monorepo on this machine: Windows 11, Node 24.14.0, npm 11.9.0)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Copied from `01-CONTEXT.md` (D-01 .. D-26). Research does not re-open them. Abbreviated verbatim where long; the planner must read CONTEXT.md for full text.

- **D-01** Port **7777**, bound to `127.0.0.1` only (never `localhost`). CLAUDE.md's 8787 + `/ext` + `/ui` is superseded; update CLAUDE.md at M0 (shared file, needs both people's OK).
- **D-02** **One endpoint `ws://127.0.0.1:7777/ws`**, role claimed in a required first `hello` frame (within 2 s). HTTP on the same port serves the voice UI and fixture pages.
- **D-03** Origin allowlist checked on the HTTP upgrade, **before any frame is read**, then **bound to the role**: `chrome-extension://<EXT_ID>` may only claim `extension`; `http://127.0.0.1:7777` may only claim `voice`. Any other Origin rejected. No-Origin allowed **only with `--dev`**, only for `extension`/`voice` fakes. Role mismatch gets an `error` frame and close.
- **D-04** Per-role message permissions enforced in the hub router: `utterance`, `speak.done`, `ptt`, `settings`, `control` from an `extension` connection are refused (and `snapshot.result`, `act.result`, `page.changed` from `voice`).
- **D-05** Extension ID pinned via a `key` in the manifest; the ID lives in one shared constant in `@blip/protocol`.
- **D-06** JSON text frames, each an `Envelope {v:1, id, type, replyTo?, ts, payload}`; invalid/unknown frames get an `error` reply and never crash the hub. Extension `ping` every 20 s, server `pong`. Single active extension and single voice connection (a new one replaces the old, with a log line).
- **D-07** Adopt `Snapshot` / `RawElement` / `FormModel` / `Field` from `ARCHITECTURE.md` "The Form Model" as the starting point. `labelCandidates` stay a ranked list in the Snapshot; `labelSource` and `confidence` appear on the resolved `Field`.
- **D-08** `RawElement.id` is the stable per-page-life id (`e<N>` in `data-blip-id`), never reassigned; `Field.id` is the same id; document order is a separate `order` int.
- **D-09** `value` is `null` whenever `sensitive != "none"`, enforced in the **schema** (refinement) and unit tested.
- **D-10** `Snapshot` carries `snapshotId`, monotonically increasing `version` per tab, `structuralHash` (excludes values), `truncated`, `elements` capped at 250; the ~8k-token cap is applied at the model-prompt boundary (Phase 4).
- **D-11** Each actionable element carries an `ActionKind` (`kind`, `kindReasons`); fixtures hand-set `kind` in Phase 1. `ActionKind` defined in `@blip/protocol`, re-exported by policy. Fail-closed.
- **D-12** Baseline builder is a **pure function** `buildBaselineFormModel(snapshot): FormModel` in `apps/server/src/baseline/`; best label = highest confidence, ties by source order aria > label > nearby-text > placeholder > inferred; `required` from `requiredSource`; group by `group`; **<100 ms on every protocol fixture, asserted in a unit test**; `labelSource == "inferred"` or confidence < 0.7 flagged.
- **D-13** Fixtures in `packages/protocol/fixtures/`: `booking.snapshot.json`, `broken.snapshot.json`, `result-ok.snapshot.json`, `result-errors.snapshot.json`, `booking.formmodel.json`. Fixture-validity test: every fixture parses against its schema.
- **D-14** Full message set defined in Phase 1 (extension: `snapshot.request/result`, `act.request/result`, `page.changed`, `announce`, `highlight`, `ptt`, `ping/pong`; voice: `utterance`, `ptt`, `speak.done`, `settings`, `control`, `speak`, `earcon`, `confirm.armed`, `confirm.cleared`, `state`, `transcript`; shared: `hello`, `welcome`, `error`). Unimplemented handlers reply `error {code:"not-implemented"}`.
- **D-15** `Intent` union exactly as drafted, **no confirm/approve/submit_now variant** (a type-level test asserts it). `ActRequest`/`ActResult` as drafted.
- **D-16** `DialogueStateName` enum and `state` push payload frozen in Phase 1. `welcome` includes `brain: "claude"|"fake"`.
- **D-17** After M0 the protocol changes **additively and optionally only**, via a PR both approve plus the matching `PROTOCOL.md` edit. Version stays `v: 1`.
- **D-18** Both sides `parse()` every inbound frame; `PROTOCOL.md` is generated-or-checked against the schemas by a test that fails if a message `type` exists in one but not the other.
- **D-19** Layout per `ARCHITECTURE.md`: `packages/protocol`, `packages/policy` (stub), `apps/server`, `tools/fake-extension`, `tools/repl`, `fixtures/`. npm workspaces, `tsconfig.base.json`, TypeScript 6.0.3, Node 24, `tsx`, protocol consumed as TS source (no build step). Core does not create the voice app folder.
- **D-20** Test runner **vitest**; `npm test` at root runs everything; each package has its own `test/`.
- **D-21** `npm run dev -- --brain=fake` starts the server with `--dev`, then fake extension and REPL attach (separate processes, or server spawns the fake). Flags: `--brain=fake|claude` (claude rejected with a clear message until Phase 4), `--dev`, `--port`.
- **D-22** Fake extension: connects as `extension`, serves `--fixture=booking|broken`, answers `snapshot.request`, applies `act.request` fills/selects/checks to an in-memory copy and reports `observedValue`, emits `page.changed`. `click` of a gated kind returns `gate-required`.
- **D-23** Fake brain: grammar-only routing plus baseline model; model-routed turns sleep a configurable ~1.5 s (`--fake-delay`, default 1500). Never returns `request_action` unless a test flag asks. Deterministic replies.
- **D-24** Minimal grammar: "what's here"/"describe", "what's required", "read the form", "stop", "repeat". Everything else -> fake brain `unknown`/`clarify`.
- **D-25** REPL connects as `voice`; stdin line -> `utterance {source:"typed"}`; prints `speak` text, `state`, `confirm.armed`; auto-replies `speak.done`; slash commands `/fixture <name>`, `/state`, `/raw <type> <json>`, `/quit`. Plain text, one line per event.
- **D-26** Security tests (PROT-04): bind address is `127.0.0.1`; ordinary-page Origin rejected; `extension` hello from the voice Origin rejected and vice versa; `utterance` from an `extension` connection refused.

### Claude's Discretion
- Exact file/module names inside each package, internal logging format, ids (uuid vs nanoid).
- Hub internals (session store shape, reconnect/replace logic) as long as D-03/D-04/D-06 hold.
- Ordering of fixture authoring vs schema authoring at M0, and whether `PROTOCOL.md` is hand-written or generated, as long as D-18's consistency test exists.
- Whether the server spawns the fake extension/REPL or the dev script uses `concurrently`.

### Deferred Ideas (OUT OF SCOPE)
None. Open item for M0: update CLAUDE.md's 8787 / `/ext`+`/ui` references to 7777 / `/ws` (shared file, needs both people's agreement). Not in this phase: real Chrome extension (Phase 2), policy gate/Executor (Phase 3), real Claude (Phase 4), one-command startup (Phase 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROT-01 | One `@blip/protocol` package of zod schemas + fixtures for ext<->server, voice<->server, snapshot/form-model, ActRequest/ActResult, Intent | Message-registry pattern (single source for union, role permissions, PROTOCOL.md check); zod 4 discriminated union + refine verified; draft-schema defects to fix before freeze (see Pitfalls 1-5) |
| PROT-02 | Run the full system offline with fake extension, `--brain=fake`, typed REPL | Exported `start*()` functions + port 0 integration tests; in-process dev runner (concurrently arg-passthrough breaks `--brain=fake` on Windows, Pitfall 7) |
| PROT-04 | Server binds only 127.0.0.1, rejects WS whose Origin is not extension/voice UI | `ws` `noServer` + manual upgrade handler verified (403 on bad Origin, bind address asserted); Host-header check; origin-bound roles; dev-origin allowance for voice's Vite server |
| PAGE-02 | Baseline form model from snapshot in <100 ms | Pure function; parse+build of a 250-element snapshot measured ~2 ms cold; assertion strategy that is not flaky on Windows |
</phase_requirements>

## Summary

This is standard-patterns work and the stack is fully proven: I built a scratch monorepo (npm workspaces, `@blip/protocol` consumed as TS source, `tsx`, vitest 5 `projects`, `tsc` 6.0.3) plus a `ws` `noServer` hub with an Origin check on this machine and everything ran. No spike is needed. The real risk is not tooling but **defects in the `ARCHITECTURE.md` draft that become one-way doors at M0**. This research found nine of them (Pitfalls 1-6, 9-11), including a role-permission contradiction (`ptt` is sent by both roles, yet D-04 refuses it from `extension`), a forward-reference in the draft schemas (`ActionKind` used before it is defined), no way to represent "this sensitive field has a value" without exposing it, and an `Origin` problem that will block the voice developer if they use a Vite dev server. Fix these in the schemas before the M0 PR is opened, because after M0 only additive-optional changes are allowed (D-17).

The recommended shape: one **message registry** in `@blip/protocol` (`type -> {senders, receivers, payload schema}`) from which the discriminated-union `Message` schema, the hub's role-permission check (D-04), and the `PROTOCOL.md` consistency test (D-18) are all derived. The hub is a thin `http` server + `WebSocketServer({noServer:true})` that checks Host and Origin in the `upgrade` handler, binds role to Origin at `hello`, then routes parsed messages by registry permission. Server, fake extension and REPL each export a `start*()` function (used by both the CLI and integration tests, with port 0), and `npm run dev` is a small `tsx` script that starts them in one process rather than using `concurrently`.

**Primary recommendation:** Author `packages/protocol` registry-first, fix the draft defects listed under Pitfalls before M0, generate `booking.formmodel.json` from the baseline builder and freeze it as a golden file, and drive all PROT-04 tests through real sockets on port 0 with a `connect({origin})` helper.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Message schemas, role permissions, fixtures | `packages/protocol` (shared) | - | One executable contract imported by all apps |
| Origin/Host/role enforcement | Server hub (`apps/server/src/hub`) | - | Single choke point (CONTEXT integration points); extension and voice are untrusted until proven |
| Baseline FormModel | Server (`apps/server/src/baseline`, pure) | - | Code, not model; instant first answer |
| Snapshot production | Extension (fake in Phase 1) | - | Server only consumes snapshots |
| Utterance routing (grammar, fake brain) | Server brain module | Voice `packages/dialogue` later | Phase 1 uses a tiny core-owned grammar; voice's reducer replaces it |
| Spoken reply text | Server (stub, deterministic) | Voice dialogue templates later | Keep the stub tiny; voice owns real speech text |
| Static HTTP (voice UI, fixture pages) | Server (`sirv`, optional in Phase 1) | - | Same origin as the WS, simplifies Origin allowlist |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.6.7 | Protocol schemas, parse at every boundary | Locked by stack; `discriminatedUnion` + `.refine` + `z.toJSONSchema` verified [VERIFIED: npm registry, scratch test] |
| ws | 8.22.0 | WebSocket server (`noServer`) and Node clients (fakes, REPL) | Standard; `handleUpgrade` + manual Origin check verified [VERIFIED: npm registry, scratch test] |
| @types/ws | 8.18.2 | Types for ws | Only version line available [VERIFIED: npm registry] |
| tsx | 4.23.15 | Run TS (server, fakes, REPL, dev script) | Locked by stack; resolves extensionless relative imports and workspace TS source [VERIFIED: npm registry, scratch test] |
| typescript | 6.0.3 | `tsc -p . --noEmit` typecheck only | Locked; **not** 7.x (latest tag is 7.0.2) [VERIFIED: npm registry] |
| vitest | 5.0.5 | Unit + integration tests, `projects` config, `expectTypeOf` | Locked by D-20; ran green in scratch monorepo [VERIFIED: npm registry, scratch test] |
| @types/node | ^24 (24.12.0 resolved in scratch) | Node types | **Pin to the 24 line**; npm `latest` is 26.x and the exact string `24.14.0` does not exist (ERESOLVE) [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sirv | 3.0.2 | Static serving of `apps/voice/dist` and `fixtures/forms` on the same port | Only when those directories exist; optional in Phase 1 [VERIFIED: npm registry] |
| concurrently | 10.0.6 | Parallel dev processes | **Not recommended for `npm run dev`** (Pitfall 7); acceptable only for non-arg scripts [VERIFIED: scratch test] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process `scripts/dev.ts` | `concurrently -P` with `{@}` | Concurrently mangles `--brain=fake` into `--brain\=fake` on Windows (verified), and interactive stdin for the REPL is awkward |
| vitest 5.0.5 | vitest 4.1.12 (`V4` dist-tag) | 5.0.0 shipped 2026-09-03, six weeks old; 4.x is the conservative fallback if 5.x misbehaves |
| `ws` `verifyClient` | Manual `upgrade` handler | `verifyClient` is deprecated in ws docs [ASSUMED]; the manual handler is what was tested and is what D-03 ("before any frame is read") needs |

**Installation (root, exact pins):**
```bash
npm i -D vitest@5.0.5 tsx@4.23.15 typescript@6.0.3 @types/node@^24
npm i -w @blip/protocol zod@4.6.7
npm i -w @blip/server ws@8.22.0
npm i -D @types/ws@8.18.2
```
Do not use `--omit=optional` anywhere (CLAUDE.md).

**Version verification:** `npm view <pkg> version` run 2026-10-16: zod 4.6.7 (modified 2026-10-12), ws 8.22.0 (2026-09-26), vitest 5.0.5 (2026-10-15), tsx 4.23.15 (2026-09-20), typescript `latest` 7.0.2 but `6.0.3` exists, concurrently 10.0.6, sirv 3.0.2, @types/ws 8.18.2.

## Package Legitimacy Audit

Seam run: `gsd-tools query package-legitimacy check --ecosystem npm ...` (2026-10-16).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zod | npm | years (4.x line) | ~347M/wk | github.com/colinhacks/zod | SUS (`too-new`) | Approved with note |
| ws | npm | years | ~288M/wk | github.com/websockets/ws | SUS (`too-new`) | Approved with note |
| vitest | npm | years | ~125M/wk | github.com/vitest-dev/vitest | SUS (`too-new`) | Approved with note |
| tsx | npm | years | ~98M/wk | github.com/privatenumber/tsx | SUS (`too-new`) | Approved with note |
| concurrently | npm | years | ~22M/wk | github.com/open-cli-tools/concurrently | SUS (`too-new`) | Approved with note (not used in the recommended dev path) |
| @types/ws | npm | years | ~80M/wk | DefinitelyTyped | SUS (`too-new`) | Approved with note |
| @types/node | npm | years | ~461M/wk | DefinitelyTyped | SUS (`too-new`) | Approved with note |
| typescript | npm | years | ~307M/wk | microsoft/TypeScript | OK | Approved |

The seam's only reason on every SUS verdict is `too-new`: it keys on the **latest version's publish date** (all published within the last ~4 weeks), not on package age. All have hundreds of millions of weekly downloads, a source repo, `postinstall: null`, and are the packages already named in `.planning/research/STACK.md`. `[WARNING: flagged as suspicious by recency heuristic only]`. The planner should still add **one** `checkpoint:human-verify` for the dependency-install task (confirm the exact pins in the lockfile and `npm ls` shows no unexpected packages) rather than one per package. Packages removed due to SLOP: none.

## Architecture Patterns

### System Architecture Diagram

```
                 ws://127.0.0.1:7777/ws   (HTTP on same port: voice UI, /fixtures)
  REPL (voice) ──┐                                                      ┌── Fake brain (grammar,
  voice UI ──────┤  upgrade: Host ok? Origin allowed? ──no──> 403/destroy│   +1.5 s on model route)
  fake-ext ──────┘                │yes                                   │
                                  v                                      │
                       ┌───────────────────────┐   utterance (voice only) │
                       │ HUB: hello(≤2 s) ->   │──────────────────────────┤
                       │ bind role to Origin   │                          v
                       │ parse(Message) ->     │            ┌──────────────────────────┐
                       │ registry.senders has  │<───speak───│ Session: latest Snapshot,│
                       │ role? else error      │   state    │ baseline FormModel, last │
                       └──────┬────────────────┘            │ spoken text, brain mode  │
                snapshot.request │ ▲ snapshot.result        └───────────▲──────────────┘
                              v  │ page.changed                          │ buildBaselineFormModel
                       Fake extension (fixture,                          │ (pure, <100 ms)
                       in-memory fills, observedValue)  ─────────────────┘
```
Primary path: REPL line -> `utterance` -> hub (role=voice OK) -> grammar match -> session snapshot (request one if none) -> `buildBaselineFormModel` -> reply text -> `speak` + `state` to voice. Unmatched -> fake brain `sleep(1500)` -> `clarify`/`unknown` reply.

### Recommended Project Structure
```
package.json                  # workspaces: ["packages/*","apps/*","tools/*"]  (globs: voice folder name is theirs)
tsconfig.base.json            # types:["node"], resolveJsonModule, Bundler resolution, noEmit
tsconfig.json                 # include packages/apps/tools src+test
vitest.config.ts              # test.projects: ["packages/*","apps/*","tools/*"]
PROTOCOL.md                   # repo root (shared)
scripts/dev.ts                # in-process: server + fake ext, then REPL on stdin
packages/protocol/
  package.json                # exports: "." -> ./src/index.ts ; "./fixtures/*" -> ./fixtures/*
  src/{action-kind,snapshot,form-model,intent,envelope,messages,errors,ids}.ts  index.ts
  fixtures/*.json
  fixtures-node.ts            # node-only loader, NOT re-exported from index (browsers import index)
  test/
packages/policy/             # stub: re-exports ActionKind/GATED_KINDS only
apps/server/src/{main.ts,hub/,session/,baseline/,brain/fake-brain.ts,reply.ts}
tools/fake-extension/src/{main.ts,fake-extension.ts}
tools/repl/src/{main.ts,repl.ts}
```

### Pattern 1: Message registry as the single source of truth
**What:** One object `MESSAGES` maps each `type` to `{ senders, receivers, payload }`. Everything else derives from it: the `Message` discriminated union, the hub permission check (D-04), the client-side parse, the not-implemented list, and the PROTOCOL.md test (D-18).
**When to use:** Always for this phase; it makes "defined in Phase 1 even when behavior lands later" (D-14) mechanical.
**Example:**
```typescript
// packages/protocol/src/messages.ts   (pattern verified in scratch test; discriminated union over z.literal(type))
import { z } from "zod";
export const Role = z.enum(["extension", "voice"]);
type Sender = "extension" | "voice" | "server";
const frame = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ v: z.literal(1), id: z.string().min(1).max(64), type: z.literal(type),
             replyTo: z.string().optional(), ts: z.number(), payload });

export const MESSAGES = {
  "hello":            { senders: ["extension", "voice"], payload: Hello },
  "welcome":          { senders: ["server"],             payload: Welcome },
  "utterance":        { senders: ["voice"],              payload: Utterance },
  "snapshot.result":  { senders: ["extension"],          payload: SnapshotResult },
  // ... every type in D-14
} as const satisfies Record<string, { senders: readonly Sender[]; payload: z.ZodType }>;

export const Message = z.discriminatedUnion("type",
  Object.entries(MESSAGES).map(([t, m]) => frame(t, m.payload)) as unknown as [any, ...any[]]);
export const canSend = (role: Sender, type: keyof typeof MESSAGES) =>
  (MESSAGES[type].senders as readonly Sender[]).includes(role);
```
(Use a typed tuple helper or an explicit array instead of the `as unknown as` cast if inference is awkward; the cast is only to keep the example short.)

### Pattern 2: Two-stage inbound parse
Stage 1: `JSON.parse` in try/catch, then a loose `Envelope` (`v, id, type, replyTo?, ts, payload: unknown`) so the `error` reply can set `replyTo` even when the payload is invalid. Stage 2: `Message.safeParse`. Map failures to `error` codes: `bad-json`, `bad-envelope`, `unknown-type`, `invalid-payload`. Binary frames -> `error` + close 1003. zod 4 `issues` do **not** echo the input value (verified: a rejected password `hunter2` did not appear in `JSON.stringify(issues)`), so returning `issue.path` + `message` in the `error` frame is safe.

### Pattern 3: Hub connection state machine
`upgrade` (Host check -> path `/ws` -> Origin allowlist -> `handleUpgrade`) -> `awaiting-hello` (2 s timer, configurable `helloTimeoutMs` for tests) -> `bound(role)` (Origin must be compatible with the claimed role; mismatch: send `error {code:"role-origin-mismatch", fatal:true}` then `close(4003)`) -> routed. Close codes (application range): 4001 hello-timeout, 4002 bad-hello, 4003 origin/role mismatch, 4004 replaced-by-newer-connection. Replace logic must compare identity before clearing the slot: `if (slots[role] === thisConn) slots[role] = undefined` (otherwise the old socket's late `close` event wipes the new connection).

### Pattern 4: Start functions that tests and CLIs share
`startServer({port, dev, brain, fakeDelayMs, helloTimeoutMs, extraVoiceOrigins}) -> {port, close()}` (port `0` = ephemeral, read `server.address()`); same for `startFakeExtension({url, fixture})`, `startRepl({url, input, output})`. CLI `main.ts` only parses flags (`node:util` `parseArgs`) and calls them. Integration tests then use real sockets with no fake timers (inject `sleep`/`delayMs` into the brain instead).

### Pattern 5: Golden-file baseline test
`buildBaselineFormModel(booking.snapshot)` must `toEqual(booking.formmodel.json)`. Generate the golden file once from the builder (`npm run fixtures:update -w @blip/protocol` or a one-off script), review by eye, commit; thereafter the test guards drift. See Open Question 2 about who authors it.

### Anti-Patterns to Avoid
- **Importing `node:fs` from `@blip/protocol`'s index:** the extension and voice UI bundle the package for the browser. Keep the fixture loader in a node-only file; JSON fixtures are exposed through the `exports` map for direct `import ... with {type:"json"}` (verified under tsx, vitest, tsc with `resolveJsonModule`).
- **`z.strictObject` on payloads:** additive evolution (D-17) means an older peer must tolerate new optional fields. Use default `z.object` (unknown keys are stripped).
- **Logging payloads:** log `{role, type, id, bytes}` only. Snapshots contain field values.
- **Using `localhost` anywhere in code or defaults:** use `127.0.0.1` (D-01).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wire validation | Manual type guards | zod discriminated union from the registry | Boundary parse is the contract (D-18) |
| WebSocket framing/handshake | Raw `net` upgrade | `ws` `WebSocketServer({noServer:true})` + `handleUpgrade` | Edge cases in framing, close codes, `maxPayload` |
| CLI flag parsing | `process.argv` loops | `node:util` `parseArgs` | Handles `--brain=fake` and `--brain fake` |
| Arg-parse-sensitive process fan-out | `concurrently` | In-process `start*()` calls | Windows quoting mangles `=` (Pitfall 7) |
| Static file serving | Custom `fs` handler | `sirv` (or skip in Phase 1) | Path traversal, MIME, caching |
| Test sockets | Mocked ws | Real `ws` clients against port-0 server | Origin header behavior is only real on a real handshake |
| Extension ID | Guessing | `crypto` SHA-256 of the SPKI DER, nibble-mapped to a-p | Recipe verified below |
| Timing assertions | `Date.now()` | `performance.now()` with warm-up and best-of-N | Cold JIT and Windows timer noise |

**Key insight:** every piece of security-relevant logic in this phase (Origin, role binding, per-role permission, sensitive-null) should be a small pure function or a registry lookup so it can be unit tested without sockets, then covered once more end to end.

## Runtime State Inventory

Not applicable: greenfield phase, no rename/refactor/migration. Nothing stored, registered or cached exists yet (verified: repo contains only docs and `.planning`).

## Common Pitfalls

### Pitfall 1: `ptt` is sent by both roles but D-04 refuses it from `extension`
**What goes wrong:** `ARCHITECTURE.md` lines 366 and 412 give `ptt` two different payloads: extension `{ source: "global-hotkey" }`, voice `{ state: "start"|"end" }`. D-04 lists `ptt` among messages refused from `extension`, and D-14 lists `ptt` under both. A single `type` cannot have two payload schemas in a `type`-keyed registry, and the permission rule contradicts the draft.
**How to avoid:** At M0 give the extension message its own type, `ptt.hotkey` (extension only), and keep `ptt` voice-only with `{state}`. Renaming is free before M0 and impossible after (D-17).
**Warning signs:** the D-18 PROTOCOL.md test or the registry cannot be written without a special case.

### Pitfall 2: The draft schemas reference `ActionKind` before it is defined
**What goes wrong:** `RawElement` uses `z.lazy(() => ActionKind)` because `ActionKind` is declared further down the draft. Splitting into files (envelope/snapshot/form-model) then creates a circular import.
**How to avoid:** Put `ActionKind` + `GATED_KINDS` in `action-kind.ts`, imported by `snapshot.ts` and `form-model.ts`; drop `z.lazy`. `packages/policy` re-exports it (D-11).

### Pitfall 3: Untagged `{ snapshot } or { error }` payload
**What goes wrong:** `snapshot.result` payload is documented as `{ snapshot: Snapshot }` or `{ error }`. An unlabeled union gives poor parse errors and ambiguous TS narrowing.
**How to avoid:** `z.discriminatedUnion("ok", [{ok:true, snapshot}, {ok:false, error:{code,message}}])`. Same for any other request/response pair that can fail.

### Pitfall 4: No way to say "a sensitive field has a value"
**What goes wrong:** D-09 makes `value` null for every sensitive field. Then `requiredEmpty` in the `state` push (computed from `required && value empty`) counts a filled password as empty forever, and read-back cannot say "password: entered" vs "not entered".
**How to avoid:** Add `hasValue: boolean` to `RawElement` and `Field` (extension computes it; builder copies it; refinement still requires `value === null` when sensitive). Compute `requiredEmpty` from `hasValue`, not `value`. Free to add now; after M0 it can only be optional.

### Pitfall 5: RawElement does not say whether an element is a field or an action, or how radios are represented
**What goes wrong:** The builder must split `elements` into `fields` and `actions`, and decide whether a radio group is one element or N. The draft gives only optional `kind`, `options`, `checked`, which invites divergent interpretations between the extension (Phase 2) and the builder.
**How to avoid:** Freeze two rules in the schema and `PROTOCOL.md`: (a) add an explicit `category: "field" | "action"` (fail-closed: the builder treats a missing/odd category as `action`); (b) a radio group is **one** RawElement (`inputType: "radio"`, `options[]` with `selected`, `id` is the group id). Fixtures include one radio group and one div-button.

### Pitfall 6: Voice's Vite dev server will be rejected by the Origin allowlist
**What goes wrong:** D-03 allows only `http://127.0.0.1:7777` for `voice`. If the voice developer runs the UI from a Vite dev server (`http://localhost:5173`) or opens the server page as `http://localhost:7777`, the browser sends that origin and the upgrade gets 403, which blocks success criterion 5 and looks like a server bug. (`localhost:7777` verified rejected in the scratch hub.)
**How to avoid:** In `--dev` only, additionally allow voice origins `http://localhost:<port>`, `http://127.0.0.1:5173`, `http://localhost:5173` (Vite's default dev port is 5173 [ASSUMED]) plus a repeatable `--allow-origin <origin>` flag, **voice role only**. Never extra origins for `extension`. Production mode keeps exactly `http://127.0.0.1:7777`. Document in PROTOCOL.md and tell the voice developer which URL to use.

### Pitfall 7: `concurrently` corrupts `--brain=fake` on Windows
**What goes wrong:** `concurrently -P "npm:dev -w @blip/server -- {@}" -- --brain=fake` delivered argv `--brain\=fake` to the server (verified). `parseArgs` then sees an unknown option. It also makes interactive stdin for the REPL awkward.
**How to avoid:** `npm run dev` = `tsx scripts/dev.ts`; it parses flags with `parseArgs`, calls `startServer({dev:true,...})` and `startFakeExtension(...)` in-process (real loopback sockets still), then runs the REPL on stdin/stdout in the same process. No orphaned child processes holding port 7777 on Windows after Ctrl-C. Also print a clear message on `EADDRINUSE`.

### Pitfall 8: TS 6 no longer auto-includes `@types/*`
**What goes wrong:** `tsc` reported `TS2591 Cannot find name 'process'` until `"types": ["node"]` was set (verified on 6.0.3).
**How to avoid:** Set `"types": ["node"]` in `tsconfig.base.json`. Browser-targeted code (protocol, extension, voice) must not rely on Node globals; protocol sources only import `zod`.

### Pitfall 9: Parsed-output vs input types when using `.default()`
**What goes wrong:** `frameId: z.number().int().default(0)` makes the inferred output type required and the input optional, so fixtures and the extension's emitters disagree on type shape.
**How to avoid:** No `.default()` in wire schemas; make fields explicitly required or `.optional()`. Use `z.infer` only.

### Pitfall 10: Replacement race and double registration
**What goes wrong:** A reconnecting extension replaces the old connection; the old socket's `close` event then clears the slot and the new connection looks disconnected (`extensionConnected: false` in `state`).
**How to avoid:** Identity check on clear (Pattern 3) and a unit test: connect A, connect B (A gets close 4004), assert slot is B and `state.extensionConnected` stays true.

### Pitfall 11: Performance test flake
**What goes wrong:** First call includes JIT/compile cost; a single `<100 ms` check on a busy Windows laptop could flake, or conversely be vacuous on tiny fixtures.
**How to avoid:** Warm up once, take the best (or median) of 5 runs per fixture, assert `< 100`, and additionally build a synthetic 250-element snapshot in the test (the schema cap) so the budget is meaningful. Measured here: zod parse of a 250-element snapshot ~2 ms cold, 0.17 ms warm; the builder step ~0.15 ms [VERIFIED: scratch benchmark]. The budget has ~50x headroom, so keep the assertion simple.

### Pitfall 12: DNS rebinding and Host header
**What goes wrong:** Origin checks stop cross-site WebSocket hijacking, but a rebinding attack makes `evil.com` resolve to 127.0.0.1 and talk to the HTTP side (fixtures, static UI).
**How to avoid:** Reject any HTTP request or upgrade whose `Host` is not `127.0.0.1:<port>` (in `--dev` also allow `localhost:<port>`). Cheap, one function, unit tested.

## Code Examples

### Hub upgrade guard (verified in scratch hub: evil origin -> 403, `http://127.0.0.1:7777` -> open, no Origin -> open only when dev)
```typescript
// Source: scratch experiment 2026-10-16 (ws 8.22.0, Node 24.14.0, Windows 11)
server.on("upgrade", (req, socket, head) => {
  const reject = (code: number, text: string) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  if (!hostAllowed(req.headers.host, port, dev)) return reject(403, "Forbidden");
  if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") return reject(404, "Not Found");
  const origin = req.headers.origin;
  const allowed = origin === undefined ? dev : allowedOrigins.has(origin);   // no-Origin only with --dev
  if (!allowed) { log.warn({ origin }, "ws origin rejected"); return reject(403, "Forbidden"); }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, origin));
});
// new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 })  // 250-element snapshots are well under this
// server.listen(port, "127.0.0.1")  -> server.address() reported { address: '127.0.0.1', family: 'IPv4' }
```

### Role bound to Origin at hello
```typescript
// D-03: origin -> permitted roles. Pure function, unit tested separately from sockets.
export function rolesForOrigin(origin: string | undefined, o: { extId: string; port: number; dev: boolean; extraVoice: string[] }): Role[] {
  if (origin === undefined) return o.dev ? ["extension", "voice"] : [];
  if (origin === `chrome-extension://${o.extId}`) return ["extension"];
  if (origin === `http://127.0.0.1:${o.port}` || (o.dev && o.extraVoice.includes(origin))) return ["voice"];
  return [];
}
```

### Sensitive-value refinement (verified: rejects with path `payload.elements.0.value`, message does not echo the value)
```typescript
const RawElementBase = z.object({ /* ...fields from ARCHITECTURE.md draft... */ sensitive: Sensitivity, value: z.string().nullable() });
export const RawElement = RawElementBase.refine(
  (e) => e.sensitive === "none" || e.value === null,
  { message: "value must be null when sensitive", path: ["value"] });
// Discriminated unions accept refined members in zod 4 (verified), so Message can embed Snapshot directly.
// Apply the same refinement to Field.
```

### No-confirm-variant test (runtime + type level)
```typescript
import { expectTypeOf, it, expect } from "vitest";
it("Intent has no confirm-like variant", () => {
  const types = Intent.options.map((o) => o.shape.type.value);        // verified: returns the literal strings
  expect(types.filter((t) => /confirm|approve|submit_now/.test(t))).toEqual([]);
  expectTypeOf<Extract<Intent, { type: "confirm" | "approve" | "submit_now" }>>().toEqualTypeOf<never>();
});
```

### Extension ID from a key (recipe verified: produced a 32-char a-p ID; generate once, commit `EXTENSION_ID` and the manifest `key` in Phase 2)
```javascript
import { generateKeyPairSync, createHash } from "node:crypto";
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const der = publicKey.export({ type: "spki", format: "der" });
const manifestKey = der.toString("base64");                       // goes into manifest.json "key"
const id = [...createHash("sha256").update(der).digest().subarray(0, 16)]
  .map((b) => "abcdefghijklmnop"[b >> 4] + "abcdefghijklmnop"[b & 15]).join("");  // -> EXTENSION_ID
```
Generate the pair in Phase 1 (so the constant can be frozen at M0), keep the private key out of the repo (only the public `key` is needed). That the browser sends `Origin: chrome-extension://<id>` on a service-worker WebSocket is [ASSUMED]; confirm in Phase 2 and log rejected origins verbatim to make a mismatch obvious.

### Frozen vocabularies (verbatim from `.planning/research/ARCHITECTURE.md`, read this session)
```
ActionKind (lines 239-243): "fill", "select", "check", "click-safe", "submit", "pay", "delete", "send", "navigate-cross-domain"
DialogueStateName (lines 424-428): "no-page", "ready", "describing", "awaiting-value", "reading-back", "awaiting-confirm", "executing", "awaiting-result", "reading-result"
Intent type literals (lines 433-450): describe, read_form, whats_required, what_went_wrong, read_back, fill_profile, go_to_field, set_fields, spell, undo, stop, request_action, click_safe, answer, clarify, unknown
ActResult.error (lines 394-397): "target-not-found", "stale-snapshot", "kind-mismatch", "gate-required", "sensitive-field", "disabled", "exception"
```
[VERIFIED: ARCHITECTURE.md:239-243, 394-397, 424-450]. Add the server-level `error` codes as a protocol enum too (recommended): `bad-json`, `bad-envelope`, `unknown-type`, `invalid-payload`, `role-violation`, `role-origin-mismatch`, `hello-required`, `hello-timeout`, `not-implemented`, `replaced` [ASSUMED names; mine, to be agreed at M0].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vitest `workspace` file | `test.projects` in root config | vitest 3.2+; works in 5.0.5 [VERIFIED: scratch test] | Use `projects: ["packages/*","apps/*","tools/*"]` |
| zod 3 `ZodEffects` for refine | zod 4 refinements stay on the object schema | zod 4 | Refined objects can be members of `discriminatedUnion` [VERIFIED: scratch test] |
| TS auto-includes `@types/*` | must list `types` | TS 6 | Pitfall 8 |
| `ws` `verifyClient` | check in `upgrade` handler before `handleUpgrade` | long-standing | Matches D-03 "before any frame is read" |

**Deprecated/outdated:** `ARCHITECTURE.md` mentions `pnpm-workspace.yaml`; ignore it (D-19: npm workspaces). Its structure names `apps/voice-ui`; the voice developer picks the folder name, so the workspace globs must be `apps/*`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ws` `verifyClient` is deprecated in its docs | Alternatives | None; the manual handler is what is recommended anyway |
| A2 | Vite dev server default port is 5173 | Pitfall 6 | Voice dev uses another port; mitigated by `--allow-origin` flag |
| A3 | A Chrome extension service-worker WebSocket sends `Origin: chrome-extension://<id>` | Code Examples | Phase 2 finds a different/missing Origin and the real extension is rejected; Phase 1 cannot test this, so log rejected origins verbatim |
| A4 | Server-level error code names listed above | Code Examples | Cosmetic; agree at M0 |
| A5 | Killing a `tsx` child on Windows may leave orphans (reason to prefer in-process dev runner) | Pitfall 7 | None if in-process runner is used |

## Open Questions

1. **`ptt` split (Pitfall 1).**
   - Known: draft uses `ptt` for two payloads; D-04 refuses `ptt` from `extension`.
   - Unclear: whether the voice developer already codes against `ptt`.
   - Recommendation: `ptt.hotkey` for the extension, `ptt` voice-only; raise in the M0 PR description.
2. **Who authors `booking.formmodel.json`?** ROADMAP's M0 table says voice hand-writes it; D-13 says core hand-writes the fixtures.
   - Recommendation: core generates it from the builder and freezes it as a golden file, so voice's reducer tests and the builder cannot disagree; voice reviews it in the M0 PR. A hand-written file from a second author is exactly the drift the golden test is meant to prevent.
3. **Voice dev origins (Pitfall 6).** Confirm with the voice developer whether they serve the UI from Vite (5173) or from the core server before success criterion 5 is attempted.
4. **`hasValue` and `category` additions (Pitfalls 4-5).** Both are schema additions to the ARCHITECTURE draft; confirm at M0.
5. **Does the server in Phase 1 serve any HTTP?** Not required by the success criteria. Recommend a plain `/healthz` plus `sirv` for `apps/voice/dist` and `fixtures/forms` only if those directories exist; skip otherwise.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 24.14.0 | - |
| npm | workspaces | yes | 11.9.0 | - |
| Network (npm registry) | install | yes | - | - |
| Chrome / Claude / NVDA | not needed in Phase 1 | n/a | - | - |

Missing with no fallback: none. (Step 2.6 tool probes limited to Node and npm; Phase 1 has no other external dependency.)

## Test Map (formal Validation Architecture section omitted: `workflow.nyquist_validation` is `false` in `.planning/config.json`)

| Req | Behavior | Type | Command (all under `npx vitest run <path>`) |
|-----|----------|------|------|
| PROT-01 | Every fixture parses against its schema; `Intent` has no confirm variant; sensitive value non-null is rejected; unknown `type` and wrong role payload rejected | unit | `packages/protocol/test` |
| PROT-01 / D-18 | Registry `type` set equals the set of types listed in `PROTOCOL.md` tables (regex over `` `type` `` first-column cells) | unit | `packages/protocol/test/protocol-md.test.ts` |
| PAGE-02 | `buildBaselineFormModel` on each fixture equals golden, runs `< 100` ms (warm, best-of-5), also on a synthetic 250-element snapshot; tie-break order; `inferred`/`<0.7` flagged | unit | `apps/server/test/baseline.test.ts` |
| PROT-04 | Server `address().address === "127.0.0.1"`; connecting to `::1` is refused; evil Origin -> HTTP 403; no Origin refused without `--dev`; extension hello with voice Origin -> `error` + close 4003 (and reverse); `utterance` from extension -> `error role-violation`; hello timeout; first frame not hello; oversize frame; bad JSON never crashes hub; replace-on-reconnect keeps new slot | integration (real sockets, port 0) | `apps/server/test/hub.test.ts` |
| PROT-02 | REPL `utterance "what's here"` against fake extension (`booking`) returns text with field count and required count; unmatched utterance is delayed >= `fakeDelayMs` (use 50 ms in test, assert elapsed >= 50); two runs give identical output | integration | `apps/server/test/walking-skeleton.test.ts` |
| Success 5 | Voice-role client gets `welcome` then `state` | integration | same file |
| Log hygiene | With a snapshot containing a sensitive element, nothing logged contains the sentinel value | unit (spy on logger) | `apps/server/test/logging.test.ts` |

Wave 0: root `package.json`/tsconfig/vitest config, `packages/protocol` package, helper `connect({origin, role})` and `nextMessage(ws, timeoutMs)`.

## Security Domain

`security_enforcement` is absent in config, so enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3 Authentication, Session | partial | No user auth; trust is Origin + role binding + loopback bind (no shared token in Phase 1) |
| V4 Access Control | yes | Registry `senders` check per role (D-04); utterances only from `voice` |
| V5 Input Validation | yes | zod parse at every boundary, `maxPayload`, text frames only, `utterance.text` max 500 |
| V7 Logging | yes | Never log payloads or field values; log `{role,type,id,bytes}` |
| V13 API / WebSocket | yes | Origin allowlist on upgrade, Host check, path check, hello timeout |
| V14 Configuration | yes | Bind `127.0.0.1`; `--dev` is the only way to allow no-Origin or extra origins |
| V6 Cryptography | no | None in this phase |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-site WebSocket hijacking from any web page | Spoofing / Elevation | Origin allowlist at upgrade, before any frame (verified 403) |
| DNS rebinding to 127.0.0.1 | Spoofing | Host header allowlist |
| Role confusion (extension claims voice, sends `utterance`) | Elevation | Origin-bound roles + registry sender check; foundation of the Phase 3 confirm-phrase rule |
| Sensitive value leaks via snapshot, log or error | Information disclosure | Schema refinement (value null), no-payload logging, zod issues don't echo input |
| Malformed/oversized frames, parse crashes | DoS | `maxPayload`, try/catch, `error` reply, hello timeout |
| Another local process connecting without Origin | Spoofing | Out of scope (any local process can omit Origin); `--dev` only; documented, accepted for the hackathon |

## Project Constraints (from CLAUDE.md)

- TypeScript everywhere; Windows; Node 24; npm workspaces; zod 4; ws 8.22; tsx; TS 6.0.3 (not 7). Do not install with `--omit=optional`.
- Port/path: CLAUDE.md says 8787 with `/ext` and `/ui`; **superseded** by D-01/D-02 (7777, `/ws`); update CLAUDE.md at M0 with both people's agreement.
- Safety invariants: model never acts; gated kinds default-deny; confirm phrase matched in code only on voice-socket utterances; passwords/card numbers never spoken, logged or sent to the model.
- Workstream ownership: core owns `packages/protocol` authorship, `apps/server`, `tools/fake-*`, `tools/repl`; do not create the voice app folder; protocol changes after M0 need both people's sign-off; branch `core/*`.
- GSD workflow enforcement: file edits happen through GSD execution, not ad-hoc.

## Sources

### Primary (HIGH confidence)
- Scratch experiments on this machine, 2026-10-16 (Node 24.14.0 / npm 11.9.0 / Windows 11): zod 4.6.7 discriminated union + refine + literal introspection + no input echo in issues; ws 8.22.0 `noServer` hub with Origin check and `127.0.0.1` bind; npm workspaces + tsx 4.23.15 + vitest 5.0.5 `projects` + `expectTypeOf` + tsc 6.0.3; JSON fixtures via package `exports`; `concurrently` 10.0.6 `{@}` argument mangling; TS 6 `types` requirement; extension-ID derivation; parse/build timing.
- npm registry (`npm view`), 2026-10-16: all versions listed above.
- `gsd-tools query package-legitimacy check`, 2026-10-16.
- `.planning/research/ARCHITECTURE.md` lines 172-303 (schemas), 321-452 (protocol), read this session.
- `01-CONTEXT.md`, core `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/WORK-SPLIT.md`.

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` (localhost WebSocket exposure, MV3 keepalive), `STACK.md` versions.

### Tertiary (LOW confidence)
- Items tagged `[ASSUMED]` above (A1-A5).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, installed and run in a scratch monorepo.
- Architecture: HIGH for hub/registry/test patterns; MEDIUM for the exact schema fixes, which need the voice developer's agreement at M0.
- Pitfalls: HIGH for 1-3, 7, 8 (verified or read directly from the draft); MEDIUM for 4-6, 9-12 (reasoned, partly verified).

**Research date:** 2026-10-16
**Valid until:** 2026-10-23 (fast-moving release cadence; re-run `npm view` if install is delayed, and treat the pins as frozen once the lockfile is committed)
