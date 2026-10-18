# Recognition accuracy and voice research — 2026-10-18

The user confirms speech speed works but recognition is poor. Recognition (what Blip hears), capture (which device/signal reaches the model), and synthesis (the voice Blip speaks with) must be evaluated separately. Current physical-input root cause is unconfirmed; synthetic tests cannot stand in for the user's voice.

## Implemented diagnosis and model change

The prior native recognizer was English base.en with a single-path decoder. The current candidate is small.en with beam size five. We keep English explicit, no translation and no grammar/prompt containing the confirmation phrase. Core still owns all action authority, final text only, the one-second speech guard and single-use capture freshness. Long model latency never extends a grant.

The voice window now exposes the selected microphone, a live signal meter, quiet/clipping hints, and the completed recording duration/level. Chrome audio filtering can be toggled; automatic gain control is disabled to allow a controlled comparison without gain pumping. This is an experiment, not a claim that gain control caused the observed failure. The exact selected device is passed to getUserMedia. Device selection/filter changes cancel the active capture. Content-free diagnostic rows can include duration/RMS/peak, never raw audio or transcripts.

Whisper's missing confidence remains absent, not zero or a fabricated success score. Changed page/connection and an occupied native worker now have distinct visible messages rather than all being called recognition failure.

## Measured comparison on this workstation

Reproduce with `npm.cmd run stt:compare`. Each engine sees exactly the same five fictional Windows-synthesized phrases, once clean and once with deterministic 6 dB noise. There are 48 reference words per engine across ten samples. Output punctuation/case is normalized for word-error comparison.

| Native CPU model | Exact cases | Normalized word errors | Median inference including startup | Decision |
| --- | --- | --- | --- | --- |
| base.en, beam 1 | 10/10 | 0/48 | 1097 ms | Retain as a comparison/fallback; this test does not reproduce poor user accuracy. |
| small.en, beam 5 | 10/10 | 0/48 | 3806 ms | Practical larger-model candidate; default when installed. |
| medium.en-q5_0, beam 5 | 10/10 | 0/48 | 11332 ms | Not default: 10–13 seconds before adding the hold itself is unsuitable for current confirmation freshness. |

These are small synthetic tests. They establish working decoding and a speed tradeoff, **not** that small is more accurate for this user. The next required evidence is an exact spoken/transcribed phrase and microphone level/duration; broader model rankings are not a substitute.

`npm.cmd run stt:check:browser` also passed with real Chrome, fake microphone, actual AudioWorklet, Chrome SpeechRecognition explicitly disabled and native small.en. It captured 3.6 seconds and emitted exactly one finalized Read the form after release. It found Microsoft David, Mark and Zira locally. This establishes the browser integration with a known signal; the physical user's device remains untested.

## Repositories and alternatives researched

| Option | Primary sources | Application to Blip |
| --- | --- | --- |
| whisper.cpp | [Repository](https://github.com/ggml-org/whisper.cpp), [CLI implementation](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/cli/cli.cpp), [models](https://github.com/ggml-org/whisper.cpp/tree/master/models) | Existing Windows native CPU integration; model/decoder can be compared without replacing the gate or adding another runtime. Larger model capacity is a candidate improvement, not a measured user result. |
| NVIDIA Parakeet + sherpa-onnx | [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2), [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Windows/native microphone examples](https://github.com/k2-fsa/sherpa-onnx/tree/master/dotnet-examples/speech-recognition-from-microphone) | Viable alternative English ASR/native capture stack. Upstream benchmark claims use different datasets/hardware. A real same-recording comparison is needed before another engine replacement; not installed in this investigation. |
| Handy | [Official README](https://github.com/cjpais/Handy) | Offline desktop dictation with hold/release and direct system microphone access. Useful reference for a native-capture comparison if Chrome's captured signal is poor. Its clipboard/paste workflow does not supply Blip's grant binding; installing it as a parallel controller would not constitute integration. |
| Buzz | [Repository](https://github.com/chidiwilliams/buzz), [microphone/offline FAQ](https://github.com/chidiwilliams/buzz/blob/main/docs/docs/faq.md) | Useful independent offline microphone/transcription reference. Does not itself fix the selected Blip input or its safety integration. |
| Piper output voices | [Current upstream](https://github.com/OHF-Voice/piper1-gpl), [voice samples/models](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md) | Alternative local neural TTS, including English voices. It changes output naturalness, not input recognition. A replacement must preserve actual start/end/cancel, rates and speakId tracking; currently retain the working output path. |
| Kokoro output voices | [Official repository](https://github.com/hexgrad/kokoro) | Another local synthesis candidate. No evidence here that replacing successful output improves recognition. Not installed. |
| Existing Windows voices | Actual browser inventory; [SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) | Implemented voice picker for installed English voices. Selection affects the next tracked item and preserves the active item's rate/voice. |
| Capture settings | [MDN automatic gain control constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/autoGainControl), [Microsoft audio/input troubleshooting](https://support.microsoft.com/en-US/Windows/Hardware/Audio/fix-sound-or-audio-problems-in-windows) | Separate a wrong input or poor level from ASR. Use the picker and meter before adding a second browser extension. |

## Installation and artifact identity

`npm.cmd run stt:setup` now installs small.en by default from model revision `5359861c739e955e79d9a303bcbc70fb988958b1`:

- `ggml-small.en.bin`: 487,614,201 bytes, SHA-256 `c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d`.
- Optional comparison `--model=medium.en-q5_0`: 539,225,533 bytes, SHA-256 `76733e26ad8fe1c7a5bf7531a9d41917b2adc0f20f2e4f5531688a8c6cd88eb0`.
- Previously installed base model and verified official v1.9.2 binary are unchanged. All are ignored local artifacts, not committed weights. No npm runtime dependency or external service was added.

Set process environment BLIP_STT_MODEL to base.en, small.en or medium.en-q5_0 only for a deliberate installed-model comparison; unsupported values fail clearly. Default discovery prefers installed small.en. Native endpoint metadata reports the actual selected engine.

## Actual user check still needed

Choose the microphone you intend to speak into, then hold and say read the form. After release, allow a few seconds. Report the exact caption and Recorded … seconds / level feedback. If sound is very quiet or clipped, correct the input/position/Windows input volume before changing models again. If the level is good but recognition is wrong, compare the same phrase with filtering unchecked. The asynchronous request for the user's exact said/heard example and microphone type remains pending.

Actual accuracy is not marked passed. Original Phase 4 human checks, including local exact-phrase behavior and microphone/speaker acceptance, remain open.
