# Phase 1: Spikes and Push-to-Talk Loop - Research

**Researched:** 2026-10-16
**Domain:** Windows voice I/O for a Chrome-based form agent (Web Speech, speechSynthesis, global hotkey, NVDA controller, window layering)
**Workstream:** voice (Person B)
**Confidence:** MEDIUM overall. Hard facts about the libraries are HIGH. Browser and NVDA runtime behavior is MEDIUM or LOW and must be settled by the hour-3 spikes, not by documentation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The voice UI is a separate popup window (not a toolbar popup, not a side panel, not a normal tab). It opens at startup and stays on top so it sits beside the form.
- **D-02:** Push-to-talk is a global hold of **Right Ctrl + Space** via `uiohook-napi`. Hold to talk, release to send. It works from the form tab.
- **D-03:** Holding push-to-talk or saying "stop" cuts Blip off right away. The mic opens only after Blip has finished speaking.
- **D-04:** The popup shows a live caption of the current utterance and a finished log of each exchange (what was said, what Blip replied).

### Claude's Discretion
- Exact window size and position, as long as the window stays visible beside the form.
- Spike-driven choices from the Phase 1 spike list (Web Speech in an unfocused window, NVDA live-region behavior, uiohook-napi versus the `chrome.commands` fallback). The fallbacks in the roadmap apply if a spike fails.

### Deferred Ideas (OUT OF SCOPE)
- None.

### Conflict to resolve before planning
D-03 ("saying 'stop' cuts Blip off") contradicts D-03's own second clause and REQUIREMENTS VOX-05 ("The mic is never open while Blip is speaking"). If the mic is closed while Blip speaks, "stop" cannot be heard by voice. See Open Question 1. The planner must not write a task that opens the mic during speech without a decision.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOX-01 | Global push-to-talk key works while the form tab has focus | uiohook-napi global keydown/keyup (Standard Stack, Pitfalls 1-4); chrome.commands fallback |
| VOX-02 | Speech transcribed per PTT press (Web Speech) and sent as an utterance | One `start()` per press, `stop()` on release; Web Speech window-focus findings (Spike A) |
| VOX-03 | Typed command instead of speech | Typed input is the always-on fallback; same `utterance` message with `source: "typed"` |
| VOX-04 | Blip speaks in its own voice, earcons, "one moment" at ~1.5 s | speechSynthesis in the voice window (Spike B); timer pattern (Code Examples) |
| VOX-05 | Mic never open while Blip speaks | Half-duplex gate in the voice window state machine (Architecture, Pitfall 6); conflicts with "stop" by voice (Open Question 1) |
| VOX-06 | "stop" cuts speech immediately | Cut-off on PTT down is HIGH-confidence to implement; voice "stop" depends on Open Question 1 |
| VIS-01 | Voice window shows live caption and finished transcript | Plain DOM; no platform risk. Layout and topmost pinning (Spike E) |
| DLG-01 | "what's here" answered with counts-first summary via the reducer | Pure reducer in `packages/dialogue`; I1 round trip against real server (Architecture) |
</phase_requirements>

## Summary

Phase 1 has six technical questions. Four of them are answered by a spike, not by documentation, and the plan should treat them that way. The research gives each one a default plan, a fallback, and a pass/fail test.

The two biggest unknowns are browser behavior, not library behavior. First, whether Chrome's Web Speech recognition keeps running in a visible but unfocused app window while the form tab is focused. Chromium code review 415933002 shows Chrome designed a switch to block new speech requests from background tabs, so a visible, always-on-top app window is the first thing to test. Second, whether NVDA announces ARIA live-region updates from a window that is not focused. Documentation found nothing that settles this. The NVDA controller client DLL is a separate path: it speaks through NVDA regardless of which window has focus, so it is the reliable output route for screen-reader mode (VOX-08 in Phase 4), and only needs a basic speak test in this phase.

Push-to-talk is well supported. `uiohook-napi` 1.5.5 exposes `UiohookKey.CtrlRight = 3613` and `UiohookKey.Space = 57`, and its keyboard events carry only a generic `ctrlKey` boolean, so the code must check `keycode === 3613` to get Right Ctrl specifically. Two pitfalls are certain by design: a listen-only global hook does not consume the Space keystroke (it still types into the focused field), and holding a key produces repeated keydown events. The Space leak has a clean mitigation in the extension's content script (see Pitfall 1).

Window layering is solved with a Win32 call. Chrome has no always-on-top flag for `--app` windows, and `chrome.windows.create` has no always-on-top option either (verified in the Chrome docs). The plan is to launch the voice window with `--app`, find its HWND, and call `SetWindowPos(HWND_TOPMOST)` through `koffi`. Document Picture-in-Picture is the fallback.

**Primary recommendation:** Build the voice window as a Chrome `--app` window on a fixed localhost URL in the dedicated profile. Use uiohook-napi with `keycode === 3613 && 57` for a deduplicated hold-to-talk state machine. Run Spikes A through E in hour 0-3, in the order below, with the Web Speech spike first because it decides the voice window layout. Half-duplex is enforced by the voice window's state machine, never by the model.

## Spike Results (answers to the six research questions)

