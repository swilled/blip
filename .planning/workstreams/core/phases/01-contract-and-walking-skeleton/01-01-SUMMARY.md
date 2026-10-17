---
phase: 01-contract-and-walking-skeleton
plan: 01
subsystem: protocol
tags: [npm-workspaces, zod, vitest, typescript, websocket-protocol, schemas]

requires:
  - phase: none
    provides: greenfield repo
provides:
  - npm workspaces monorepo (packages/*, apps/*, tools/*) with exact dependency pins and a committed lockfile
  - "@blip/protocol: constants, Envelope/Hello/Welcome/ErrorMsg, MESSAGES registry, canSend/canReceive, two-stage parseFrame, buildFrame/buildRawFrame"
  - "@blip/protocol domain schemas: ActionKind (+ fail-closed isGatedKind), Snapshot/RawElement, Field/ActionTarget/FormModel, Intent (no confirm variant), ActOp/ActRequest/ActResult"
  - "@blip/policy stub re-exporting the single ActionKind"
affects: [01-02 full message set, 01-03 fixtures and baseline builder, 01-04 hub, 01-05 skeleton, voice workstream]

actuals:
  tokens: 13300
  tasks: 3
  commits: 3
plan_head_before: b5300fbbf55d8f3fdb9e379373c2edc37057c0aa
plan_head_after: ad088f7bfe38edc282393f0be6b1a6cd2b6ff08a

tech-stack:
  added: [zod 4.6.7, ws 8.22.0, sirv 3.0.2, vitest 5.0.5, tsx 4.23.15, typescript 6.0.3, vite 8.3.4, "@types/ws 8.18.2", "@types/node ^24 (24.19.2)"]
  patterns:
    - "Registry-first protocol: MESSAGES drives the Message union, per-role senders/receivers and (later) the PROTOCOL.md check"
    - "Two-stage parse (loose Envelope, then full Message); parseFrame never throws and never echoes input values"
    - "Wire schemas: no .default(), no z.lazy, non-strict objects (unknown keys stripped, D-17)"
    - "Protocol consumed as TypeScript source through the package exports map, no build step"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.base.json
    - tsconfig.json
    - vitest.config.ts
    - packages/protocol/package.json
    - packages/protocol/src/constants.ts
    - packages/protocol/src/envelope.ts
    - packages/protocol/src/ids.ts
    - packages/protocol/src/messages.ts
    - packages/protocol/src/action-kind.ts
    - packages/protocol/src/snapshot.ts
    - packages/protocol/src/form-model.ts
    - packages/protocol/src/intent.ts
    - packages/protocol/src/act.ts
    - packages/protocol/src/index.ts
    - packages/protocol/test/helpers.ts
    - packages/protocol/test/registry.test.ts
    - packages/protocol/test/snapshot.test.ts
    - packages/protocol/test/form-model.test.ts
    - packages/protocol/test/intent.test.ts
    - packages/protocol/test/act.test.ts
    - packages/policy/package.json
    - packages/policy/src/index.ts
    - packages/policy/test/reexport.test.ts
    - apps/server/package.json
    - apps/server/test/protocol-import.test.ts
    - tools/fake-extension/package.json
    - tools/repl/package.json
  modified: []

key-decisions:
  - "Dependency pins approved at the Task 1 gate, plus an extra exact vite@8.3.4 devDependency because vitest 5.0.5 has a required (non-optional) vite peer; STACK.md already names vite 8.3.x"
  - "RawElement and Field gain required hasValue (presence without value) and RawElement gains required category field|action and required integer frameId, per research Pitfalls 4, 5, 9; these are M0 sign-off items for PROTOCOL.md (plan 01-02)"
  - "Registry entries carry receivers as well as senders so canReceive is derived from the same single source"
  - "tsconfig lib includes DOM because @blip/protocol must stay browser-safe; Node types come from types: [node]"

patterns-established:
  - "Sensitive-null refinement shared by RawElement and Field through one predicate (sensitiveValueIsNull) with a constant message that never mentions the value"
  - "Test helpers makeElement/makeSnapshot/makeField in packages/protocol/test/helpers.ts for reuse by later plans"

requirements-completed: [PROT-01]

coverage:
  - id: D1
    description: "npm workspaces monorepo installs from the approved exact pins; typecheck and tests are green at the repo root"
    requirement: PROT-01
    verification:
      - kind: integration
        ref: "npm run typecheck && npm test (7 files, 96 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Registry-driven frame travels from buildFrame in one workspace to parseFrame in another, with role permissions from the single registry"
    requirement: PROT-01
    verification:
      - kind: unit
        ref: "apps/server/test/protocol-import.test.ts; packages/protocol/test/registry.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sensitive values rejected at schema level, no confirm-like Intent variant (runtime and type level), unrecognized action kinds are gated"
    requirement: PROT-01
    verification:
      - kind: unit
        ref: "packages/protocol/test/snapshot.test.ts; form-model.test.ts; intent.test.ts; packages/policy/test/reexport.test.ts"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-16
status: complete
---

# Phase 1 Plan 01: Monorepo and Protocol Foundations Summary

**npm-workspaces monorepo with a registry-first `@blip/protocol` (zod 4) that already enforces sensitive-null values, a confirm-free Intent union and fail-closed action kinds, proven across workspaces with a tracer and 96 passing tests.**

## Performance

- **Duration:** about 40 min of execution (plus the Task 1 human gate)
- **Tasks:** 3 (1 checkpoint, 1 tracer, 1 TDD)
- **Commits:** 3 task commits (tracer, TDD RED, TDD GREEN)

## Accomplishments

- Task 1 (blocking-human package gate): `npm view` audit of every pin (names, upstream repos, no direct install scripts, integrity hashes, publish dates) was presented to the user. **Approval was relayed by the orchestrator** as "Approve + pin vite@8.3.4" and recorded here as user-approved. Findings surfaced at the gate: tsx pulls esbuild, which has a legitimate `postinstall` (binary check); vitest 5.0.5 has a required vite peer, so vite 8.3.4 was pinned explicitly. concurrently was deliberately not installed.
- Task 2 (tracer): workspace scaffold, constants, Envelope, `MESSAGES` registry with five entries (hello, welcome, error, utterance, speak), `canSend`/`canReceive`, never-throwing two-stage `parseFrame`, `buildFrame`/`buildRawFrame`. `apps/server` imports `@blip/protocol` by name as TS source and round-trips a hello frame.
- Task 3 (TDD): ActionKind and `isGatedKind` (fail closed), RawElement/Snapshot with sensitive-null refinement and caps 250/40/20, Field/ActionTarget/FormModel with `isLowConfidenceLabel`, Intent with exactly 16 variants and no confirm-like member (runtime filter plus `expectTypeOf`), ActOp/ActRequest/ActResult, and the `@blip/policy` re-export test asserting identity equality.
- Install verified: `npm ls --depth=0` shows exactly zod 4.6.7, ws 8.22.0, sirv 3.0.2, vitest 5.0.5, tsx 4.23.15, typescript 6.0.3, vite 8.3.4, @types/ws 8.18.2, @types/node 24.19.2 plus the five workspaces. `npm install` reported 0 vulnerabilities.

## Task Commits

1. Task 1: no commit (checkpoint, approved)
2. Task 2 tracer: `0a4e808` feat(01-01): npm workspaces scaffold and registry-driven protocol tracer
3. Task 3 RED: `506a43a` test(01-01): failing tests for domain schemas
4. Task 3 GREEN: `ad088f7` feat(01-01): domain schemas - ActionKind, Snapshot, FormModel, Intent, Act*, policy re-export

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was branched before the planning commits**
- **Found during:** startup (plan file missing on disk)
- **Fix:** `git merge --ff-only main` on the worktree branch (HEAD was a strict ancestor); no content change beyond planning docs
- **Commit:** none (fast-forward)

**2. [Rule 3 - Blocking] vitest 5.0.5 requires a vite peer**
- **Found during:** Task 1 audit
- **Fix:** pinned `vite@8.3.4` as an exact root devDependency (user-approved at the gate)
- **Files modified:** package.json, package-lock.json
- **Commit:** 0a4e808

**3. [Rule 1 - Bug] Duplicate star export**
- **Found during:** Task 3 typecheck planning
- **Issue:** `form-model.ts` re-exported `LOW_CONFIDENCE_THRESHOLD`, which `constants.ts` already exports through the same barrel
- **Fix:** removed the re-export; the constant stays in `constants.ts` per the plan's constant list
- **Commit:** ad088f7

### Notes (not deviations)

- tsconfig `lib` includes `DOM` (plan did not specify) so the protocol stays browser-safe type-wise.
- The plan's Task 3 verify filter `npx vitest run packages/protocol packages/policy` works; a bare `packages` filter finds no files because the filter matches project paths.

**Total deviations:** 3 auto-fixed, no scope creep. **Impact:** none on the contract.

## Issues Encountered

None blocking. No auth gates.

## Known Stubs

- `packages/policy/src/index.ts` is an intentional stub that only re-exports ActionKind, GATED_KINDS and isGatedKind (D-11). Classification rules arrive in Phase 2/3.
- `tools/fake-extension` and `tools/repl` are manifest-only (no source) by plan design; plans 01-04/01-05 fill them.

## Threat Flags

None. All new surface is pure schemas and registry lookups; threats T-01-01 to T-01-05 and T-01-SC are mitigated and tested as planned.

## Next Phase Readiness

- Plan 01-02 can extend `MESSAGES` with the remaining D-14 types. M0 sign-off items to record in PROTOCOL.md: `ptt.hotkey` split (Pitfall 1), `hasValue`, `category`, required `frameId`, tagged `{ok}` unions for result payloads (Pitfall 3), registry `receivers`.
- `Message` union is an explicit member list; the parity test in `registry.test.ts` fails if it drifts from `MESSAGES`.

## Self-Check: PASSED

- All created files verified present on disk (`git status` clean after commits).
- Commits 0a4e808, 506a43a, ad088f7 are on the branch (`git rev-list --count b5300fb..HEAD` = 3 before this SUMMARY).
- `npm run typecheck` and `npm test` exit 0 (7 files, 96 tests).
