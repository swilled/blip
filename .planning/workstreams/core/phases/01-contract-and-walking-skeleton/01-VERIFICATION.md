---
phase: 01-contract-and-walking-skeleton
verified: 2026-10-16T20:40:00Z
status: human_needed
score: 3/5 must-haves verified
covered_files:
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-01-PLAN.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-01-SUMMARY.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-02-PLAN.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-02-SUMMARY.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-03-PLAN.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-03-SUMMARY.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-04-PLAN.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-04-SUMMARY.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-05-PLAN.md"
  - ".planning/workstreams/core/phases/01-contract-and-walking-skeleton/01-05-SUMMARY.md"
  - "PROTOCOL.md"
  - "apps/server/src/baseline/build.ts"
  - "apps/server/src/hub/guard.ts"
  - "apps/server/src/hub/hub.ts"
  - "apps/server/src/turn.ts"
  - "packages/protocol/src/intent.ts"
  - "packages/protocol/src/messages.ts"
  - "scripts/dev.ts"
covered_digest: "v3:sha256:ab075ea80f2017b1b68a9ae62f0335da09b73a04851635cd5f6ba737832ed269"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Voice developer written M0 sign-off of @blip/protocol v1 and PROTOCOL.md (ROADMAP criterion 1)"
    expected: "Voice developer approves the M0 PR in writing; PROTOCOL.md line 'M0 approval: pending' is replaced with 'M0 approval: received (<location>)' in the same PR before merge"
    why_human: "Sign-off is a human act by the other developer. The freeze was deliberately recorded as provisional by the user. The contract itself (schemas, fixtures, registry parity, lock file) is verified in code."
  - test: "Voice UI attaches to the real server: run `npm run dev -- --brain=fake --no-repl`, open the voice developer's UI pointed at ws://127.0.0.1:7777/ws (ROADMAP criterion 5)"
    expected: "UI connects as role=voice, receives `welcome` and a `state` push, and the voice track can retire dev/mock-server"
    why_human: "The voice UI does not exist in this repo (apps/ contains only server). The server side was exercised with a scripted voice-origin client (welcome + state received), but the real UI cannot be run from here."
---

# Phase 1: Contract and Walking Skeleton Verification Report

**Phase Goal:** Both developers build against one frozen contract, and the whole loop (typed utterance -> server -> extension snapshot -> spoken reply) runs on one machine with no Chrome, no voice UI and no Claude.
**Verified:** 2026-10-16
**Status:** human_needed
**Re-verification:** No, initial verification

Automated checks all pass. No code gaps were found. The two open items are the voice developer's written M0 sign-off and a run of the real voice UI against the server. Both are known and were agreed to be human-gated.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@blip/protocol` holds zod schemas and fixtures for every extension<->server and voice<->server message, Snapshot/FormModel, ActRequest/ActResult and the Intent union (no confirm variant); `PROTOCOL.md` matches; voice dev signed off | ? UNCERTAIN (human) | Contract verified: `packages/protocol/src/messages.ts` has a 24-entry `MESSAGES` registry and a matching 24-member `Message` discriminated union (parity test in `registry.test.ts`); `act.ts`, `snapshot.ts`, `form-model.ts`, `intent.ts` exist; 5 fixtures in `packages/protocol/fixtures/`; `protocol-md.test.ts` checks PROTOCOL.md against the registry; `protocol.lock.json` + `protocol-lock.test.ts` enforce the freeze. `intent.ts` has 16 variants and no confirm/approve/submit_now, with runtime and type-level tests (`intent.test.ts` lines 31-41). Sign-off: PROTOCOL.md line 5 reads `M0 approval: pending`. |
| 2 | With Claude unreachable, `npm run dev -- --brain=fake` starts server + fake extension + REPL; "what's here" returns a reply built from the fixture (field and required counts) with the ~1.5 s fake-brain delay on model-routed turns | VERIFIED | Ran `scripts/dev.ts --brain=fake --port 0` and typed into the REPL: `speak[answer]: Hotel booking. 9 fields, 6 required, 3 actions.` Model-routed utterance produced `earcon: thinking`, `speak[filler]: One moment.`, then the offline-mode answer. `fake-brain.test.ts` asserts the 1500 ms delay via injected sleep and `walking-skeleton.test.ts` covers the model route. `--brain=claude` exits with a clear Phase 4 message. |
| 3 | For every fixture snapshot, code builds the baseline form model in under 100 ms, unit tested | VERIFIED | `buildBaselineFormModel` in `apps/server/src/baseline/build.ts` is pure and fully populated (id, label, labelSource, confidence, type, required, options, value, error, plus fail-closed action kinds and a single primary). `baseline.test.ts` line 385 runs `it.each(FIXTURE_NAMES)` with best-of-5 `< 100` ms for all 4 snapshot fixtures plus a synthetic 250-element case, and compares against the golden `booking.formmodel.json`. Passes. |
| 4 | Server listens on 127.0.0.1 only; a WebSocket from an ordinary web page Origin is rejected; an `utterance` from a client that said hello as `extension` is refused | VERIFIED | `server.listen(boundPort, LOOPBACK_HOST)` confirmed; `netstat` shows `127.0.0.1:7777 LISTENING`. Live probe against `npm run dev -- --no-repl`: `Origin: https://evil.example` -> HTTP 403 (before any frame); extension Origin + hello extension + utterance -> `welcome` then `error:role-violation`; voice Origin claiming extension -> `error:role-origin-mismatch`. `hub.ts` checks Host, path, then Origin before `handleUpgrade`, and checks `canSend(role, type)` per frame. `security.test.ts` covers these on real sockets. |
| 5 | The voice developer's UI, pointed at the real server, connects as `role=voice` and receives `welcome` and `state` | ? UNCERTAIN (human) | Server side verified: scripted client with the voice Origin and `hello` role=voice received `welcome` and `state` from the real server on 7777. The actual voice UI is not in this repo, so the end-to-end attach could not be run. |