| # | Question | Answer | Confidence | Verdict |
|---|----------|--------|------------|---------|
| Q1a | Does `webkitSpeechRecognition` work in an app window while the form tab has focus? | Unknown. Chromium's design blocks new Web Speech requests from background tabs. A separate visible window is not a background tab, but this is unverified. | LOW | **Hands-on spike A** |
| Q1b | Does `speechSynthesis` work there? | Likely yes. Speech output is owned per window. Chrome needs user activation before the first `speak()`. | MEDIUM | **Hands-on spike B** |
| Q2 | Does NVDA announce an ARIA live region in the voice window while the form tab is focused? | No documentation found. Live-region announcements are an NVDA focus-driven path, so a non-focused window is the risky case. | LOW | **Hands-on spike C (test)** |
| Q2b | Does `nvdaController_speakText` speak through NVDA regardless of focus? | The client API is a direct speech command, not a focus event, so focus should not matter. | MEDIUM (documented API; not tested here) | **Spike C (test)** |
| Q3 | Does uiohook-napi detect held Right Ctrl + Space globally on Windows, Node 24? | Yes on the API level: `UiohookKey.CtrlRight` (3613) and `UiohookKey.Space` (57) exist in the published types. Behavior with a real hold is untested. | HIGH (constants); MEDIUM (runtime) | **Spike D (hands-on)** |
| Q4 | Can Blip's own speech be picked up and trigger "stop"? | Yes, physically: Web Speech uses the default mic and speakers are not echo-cancelled for it (ASSUMED, no source found). Mitigation is to keep the mic closed during speech and reopen after `onend` plus a tail delay. | MEDIUM (mitigation design); LOW (Chrome echo behavior) | **Spike F (hands-on)** |
| Q5 | Open the voice window at startup and keep it always-on-top | Launch with `--app=<url> --window-size --window-position --user-data-dir`. Pin with `SetWindowPos(HWND_TOPMOST)` via koffi. No Chrome flag does this. | MEDIUM | **Spike E (hands-on)** |
| Q6 | Fallbacks | `chrome.commands` (Ctrl+Shift+digit, toggle only, no keyup) and typed input. Document PiP is a second topmost option. | HIGH (chrome.commands limits); MEDIUM (PiP) | Documented below |

### Spike A: Web Speech in an app window (decides layout)
- **Question:** Does recognition start and keep returning results while the voice app window is visible but not focused, and while the form tab is focused in another window?
- **Evidence for risk:** Chromium code review 415933002 added a switch that stops Web Speech when a tab goes to the background, with the description "both WebRTC and webSpeech won't be able to initiate new requests when tab is in background." Code review 431433006 is the same design, dated 2014. Microsoft Q&A reports throttled background tabs closing the connection. (Sources in the Sources section.)
- **Evidence against risk:** The app window is a separate top-level window whose tab is the active tab in its own window, so its `document.visibilityState` should remain `visible` while the form window has focus. This depends on occlusion behavior (see Spike E notes).
- **Test script (in the voice page):** log `document.visibilityState`, `document.hasFocus()`, and every `start`, `result`, `error`, `end` event with its timestamp. Run three cases: (1) voice window focused; (2) form tab focused, voice window on top but not focused; (3) form window fully covering the voice window with the topmost pin removed.
- **Pass:** case 2 returns a `result` with a transcript within 3 s of speaking.
- **If it fails:** the window layout is the fallback from the roadmap. Keep the window on top and pinned (not behind), or use typed input and the `chrome.commands` toggle. Do not use an offscreen document (CLAUDE.md, section 5).

### Spike B: speechSynthesis in the app window
- Test `speechSynthesis.speak` in cases 1-3 above. Log `onstart`/`onend`/`onerror`. Check whether `onend` fires on the local Microsoft voice for a 20-word sentence.
- Known risk: `onend` can fire immediately or never fire on some voices (LOW, from community reports). The half-duplex gate depends on `onend`, so Spike B must confirm it. Add a timeout fallback (estimated duration + 1 s) and use local `Microsoft *` voices.

### Spike C: NVDA (roadmap item)
- **C1 (required by roadmap):** with NVDA running, call `nvdaController_speakText(L"Blip test")` from Node through koffi, with the form tab focused, then with the voice window focused. Pass: speech is heard both times.
- **C2 (exploratory):** update an `aria-live="polite"` region in the voice page while the form tab is focused. Record whether NVDA speaks it. Expected to be unreliable. Treat the result as a LOW-confidence data point, not a route for Phase 1.
- Requirements: NVDA 2026.2 installed on both machines (STATE.md blocker); x64 `nvdaControllerClient64.dll` for 64-bit Node. Client API is LGPL 2.1 (documented).
- NVDA's controller client documentation warns that calling it while Windows is locked or on a secure desktop may need a check. Out of scope for Phase 1 but noted for Phase 4.

### Spike D: uiohook-napi hold-to-talk
- **Constants (verified):** `UiohookKey.Space = 57`, `UiohookKey.Ctrl = 29` (left), `UiohookKey.CtrlRight = 3613`.
- **Event payload (verified):** keydown/keyup events carry `keycode`, `ctrlKey`, `shiftKey`, `altKey`, `metaKey`. There is no left/right flag, so `ctrlKey` is true for either Ctrl. Use `keycode`, not `ctrlKey`, to identify Right Ctrl.
- **Test:** hold Right Ctrl+Space in Chrome, release Space first, then Ctrl first, then Left Ctrl+Space (must NOT trigger). Log every event.
- **Pass:** exactly one start and one end per hold in all four orders; left Ctrl+Space does not trigger.

