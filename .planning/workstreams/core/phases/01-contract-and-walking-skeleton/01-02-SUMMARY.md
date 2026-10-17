---
phase: 01-contract-and-walking-skeleton
plan: 02
subsystem: protocol
status: complete
tags: [websocket-protocol, zod, message-registry, protocol-md, extension-id]

requires:
  - phase: 01-contract-and-walking-skeleton (plan 01)
    provides: MESSAGES registry tracer, domain schemas, parseFrame/buildFrame, test helpers
provides:
  - "Complete 24-type MESSAGES registry with per-type payload schemas, senders and receivers"
  - "payloads-extension.ts and payloads-voice.ts (DialogueStateName and the voice/server payloads)"
  - "PROTOCOL.md at the repo root, checked against the registry by test (D-18)"
  - "EXTENSION_ID, EXTENSION_PUBLIC_KEY, extensionOrigin() and scripts/gen-extension-key.ts"
  - "EXAMPLES: one valid payload per message type, typed over every MessageType"
affects: [01-03 fixtures and freeze, 01-04 hub (permissions and origin rules), 01-05 skeleton, voice workstream M0 review]

actuals:
  tokens: 13200
  tasks: 3
  commits: 4
plan_head_before: af7ee8fa60c4ad3231554a085c69c29a609bd40a
plan_head_after: 9a9da0bc300f8ed9adb1f8871c7c6846cf383176

tech-stack:
  added: []
  patterns:
    - "Registry <-> PROTOCOL.md <-> test: tables whose first header cell is `type` are parsed and compared with MESSAGES keys, senders and receivers"
    - "EXAMPLES typed as { [T in MessageType]: PayloadOf<T> } so a missing example is a compile error"
    - "Independent hand-written permission table in the test, not derived from the registry"

key-files:
  created:
    - PROTOCOL.md
    - packages/protocol/src/payloads-extension.ts
    - packages/protocol/src/payloads-voice.ts
    - packages/protocol/src/extension-id.ts
    - scripts/gen-extension-key.ts
    - packages/protocol/test/message-examples.ts
    - packages/protocol/test/messages.test.ts
    - packages/protocol/test/permissions.test.ts
    - packages/protocol/test/protocol-md.test.ts
    - packages/protocol/test/extension-id.test.ts
  modified:
    - packages/protocol/src/messages.ts
    - packages/protocol/src/index.ts
    - packages/protocol/test/registry.test.ts
    - package.json

key-decisions:
  - "ptt split: ptt.hotkey (extension, {source}) and voice-only ptt ({state}); no type has two payload schemas"
  - "snapshot.result is an ok-discriminated union; act.result keeps ActResult (ok boolean plus error enum) unchanged"
  - "EXTENSION_ID gipmmdbdhebfpfoabhdpkenijaljeclp pinned from a generated 2048-bit RSA public key; private key never written"
  - "PROTOCOL.md drift test also checks the extension origin, 12 error codes and 4 close codes appear in the document"

patterns-established:
  - "Adding a message type touches: registry entry, Message union member, EXAMPLES entry, permissions table, PROTOCOL.md row; each omission fails a test or tsc"

requirements-completed: [PROT-01]

duration: 25min
completed: 2026-10-16
---

# Phase 1 Plan 02: Full message set, PROTOCOL.md and pinned extension identity Summary

**24-message registry with per-role permissions, a PROTOCOL.md that tests fail on if it drifts from the registry, and a pinned extension id derived from a committed public key.**

## Performance

- **Tasks:** 3 of 3 (Task 1 tracer, Task 2 TDD, Task 3 auto)
- **Commits:** 4 task commits (tracer, RED tests, GREEN implementation, identity plus docs)
- **Verification:** `npm run typecheck` exits 0; `npx vitest run` passes 11 files, 179 tests

## Accomplishments

- Tracer: `snapshot.request` and `snapshot.result` went through registry, PROTOCOL.md and the drift test first. The drift test was shown to fail when the `speak` row was deleted from PROTOCOL.md, then restored.
- All 24 types from D-14 are in `MESSAGES` and in the `Message` union. Senders and receivers match the hand-written table in `permissions.test.ts` for every role (T-01-06). Voice-only senders (utterance, ptt, speak.done, settings, control) and extension-only senders (snapshot.result, act.result, page.changed, ptt.hotkey, ping) are tested in both directions.
- `message-examples.ts` fails to compile if a type is missing (verified by removing `pong` and seeing TS2741, then restoring).
- `PROTOCOL.md` carries 24 type rows in three tables plus the ActOp/ActRequest/ActResult, Intent (16 variants, no confirm variant) and DialogueStateName sections, the origin allowlist with role binding, Host rule, dev-only voice origins, close codes 4001 to 4004, the 12 error codes, conventions, evolution rules, the 13 M0 sign-off items verbatim, and open items.
- `npm run gen:extension-key` prints the manifest key and id; only the public half is committed. `git status` showed only source files afterward.

## M0 sign-off items covered by this plan

Recorded in PROTOCOL.md (section "M0 sign-off items"): ptt split (item 1), `hasValue` (2), `category` and radio-as-one-element (3), `ActionKind` module (4), `snapshot.result` union (5), no defaulted fields and required `frameId` (6), port 7777 and single `/ws` superseding CLAUDE.md (7), Origin rules (8), golden-file ownership (9), `isLowConfidenceLabel` (10), pinned extension id (11), 12 error codes (12), HTTP behavior (13). Receivers are in the registry for all 24 types. Items 2, 3 and required `frameId` were already implemented in plan 01-01; this plan documents them.

## Deviations from Plan

None - plan executed as written.

Notes, not deviations:
- The plan's "act.result ... tagged `{ok}` union" in the hand-off message is satisfied by `ActResult` as designed in plan 01-01 (`ok` boolean with an optional typed `error`). Only `snapshot.result` was converted to a discriminated union, as plan 01-02 specifies. If voice wants `act.result` as a strict discriminated union, that is an M0 conversation, not done here.
- Added one extra drift check to `protocol-md.test.ts` (extension origin, error codes, close codes appear in the document), beyond the plan's three assertions.
- `registry.test.ts` now reads its sample payloads from `EXAMPLES` instead of an inline list.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. No new network surface; the enforcement of `senders` lives in the hub (plan 01-04).

## Next

- Plan 01-03: fixtures, baseline builder, the golden `booking.formmodel.json`, and the PROTOCOL.md freeze stamp.
- Plan 01-04: the hub must enforce `canSend` per role, the Origin and Host rules, and the `--dev` / `--allow-origin` flags exactly as PROTOCOL.md documents.
- Open item for both developers: CLAUDE.md still says 8787 with `/ext` and `/ui`.

## Self-Check: PASSED

- FOUND: PROTOCOL.md, packages/protocol/src/payloads-extension.ts, packages/protocol/src/payloads-voice.ts, packages/protocol/src/extension-id.ts, scripts/gen-extension-key.ts, and the five test files
- FOUND commits: 4805fd9, c31842a, 633bf62, 9a9da0b
