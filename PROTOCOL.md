# Blip wire protocol

Status: FROZEN v1 (M0)

M0 approval: pending

The freeze is provisional until the M0 PR is approved in writing by the voice developer. When that approval arrives, replace the line above with `M0 approval: received (<where the written approval lives>)` in the same PR, before it merges. Never write `received` without a location.

The registry in `packages/protocol/src/messages.ts` is the source of truth. A test (`packages/protocol/test/protocol-md.test.ts`) fails if a message type or its from/to columns differ between this file and the registry.

## Transport

- One WebSocket server at `ws://127.0.0.1:7777/ws` (D-01 port 7777, loopback only; D-02 a single endpoint). Use the IPv4 literal `127.0.0.1`, never `localhost`.
- JSON text frames only. Binary frames are rejected. Maximum frame size is 2 MiB.
- The first frame on a connection must be a `hello` that claims a role (`extension` or `voice`), sent within 2 seconds of the upgrade.
- Unknown or invalid frames get an `error` reply, never a crash.
- Keepalive (D-06): the extension sends `ping` every 20 s, which keeps the MV3 service worker alive. The server replies `pong`.

## Envelope

Every frame is an envelope:

```ts
{ v: 1, id: string, type: string, replyTo?: string, ts: number, payload: unknown }
```

- `id` is unique per frame (1 to 64 characters).
- A reply sets `replyTo` to the `id` of the request it answers.
- The payload is validated per `type` against the registry. Payload objects are non-strict: unknown keys are stripped, so an additive field never breaks an older peer.

## Messages

In the tables below `from` is the role allowed to put the frame on the wire and `to` is the role that receives it. Roles are `extension`, `voice` and `server`. There are 24 types. The server enforces `from` per connection (D-04): a frame whose type the connection's role may not send is answered with a `role-violation` error and never routed.

### Handshake and shared

| type | from | to | payload | notes |
|---|---|---|---|---|
| `hello` | extension, voice | server | `{ role, clientVersion, protocolVersion: 1 }` | first frame, within 2 s |
| `welcome` | server | extension, voice | `{ sessionId, serverVersion, brain: claude or fake }` | reply to `hello` |
| `error` | server | extension, voice | `{ code, message, fatal }` | `code` is an open string, see the error code table |

### Extension to Server

Includes the server-to-extension requests, listed next to the replies they expect.

| type | from | to | payload | notes |
|---|---|---|---|---|
| `snapshot.request` | server | extension | `{ tabId?: int, reason: page-load, user, post-act or refresh }` | the extension replies `snapshot.result` (timeout 8 s) |
| `snapshot.result` | extension | server | `{ ok: true, snapshot }` or `{ ok: false, error: { code, message } }` | `ok`-discriminated union; `Snapshot.untrustedInstructionDetected?` is an optional warning-only boolean |
| `act.request` | server | extension | `ActRequest` (see below) | the extension replies `act.result` (timeout 5 s) |
| `act.result` | extension | server | `ActResult` (see below) | carries `observedValue` for verify-after-write |
| `page.changed` | extension | server | `{ tabId: int, url, reason: navigation, mutation or tab-activated, structuralHash? }` | debounced 500 ms; the server decides whether to re-snapshot |
| `announce` | server | extension | `{ text (max 500), politeness: polite or assertive }` | in-page live region for NVDA mode |
| `highlight` | server | extension | `{ targetId: string or null }` | visual aid for a sighted audience; null clears |
| `ptt.hotkey` | extension | server | `{ source: "global-hotkey" }` | relayed from `chrome.commands`; toggle only, there is no keyup |
| `ping` | extension | server | `{}` | every 20 s |
| `pong` | server | extension | `{}` | reply to `ping` |

### Voice to Server

Includes the server-to-voice pushes.

