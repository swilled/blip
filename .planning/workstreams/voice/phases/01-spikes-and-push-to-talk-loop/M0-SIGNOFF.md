# M0 Sign-off (voice side)

No answer from Pranav, proceeding on the stub (docs/WORK-SPLIT.md 30-minute rule; `ptt.hold` is not in origin/main packages/protocol/src).

PTT_DELIVERY: B (voice-owned loopback sidecar socket on 127.0.0.1:7778, Origin-checked, no protocol change). R1 `ptt.hold` stays on file as an optional later upgrade to A. HO-3 is required under B: core's launcher must call startPttHook + startPttSidecar.

The protocol is frozen on disk (packages/protocol, PROTOCOL.md, protocol.lock.json). This document records exactly what voice uses and the additive requests voice needs. It edits nothing in packages/protocol.

## 1. Messages voice uses

Connection contract:
- Single endpoint `ws://127.0.0.1:7777/ws` (DEFAULT_PORT 7777, WS_PATH `/ws`, LOOPBACK_HOST `127.0.0.1`).
- First frame must be `hello {role:"voice", clientVersion, protocolVersion:1}` within HELLO_TIMEOUT_MS (2000 ms), else close 4001.
- Every frame is an envelope `{v:1, id, type, ts, payload}`, built with `buildFrame` and read with `parseFrame`.
- Voice Origin is exactly `http://127.0.0.1:7777` (`localhost` only under `--dev` or `--allow-origin`).
- A second voice connection replaces the first (close 4004).

| Type | Sender | Receiver | Payload fields |
|------|--------|----------|----------------|
| utterance | voice | server | utteranceId (1..64), text (1..MAX_UTTERANCE_CHARS = 500), source `voice` or `typed`, optional sttConfidence (0..1), optional alternatives (max 3, each up to 500 chars) |
| ptt | voice | server | state `start` or `end` |
| speak | server | voice | speakId, text, category (answer, filler, readback, confirm-prompt, error, result), interrupt (boolean), optional spell (boolean) |
| speak.done | voice | server | speakId, interrupted (boolean) |
| earcon | server | voice | name: listening, thinking, done, blocked, error |
| state | server | voice | dialogue (9 names), page (null or url, title, optional step, fieldCount, requiredEmpty), optional focusFieldId, busy, extensionConnected, brain (claude or fake). There is no "thinking" value: the window derives Thinking locally and from `busy`. |
| transcript | server | voice | utteranceId, heardAs, routedTo (grammar or model) |
| confirm.armed | server | voice | grantId, phrase, kind, actionLabel, expiresAt. Informational only. |
| confirm.cleared | server | voice | grantId, reason (executed, cancelled, expired, page-changed, value-changed). Informational only. |
| settings | voice | server | outputMode (agent-voice, screen-reader, both), optional rate, optional verbosity |
| control | voice | server | cmd: stop, repeat, reconnect-browser |

Discrepancies: none. Every row was checked against messages.ts, payloads-voice.ts and constants.ts on disk.

## 2. Requests to core (all additive)

### R1 `ptt.hold` (server to voice)
The global Right Ctrl + Space hook runs in the server process (uiohook-napi), but the frozen `ptt` message flows voice to server, so the voice window cannot learn that a hold started or ended. Request a new additive message `ptt.hold`, payload `{state: "start" | "end"}`, sender server, receiver voice.

Protocol PR contents (one pass, both developers approve per PROTOCOL.md):
1. `PttHoldPayload` schema in payloads-voice.ts.
2. Registry entry plus Message union frame in messages.ts.
3. A row in PROTOCOL.md.
4. An example in test/message-examples.ts.
5. `npm run protocol:lock` to refresh protocol.lock.json.

Decision key `PTT_DELIVERY`:
- **A (chosen): use `ptt.hold`.**
- B (fallback): the hook runs in a voice-owned sidecar process (apps/server/src/voice/ptt-sidecar.ts) that serves holds over a second loopback WebSocket (port 7778, Origin-checked to `http://127.0.0.1:7777`). The voice window opens it next to its hub connection. No protocol change.

Rule: if R1 is not merged within 30 minutes of being asked, or is declined, set PTT_DELIVERY to B (docs/WORK-SPLIT.md stub rule) and tell Pranav. Plan 09 reads PTT_DELIVERY.

### R2 optional `heardDuringSpeech` on utterance
Additive, optional boolean. NOT needed for safety: core's GATE-08 derives the guard from speak and speak.done on the server. The default z.object strips unknown keys, so core would drop the field unless it is added to the schema. Keep SEND_HEARD_DURING_SPEECH false until R2 is merged. Informational, for the demo panel only.

### R3 barge-in guard (no new behavior)
Rely on core GATE-08: "the server ignores a confirm-phrase match while a speak is outstanding (no speak.done yet) and for 1 s after speak.done, regardless of what the voice UI does with its mic". Voice's obligation (HO-6): the voice window sends `speak.done {speakId, interrupted}` for every speak it receives, including interrupted ones (interrupted true). The voice window never decides a confirm match.

## 3. Hand-offs to core

- **HO-1**: the form-tab content script suppresses Space while Ctrl is held (capture phase, keydown and keyup, all frames). Otherwise Right Ctrl + Space types a space into the focused field.
- **HO-2**: apps/server/package.json and package-lock.json gain uiohook-napi and koffi (core-owned files, Pranav approves; Plan 02 already made the edit, commit 940d424).
- **HO-3**: the real server starts the PTT hook from apps/server/src/voice/ptt-hook.ts and calls `hub.send("voice","ptt.hold",{state})` (PTT_DELIVERY A), or under B (chosen) starts startPttHook + startPttSidecar from core's launcher (required under B).
- **HO-4**: "what's here" wording. Core's describeReply (apps/server/src/reply.ts) answers "<title>. N fields, R required, A actions." and voice's reduce emits the identical wording, so the swap is optional and I1 passes either way.
- **HO-5**: if PTT_ROUTE ends up chrome.commands-toggle (spike D), the server maps the extension's `ptt.hotkey` toggle to ptt.hold.
- **HO-6**: GATE-08 present in core Phase 3 (see R3).
- **HO-7**: scripts/dev.ts adds apps/voice/dist as a static root (as apps/server/src/main.ts already does) so `npm run dev -- --no-repl` serves the window. Until then voice uses its own in-process runner (Plan 10).

## 4. Docs fixes (made in this task)

1. 01-RESEARCH.md: heading renamed to `## Open Questions (RESOLVED)` with a `RESOLVED:` line under each of the four questions.
2. .planning/REQUIREMENTS.md (shared file): VOX-05 line replaced with the amended wording from the voice REQUIREMENTS.md.
3. .planning/workstreams/voice/ROADMAP.md: Phase 1 success criterion 4 old sentence replaced with the barge-in sentence.

## 5. Sign-off status

| Item | Status | Who |
|------|--------|-----|
| R1 ptt.hold (protocol PR + protocol.lock.json) | pending | Pranav |
| R2 heardDuringSpeech | pending | Pranav |
| R3 / GATE-08 | pending | Pranav |
| HO-1 | pending | Pranav |
| HO-2 | pending | Pranav |
| HO-3 | pending | Pranav |
| HO-4 | pending | Pranav |
| HO-5 | pending | Pranav |
| HO-6 | pending | Pranav |
| HO-7 | pending | Pranav |
| PTT_DELIVERY | B (stub applied, no answer from Pranav) | Voice; tell Pranav |
| VOX-05 wording in .planning/REQUIREMENTS.md | pending | Pranav |
