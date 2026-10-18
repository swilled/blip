# Voice repair research

Researched: 2026-10-18. Local baseline: `d69d822`. Method: source inspection, official browser documentation, and direct inspection of existing repository implementations. No application tests, microphone capture, audible measurements, model calls, package installs, or browser restarts were performed for this planning pass.

## Scope and evidence standard

The open user reports are: Right Ctrl + Space stops listening automatically; complete commands are not understood; some speech is truncated; rate controls do not reliably change audible speed; repeated rate changes can leave speech silent; opening/reloading Blip has repeatedly exposed old builds or the wrong browser/profile. Earlier form-reading, required-field, profile, and submission fixes are regression coverage.

A source defect is not proof of the event that occurred on this machine. The previous explanation identifying browser `onend` as the runtime root cause was too strong: this is a confirmed mishandled lifecycle, but a live event trace must still distinguish it from microphone denial, network failure, native key release, and the 10-second watchdog.

## Local findings

| Finding | Evidence | Confidence / implication |
|---|---|---|
| Browser end is treated as completion of a held command | Committed `apps/voice/src/stt.ts` finishes on every `onend`, with no physical-release state | Confirmed code defect; exact runtime trigger unobserved |
| Errors hide the cause | Committed `errorFor` gives network and no-speech the same message; audio-capture also falls through | Confirmed diagnostic gap |
| Listening is announced before capture readiness | `talk-controller.ts` enters listening and plays the earcon before `stt.press`; RecognitionLike lacks start/audio lifecycle hooks | Confirmed readiness gap |
| Old and new interfaces remain reachable | `scripts/demo.ts` builds/serves dist; `apps/server/src/main.ts` serves public | Confirmed entry-point mismatch |
| Local and global hold ownership can conflict | `main.ts` separately tracks manual/global flags; `hold-client.ts` does not end an active hold on socket close | Confirmed recovery gap; add aggregate ownership and disconnect tests |
| Long holds have an unconditional 10-second limit | `ptt-state.ts` default watchdog | Confirmed constraint, not an explanation for a reported one-second stop |
| Numeric acknowledgement is split at a decimal | `tts.ts splitSentences` uses punctuation matching; “Speech rate is now 1.2.” becomes two utterances | Confirmed segmentation defect |
| Completion timer includes startup delay | `speakSentence` starts its timer before synth.speak; Synth has no onstart | Confirmed false-timeout risk; rate scaling alone is insufficient |
| Rate can change between sentences in one reply | `getRate` is called in every speakSentence | Conflicts with applying rate to the next speech item |
| Actual voice selection is unstable during voice loading | `makeSynth` picks the first currently loaded local Microsoft voice without waiting for voiceschanged | Confirmed missing readiness path, audible impact unverified |
| Local rate acknowledgement bypasses server accounting | `LOCAL_RATE_ACK_ID` returns before bridge completion; `settings.rate` exists but runner ignores it | Confirmed integration gap; fix before gated live testing |
| Fresh PTT may clear an otherwise valid confirmation | Runner's ptt-start handler clears any state.confirm without capture eligibility checks | Static integration concern: exercise real PTT start/end plus exact phrase, not a typed-only substitute |
| Existing speech tests do not establish device behavior | STT factory and Synth are mocked; speech-rate tests inspect numbers | Automated correctness must be supplemented by Windows Chrome audio evidence |

The dirty `apps/voice/src/stt.ts` is an interrupted draft from before planning. It is not verified, has no matching new tests, and is not accepted as the finished repair. In particular, it still needs capture generations, cleanup, bounded recovery, terminal-error settlement, and protection against mixing successive holds. Preserve it for reconciliation in 04-05.

## Primary sources and repository confirmation

These are implementation references, not new runtime dependencies. Source was read, not merely found by search. Reuse behavior through original TypeScript code; preserve licenses if any source is actually copied.

