# Local speech recognition decision — 2026-10-18

The user authorized replacing Chrome-dependent recognition if research supported it. Decision: use a native Windows whisper.cpp CPU process with base.en. Chrome remains Blip's UI and raw microphone capture surface. This change removes Chrome SpeechRecognition and its recognition-service endpointing from the live input path; it does not claim to remove Chrome or prove every background microphone scenario.

## Options considered

| Option | Evidence / suitability | Decision |
| --- | --- | --- |
| Chrome Web Speech | Existing production source and user reports show automatic end/no-speech recovery and repeated early termination. Correct handling cannot control service endpointing. | Retain its module/tests as historical and adapter regression coverage, but do not call it from main. No silent fallback. |
| whisper.cpp | Official repository supports Windows, CPU inference and English models; native CLI accepts WAV stdin. Can transcribe the complete physically bounded recording after release with no Python/GPU/service account. | Selected and installed; actual local execution and synthetic Chrome microphone test passed. |
| faster-whisper | Official repository provides CTranslate2, Python and CPU int8. Viable, but adds a Python/runtime installation to this TypeScript workstation. | No extra Python stack needed for this repair. |
| Windows System.Speech | Microsoft documents the native default-device recognition engine. Adds Windows recognizer/culture availability as another machine-specific dependency. | Used only to generate reproducible fictional audio for testing, not to assume recognition quality. |

Primary references inspected:

- [whisper.cpp README](https://github.com/ggml-org/whisper.cpp), [v1.9.2 CLI source](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/cli/cli.cpp), and [WAV/stdin source](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/common-whisper.cpp).
- [Official Windows binary release](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.2). Newer semantic latest v1.9.5 had no binary assets when checked; use the pinned available v1.9.2 release rather than a mutable development build.
- [faster-whisper README](https://github.com/SYSTRAN/faster-whisper).
- [Microsoft default-device API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtodefaultaudiodevice?view=netframework-4.8.1).
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet): background audio processing runs on the audio thread. Our real browser test verifies the selected localhost implementation; this is not a blanket promise of background behavior on every machine.

## Installed artifacts

`npm.cmd run stt:setup` downloads only the two pinned artifacts and verifies SHA-256 before installation into ignored `.local-stt/`:

- Windows x64 CPU `whisper-bin-x64.zip`, v1.9.2, SHA-256 `49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a` (official release API digest).
- `ggml-base.en.bin`, model repository revision `5359861c739e955e79d9a303bcbc70fb988958b1`, 147,964,211 bytes, SHA-256 `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` (upstream LFS digest).

No npm runtime dependency was added. The setup currently targets Windows x64. Another machine must run setup once; missing setup produces a clear unavailable result, never automatic cloud transcription.

## Input and safety boundary

The existing button and global hold still go through one TalkController and the server-owned PTT eligibility record. AudioWorklet records mono PCM into memory while held, flushes on physical release and sends one canonical 16 kHz WAV to the existing loopback server. Silence never ends a hold. The existing ten-second safety cap cancels rather than dispatching a partial command. Permission denial, lost device, cancellation, replacement, startup/flush failure and old callbacks discard the capture. No interim transcript is executed.

The HTTP endpoint requires the current exact same Origin and a process-specific token, with no permissive CORS. It validates WAV layout, bounded Content-Length and duration, rejects malformed requests, serializes inference and filters near-zero energy. Input is passed to a hidden native child through stdin; transcripts return through stdout. User recordings/transcript files are not written. There is no shell invocation, prompt hint containing the confirmation phrase, model-granted action authority or transcript logging. Whisper's unavailable confidence is omitted rather than fabricated as zero or one.

An upstream Windows CLI detail was confirmed experimentally and in source: stdin defaults the output basename to `-`, disabling live stdout; requesting a text file at `/dev/stdout` is unsuitable on Windows. Our `-of blip-memory` restores the stdout callback with **no output-format flag**, so no file is created. Stderr is discarded to keep recognition content out of logs.

The server returns text only. The normal finalized utterance still passes deterministic exact-phrase/readback/cooldown/core grant checks; output failures and page changes invalidate old eligibility. The endpoint rejects a result if the voice epoch or capture identity changed while inference ran. CPU processing latency counts against the existing confirmation freshness window; long captures may require a fresh shorter hold and never extend action authority.

## Observed verification

- Actual CPU/model test (`npm.cmd run stt:check`): five fictional synthetic utterances correctly recognized, including complete long dictation, read the form, what is required, submit form and submit survey. Latencies: 1,094 / 1,023 / 1,027 / 956 / 933 ms, including model startup for each invocation. These are synthetic samples, not measured user accuracy.
- Actual browser test (`npm.cmd run stt:check:browser`): isolated headless Chrome, synthetic microphone, real AudioWorklet and native model. Chrome SpeechRecognition constructors were deliberately replaced with throwing constructors. No utterance was sent while held; after release exactly one voice frame contained `Read the form.` without a fabricated confidence value. No personal microphone was opened and no form was submitted.
- Focused recording/HTTP/gate tests passed; permission and late-result races, bounded capture, WAV conversion, silence, origin/token validation, connection replacement and inference serialization are covered. Existing exact-phrase gate regressions pass.
- Root regression: 125 files / 1,311 tests passed; 16 files / 28 tests skipped. Typecheck and voice build passed. Follow-up full suite after the final confidence/device-loss adjustment is recorded in the execution handoff.

## Remaining device acceptance

Restart `npm.cmd run demo -- --brain=fake`, activate Blip, and grant microphone access with Check microphone before using either hold route. The UI identifies local Whisper. Hold until the phrase is finished, release, then expect roughly a second for recognition; live partial captions are not provided by this batch input path. Test pauses and longer utterances, both input routes while the form has focus, normal output/rates, and the local gate checks in 04-REPAIR-ACCEPTANCE.md.

Actual user microphone accuracy, background focus behavior, speaker speeds and the original milestone rehearsal remain pending. No freeze tag or phase-complete claim follows from these synthetic/software checks.