**Score:** 3/5 truths verified (2 routed to human verification, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/protocol/src/messages.ts` | 24-type registry, `parseFrame`, `buildFrame`, `canSend/canReceive` | VERIFIED | Substantive and wired; used by hub and tools |
| `packages/protocol/src/intent.ts` | Intent union without confirm variant | VERIFIED | 16 variants, tested |
| `packages/protocol/fixtures/*.json` | booking, broken, result-ok, result-errors snapshots + golden form model | VERIFIED | Loaded via `fixtures-loader.ts`, schema-parsed, used by baseline and fake extension |
| `packages/protocol/protocol.lock.json` | Mechanical freeze | VERIFIED | Enforced by `protocol-lock.test.ts` |
| `PROTOCOL.md` | Matches registry | VERIFIED (sign-off pending) | `protocol-md.test.ts` passes |
| `apps/server/src/hub/{hub,guard}.ts` | Loopback hub, Origin/Host guard, role binding | VERIFIED | Live-probed |
| `apps/server/src/baseline/*` | Pure baseline builder | VERIFIED | |
| `apps/server/src/{turn,reply,brain/*}.ts` | Turn handling, fake brain, grammar | VERIFIED | Only read-only intents act; every other intent replies "I can't do that yet" and sends no `act.request` |
| `tools/fake-extension`, `tools/repl`, `scripts/dev.ts` | Offline loop | VERIFIED | Live-run |
| `packages/policy/src/index.ts` | Re-export stub | VERIFIED | Intentional Phase 3 placeholder with a re-export test |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| REPL / voice client -> hub `/ws` -> `handleUtterance` | fake extension `snapshot.request` -> `snapshot.result` -> `session.applySnapshot` -> `buildBaselineFormModel` -> `speak` | WIRED | Observed end to end in the live run |
| `@blip/protocol` registry -> hub role permissions | `canSend`/`canReceive` | WIRED | Live role-violation observed |
| `@blip/protocol` -> `apps/server`, tools, scripts | TS-source workspace import | WIRED | `protocol-import.test.ts`, typecheck clean |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Reply "9 fields, 6 required, 3 actions" | `session.model` | fixture snapshot -> hub request -> baseline builder | Yes (fixture served by the fake extension through the real socket) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npx vitest run` | 28 files, 472 tests passed | PASS |
| Typecheck | `tsc --noEmit -p .` | exit 0 | PASS |
| Walking skeleton | `tsx scripts/dev.ts --brain=fake --port 0` with piped utterances | Expected replies | PASS |
| Origin / role guard | scripted ws client against a live server | 403 / role-violation / role-origin-mismatch | PASS |
| Claude brain refusal | `--brain=claude` | Clear message, no start | PASS |

### Probe Execution

No probes declared. Step 7c skipped.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| PROT-01 | One `@blip/protocol` package of zod schemas + fixtures | SATISFIED in code (voice sign-off pending, see human item 1) | Registry, fixtures, lock, PROTOCOL.md test |
| PROT-02 | Run offline with fake extension, `--brain=fake`, REPL | SATISFIED | Live run |
| PROT-04 | Loopback bind, Origin rejection | SATISFIED | Live probe + `security.test.ts` |
| PAGE-02 | Baseline form model under 100 ms | SATISFIED | Per-fixture timing tests |

No orphaned requirements: REQUIREMENTS.md maps only PROT-01, PROT-02, PROT-04, PAGE-02 to Phase 1 (PROT-03 is Phase 5). The REQUIREMENTS.md traceability table still shows these as `Pending`; updating it is left to the orchestrator.

### Anti-Patterns Found

No TBD/FIXME/XXX markers in `apps/`, `packages/`, `tools/`, `scripts/`, or `PROTOCOL.md`. No stub returns on the live path.

| Note | Severity | Impact |
|------|----------|--------|
| `npm run dev` always runs the hub in `dev: true`, which accepts no-Origin clients and also treats `http://localhost:5173`/`:port` as voice origins | Info | Dev-only by design (documented, tested in `security.test.ts`). Browsers always send an Origin, and the extension role is never granted to dev origins. Non-dev behavior is covered by tests. Must not carry into the Phase 5 one-command startup. |
| CLAUDE.md still states port 8787 with `/ext` and `/ui` | Info | Known open item in PROTOCOL.md; PROTOCOL.md supersedes it, and CLAUDE.md is a shared file needing both developers' agreement. |

### Human Verification Required

#### 1. Voice developer M0 sign-off

**Test:** Voice developer reviews the M0 PR (including the 13 sign-off items and the golden `booking.formmodel.json`) and approves in writing.
**Expected:** PROTOCOL.md header changes to `M0 approval: received (<location>)`.
**Why human:** Needs the other developer. Freeze is provisional by explicit user choice.

#### 2. Real voice UI attach

**Test:** `npm run dev -- --brain=fake --no-repl`, then point the voice UI at `ws://127.0.0.1:7777/ws` from its dev origin (default Vite ports are allowed under dev; otherwise pass `--allow-origin`).
**Expected:** Connects as `role=voice`, receives `welcome` and `state`, and can drive a "what's here" turn; `dev/mock-server` can be retired.
**Why human:** The voice UI is not in this repo.

### Gaps Summary

No gaps. Every automated truth holds against the actual code and a live run, and the SUMMARY claims (472 tests, typecheck clean) were reproduced independently. The phase is `human_needed` only because criterion 1's sign-off clause and criterion 5's voice-UI attach require the voice developer.

---

_Verified: 2026-10-16_
_Verifier: Claude (gsd-verifier)_