| type | from | to | payload | notes |
|---|---|---|---|---|
| `utterance` | voice | server | `{ utteranceId, text (1 to 500 chars), source: voice or typed, sttConfidence?, alternatives? }` | final transcripts only; the confirm phrase is matched in code only on these |
| `ptt` | voice | server | `{ state: start or end }` | on `start` the server stops speech and cancels the pending brain turn |
| `speak.done` | voice | server | `{ speakId, interrupted: boolean }` | required for read-back before arming a confirmation |
| `settings` | voice | server | `{ outputMode: agent-voice, screen-reader or both, rate?: number, verbosity?: short or normal }` | |
| `control` | voice | server | `{ cmd: stop, repeat or reconnect-browser }` | `stop` also works from a button and a hotkey |
| `speak` | server | voice | `{ speakId, text, category, interrupt, spell? }` | the UI queues it; `interrupt` flushes the queue. `category` is answer, filler, readback, confirm-prompt, error or result |
| `earcon` | server | voice | `{ name: listening, thinking, done, blocked or error }` | non-verbal latency cue |
| `confirm.armed` | server | voice | `{ grantId, phrase, kind: ActionKind, actionLabel, expiresAt: number }` | informational only; the UI displays "Say: submit form" |
| `confirm.cleared` | server | voice | `{ grantId, reason: executed, cancelled, expired, page-changed or value-changed }` | |
| `state` | server | voice | `{ dialogue: DialogueStateName, page: object or null, focusFieldId?, busy, extensionConnected, brain }` | pushed on every change; `page` is `{ url, title, step?, fieldCount: int, requiredEmpty: int, untrustedInstructionDetected?: boolean }` |
| `transcript` | server | voice | `{ utteranceId, heardAs, routedTo: grammar or model }` | debug and demo panel |

## ActOp, ActRequest and ActResult

`act.request` carries an `ActRequest` and `act.result` carries an `ActResult`.

`ActOp` is a union on `op`:

- `fill`: `{ targetId, value }`
- `select`: `{ targetId, optionValue }`
- `check`: `{ targetId, checked: boolean }`
- `focus`: `{ targetId }` (used for password and card fields: the user types)
- `click`: `{ targetId }`
- `scroll-into-view`: `{ targetId }`

