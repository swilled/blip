# Blip wire protocol

**Status: DRAFT for M0 review.** The freeze stamp is added in plan 01-03. Until then the voice developer reviews this document and the schemas in `packages/protocol/src` together.

The registry in `packages/protocol/src/messages.ts` is the source of truth. A test (`packages/protocol/test/protocol-md.test.ts`) fails if a message type or its from/to columns differ between this file and the registry.

## Transport

- One WebSocket server at `ws://127.0.0.1:7777/ws` (D-01 port 7777, loopback only; D-02 a single endpoint). Use the IPv4 literal `127.0.0.1`, never `localhost`.
- JSON text frames only. Binary frames are rejected. Maximum frame size is 2 MiB.
- The first frame on a connection must be a `hello` that claims a role (`extension` or `voice`), sent within 2 seconds of the upgrade.
- Unknown or invalid frames get an `error` reply, never a crash.

## Envelope

Every frame is an envelope:

```ts
{ v: 1, id: string, type: string, replyTo?: string, ts: number, payload: unknown }
```

- `id` is unique per frame (1 to 64 characters).
- A reply sets `replyTo` to the `id` of the request it answers.
- The payload is validated per `type` against the registry. Payload objects are non-strict: unknown keys are stripped, so an additive field never breaks an older peer.

## Messages

In the tables below `from` is the role allowed to put the frame on the wire and `to` is the role that receives it. Roles are `extension`, `voice` and `server`.

### Handshake and shared

| type | from | to | payload | notes |
|---|---|---|---|---|
| `hello` | extension, voice | server | `{ role, clientVersion, protocolVersion: 1 }` | first frame, within 2 s |
| `welcome` | server | extension, voice | `{ sessionId, serverVersion, brain: claude or fake }` | reply to `hello` |
| `error` | server | extension, voice | `{ code, message, fatal }` | `code` is an open string, see the error code table |

### Extension to Server and Server to Extension

| type | from | to | payload | notes |
|---|---|---|---|---|
| `snapshot.request` | server | extension | `{ tabId?: int, reason: page-load, user, post-act or refresh }` | the extension replies `snapshot.result` (timeout 8 s) |
| `snapshot.result` | extension | server | `{ ok: true, snapshot }` or `{ ok: false, error: { code, message } }` | `ok`-discriminated union, so a failed capture is a typed reply and not a timeout |

### Voice to Server and Server to Voice

| type | from | to | payload | notes |
|---|---|---|---|---|
| `utterance` | voice | server | `{ utteranceId, text (1 to 500 chars), source: voice or typed, sttConfidence?, alternatives? }` | final transcripts only; the confirm phrase is matched in code only on these |
| `speak` | server | voice | `{ speakId, text, category, interrupt, spell? }` | the UI queues it; `interrupt` flushes the queue |

More rows are added in the next task; the full list will have 24 types.
