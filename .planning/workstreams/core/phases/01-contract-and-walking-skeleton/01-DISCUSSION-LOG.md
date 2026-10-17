# Phase 1: Contract and Walking Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 1-Contract and Walking Skeleton
**Areas discussed:** Socket topology and port, Snapshot and FormModel shape, Intent union and message set, Fakes/REPL/scaffold

---

## Area selection

User selected all four gray areas and said: "do whatever you think is best for all, just make sure you consider it all". No per-question interview was run; Claude decided from the research docs.

## Socket topology and port

| Option | Description | Selected |
|--------|-------------|----------|
| 7777, single `/ws`, role in `hello` | ARCHITECTURE.md draft; matches roadmap criterion 4 wording | ✓ |
| 8787, `/ext` + `/ui` paths | CLAUDE.md stack table; role fixed by path | |

**User's choice:** delegated. **Notes:** Origin check bound to role gives the same safety as path-based routing. CLAUDE.md to be updated at M0.

## Snapshot and FormModel shape

| Option | Description | Selected |
|--------|-------------|----------|
| ARCHITECTURE.md shapes + schema-enforced null for sensitive values | Ranked labelCandidates, stable `e<N>` ids | ✓ |
| Redesign from scratch | Rejected: delays M0 | |

**User's choice:** delegated.

## Intent union and message set

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze full draft message set now, additive-only after | One contract, handlers stubbed with `not-implemented` | ✓ |
| Freeze only Phase 1 messages | Rejected: voice needs the whole set at M0 | |

**User's choice:** delegated.

## Fakes, REPL and scaffold

| Option | Description | Selected |
|--------|-------------|----------|
| vitest, npm workspaces, REPL as `voice` role, deterministic fake brain with configurable 1.5 s delay | | ✓ |
| node:test | Rejected: weaker TS/workspace ergonomics | |

**User's choice:** delegated.

## Claude's Discretion

Module names, logging, id format, hub internals, fixture/schema authoring order, PROTOCOL.md hand-written vs generated.

## Deferred Ideas

None.
