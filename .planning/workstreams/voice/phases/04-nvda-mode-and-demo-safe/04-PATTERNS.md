# Phase 4: NVDA Mode and Demo-Safe — Pattern Map

**Mapped:** 2026-10-17  
**Files analyzed:** 13 likely existing files, plus human-run artifacts  
**Scope:** VOX-07, VOX-08, DEMO-03, DEMO-04. Existing protocol contracts only; no schema changes assumed.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `apps/voice/src/tts.ts` | service | queued streaming speech | same module; `apps/voice/src/main.ts` synthesizer adapter | exact / role-match |
| `apps/voice/src/main.ts` | controller | event-driven UI and speech routing | same module's typed-input and TTS wiring | exact |
| `apps/voice/index.html` | component / markup | request-response controls | native start button and typed form | exact |
| `apps/voice/src/styles.css` | presentation | UI state | existing `:focus-visible` and form styles | exact |
| `apps/voice/src/socket.ts` | service / protocol client | request-response | `sendUtterance`, `sendPtt`, `sendSpeakDone` | exact |
| `apps/voice/src/speak-bridge.ts` | adapter | event-driven speech/completion | tracked `speakId` bridge | exact |
| `apps/server/src/server.ts` | controller / handler registry | event-driven messages | `settings` and `speak.done` handlers | exact |
| `apps/server/src/voice/nvda.ts` | service / native FFI | request-response | existing speak/cancel DLL calls | exact |
| `apps/voice/src/ui-log.ts` | UI utility | transform / DOM rendering | safe caption and exchange rendering | exact |
| `dev/mock-server/src/run-real.ts` | demo server | static file serving + event-driven startup | local static roots and runner setup | exact |
| `dev/mock-server/src/reset.ts` | demo utility | file I/O + process orchestration | fictional profile reset and Chrome launch | exact |
| `dev/mock-server/src/launch-window.ts` | launcher | process orchestration | Chrome app-window argument builder | exact |
| `fixtures/demo/profile.template.json` | fixture | static data | current fictional demo profile | exact |
| Phase 4 run sheet, offline demo copies, and backup video | demo assets | human-run / static files | no rehearsal/video analog identified | none |

## Pattern Assignments

### Session speech-rate controls — `tts.ts`, `main.ts`, `index.html`, `styles.css`

The TTS queue serializes sentences and calls one injected synthesizer per sentence. Preserve that boundary; session rate belongs with voice-window state and should affect newly synthesized utterances. The current adapter creates each browser utterance and connects completion/error callbacks:

**Analog:** `apps/voice/src/main.ts:24-39`

```ts
speak(text, handlers) {
  const u = new SpeechSynthesisUtterance(text);
  // choose local Microsoft English voice
  u.onend = () => handlers.onend();
  u.onerror = (ev) => handlers.onerror(ev.error);
  ss.speak(u);
}
```

`apps/voice/src/tts.ts:110-125,127-145` is the queue pattern: `speakSentence()` submits only the active sentence, `pump()` advances one item at a time, and `speak()` enqueues. Capture the session rate at the next utterance boundary; keep cancellation for interruption/mode changes, not rate changes. `main.ts:42-54` is the existing location for per-window state. Add controls as native labeled buttons in `index.html` alongside the typed form (`62-68`); reuse the visible focus ring and button sizing in `styles.css:40-52`.

### Exclusive NVDA mode and completion — `main.ts`, `socket.ts`, `speak-bridge.ts`, `server.ts`, `nvda.ts`, `index.html`

The protocol already provides `SettingsPayload` with `outputMode: "agent-voice" | "screen-reader" | "both"` and optional `rate` (`packages/protocol/src/payloads-voice.ts:27-39`), and routes `settings` and `speak.done` from voice to server (`packages/protocol/src/messages.ts:81-85`). Keep the user-facing choices exclusive per D-02; do not change the schema or select `both`. The current voice socket sends ordinary frames through `send()` and exposes typed protocol methods (`apps/voice/src/socket.ts:36-47,62-64,110-127`); extend this client pattern for settings if needed.

**Tracked completion analog:** `apps/voice/src/speak-bridge.ts:12-25`

