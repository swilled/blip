# Phase 4: NVDA Mode and Demo-Safe — Research

**Researched:** 2026-10-17  
**Domain:** Windows speech output, accessible voice controls, public-form rehearsal, and demo fallback  
**Confidence:** MEDIUM overall; HIGH for repository contracts and patterns, MEDIUM for NVDA end-to-end behavior (not yet tested with NVDA running)

<user_constraints>
## User Constraints (from 04-CONTEXT.md)

### Locked Decisions

### NVDA mode and switching (VOX-08)
- **D-01:** Provide an explicit, accessible output-mode toggle. Start each new session in agent-voice mode; the user selects NVDA mode when ready.
- **D-02:** When changing output modes, cancel speech on the old output before sending any new speech through the selected output. Only one output speaks at a time.
- **D-03:** If the NVDA controller is unavailable, announce the problem once and fall back to agent voice.
- **D-04:** Keep the mode choice for the current session. A new session starts in agent-voice mode until the user selects NVDA.

### Speech rate controls (VOX-07)
- **D-05:** “Faster” and “slower” change agent-voice rate by 0.1 per command, starting at 1.0 and clamped to 0.8–1.5.
- **D-06:** Apply the new rate to the next speech item, including a short spoken acknowledgement at the new rate. Do not restart speech already in progress.
- **D-07:** At a rate limit, keep the value within bounds and say that it is already at the fastest or slowest setting. Rate changes last for the current session and do not change NVDA's own rate.

### Public-form rehearsal (DEMO-03)
- **D-08:** Use only the same fictional profile and test values for all three consecutive runs; do not enter personal data.
- **D-09:** Keep the user in control at each demo beat: describe, fill, read back, present the distinct phrase, then wait for the user's command.
- **D-10:** If the site reports validation errors, read each detected error with its field label, identify remaining missing data, and do not claim success.
- **D-11:** After submit, read the observed confirmation text and number if present. Attribute success to the site's result; if no confirmation is observed, say that success cannot be verified.

### Fallback kit and backup (DEMO-04)
- **D-12:** After one clear speech-recognition miss, say that typing is available and route typed input through the same command pipeline.
- **D-13:** If NVDA output fails, announce the issue once and switch to agent voice without overlapping speech.
- **D-14:** If the live site or Wi-Fi fails, try the tested phone hotspot once. If the site remains unavailable, switch to the locally served offline copies of every demo site and clearly say the demo is offline.
- **D-15:** Prepare a concise run sheet with fallback triggers and record a complete, uninterrupted three-minute demo video, stored locally.
- **D-16:** Carry forward the roadmap fallback: if NVDA is not reliable by freeze, use agent voice for the main demo and show NVDA only in the opening hook.

### The agent's Discretion
- The user instructed Codex to choose the recommended option for discussion choices; the decisions above record those recommendations as the selected defaults.
- Exact rate-acknowledgement wording and run-sheet formatting may follow existing voice-window conventions.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 4 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOX-07 | User can say "faster" / "slower" to change Blip's speech rate. | Existing TTS creates one `SpeechSynthesisUtterance` per sentence; add a session-scoped rate applied to future queue items, with bounded adjustment and acknowledgement. |
| VOX-08 | In screen-reader mode, Blip's replies are spoken through NVDA (controller client DLL) instead of Blip's own voice, without double speech. | Existing `koffi` DLL bridge, exclusive output-mode decisions, tracked `speakId`/`speak.done` contract, and an unresolved server/client routing seam inform implementation and verification. |
| DEMO-03 | At least one real public form (e.g. a team-owned Google Form) can be completed end to end by voice. | Phase 3 must provide the team-owned page and form details; core `RES-01` supplies observed confirmation/error data. Rehearse three resets with the same fictional values and preserve the user-controlled submit gate. |
| DEMO-04 | The demo has a fallback kit: offline copies of the demo sites, a phone hotspot plan, a backup video, and a rehearsed plan-B script. | Reuse the local static-serving and reset patterns; prepare a timed run sheet, one tested hotspot attempt, explicit offline status, and a local uninterrupted backup video. |
</phase_requirements>

The requirement identifiers and descriptions are verbatim: `VOX-07` — “User can say "faster" / "slower" to change Blip's speech rate”; `VOX-08` — “In screen-reader mode, Blip's replies are spoken through NVDA (controller client DLL) instead of Blip's own voice, without double speech”; `DEMO-03` — “At least one real public form (e.g. a team-owned Google Form) can be completed end to end by voice”; `DEMO-04` — “The demo has a fallback kit: offline copies of the demo sites, a phone hotspot plan, a backup video, and a rehearsed plan-B script”. [VERIFIED: `.planning/workstreams/voice/REQUIREMENTS.md:19-20,48-49`]