### Spike E: window pinning and launch
- **Launch command (ASSUMED until tested):**
  `chrome.exe --user-data-dir="<repo>/.chrome-profile" --app=http://localhost:8787/ui --window-size=440,720 --window-position=<x>,<y>`
  The separate `--user-data-dir` is the flag most likely to matter if size or position keep reverting (MEDIUM, from community guides).
- **Pin topmost:** find the HWND by window class `Chrome_WidgetWin_1` and title (set a unique `<title>` such as "Blip Voice"). Call `SetWindowPos(hwnd, HWND_TOPMOST=-1, 0,0,0,0, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE=0x0003|0x0010)` through koffi on `user32.dll`. A forum source reports the topmost state persists after the window is deactivated (LOW-MEDIUM).
- **Chrome flags have no always-on-top option** (no source found in the Chrome command-line switch list, verified in the switch list only through search). Do not spend time on a flag.
- **Pass:** the voice window stays above a maximized Chrome form window while the form tab is focused.
- **Fallback:** Document Picture-in-Picture (`documentPictureInPicture.requestWindow()`, Chrome 116+) floats above other windows and must be opened from a user gesture (the "Press Space to start Blip" gate satisfies this). Its window cannot be navigated and closes when its opener closes. Use it only if the koffi pin fails, and test that PiP stays focusable for keyboard typing.

### Spike F: Blip's speech and "stop" (echo)
- Play a spoken reply with the mic closed, then with the mic gated by the state machine (open only after `onend` plus 400 ms). Confirm that no `result` events arrive during speech. Then test "stop" spoken while Blip speaks: this only works if the mic is open, which violates VOX-05. See Open Question 1 before running this.

### Fallbacks