```ts
onSpeak(p) {
  deps.tts.markReplied();
  if (p.interrupt) deps.tts.cancel();
  deps.tts.speak(p.text, { speakId: p.speakId });
},
onTtsDone(d) {
  if (d.speakId === undefined) return;
  deps.sendSpeakDone({ speakId: d.speakId, interrupted: d.interrupted });
},
```

Preserve one matching `speak.done` for every server-issued `speakId`, including cancellation; do not let local acknowledgements create protocol completions. The existing `apps/server/src/server.ts:117-121` `settings` handler is a no-op and is the closest server-side routing seam. The DLL wrapper in `apps/server/src/voice/nvda.ts:19-36,43-63` binds only `speak`/`cancel`; its integer return is a call result, not proof of audible completion. Any NVDA path must establish and test its completion strategy before reporting done. On mode changes, cancel the old route before selecting the next route; expose a semantic native control in `index.html` and retain the `:focus-visible` styling.

### Typed fallback, public form, and offline/demo assets — `main.ts`, `socket.ts`, `run-real.ts`, `reset.ts`, `launch-window.ts`, fixtures

The existing typed fallback already feeds the same utterance pipeline as speech. `apps/voice/src/main.ts:236-254` reads the form, handles typed `stop` locally, then calls `socket.sendUtterance({ source: "typed", text })`; `apps/voice/src/socket.ts:110-127` creates the protocol frame. Reuse this path after one clear recognition miss rather than making a parallel command route. Keep server-provided errors/confirmation text in text-only DOM insertion; `apps/voice/src/ui-log.ts:51-60,63-75` uses `textContent` and inserts an exchange once for screen-reader announcement.

For local demo serving, `dev/mock-server/src/run-real.ts:39-57` mounts the voice build at `/` and local form fixtures under `/fixtures/forms`; extend those roots for offline copies rather than adding a new host. `dev/mock-server/src/reset.ts:52-58,80-100` restores `fixtures/demo/profile.template.json`, restarts the runner, waits for readiness, and opens the local form in Chrome. `dev/mock-server/src/launch-window.ts:21-39,81-103` builds Chrome arguments as an array and logs launch/pin fallback status. Keep all three rehearsal runs on the fictional data in `fixtures/demo/profile.template.json`.

The repository sources listed for this mapping contain no run sheet, plan-B script, offline copy of the Phase 3 public form, or recorded backup video. These are demo/human-run deliverables, not an existing source-code pattern. Bind the actual public form and offline counterpart to Phase 3's hand-off; do not invent a provider-specific form contract. The final three-run confirmation check depends on core `RES-01`, and the freeze rehearsal depends on core `PROT-03` per `docs/WORK-SPLIT.md:17,21,36-37,48-53`.

## Shared Patterns

- **Session ownership:** keep rate and output mode in the current voice window; no cross-session persistence. `main.ts:42-54` already groups window state.
- **Exclusive route / tracked completion:** use the existing socket and `speak-bridge` abstractions; cancellation must clear the old output and report interruption once for each tracked `speakId`.
- **Accessible UI:** use native buttons/labels and preserve keyboard focus styling (`index.html:10,62-68`; `styles.css:40-52`).
- **Untrusted page text:** render observed result/error strings using `textContent`, following `ui-log.ts:51-60`.
- **Protocol boundary:** settings schema is already present and optional rate is defined. No protocol edits are assumed; existing work-split rules require both owners to agree before any protocol change (`docs/WORK-SPLIT.md:55-61`).

## No Analog Found

| Deliverable | Reason |
|---|---|
| Public-form rehearsal run sheet and plan-B script | No existing rehearsal document in the sources identified by Phase 4 research. |
| Backup video | Must be recorded locally by a human; no repository source analog. |
| Offline copy of the Phase 3 public form | No public-form URL/page has been delivered in the current source set; coordinate with Phase 3 before choosing a local fixture. |

## Metadata

**Analog search scope:** source paths listed by `04-RESEARCH.md` for voice UI, server-side NVDA, protocol, and mock-server demo setup.  
**Tracked-source gate:** all named code analogs verified with `git ls-files`.  
**Pattern extraction date:** 2026-10-17