## Summary

Phase 4 should extend the existing TypeScript voice window and server-side NVDA bridge, without adding a speech package. The browser's `SpeechSynthesisUtterance.rate` is already available for agent voice, while the TTS queue already serializes speech and reports completion per tracked `speakId`; session rate and output mode belong to the voice-owned experience. [VERIFIED: `apps/voice/src/main.ts:24-39`, `apps/voice/src/tts.ts:11-35,58-65,110-145`, `apps/voice/src/speak-bridge.ts:12-24`, `docs/WORK-SPLIT.md` V10/V11]

The main planning risk is the screen-reader path boundary: the DLL bridge is in Node (`apps/server`), the voice client currently has no settings sender, and the server currently ignores settings. The app must also preserve the server's `speak.done` safety signal when output moves to NVDA, even though the current `speakText` wrapper exposes no completion callback. Treat this as an explicit integration contract and acceptance gate; Phase 3, core `RES-01`, and core `PROT-03` are still prerequisites, not available assumptions. [VERIFIED: `apps/server/src/voice/nvda.ts:7-10,43-63`, `apps/voice/src/socket.ts:36-47`, `apps/server/src/server.ts:118-120`, `.planning/workstreams/voice/STATE.md`, `.planning/workstreams/core/STATE.md`, `.planning/workstreams/core/REQUIREMENTS.md:15,52,101,123]

**Primary recommendation:** Keep mode and rate session-scoped in the voice layer; maintain one exclusive output route; preserve one completion event per server-issued `speakId`; and gate the final three-run rehearsal on Phase 3's team-owned form plus core's observed result-page and one-command-startup contracts. Use the already agreed typed fallback and local demo server during development. [INFERENCE from `04-CONTEXT.md` decisions, `apps/voice/src/tts.ts`, `apps/voice/src/speak-bridge.ts`, and the core/voice dependency docs]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Accessible mode toggle and session mode state | Browser / Client | — | The voice window already owns the start gate, typed input, captions, and TTS adapter; D-01/D-04 scope mode to its current session. [VERIFIED: `apps/voice/index.html:10-69`, `apps/voice/src/main.ts:24-39,228-280`, `04-CONTEXT.md` D-01/D-04] |
| Agent-voice rate changes | Browser / Client | Dialogue / server only if chosen | `speechSynthesis` and its queue run in the voice window; rate need not change NVDA's settings. [VERIFIED: `apps/voice/src/main.ts:24-39`, `04-CONTEXT.md` D-05–D-07] |
| NVDA DLL calls | API / Backend (local Node process) | Browser / Client | `nvda.ts` imports `koffi` and calls the Controller Client DLL; the browser cannot directly call this Node FFI module. [VERIFIED: `apps/server/src/voice/nvda.ts:1-5,19-36] |
| Page result interpretation and submit gate | API / Backend | Browser / Client presents speech | Core owns `RES-01` and the deterministic Executor/gate; voice consumes observed errors or confirmation and must not infer success. [VERIFIED: `.planning/workstreams/core/REQUIREMENTS.md:15,52`, `CLAUDE.md:307-311`, `docs/WORK-SPLIT.md` C6/C7/V10/V11] |
| Offline demo pages and reset | Browser / Client static demo | API / Backend serves assets | `dev/mock-server` already mounts local form fixtures and its reset command restores a fictional profile and launches the local form. [VERIFIED: `dev/mock-server/src/run-real.ts:34-61`, `dev/mock-server/src/reset.ts:52-100] |
| Hotspot, run sheet, and backup video | Human / Demo operations | Local demo tooling | These depend on the actual device, venue network, form URL, and recorder; no code can certify the human rehearsal. [VERIFIED: `04-CONTEXT.md` D-14/D-15 and Phase Boundary] |

## Standard Stack

No new packages are required by the current phase scope. The existing repository stack already covers the client speech queue, UI, NVDA FFI, local static demo, and tests. [VERIFIED: `package.json:16-29`, `apps/server/package.json:6-15`, `apps/voice/package.json`]