| Failure | Fallback | Cost | Source |
|---------|----------|------|--------|
| uiohook-napi fails to load or misses events | `chrome.commands` `"global": true` on Ctrl+Shift+digit. Toggle only: press to start, press to stop. No keyup. | Lose hold-to-talk. Documented in CLAUDE.md. | [chrome.commands doc](https://developer.chrome.com/docs/extensions/reference/api/commands) (cited in CLAUDE.md) |
| Web Speech blocked in app window | Typed input (VOX-03 always works); window layout falls back to docked and focused | Lose voice input while unfocused | CLAUDE.md section 5 |
| speechSynthesis onend unreliable | Timeout based on word count; sentence-by-sentence speaking | Slightly less exact gate | This research |
| NVDA DLL fails | Agent-voice only in Phase 1. In-page live region is Phase 4 work | Screen-reader mode deferred | ROADMAP Phase 1 notes |
| Topmost pin fails | Document PiP after a gate click; or docked window (no pin) | Less convenient layout | Spike E |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| uiohook-napi | 1.5.5 (npm modified 2026-03-21) | Global keydown/keyup for hold-to-talk | Only Node option with real global key up/down events; wraps libuiohook (CLAUDE.md choice) |
| koffi | 3.3.3 | FFI to `nvdaControllerClient64.dll` and to `user32.dll` for `SetWindowPos`/`FindWindowW` | Prebuilt for Node 24 win32-x64 (CLAUDE.md, verified) |
| Web Speech API | Chrome built-in | `webkitSpeechRecognition` for VOX-02 | Only in-browser STT; no install |
| speechSynthesis | Chrome built-in | VOX-04 reply voice | Only in-browser TTS; no install |
| TypeScript | 6.0.3 | All voice code | Project constraint (CLAUDE.md) |
| Vite | 8.3.4 (npm modified 2026-10-08) | Voice UI build, vanilla TS template | Project constraint |
| ws | 8.22.0 (npm modified 2026-09-26) | `/ui` socket to server or mock server | Project constraint |
| zod | 4.6.7 (npm modified 2026-10-12) | Parse every inbound message | Project constraint; `@blip/protocol` consumer |
| sirv | 3.0.2 | Serve `apps/voice/dist` from the server | Project constraint |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| concurrently | 10.0.6 | `npm run dev` for voice plus mock server | Dev only |
| vitest | (not version-checked in this session; pick the current one at install time) | Test `packages/dialogue` reducer | Reducer tests |

### Package Legitimacy Audit

> slopcheck could not be installed in this session (pip install failed in the sandbox). Per the Package Legitimacy Gate, every recommended package is tagged `[ASSUMED]` and each install must be gated behind a `checkpoint:human-verify` task. Registry existence was confirmed with `npm view`, which does NOT by itself confer VERIFIED status.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| uiohook-napi | npm | years (project since 2019; not re-verified) | not checked | github.com/SnosMe/uiohook-napi (from npm metadata) | not run | [ASSUMED] - gate install |
| koffi | npm | years (not re-verified) | not checked | not checked in this session | not run | [ASSUMED] - gate install |
| ws | npm | years (not re-verified) | not checked | not checked | not run | [ASSUMED] - gate install |
| vite | npm | years (not re-verified) | not checked | not checked | not run | [ASSUMED] - gate install |
| sirv | npm | years (not re-verified) | not checked | not checked | not run | [ASSUMED] - gate install |
| zod | npm | years (not re-verified) | not checked | not checked | not run | [ASSUMED] - gate install |
| concurrently | npm | years (not re-verified) | not checked | not checked | not run | [ASSUMED] - gate install |

**Packages removed due to slopcheck [SLOP] verdict:** none (not run)
**Packages flagged as suspicious [SUS]:** none (not run)

The planner must add a `checkpoint:human-verify` before the first install of each package above. The `uiohook-napi` postinstall path (`node-gyp-build`) should be checked on the install machine, because it loads a native prebuild.

**Version verification:** `npm view <pkg> version` run 2026-10-16 for each row above. The Standard Stack versions match CLAUDE.md.

## Architecture Patterns

### System Architecture Diagram

```
  Right Ctrl + Space held (any window)
           |
           v
  [server: uiohook-napi keydown/keyup]  --- dedupe, keycode 3613 + 57 ---> ptt event
           |                                                                  |
           | ws /ui (ptt down / ptt up)                                        |
           v                                                                  v
  [voice window: state machine]  <-- speechSynthesis onend + 400 ms -- Speaking
           |                                                          ^
           | PTT down: cancel speech, stop speak, abort mic           |
           v                                                          |
  Listening: webkitSpeechRecognition.start() (one per press)          |
           | PTT up: stop() -> final result                           |
           v                                                          |
  utterance {source:"voice"} --> ws /ui --> server/mock-server --> reducer ----> speak/earcon
                                                                      |
  Typed box --> utterance {source:"typed"} ---------------------------+
                                                                      
  Form tab (Chrome window A, focused)  <-- Space keystroke also reaches it
     mitigated by content script: keydown Space with ctrlKey -> preventDefault
```

Flow notes: the mic is opened only in the Listening state, which is entered only from Idle (never from Speaking). Earcons play on the listening transition.

### Recommended Project Structure
```
apps/voice/                # Vite vanilla TS (voice owns)
  index.html               # window UI: caption, log, typed box, BLOCKED banner slot
  src/
    main.ts                # wiring, user-activation gate ("Press Space to start Blip")
    ptt-client.ts          # receives ptt events from server over /ui
    stt.ts                 # webkitSpeechRecognition wrapper, one start per press
    tts.ts                 # speechSynthesis queue, onend-driven gate, one-moment timer
    earcons.ts             # WebAudio tones
    ui-log.ts              # caption + finished log
    socket.ts              # ws client, zod-parse inbound
packages/dialogue/         # pure reducer (voice owns)
  src/reduce.ts            # reduce(state, event, ctx) -> { state, effects }
  src/reduce.test.ts       # vitest
dev/mock-server/           # voice's stand-in server (voice owns)
apps/server/src/voice/     # NVDA bridge + uiohook (voice owns subfolder; core owns hub)
  ptt-hook.ts              # uiohook-napi wrapper, emits {type:"ptt", state}
  nvda.ts                  # koffi bindings (Phase 4 full use; Phase 1 spike test)
  pin-topmost.ts           # koffi SetWindowPos (or spike script)
scripts/                   # launch helper (core PROT-03 owns start.ts)
```

### Pattern 1: PTT state machine with deduplication (server side)
**What:** uiohook emits repeated keydown while a key is held. Convert to exactly one `ptt-down` and one `ptt-up` per hold.
**When to use:** every PTT event; never trust raw keydown.
**Example:**
```typescript
// Source: uiohook-napi README (usage) + UiohookKey constants from dist/index.d.ts (verified 2026-10-16)
import { uIOhook, UiohookKey } from 'uiohook-napi';

let rightCtrlDown = false;
let spaceDown = false;
let pttActive = false;

const emit = (state: 'down' | 'up') => { /* send {type:'ptt', state} on /ui */ };

function update() {
  const next = rightCtrlDown && spaceDown;
  if (next && !pttActive) { pttActive = true; emit('down'); }
  if (!next && pttActive) { pttActive = false; emit('up'); }
}

uIOhook.on('keydown', (e) => {
  if (e.keycode === UiohookKey.CtrlRight) rightCtrlDown = true;
  if (e.keycode === UiohookKey.Space) spaceDown = true;
  update();
});
uIOhook.on('keyup', (e) => {
  if (e.keycode === UiohookKey.CtrlRight) rightCtrlDown = false;
  if (e.keycode === UiohookKey.Space) spaceDown = false;
  update();
});
uIOhook.start();
```
Ending the hold when either key is released, and never restarting until both are up, handles key repeat and the release-order issue.

### Pattern 2: Half-duplex voice state machine (voice window)
**What:** One state variable decides whether the mic may be open. Speech and recognition never overlap.
**States:** `Idle -> Listening -> Thinking -> Speaking -> Idle` (plus `Blocked` in Phase 2).
**Rules:**
- `ptt-down` from any state: `speechSynthesis.cancel()`, then enter `Listening` and call `start()`.
- `ptt-up`: call `stop()` on recognition; wait for the final result or `end`; send the utterance.
- Entering `Speaking`: never call `start()`. If recognition is somehow running, call `abort()` first.
- Leaving `Speaking`: on `speechSynthesis` `onend`, wait 400 ms (tail for room reverb), then `Idle`. If `onend` does not fire within `estimatedMs + 1000`, force `Idle`.
- Typed utterances bypass the mic and are accepted in any state.

### Pattern 3: Window launch and pin
```typescript
// Source: Win32 SetWindowPos (Microsoft Learn); koffi usage per CLAUDE.md. Untested in this session.
// Pseudocode for scripts/pin-topmost.ts:
// 1. FindWindowW("Chrome_WidgetWin_1", "Blip Voice") -> hwnd (retry up to 5 s after launch)
// 2. SetWindowPos(hwnd, -1 /* HWND_TOPMOST */, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 /* NOMOVE|NOSIZE|NOACTIVATE */)
```

### Anti-Patterns to Avoid
- **Continuous recognition:** do not set `continuous = true` (CLAUDE.md). Stacked sessions and silent drops.
- **Restarting recognition on `onend` in a loop:** only restart on a new PTT press.
- **Opening the mic during Speaking:** violates VOX-05 and lets Blip confirm its own speech.
- **Using `ctrlKey` to detect PTT:** true for Left Ctrl too. Use `keycode`.
- **Relying on a keyboard event for the Space suppression:** uiohook cannot consume keys (see Pitfall 1); suppress in the page.
- **Putting STT in an offscreen document:** CLAUDE.md, section 5.
- **Blocking tool-style waits in the voice window:** the voice window only shows and speaks; the server and reducer decide.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Global hold-to-talk | Polling `GetAsyncKeyState` in a loop | uiohook-napi keydown/keyup | Event-based, already in the stack; polling is a fallback only if uiohook misses events |
| Speech recognition | Custom audio capture and STT | `webkitSpeechRecognition` | Only in-browser STT; no install |
| Speech output | Custom TTS | `speechSynthesis` (agent voice), NVDA controller DLL (Phase 4) | Built in |
| Always-on-top | Trying Chrome flags or `chrome.windows` | koffi `SetWindowPos(HWND_TOPMOST)` | No Chrome option exists |
| Earcons | Bundled audio files | WebAudio oscillator tones | No asset pipeline needed; instant |
| Speech-end detection | Fixed timers | `speechSynthesis` `onend` plus timeout fallback | Timers drift; `onend` is the real signal |

**Key insight:** the risky parts are browser and OS interactions. Build thin wrappers that log everything, so the spikes produce evidence.

## Runtime State Inventory

Not a rename or migration phase. Omitted.

## Common Pitfalls

### Pitfall 1: The Space keystroke types into the focused field
**What goes wrong:** Right Ctrl + Space pressed while the form tab is focused inserts a space into the focused input.
**Why it happens:** uiohook-napi's `keydown` is a listener on a global hook. It observes input and does not consume it (ASSUMED from libuiohook design; confirm in Spike D by typing into a text field during the hold).
**How to avoid:** have the form tab's content script suppress the key in capture phase: `window.addEventListener('keydown', e => { if (e.code === 'Space' && e.ctrlKey) e.preventDefault(); }, true)` and the same for `keyup`. Ctrl+Space is not a typing action, so this changes nothing else. This is the extension's code (core track); coordinate by agreement because the content script belongs to core. Note: the suppression only reaches pages the content script runs in (use `all_frames: true` for embedded forms).
**Warning signs:** a stray space in a field after every PTT press; the field's `input` events fire during a hold.

### Pitfall 2: Key repeat floods keydown
**What goes wrong:** holding a key fires repeated keydown events, which start multiple utterances.
**Why it happens:** Windows auto-repeat applies to the low-level hook path too.
**How to avoid:** Pattern 1 (boolean state; emit only on transitions). In the voice window also ignore `ptt-down` while already `Listening`.
**Warning signs:** more than one `ptt-down` per hold in the log.

### Pitfall 3: Right Ctrl vs Left Ctrl
**What goes wrong:** Left Ctrl + Space triggers PTT, or Right Ctrl alone does.
**Why it happens:** `ctrlKey` is generic. Left is keycode 29, Right is 3613.
**How to avoid:** check `keycode`, not `ctrlKey`. Test in Spike D.

### Pitfall 4: Modifier release order
**What goes wrong:** Releasing Ctrl before Space leaves PTT stuck, or ends the utterance early.
**How to avoid:** end PTT when either key goes up (Pattern 1). Add a watchdog: if no keyup arrives within 10 s of a press, force `ptt-up`.

### Pitfall 5: Elevated windows swallow hook events
**What goes wrong:** hold-to-talk does nothing while an elevated (admin) window has focus.
**Why it happens:** Windows low-level hooks from a non-elevated process do not see input to an elevated window (ASSUMED, standard Windows UIPI behavior).
**How to avoid:** the form tab is a normal Chrome window, so this does not apply in the demo. Note it in the demo runbook.

### Pitfall 6: Blip's own speech triggers recognition
**What goes wrong:** the mic hears Blip's voice and sends it as an utterance, or, worse, a "stop" or "submit" phrase from speakers.
**How to avoid:** the state machine in Pattern 2. Recognition is never started while `Speaking`. Keep the 400 ms tail. Prefer a headset in the demo.
**Warning signs:** `result` events arriving during speech in Spike F.

### Pitfall 7: speechSynthesis `onend` unreliability
**What goes wrong:** the half-duplex gate never releases, or releases too early.
**How to avoid:** timeout fallback (estimated duration plus 1 s). Use local `Microsoft *` voices. Speak sentence by sentence.
**Warning signs:** `onend` fired within a few ms of `onstart`, or never.

### Pitfall 8: Web Speech in a non-focused app window (LOW confidence)
**What goes wrong:** recognition returns `no-speech`, `aborted`, or `network` errors, or never starts.
**How to avoid:** Spike A decides. Keep the voice window on top and visible (pin), and test occlusion: if the form window fully covers the voice window and Chrome marks it hidden, recognition will fail. The pin is the mitigation.
**Warning signs:** `document.visibilityState` is `hidden` in the voice window during the test.

### Pitfall 9: Chrome `--app` window reuses an existing instance
**What goes wrong:** the voice window opens in an existing Chrome process and ignores `--window-size` or `--window-position`, or the HWND lookup fails.
**How to avoid:** use the dedicated `--user-data-dir` (CLAUDE.md). Use a unique title for the HWND lookup. Retry the lookup for 5 s.

### Pitfall 10: Microphone permission prompts
**What goes wrong:** a permission prompt appears in the middle of a demo.
**How to avoid:** `http://localhost` is a secure context, so the mic prompt appears once and is remembered (CLAUDE.md). Grant it during the startup gate, before the demo.

### Pitfall 11: `speechSynthesis` and user activation
**What goes wrong:** the first `speak()` is silently ignored.
**How to avoid:** a "Press Space to start Blip" gate on load (CLAUDE.md). This gate also enables earcons and PiP if needed. Note: the gate uses the Space key, so the page's own Space handling must not be confused with PTT; the voice window is not the form page, so this is safe.

## Code Examples

### Typed fallback is the same message as voice
```typescript
// Source: CLAUDE.md section 5 (typed fallback goes into the same /ui channel)
ws.send(JSON.stringify({ type: 'utterance', source: 'typed', text: input.value.trim() }));
```

### One start per press (STT)
```typescript
// Source: CLAUDE.md section 5 (one start() per press; continuous = false)
const Rec = (window as any).webkitSpeechRecognition;
const rec = new Rec();
rec.lang = 'en-US';
rec.continuous = false;
rec.interimResults = true;   // live caption (D-04)
rec.maxAlternatives = 3;
rec.onresult = (ev: any) => { /* update caption from ev.results; final on isFinal */ };
rec.onerror = (ev: any) => { /* log ev.error; show "say it again" */ };
// PTT down: rec.start();  PTT up: rec.stop();
```

### "One moment" timer (VOX-04)
```typescript
// Source: ROADMAP VOX-04 (~1.5 s); pattern is this research's suggestion
let timer: number | undefined;
function onUtteranceSent() {
  timer = window.setTimeout(() => speak('One moment.'), 1500);
}
function onReply() { clearTimeout(timer); }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Toolbar popup or side panel for voice UI | Standalone app window pinned topmost (D-01) | Locked in CONTEXT | Lets the window stay visible beside the form |
| Chrome "always on top" flag assumed | Win32 `SetWindowPos` through koffi | This research | No Chrome option exists |
| Document PiP as a generic topmost window | Fallback only | Chrome 116 GA | Needs user gesture; adds a second window to manage |

**Deprecated/outdated:**
- `--load-extension` in launchers (removed from branded Chrome 137, CLAUDE.md). Not relevant to Phase 1 beyond the launch command.
- `chrome.commands` as primary PTT: toggle only, no keyup. Fallback only.

## Open Questions (RESOLVED)

1. **Does "stop" by voice work while Blip speaks? (decision needed, blocks Spike F)**
   - What we know: D-03 says saying "stop" cuts Blip off. D-03's second clause and VOX-05 say the mic never opens while Blip speaks.
   - What's unclear: these cannot both hold with the mic closed during speech.
   - Options: (a) "stop" by voice works only between turns, and the interrupt during speech is the PTT hold plus typed "stop" in the box; (b) open the mic during speech for a short "stop" listen window, which violates VOX-05 and needs echo handling; (c) use a keyboard key for interrupt (not voice). Recommendation: option (a) for Phase 1 and ask the user to amend D-03 and VOX-05 wording. The planner should not write a task that opens the mic during speech until this is decided.
   - Recommendation: pick (a) in the plan and flag it at the M0 review.
   - RESOLVED: user decision D-03 and the amended VOX-05. Built as mic-open barge-in whose mode is chosen by Spike F (BARGE_IN_MODE voice | ptt-only). The recommendation (a) mic-closed is superseded and is not to be followed. The confirm guard is core GATE-08.

2. **Does NVDA announce a live region in a non-focused app window?**
   - What we know: nothing found in documentation; NVDA focus behavior makes it unlikely to be reliable.
   - What's unclear: the actual behavior with this window layout.
   - Recommendation: test in Spike C2. Do not depend on it. Screen-reader output in Phase 4 uses the controller DLL (C1).
   - RESOLVED: spike C2 results are recorded in 01-SPIKE-DECISIONS.md (LIVE_REGION).

3. **Does Chrome set `visibilityState` to `hidden` when a foreground window is occluded on Windows?**
   - What we know: Chromium tracks native occlusion on Windows; the Visibility API and occlusion interaction is not clear from sources found.
   - Recommendation: Spike A case 3 measures it directly. The topmost pin avoids the question.
   - RESOLVED: spike A results (case 3, STT_UNFOCUSED) are recorded in 01-SPIKE-DECISIONS.md.

4. **Does the Ctrl+Space keystroke suppression in the content script need core's agreement?**
   - Yes. The content script is core's. Needs a one-line agreement at M0.
   - RESOLVED: handed off as HO-1 in M0-SIGNOFF.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, uiohook-napi, koffi | not probed in this session | target 24 LTS (CLAUDE.md) | — |
| Chrome (branded, Windows) | voice window, form tab | not probed | — | Chrome required; no fallback |
| NVDA 2026.2 | Spike C | not installed on research machine (ROADMAP blocker) | — | Skip C1 on machine without NVDA; C1 must run on at least one machine |
| nvdaControllerClient64.dll | Spike C1 | not probed (from NVDA download) | 2026.2 | none needed for Phase 1 except C1 |
| Microphone + speakers or headset | STT, TTS | not probed | — | Typed input (VOX-03) |
| Internet | Web Speech (Google server STT) | not probed | — | Typed input only |

**Missing dependencies with no fallback:** Chrome and a working mic. The planner must check these on both machines in the first task.

**Missing dependencies with fallback:** NVDA (Spike C deferred to the machine that has it), internet (typed input).

Step 2.6 note: the dependency probe on the target machines was not run in this session; the table lists what must be checked.

## Validation Architecture

> workflow.nyquist_validation is not set to false in config; this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (version to pin at install; not version-checked here) |
| Config file | none — Wave 0 |
| Quick run command | `npx vitest run packages/dialogue` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOX-01 | PTT state machine emits exactly one down/up per hold; ignores repeats; ignores Left Ctrl | unit | `npx vitest run apps/server/src/voice/ptt-hook.test.ts` | Wave 0 (pure reducer over synthetic events; hook call itself is manual) |
| VOX-02 | Press starts one recognition; release stops; utterance sent with `source:"voice"` | unit (mocked recognition) | `npx vitest run apps/voice/src/stt.test.ts` | Wave 0 |
| VOX-03 | Typed input yields the same utterance message | unit | `npx vitest run apps/voice/src/socket.test.ts` | Wave 0 |
| VOX-04 | "one moment" fires at 1.5 s and clears on reply | unit (fake timers) | `npx vitest run apps/voice/src/tts.test.ts` | Wave 0 |
| VOX-05 | Recognition never starts while Speaking; gate releases on onend+400 ms or timeout | unit (state machine) | `npx vitest run apps/voice/src/state.test.ts` | Wave 0 |
| VOX-06 | PTT down cancels speech immediately | unit | `npx vitest run apps/voice/src/state.test.ts` | Wave 0 |
| VIS-01 | Caption shows interim; log appends finished exchange | manual-only (visual) | — | justification: DOM layout; verify by eye in the demo rehearsal |
| DLG-01 | "what's here" yields counts-first summary | unit | `npx vitest run packages/dialogue` | Wave 0 |
| Spike A-F | Browser, NVDA, hook, pin behavior | manual spike | run the spike scripts; log to a spike notes file | manual-only (hardware and OS) |

### Sampling Rate
- Per task commit: the quick command for the touched package.
- Per wave merge: full vitest run.
- Phase gate: spike results recorded as decisions, plus the manual PTT run from success criterion 3 on the mock server, and the I1 "what's here" run against the real server.

### Wave 0 Gaps
- [ ] `packages/dialogue/` vitest config and `reduce.test.ts`: covers DLG-01
- [ ] `apps/server/src/voice/ptt-hook.test.ts`: covers VOX-01 state logic with synthetic events (hook not required)
- [ ] `apps/voice/src/state.test.ts`, `stt.test.ts`, `tts.test.ts`, `socket.test.ts`: covers VOX-02..06
- [ ] `scripts/spikes/` folder for hands-on spike scripts (A-F); each logs to a file under `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/`
- [ ] Framework install: vitest, gated behind `checkpoint:human-verify` (Package Legitimacy Audit)

## Security Domain

> security_enforcement is not set to false; included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (local-only app; no login in Phase 1) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Voice socket accepts only `/ui` from `http://localhost:<port>` Origin (CLAUDE.md) |
| V5 Input Validation | yes | zod parse on every inbound `/ui` message; typed text is length-capped before it reaches the reducer |
| V6 Cryptography | no | — |

### Known Threat Patterns for voice I/O + local Chrome app

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile site opens `ws://localhost` to drive the agent | Spoofing / Elevation | Origin check on `/ui`; bind 127.0.0.1 (CLAUDE.md) |
| Blip's own speech confirms a gate through the mic | Tampering | Half-duplex state machine; confirm matched only in server code (VOX-05) |
| Page text read aloud as an instruction | Tampering | Voice window only speaks reducer output; never page text as command (GATE-07 is Phase 3) |
| Speech audio sent to Google STT | Information disclosure | Fictional data only in demo; disclose in the pitch (STATE.md) |
| Passwords spoken or typed in the voice window | Information disclosure | Never spoken or logged; DLG-12 is Phase 3 |

## Sources

### Primary (HIGH confidence)
- npm registry, `npm view` run 2026-10-16: uiohook-napi 1.5.5, koffi 3.3.3, ws 8.22.0, vite 8.3.4, sirv 3.0.2, zod 4.6.7, concurrently 10.0.6
- https://unpkg.com/uiohook-napi/dist/index.d.ts (fetched 2026-10-16): `UiohookKey.Space = 57`, `UiohookKey.Ctrl = 29`, `UiohookKey.CtrlRight = 3613`
- https://unpkg.com/uiohook-napi/README.md (fetched 2026-10-16): `uIOhook.on('keydown'|'keyup')`, `uIOhook.start()`, event fields (`ctrlKey`, `keycode`, etc.)
- https://developer.chrome.com/docs/extensions/reference/api/windows (fetched 2026-10-16): `chrome.windows.create` options; no always-on-top option; `alwaysOnTop` is a read-only flag on `Window`
- CLAUDE.md section 5 (project): `chrome.commands` limits, `webkitSpeechRecognition` one-start-per-press, typed fallback, `speechSynthesis` user activation, NVDA DLL, koffi
- CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md (voice workstream), read 2026-10-16

### Secondary (MEDIUM confidence)
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture (via search, 2026-10-16): PiP floats above windows, `requestWindow()` from user gesture, closes with opener, cannot be navigated; Chrome 116 GA
- https://developer.chrome.com/blog/the-future-of-picture-in-picture (via search): PiP overview
- https://www.mintlify.com/nvaccess/nvda/development/advanced/controller-client and https://softwarepublico.gov.br/gitlab/vlibras/nvda/raw/master/extras/controllerClient/readme.html (NVDA Controller Client readme mirror): `nvdaController_speakText` takes a wide string, returns 0 on success; v2.0 adds `speakSsml` (NVDA 2024.1+); LGPL 2.1; lock-screen warning
- https://chromium.googlesource.com/chromium/src/+/master/docs/windows_native_window_occlusion_tracking.md (via search): Chromium tracks native occlusion on Windows
- https://www.ghacks.net/?p=94945 (Chrome switch list, via search): `--window-size` and `--window-position` formats
- https://www.askwoody.com/forums/topic/how-to-keep-current-app-window-on-top and https://learn.microsoft.com/da-dk/archive/blogs/taylorb/scripts-from-teched-2012-part-1-keeping-powershell-window-on-top (via search): `SetWindowPos` with HWND_TOPMOST persists after deactivation (LOW-MEDIUM; community source)

### Tertiary (LOW confidence; needs spike)
- https://codereview.chromium.org/415933002 and https://codereview.chromium.org/431433006 (via search): Chromium change to stop webspeech when tab goes to background; 2014 design, current behavior not confirmed
- https://bugs.webkit.org/show_bug.cgi?id=220073 (via search): "Stop speech recognition if page becomes invisible" (WebKit; title only)
- https://learn.microsoft.com/en-us/answers/questions/1290956/speech-recognition-with-inactive-tab (via search): throttled background tab reports; workaround in that answer is incorrect (no `send()` on SpeechRecognition)
- https://codereview.chromium.org/944063002 and webaim discussion threads (via search): live regions in background tabs were reverted for unwanted speech (ChromeVox-era); not NVDA-specific
- https://dev.to/mafee6/how-to-use-text-to-speech-in-chrome-with-js-1k4j and https://forum.playcanvas.com/t/window-speechsynthesis-onend-gets-called-instantly-on-chrome/29515 (via search): speechSynthesis `onend` timing reports (community)

### Not reached
- libuiohook source (`include/uiohook.h`) and the uiohook-napi GitHub repo returned 404 to WebFetch. Keycode values above come from the published `dist/index.d.ts` instead.
- Chrome's own Web Speech spec-level behavior on hidden or unfocused windows: no official Chrome doc found.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for versions (npm view), MEDIUM for package legitimacy (slopcheck not run, all tagged ASSUMED)
- Push-to-talk keycodes and event fields: HIGH (published typings and README)
- Push-to-talk runtime behavior (repeat, Space leakage, release order): MEDIUM (design-based; Spike D confirms)
- Web Speech and speechSynthesis in an unfocused app window: LOW (spike A and B decide)
- NVDA live region in unfocused window: LOW (spike C2)
- NVDA controller DLL speak via koffi: MEDIUM (documented API; Spike C1 confirms)
- Window pin via SetWindowPos: MEDIUM (standard Win32; Spike E confirms)
- Half-duplex and echo mitigation: MEDIUM (design); echo pickup itself LOW

**Research date:** 2026-10-16
**Valid until:** 2026-11-15 for libraries (30 days); Chrome and NVDA behavior may change with releases, so re-check at the spike.

## Hands-on spike plan (order, by hour 3)

1. **Spike A** (Web Speech in app window, three cases). Decides layout. Blocks VOX-02.
2. **Spike B** (speechSynthesis and `onend` reliability). Blocks VOX-04 and VOX-05 gate.
3. **Spike D** (uiohook-napi Right Ctrl + Space; repeat; Space leakage; left Ctrl negative case).
4. **Spike E** (launch and HWND pin; occlusion check).
5. **Spike C1** (NVDA speak via koffi, on a machine with NVDA). Required by ROADMAP success criterion 2.
6. **Spike C2** (live region in unfocused window). Exploratory.
7. **Spike F** (echo and gate). Run after Open Question 1 is decided.

Record each result as a decision in `.planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/` (one short markdown per spike, PASS/FAIL, measured values). The roadmap lists these as required decisions by ~h3.
