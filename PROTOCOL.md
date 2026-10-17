# Blip wire protocol

**Status: DRAFT for M0 review.** The freeze stamp is added in plan 01-03. Until then the voice developer reviews this document and the schemas in `packages/protocol/src` together.

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
| `snapshot.result` | extension | server | `{ ok: true, snapshot }` or `{ ok: false, error: { code, message } }` | `ok`-discriminated union, so a failed capture is a typed reply and not a timeout |
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
| `state` | server | voice | `{ dialogue: DialogueStateName, page: object or null, focusFieldId?, busy, extensionConnected, brain }` | pushed on every change; `page` is `{ url, title, step?, fieldCount: int, requiredEmpty: int }` |
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