| Component | Existing version / API | Purpose | Planning guidance |
|---|---|---|---|
| TypeScript / Vite / Vitest | TypeScript `6.0.3`, Vite `8.3.4`, Vitest `5.0.5` | Voice window, build, and tests | Extend current modules and Vitest patterns; no framework migration. [VERIFIED: `package.json:22-28`, verbatim: `"typescript": "6.0.3"`, `"vite": "8.3.4"`, `"vitest": "5.0.5"`] |
| Browser Web Speech API | `speechSynthesis`, `SpeechSynthesisUtterance.rate` | Agent-voice output and rate | Set `rate` on newly created utterances. MDN gives a default of `1`, a broad `0.1`–`10` range, and warns that engines/voices can constrain it; enforce the narrower user-selected range from D-05 in application state. [CITED: [MDN rate](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate)] |
| NVDA Controller Client | Existing `nvdaController_speakText` / `nvdaController_cancelSpeech` declarations via `koffi` `3.3.3` | Local screen-reader output | Reuse the existing bridge and add an explicit availability probe before selecting this route. The DLL itself is in a git-ignored local tools directory, so each demo machine must have a compatible copy. [VERIFIED: `apps/server/package.json:6-11`, `apps/server/src/voice/nvda.ts:15-35`, `.gitignore:11-16`]
| Local demo host | Existing `sirv` `3.0.2`, Node `node:http`, and mock-server static roots | Serve offline copies and voice window | Reuse the current local roots/reset path; do not make the fallback depend on external scripts or a live network. [VERIFIED: `dev/mock-server/package.json`, `dev/mock-server/src/run-real.ts:34-61`, `dev/mock-server/src/reset.ts:52-100`]

The frozen protocol already defines the exact settings values. Its source contains: [VERIFIED: `packages/protocol/src/payloads-voice.ts:34-39`]

```typescript
export const SettingsPayload = z.object({
  outputMode: z.enum(["agent-voice", "screen-reader", "both"]),
  rate: z.number().optional(),
  verbosity: z.enum(["short", "normal"]).optional(),
});
```

The phase decisions require exclusive output, so do not enable `"both"` for the user-facing mode switch. The presence of the schema does not mean the mode currently routes speech: the client exposes no `sendSettings`, and the server's settings handler is a no-op. [VERIFIED: `04-CONTEXT.md` D-02, `apps/voice/src/socket.ts:36-47`, `apps/server/src/server.ts:118-120`]

**Package legitimacy:** No package installation is recommended, so the package-legitimacy gate does not apply. The existing `koffi` dependency is already pinned in the server manifest. [VERIFIED: `apps/server/package.json:6-11`]

## Architecture Patterns

### Speech rate: snapshot configuration per queued item