| Reference | Revision / inspected source | Confirmed pattern and limitation |
|---|---|---|
| Web Speech API draft | [Current specification](https://webaudio.github.io/web-speech-api/) | Continuous mode permits multiple final results; stop finalizes captured audio, abort discards it. Consent and visible recording state matter. A browser end event does not identify a physical key release. |
| TalAter/annyang | [src/annyang.ts](https://github.com/TalAter/annyang/blob/616fb0e9c4b7355ede19d5909cbcf7b6c9783cac/src/annyang.ts), HEAD verified by git ls-remote | Restarts after automatic end, rate-limits automatic starts to once per second, cancels pending restart, and disables restart on permission denial. Adapt only while an explicit Blip hold is active; do not import its always-listening command behavior. |
| JamesBrill/react-speech-recognition | [RecognitionManager.js](https://github.com/JamesBrill/react-speech-recognition/blob/849a908a8317e7e56739d937faf51be347c631b0/src/RecognitionManager.js) | Separates intentional stop/abort from disconnect recovery and separates final/interim transcription. Blip also needs per-hold generations and exactly one server utterance. |
| SnosMe/uiohook-napi | [src/index.ts](https://github.com/SnosMe/uiohook-napi/blob/44e0d868ac6fedd2a68c7f8ad8163c73a3f36fc3/src/index.ts) | Exposes distinct keydown/keyup events. Space is 0x0039 and right control is 0x0E1D, matching Blip's constants. This confirms identifiers, not hardware event delivery. |
| Chromium | [Windows TTS source](https://github.com/chromium/chromium/blob/03f87b9b21b97bdef4342dcf2d3ae63a762afa1b/content/browser/speech/tts_win.cc) | The SAPI path uses integer truncation of 10 log10(rate). Requested rates 0.8 through 1.2 can map to the same native level. This is source-level evidence; verify the installed browser and chosen voice use this route. |
| MikeyParton/react-speech-kit | [useSpeechSynthesis.jsx](https://github.com/MikeyParton/react-speech-kit/blob/d8f42d3968d2034c3a45fd3d7c33c4e83de62774/src/useSpeechSynthesis.jsx) | Reads available voices and handles voiceschanged when loading is asynchronous; creates a fresh utterance and assigns its rate before speak. |
| compulim/react-say | [README caveats](https://github.com/compulim/react-say/tree/e3983f84384f832a911eb2a17f8831d260b9d2b0#caveats) | Documents a Chrome cancel/speak repetition failure with no audio despite speaking=true. This is a library author's observed caveat, not proof it caused this incident; use onstart and event ordering to check. |
| MDN maintained examples | [synthesis script](https://github.com/mdn/dom-examples/blob/93d7d40c7b14dc0dd208d4967905606339e1f0e6/web-speech-api/speak-easy-synthesis/script.js) | Refreshes the voice list on voiceschanged, handles end/error, and sets rate on the actual utterance. |
| Google Chrome Help | [Microphone access and device selection](https://support.google.com/chrome/answer/2693767?hl=en) | Documents per-site permission, OS permission, default recording device, and restrictions when switching tabs/apps. The earlier medium-confidence unfocused spike is insufficient to guarantee this workstation's global shortcut. |
| Chromium renderer | [speech_recognition.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/speech/speech_recognition.cc) | Distinct start, audio, result, error, and end callbacks and cumulative final-result handling support lifecycle instrumentation. Current main may differ from the installed Chrome release. |
| WebAudio explainer | [On-device recognition](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md) | On-device recognition is an optional capability path with availability/model prerequisites; feature-detect on the actual browser before considering it. Not a guaranteed replacement or a reason to silently download a model. |

## Recommended design

1. Keep vanilla TypeScript, native Chrome recognition, and the existing native hook. Adding a React wrapper or annyang would not fix microphone permissions, stale builds, or Windows TTS quantization.
2. Observe one attempt end to end: native chord, sidecar, capture request, onstart, audiostart, sound/speech events, final/interim counts, error code, release, end, and utterance dispatch. Keep diagnostic payloads to event names, relative times, generation ids, counts, booleans, requested rate, and selected voice metadata. No transcripts, page values, raw audio, arbitrary keycodes, or credentials in diagnostic persistence.
3. Define one hold owner, one capture generation, at most one recognizer, and at most one utterance per generation. Separate starting/listening/recovering/finalizing. Only readiness callbacks prove recording started. Recover automatic no-speech/end while held, no more than one start per second; stop recovery on release, disconnect, terminal error, or expiry.
4. Preserve the existing 10-second watchdog until evidence establishes it is the cause of longer-command cutoff. Show an explicit time-limit message instead of a generic miss; extending the bound needs a documented user-experience decision, not removal of cleanup.
5. Preserve indexed final results and display replaceable interim text. Do not execute interim speech or merge text from different presses. Discard a command whose capture was interrupted so its tail cannot become an authorization.
6. Use rate presets [0.50, 0.63, 0.79, 1.00, 1.26, 1.59, 2.00]. Computed against the inspected SAPI mapping these address levels [-3,-2,-1,0,1,2,3]. This is an engineering starting point, not a promise of exact acoustic multipliers. Show the selected requested value, apply it once at speech-item start, and say “Speaking faster/slower” instead of splitting decimal speech.
7. Retain the active utterance until terminal settlement; load/select one voice deterministically; separate an 8-second startup deadline from conservative completion deadlines (at least 5 seconds, rate-aware, bounded to 120 seconds per sentence). Timers only interrupt/fail, never certify read-back completion. Record onstart/end/error and recover the queue without immediate repeated cancel/speak cycles.
8. Route agent-voice rate acknowledgements through existing settings.rate and ordinary server-tracked speak effects. Use the reducer and session speech ledgers; do not send completion for a fabricated client-only id. Screen-reader mode keeps browser TTS silent and presents status text.
9. Preserve a valid armed confirmation through a fresh eligible PTT capture. A capture started during speech or within the existing 1-second guard is ineligible even if released later. Page/value change, cancellation, output loss, and stale generations still invalidate authority. Exact confirmation matching remains server-owned.
10. If the trace proves a blocked microphone/service instead of lifecycle failure, fix that specific layer and rerun the same test. If focused button capture works but background capture fails, implement an explicit focus-ready shortcut path and disclose its focus change; do not silently claim background support. A local recognition backend is a later conditional spike if native recognition remains unavailable.

## Validation strategy

Source/unit tests: unexpected end while held, no-speech recovery, release during recovery, late callbacks, rapid consecutive holds, disconnect, mixed input ownership, denied permission, service/network failure, timer boundaries, multi-chunk text, decimal/URL/email speech, rate presets, startup delay, repeated speed adjustments, and exactly-once speech completion.

Integration: built UI and launcher identity, real settings.rate -> tracked acknowledgement -> actual done callback, and PTT start/end -> exact confirmation -> single local action. Keep local fake-brain tests separate from real-provider/demo claims.

Device acceptance: five successful fresh holds through each supported input route, one longer fictional phrase with pauses, same fixed phrase at slow/default/fast, twenty rate changes followed by a normal reply, and a microphone denial/recovery check. Then regress Microsoft Forms required-field reading and the already-passed local I2 gate. No public-form submission is part of the repair test without a deliberate user-led rehearsal.

Planning checks: frontmatter/task completeness, static command-path resolution, explicit failure directions, dependency order, and coverage against all user reports. A static plan review is not a code test or a human audio pass.