`ActRequest` fields: `actId`, `tabId` (int), `snapshotVersion` (int), `action` (an `ActOp`), `expectedKind` (an `ActionKind`, the server's classification), and `gate?` with `{ grantId, kind }`, present only for gated kinds.

`ActResult` fields: `actId`, `ok` (boolean), `error?` (one of `target-not-found`, `stale-snapshot`, `kind-mismatch`, `gate-required`, `sensitive-field`, `disabled`, `exception`), `detail?` (max 300), `observedValue?` (string or null, the DOM value read back after fill or select), `liveKind?` (an `ActionKind`), `newSnapshotVersion?` (int).

`ActionKind` is `fill`, `select`, `check`, `click-safe` (ungated) and `submit`, `pay`, `delete`, `send`, `navigate-cross-domain` (gated). Any other string is treated as gated.

## Intent

The model (or the grammar) produces an `Intent`, a union on `type` with 16 variants: `describe`, `read_form`, `whats_required`, `what_went_wrong`, `read_back`, `fill_profile`, `go_to_field` (`fieldId`), `set_fields` (`fills`, up to 20 of `{ fieldId, value }`), `spell` (`fieldId`), `undo`, `stop`, `request_action` (`actionId`), `click_safe` (`actionId`), `answer` (`text`), `clarify` (`question`), `unknown`.

There is deliberately no `confirm`, `approve` or `submit_now` variant. The model may request an action but can never grant one; the confirm phrase is matched in server code on `utterance` frames from the voice socket only.

## DialogueStateName

Nine values, a closed enum: `no-page`, `ready`, `describing`, `awaiting-value`, `reading-back`, `awaiting-confirm`, `executing`, `awaiting-result`, `reading-result`.

## Origin allowlist and role binding

The server checks the `Origin` header on the HTTP upgrade, before any frame is read. A role is bound to the Origin: the `role` claimed in `hello` must match the role the Origin is allowed to hold (D-03). A mismatch gets an `error` frame (`role-origin-mismatch`) and a close with code 4003.

The pinned extension id is `gipmmdbdhebfpfoabhdpkenijaljeclp`, exported as `EXTENSION_ID` from `@blip/protocol` together with `EXTENSION_PUBLIC_KEY` (the manifest `key` value) and `extensionOrigin()`. The id derives from the committed public key, and the private key was discarded.

| origin | role | notes |
|---|---|---|
| `chrome-extension://gipmmdbdhebfpfoabhdpkenijaljeclp` | extension | the pinned id from `EXTENSION_ID` |
| `http://127.0.0.1:7777` | voice | the voice UI served by the server itself |
| no Origin header | extension or voice | only when the server runs with `--dev`, for Node tools and fakes |
| anything else | none | rejected on the HTTP upgrade (any website can open a WebSocket to localhost) |

### Host header rule

Only `127.0.0.1:<port>` is accepted as the `Host` header. Under `--dev`, `localhost:<port>` is accepted as well. Any other host is rejected, which blocks DNS-rebinding pages.

### Dev-only voice origins

Under `--dev` the server also grants the voice role to `http://localhost:<port>`, `http://127.0.0.1:5173` and `http://localhost:5173` (the default Vite dev-server ports). A repeatable `--allow-origin <origin>` flag adds more origins; it grants voice only, accepts only loopback `http` origins, and requires `--dev`. The extension origin can never be added this way. The voice developer opens the UI from the production URL `http://127.0.0.1:7777/` or from their Vite dev server under `--dev`. The flags are implemented in plan 01-04.

## Close codes

| code | name | meaning |
|---|---|---|
| 4001 | hello-timeout | no `hello` within 2 s of the upgrade |
| 4002 | bad-hello | the first frame was not a valid `hello`, or the role was unacceptable |
| 4003 | role-origin-mismatch | the claimed role is not allowed for this Origin |
| 4004 | replaced | a newer connection with the same role replaced this one |

## Error codes

The wire field `error.code` is an open string so a code added later never breaks an older parser. These twelve names are agreed:

| code | meaning |
|---|---|
| bad-json | the frame was not valid UTF-8 JSON |
| bad-envelope | valid JSON but not a valid envelope |
| unknown-type | well-formed envelope with an unregistered `type` |
| invalid-payload | the payload does not match the schema for its type |
| role-violation | the connection's role may not send this type |
| role-origin-mismatch | the claimed role is not allowed for this Origin |
| hello-required | a frame other than `hello` arrived first |
| hello-timeout | no `hello` within 2 s |
| already-bound | a second `hello` on an already bound connection |
| not-implemented | the type is valid but the server has no handler yet |
| unexpected-reply | a reply with no matching pending request |
| replaced | a newer connection took over this role |

## Conventions

- **Element ids.** `e<N>`, assigned by the extension, never reassigned for the life of a page. The same id appears in `Snapshot` and in `FormModel`; document order is carried by a separate integer `order`.
- **`category`.** Every `RawElement` has `category` of `field` or `action`. A consumer treats a missing or unknown category as `action` (fail closed).
- **`hasValue`.** `RawElement` and `Field` carry `hasValue: boolean` so a filled password can be reported without exposing it. `requiredEmpty` counts use `hasValue`, never `value`.
- **`frameId`.** Required integer on every `RawElement`; there are no defaulted fields.
- **Radio group.** One element, not one per option: `id` is the group id, `inputType` is `radio`, `options[].selected` marks the choice, and `value` is the selected option value or null.
- **Checkbox.** Uses `checked`, with `value` null. **Select** uses `options` with `selected`, and `value` is the selected option value.
- **Sensitive values.** When `sensitive` is not `none`, `value` is always null, in `Snapshot`, `FormModel`, and every frame. This is enforced by the schemas.
- **GATE-07 warning signal.** `Snapshot.untrustedInstructionDetected?` and `StatePayload.page.untrustedInstructionDetected?` are optional booleans; older peers may omit them. The local detector sends no matched page prose, URL/query data, form value, or detector detail. The signal is warning-only and never changes an action kind, grant, confirmation, or permission.
- **Caps.** At most 250 elements per snapshot, 40 headings, 20 alerts. The roughly 8k-token cap is applied at the model-prompt boundary in Phase 4, not on the wire.
- **Label provenance (D-05).** `RawElement.labelCandidates[].source` is deterministic extension evidence (`aria`, `label`, `nearby-text`, `placeholder`, `inferred`) and excludes `model`. Resolved `Field.labelSource` may additionally be `model` only after server code applies a validated repair. Baseline ranking accepts raw sources only; the protocol lock stores both lists independently.
- **FormModel conventions** the baseline builder follows:
  - the best label is the highest-confidence candidate, ties broken by source order `aria`, `label`, `nearby-text`, `placeholder`, `inferred`;
  - `required` is true when `requiredSource` is not `none`;
  - invisible elements are excluded;
  - an action with a missing or non-action kind becomes `submit`;
  - the form title is the first level-1 heading text, else the page title;
  - the primary action is the first `submit`, else `pay`, else `send`;
  - a low-confidence label is flagged by the derived predicate `isLowConfidenceLabel` (label source `inferred`, or confidence below 0.7), not by a stored field.

## Evolution rules (D-17)

- After M0 sign-off, changes are additive and optional only. `v` stays 1.
- A new optional field or a new message type needs a PR that both developers approve, plus the matching edit in this file.
- Enums are closed. Widening an enum needs both developers' agreement.
- Never rename or remove a type, field or enum value.
- Receivers ignore unknown keys (payload objects are non-strict), so an older peer tolerates an additive field.
- The freeze is mechanical: `packages/protocol/protocol.lock.json` lists every message type with its senders and receivers, the Intent types, ActionKind members, DialogueStateName values, separate raw and resolved label source lists, and the fixture files. `packages/protocol/test/protocol-lock.test.ts` fails if any locked item is removed or a message's senders or receivers change. New types and members pass.
- Edits to the lock file and to this document ride in the same PR as the additive change they describe. `npm run protocol:lock` regenerates the lock and may be run only inside a protocol PR that both developers approve.

## M0 sign-off items

Deliberate changes to the ARCHITECTURE.md draft, listed for the voice developer's PR approval:

1. `ptt` is split: extension hotkey relay is `ptt.hotkey` (extension role); `ptt` stays voice-only with `{ state: "start" | "end" }`.
2. `hasValue: boolean` added to RawElement and Field so a filled password can be reported without exposing it; `requiredEmpty` counts use `hasValue`.
3. `category: "field" | "action"` added to RawElement; a radio group is ONE element (group id, `options[].selected`).
4. `ActionKind` lives in its own module and is re-exported by `@blip/policy`; no lazy schema references.
5. `snapshot.result` is an `ok`-discriminated union.
6. No defaulted fields (`frameId` is required); payload objects are non-strict so older peers tolerate additive fields; the `error.code` wire field is an open string with a documented list; closed enums widen only by agreement.
7. Port 7777 and the single `/ws` endpoint supersede CLAUDE.md's 8787 with `/ext` and `/ui` (D-01, D-02). CLAUDE.md is a shared file and is NOT edited here; it needs both developers' agreement (open item).
8. Origin rules: roles are bound to Origin; Host header allowlist; dev-only extra voice origins (default Vite ports) and a repeatable `--allow-origin` flag that grants voice only and requires `--dev`; close codes 4001-4004.
9. `booking.formmodel.json` is generated by the baseline builder and frozen as a golden file by core; voice reviews it in the M0 PR (it is not hand-written by a second author).
10. Low-confidence label flagging is the derived predicate `isLowConfidenceLabel` (inferred, or confidence below 0.7), not a stored field.
11. EXTENSION_ID and the manifest public key are committed; the private key is discarded.
12. Server-level error codes (12) are agreed names: bad-json, bad-envelope, unknown-type, invalid-payload, role-violation, role-origin-mismatch, hello-required, hello-timeout, already-bound, not-implemented, unexpected-reply, replaced.
13. HTTP on the same port serves `/healthz` only by default; static serving (sirv) of `apps/voice/dist` at `/` and `fixtures/forms` at `/fixtures/forms` is switched on only when those directories exist. The voice UI may instead run from its own dev-server origin (item 8). No protocol impact.

## Open items

- CLAUDE.md still says port 8787 with `/ext` and `/ui` endpoints. This document supersedes that text. CLAUDE.md is a shared file, so it is not edited here; both developers must agree to update it.
- Root `package.json` and `package-lock.json` are shared files. They were created in plan 01-01 and extended by the scripts added in this phase (`gen:extension-key`, `fixtures:update`, `protocol:lock`). They appear in the M0 PR diff and are listed in its checklist.