`createTts` splits a response into sentences and calls the injected synthesizer for each sentence. The current `Synth.speak` interface takes only text and handlers. Add the rate at this existing boundary and capture it for the next queued speech item, so an in-progress item is not restarted or partially changed. Store rate in integer tenths (8 through 15, initial 10) or round after every update to avoid cumulative floating-point drift; update the session value before enqueueing the acknowledgement. These are implementation recommendations derived from D-05/D-06 and the current queue shape. [VERIFIED: `apps/voice/src/tts.ts:11-14,43-46,110-124,136-145`, `04-CONTEXT.md` D-05/D-06]

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.rate = desiredRate;
speechSynthesis.speak(utterance);
```

This follows MDN's `SpeechSynthesisUtterance.rate` example. `speechSynthesis.speak()` queues an utterance; `speechSynthesis.cancel()` stops the active utterance and clears the queue. Therefore a rate update should create a future utterance at the new rate, not call cancel/restart on the current response. [CITED: [MDN rate](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate), [MDN speak](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak), [MDN cancel](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel)]

### Exclusive mode dispatch and tracked speech completion

Keep a single session mode in the voice experience, defaulting to agent voice. On a switch, cancel the old adapter before accepting new items for the selected adapter, and update the accessible control's checked/pressed state. Do not persist the choice to local storage because D-04 says each new session starts in agent voice. [VERIFIED: `04-CONTEXT.md` D-01/D-02/D-04, `apps/voice/src/tts.ts:147-160`]

The protocol carries a tracked speech id; the source defines it verbatim as `speakId: z.string().min(1).max(64)` and `interrupted: z.boolean()`. The voice client returns `"speak.done"` for completed or interrupted ids. The Node NVDA wrapper only returns a DLL status code and has no completion event, so the NVDA adapter must not treat DLL call return as proof that speech finished. Plan an explicit, tested completion strategy and verify the core confirmation guard remains held until NVDA speech finishes plus its existing safety interval. [VERIFIED: `packages/protocol/src/payloads-voice.ts:27-32`, `packages/protocol/src/messages.ts:68-85`, `apps/voice/src/speak-bridge.ts:1-24`, `apps/server/src/voice/nvda.ts:43-63`, `.planning/workstreams/core/REQUIREMENTS.md` GATE-08]

The official NVDA sample calls `nvdaController_testIfRunning()` before speaking, then uses `nvdaController_speakText()` and `nvdaController_cancelSpeech()`. Add availability detection before entering NVDA mode; the current wrapper binds only speak/cancel and currently observes an RPC failure when NVDA is absent. [CITED: [NV Access Controller Client example](https://github.com/nvaccess/nvda/blob/master/extras/controllerClient/examples/example_python.py); VERIFIED: `apps/server/src/voice/nvda.ts:7-10,19-36`]

### User-controlled public-form rehearsal

Use the Phase 3 public-form artifact and the form model/result supplied by core. At each run, begin from a blank form, describe, fill fictional values, read back, state the exact phrase, and wait for the user to say it. For validation failures, read only detected errors and corresponding field labels; for success, report only the observed confirmation text/number. Keep the offline copy locally served and visibly label that route as offline. [VERIFIED: `04-CONTEXT.md` D-08–D-11/D-14, `.planning/workstreams/voice/ROADMAP.md:167-185`, `.planning/workstreams/core/REQUIREMENTS.md:52`]

The existing local reset path restores `fixtures/demo/profile.template.json`, restarts the mock server, and opens `fixtures/forms/broken.html`; `run-real.ts` serves `fixtures/forms` from a local static root. Reuse this pattern for any new offline demo page. The new public-form URL, reset behavior, and locally served counterpart are not yet specified in the repository; bind those choices to Phase 3's hand-off instead of inventing a provider-specific form contract. [VERIFIED: `dev/mock-server/src/reset.ts:7-10,52-100`, `dev/mock-server/src/run-real.ts:34-61`, `04-CONTEXT.md` Existing Code Insights]

For D-12's one-miss fallback, reuse the existing typed submission path so typed text enters the same server utterance pipeline; the current call is `socket?.sendUtterance({ source: "typed", text })`. Preserve the existing typed `stop` exception, which cancels speech locally and is not sent as a form command. [VERIFIED: `apps/voice/src/main.ts:230-255`, `apps/voice/src/socket.ts:36-47`]

### Accessible controls and safe output

Use native buttons or radio controls with text labels and keyboard focus styling for the mode switch and visible rate status. Current `index.html` uses a native start button and typed form; `styles.css` already has a `:focus-visible` outline. Keep untrusted page text in `textContent`; the current transcript/log renderer deliberately uses text-only insertion so confirmation/error text cannot become markup. [VERIFIED: `apps/voice/index.html:10-69`, `apps/voice/src/styles.css:40-43`, `apps/voice/src/ui-log.ts:1-3,37-60`]

### Project Constraints (from repository instructions)

- No root `AGENTS.md`, `.claude/CLAUDE.md`, or project `.codex/skills`, `.agents/skills`, or `.claude/skills` directory was present in the workspace. Root `CLAUDE.md` is the project instruction file. [VERIFIED: workspace path probes]
- The project says every page is untrusted and secrets must not enter model prompts. It states, verbatim: `Passwords/card numbers are never spoken, logged, or sent to the model.` [VERIFIED: `CLAUDE.md:311`]
- The shared protocol must not be changed without both developers' sign-off. The project states: `Protocol changes after M0 must be additive, optional fields, agreed with core.` [VERIFIED: `CLAUDE.md` Tech Stack / shared protocol rules; `docs/WORK-SPLIT.md` Rules for independent work]
- The phase context further limits rehearsal to fictional profile/test values because speech recognition audio is sent to Google STT. [VERIFIED: `04-CONTEXT.md` D-08 and Existing Code Insights; `CLAUDE.md` Voice / STT section]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Browser speech output | A custom audio/timing engine | Existing `SpeechSynthesisUtterance` and `createTts` queue | Existing queue already serializes sentences, handles interruption, and reports tracked completion. [VERIFIED: `apps/voice/src/tts.ts:58-160`, `apps/voice/src/main.ts:24-39] |
| NVDA FFI | A new native wrapper or package | Existing `koffi` bridge in `apps/server/src/voice/nvda.ts` | It already loads the local Controller Client DLL and exposes speak/cancel; extend it only for availability/completion needs. [VERIFIED: `apps/server/package.json:6-11`, `apps/server/src/voice/nvda.ts:1-63] |
| Form validation/result truth | Local heuristics that claim submit worked | Core `RES-01` observed result and error data | The core requirement says never claim success unless the page confirms it. [VERIFIED: `.planning/workstreams/core/REQUIREMENTS.md:52] |
| Offline web hosting | New server or CDN dependency | Existing `dev/mock-server` static roots and local fixtures | Local-only hosting already serves app assets and form fixtures without an external service. [VERIFIED: `dev/mock-server/src/run-real.ts:34-61] |

**Key insight:** The local speech technology is already present; the hard part is preserving mutually exclusive output and truthful `speak.done` semantics across the browser/Node boundary. [INFERENCE from the current TTS and NVDA bridge contracts]

## Common Pitfalls

### Pitfall 1: Mistaking DLL availability for a running NVDA instance

**What goes wrong:** The DLL loads, but the RPC call fails because NVDA is not running; the UI stays in screen-reader mode or silently drops speech. **Why:** Current `load()` checks DLL path and function binding, not NVDA process availability. **How to avoid:** Probe with `nvdaController_testIfRunning()` before selecting the route; speak one failure notice through agent voice, then persist agent mode for the rest of the current session. **Warning sign:** first call returns the Windows RPC-unavailable error. [VERIFIED: `apps/server/src/voice/nvda.ts:19-36,43-63`, `01-SPIKE-DECISIONS.md:12,18-20`; CITED: NV Access example]

### Pitfall 2: Reporting NVDA output complete when only the RPC call returned

**What goes wrong:** Core clears an outstanding speech id early and the GATE-08 confirmation guard no longer reflects audible speech. **Why:** `nvdaSpeak()` returns an integer call result; it does not return an `onend` callback. **How to avoid:** Select and test an NVDA completion strategy before accepting NVDA mode; emit exactly one `speak.done` for every server-issued id and mark cancellation as interrupted. Verify the gate with a real form and NVDA running. [VERIFIED: `apps/server/src/voice/nvda.ts:43-63`, `apps/voice/src/speak-bridge.ts:12-24`, `.planning/workstreams/core/REQUIREMENTS.md` GATE-08]

### Pitfall 3: Cancelling the screen reader's own page announcement

**What goes wrong:** Switching modes may stop a focus announcement from the page, even though Blip's own browser voice is exclusive. **Why:** NVDA developers describe `nvdaController_cancelSpeech()` as cancelling all NVDA speech; the controller client does not identify a Blip-only utterance to cancel. **How to avoid:** Track whether Blip has active NVDA output, keep the D-02 ordering, and test toggles while focus announcements are occurring with the form tab active. Do not assume cancellation is isolated to Blip. **Inference:** this can affect concurrent NVDA page speech because the API-wide cancel is global. [CITED: [NV Access controller-client issue #11028](https://github.com/nvaccess/nvda/issues/11028), [NVDA speech cancellation implementation](https://github.com/nvaccess/nvda/blob/master/source/speech/speech.py)]

### Pitfall 4: Changing rate mid-item or allowing range drift

**What goes wrong:** An active multi-sentence response restarts or switches rate mid-sentence; repeated 0.1 updates drift outside the agreed bounds. **How to avoid:** Store a bounded session value, apply it to newly queued items, and leave an active item untouched. At a boundary, acknowledge at the unchanged boundary rate. [VERIFIED: `04-CONTEXT.md` D-05–D-07; CITED: MDN rate/cancel]

### Pitfall 5: Claiming success from a click or a page transition

**What goes wrong:** The site rejects a required field, or the confirmation page is unavailable, while the demo says it succeeded. **How to avoid:** Wait for core's observed `RES-01` result; speak detected validation errors with labels; otherwise say success cannot be verified. Keep the distinct phrase and explicit user command as the only submit route. [VERIFIED: `04-CONTEXT.md` D-09–D-11, `CLAUDE.md:307-311`, `.planning/workstreams/core/REQUIREMENTS.md:52] |

### Pitfall 6: Treating an offline fallback as the live public form

**What goes wrong:** An offline mirror loads external scripts, loses expected result states, or the presenter fails to disclose that the demo is offline. **How to avoid:** serve locally controlled assets, rehearse both result and validation-error states, announce the offline route, and keep the real-site run separate from offline acceptance. [VERIFIED: `04-CONTEXT.md` D-14/D-15; `.planning/workstreams/voice/ROADMAP.md:167-185] |

## Integration Boundaries and Readiness

| Dependency | Owner | Readiness evidence | Planning consequence |
|---|---|---|---|
| Phase 3 I3 command set and team-owned public form | Voice Phase 3, with core BRAIN/PAGE/GATE hand-offs | Voice state says Phase 2 I2 is pending; Phase 3 is planned but not executed. Phase 4 context says the public form is not present yet. [VERIFIED: `.planning/workstreams/voice/STATE.md`, `04-CONTEXT.md` Existing Code Insights] | Prepare Phase 4 work now, but gate public-form rehearsal on the Phase 3 artifact and successful I3. |
| `RES-01` result page and errors | Core | Core requirement remains Pending and is assigned to core Phase 3. [VERIFIED: `.planning/workstreams/core/REQUIREMENTS.md:52,123`, `.planning/workstreams/core/STATE.md`] | Do not duplicate core result parsing; test both confirmed success and reported validation errors against the delivered contract. |
| `PROT-03` one-command startup | Core | Core requirement remains Pending and is assigned to core Phase 5. [VERIFIED: `.planning/workstreams/core/REQUIREMENTS.md:15,101`, `.planning/workstreams/core/STATE.md`] | Use the voice mock/manual launcher while building; make the freeze rehearsal a hand-off gate for core's final launcher. |
| NVDA mode and `speak.done` routing | Voice owns UX; local DLL is in server process | Protocol supports mode settings but client lacks `sendSettings`, server settings handler is no-op, and the DLL wrapper has no completion callback. [VERIFIED: `packages/protocol/src/payloads-voice.ts:27-39`, `apps/voice/src/socket.ts:36-47`, `apps/server/src/server.ts:118-120`, `apps/server/src/voice/nvda.ts:43-63`] | Write an explicit voice/core integration contract before implementation. Prefer the existing protocol if it suffices; any schema change is additive and requires both owners' agreement. |

The protocol's relevant wire values are exactly `"speak.done"` and `settings`; the settings values are `"agent-voice"`, `"screen-reader"`, and `"both"`. [VERIFIED: `packages/protocol/src/messages.ts:81-85`, `packages/protocol/src/payloads-voice.ts:27-39`]
The core requirement ledger's exact rows are `PROT-03 | core | Phase 5 | Pending` and `RES-01 | core | Phase 3 | Pending`; the quoted status value is `Pending`. [VERIFIED: `.planning/workstreams/core/REQUIREMENTS.md:101,123`]

## Environment Availability

| Dependency | Required by | Available in research environment | Version / note | Fallback |
|---|---|---|---|---|
| Node.js | TypeScript server, build, tests | Yes | `v24.20.0` [VERIFIED: runtime probe] | — |
| npm | Workspace scripts | Yes through `npm.cmd` | `11.19.0`; PowerShell's `npm.ps1` is blocked by the current execution policy, so use `npm.cmd` for manual commands. [VERIFIED: runtime probe] | Use `npm.cmd` or `node` directly. |
| NVDA runtime | VOX-08 end-to-end speech | Not observed running; Phase 1 explicitly says NVDA was not installed for its spike. [VERIFIED: runtime probe, `01-SPIKE-DECISIONS.md:12,18-20`] | The local `tools/nvda-client/nvdaControllerClient64.dll` exists but is ignored/untracked; another demo machine's DLL/NVDA availability is unknown. [VERIFIED: runtime probe, `.gitignore:11-16`] | Agent voice is the approved fallback; show NVDA only in the opening hook if it is unreliable by freeze. |
| Chrome | Live form and app window | Not found as a command in `PATH`; launcher resolves standard Windows install paths or `CHROME_PATH`. [VERIFIED: runtime probe, `dev/mock-server/src/launch-window.ts:42-53`] | Exact install path not determined in this research run. | Use the existing `CHROME_PATH` override or a machine with Chrome installed. |
| Public form URL and owner | DEMO-03 rehearsal | Not yet supplied in Phase 4 context; expected from Phase 3. [VERIFIED: `04-CONTEXT.md` Integration Points] | Form provider and reset behavior are open. | Run only against the Phase 3 team-owned form; use local demo fixtures for interim checks. |
| Phone hotspot and screen recorder | DEMO-04 human rehearsal | Not verifiable from this machine probe. | Device/network and capture tool need a human rehearsal. | D-14 allows one hotspot attempt, then local copies; keep a locally stored backup video. |

The local DLL is a real machine dependency even though no npm package is needed. Do not commit the DLL; the repository ignores `tools/nvda-client`. [VERIFIED: `apps/server/src/voice/nvda.ts:15-16`, `.gitignore:11-16`]

## Security Domain

Security enforcement is enabled by default because no `security_enforcement: false` override exists; Phase 4 should use the applicable OWASP ASVS 5.0.0 Level 1 controls. The OWASP project identifies 5.0.0 as its stable release. [VERIFIED: GSD security defaults, workstream config read; CITED: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS)]

### Applicable ASVS Categories

| ASVS 5.0.0 category | Applies | Phase control |
|---|---|---|
| V1 Encoding and Sanitization | Yes | Treat page-provided labels, errors, and confirmation text as untrusted text; never turn them into executable instructions or markup. [CITED: OWASP ASVS 5.0.0 V1; `apps/voice/src/ui-log.ts:1-3,51-60`] |
| V2 Validation and Business Logic | Yes | Do not infer that submission succeeded. Preserve the core's exact phrase, read-back, and observed-result checks. [CITED: OWASP ASVS 5.0.0 V2; `CLAUDE.md:307-311`, core `RES-01`] |
| V3 Web Frontend Security | Yes | Render remote result text using text-safe DOM insertion; keep the mode toggle keyboard-operable and clearly labeled. [CITED: OWASP ASVS 5.0.0 V3; `apps/voice/src/ui-log.ts:37-60`, `apps/voice/index.html:62-68`] |
| V4 API and Web Service | Yes, if the existing settings frame is used for mode routing | Parse through the frozen protocol; do not create a permissive alternate channel or weaken the loopback/Origin controls. [CITED: OWASP ASVS 5.0.0 V4; `packages/protocol/src/messages.ts:64-85`] |
| V14 Data Protection | Yes | Use only fictional profile values; keep the demo recording local; exclude sensitive values from speech, transcript, and model input. [CITED: OWASP ASVS 5.0.0 V14; `04-CONTEXT.md` D-08/D-15; `CLAUDE.md:311`] |
| V16 Security Logging and Error Handling | Yes | NVDA or network failure must degrade to the declared fallback; do not expose DLL paths, stack traces, or internal failure details in user-facing speech. [CITED: OWASP ASVS 5.0.0 V16; `04-CONTEXT.md` D-03/D-13/D-14] |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Page-supplied “submit now” text or deceptive confirmation | Spoofing / elevation of privilege | Treat page text as untrusted; voice UI only presents it; only core's deterministic gate accepts the distinct phrase from voice input. [VERIFIED: `CLAUDE.md:307-311`, core requirements GATE-01..08] |
| Claiming success without an observed result | Repudiation / tampering | Report only the result returned from the current page; if no confirmation is observed, say success cannot be verified. [VERIFIED: `04-CONTEXT.md` D-10/D-11] |
| Profile values exposed in audio, transcript, logs, or recorded video | Information disclosure | Use fictional test values throughout the live and recorded demo; never enter password/card data; keep the recording local. [VERIFIED: `04-CONTEXT.md` D-08/D-15, `CLAUDE.md:311] |
| NVDA unavailable or server completion reported early | Denial of service / safety-state desynchronization | Fail over once to agent voice, keep ids tracked, and test the one-second GATE-08 interval against actual NVDA output. [VERIFIED: `04-CONTEXT.md` D-03/D-13, core requirements GATE-08] |

## State of the Art

| Area | Current behavior | Phase 4 implication |
|---|---|---|
| Browser rate control | `SpeechSynthesisUtterance.rate` is a per-utterance speed value; MDN notes voice/engine bounds can be narrower than the API range. [CITED: [MDN rate](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate)] | Keep D-05's tighter application clamp and test the chosen local voice at both bounds. |
| Browser cancellation | `speechSynthesis.cancel()` immediately stops active speech and empties the queue. [CITED: [MDN cancel](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel)] | Cancel the old route before switching; don't use cancellation to apply a rate change. |
| NVDA Controller Client | NVDA 2026.2 added `nvdaController_getProcessId` and `nvdaController_speakSsml`; the release notes say new functions require NVDA 2024.1+ and `speakSsml` supports priority plus sync/async options. [CITED: [NVDA 2026.2 release notes](https://api.nvaccess.org/releases/2026.2/documentation/changes.html)] | The repository uses the simpler `speakText` path. If its completion or interference behavior blocks acceptance, evaluate the supported API with NVDA installed rather than assuming it solves the issue. |

## Assumptions Log

No unverified implementation facts are promoted to decisions. The mode-routing/completion strategy, actual public form, hotspot device, and recording environment remain open items below.

## Open Questions

1. **(RESOLVED — accepted implementation gate) NVDA routing and completion:** Reuse the existing `settings` / speech-id contract; do not change the protocol schema. The first implementation task must prove a completion strategy. NVDA mode is not accepted unless one matching `speak.done` follows audible completion or cancellation. Until that is demonstrated on an equipped machine, NVDA acceptance remains human-needed; use the D-16 agent-voice fallback if the strategy cannot be proven. [VERIFIED: `packages/protocol/src/payloads-voice.ts:27-39`, `apps/voice/src/socket.ts:36-47`, `apps/server/src/server.ts:118-120`, `apps/server/src/voice/nvda.ts:43-63`; CITED: NVDA 2026.2 release notes]
2. **(RESOLVED — accepted live-form gate) Phase 3 target:** The team-owned public form delivered by Phase 3 is the only live target. Until it exists, fixture/offline rehearsal does not count as live acceptance; the form provider, reset path, and counterpart remain implementation inputs from that hand-off. [VERIFIED: `04-CONTEXT.md` Integration Points and Canonical References]
3. **(RESOLVED — human-needed NVDA check) Focus and cancellation behavior:** Test the actual accessible toggle, form focus announcements, and controller cancellation on a machine running NVDA. If cancellation silences useful page announcements or speech overlaps, retain the D-16 agent-voice fallback and leave NVDA acceptance pending. [CITED: NV Access issue #11028 and NVDA speech implementation; `04-CONTEXT.md` Notes]
4. **(RESOLVED — venue-owned human inputs) Hotspot and recorder:** The venue team supplies and tests these; the run sheet must record the chosen device/recorder and tested procedure before freeze. Do not assume a device or claim these checks passed. [VERIFIED: `04-CONTEXT.md` D-14/D-15]

## Sources

### Primary repository sources

- `.planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-CONTEXT.md` — locked decisions, boundaries, and known assets.
- `.planning/workstreams/voice/ROADMAP.md` and `REQUIREMENTS.md` — freeze criteria and requirement scope.
- `.planning/workstreams/core/ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` — `PROT-03`, `RES-01`, and ownership/readiness.
- `apps/voice/src/tts.ts`, `speak-bridge.ts`, `main.ts`, `socket.ts`, `ui-log.ts`, and `index.html` — browser speech queue, input paths, accessibility markup, and protocol client.
- `apps/server/src/voice/nvda.ts`, `apps/server/src/server.ts`, `packages/protocol/src/payloads-voice.ts`, and `messages.ts` — DLL bridge, settings handling, and speech completion contract.
- `dev/mock-server/src/reset.ts`, `run-real.ts`, and `launch-window.ts` — local form serving, reset, and app launch patterns.
- `CLAUDE.md`, `.planning/PROJECT.md`, and `docs/WORK-SPLIT.md` — safety, privacy, ownership, and cross-track constraints.

### Official external documentation

- [NV Access Controller Client example](https://github.com/nvaccess/nvda/blob/master/extras/controllerClient/examples/example_python.py) — availability probe and speak/cancel usage.
- [NVDA 2026.2 release notes](https://api.nvaccess.org/releases/2026.2/documentation/changes.html) — current Controller Client additions and version floor.
- [NV Access issue #11028](https://github.com/nvaccess/nvda/issues/11028) and [NVDA speech cancellation implementation](https://github.com/nvaccess/nvda/blob/master/source/speech/speech.py) — global cancellation caveat.
- [MDN rate](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate), [MDN speak](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak), and [MDN cancel](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel) — browser synthesis behavior.
- [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS) — applicable security category names and controls.

## Metadata

**Confidence breakdown:**
- Existing stack and repository patterns: HIGH — inspected the manifest and current implementation files.
- NVDA integration behavior: MEDIUM — official API example and release notes checked; no NVDA instance was available for end-to-end testing.
- Public-form and demo logistics: LOW until Phase 3 supplies the team-owned form and the team tests the hotspot/video setup.

**Research date:** 2026-10-17  
**Valid until:** 2026-11-16 for repository patterns; re-check NVDA release documentation and Phase 3/core hand-offs before execution.
