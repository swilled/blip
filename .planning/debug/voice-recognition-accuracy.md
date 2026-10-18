---
status: verifying
trigger: "The faster and slower thing works now but audio recognition is still terrible; debug possible Chrome issues and research voices, extensions and repositories."
created: 2026-10-18
updated: 2026-10-18
---

## Symptoms

Expected: Complete, accurate user speech through both hold routes.
Actual: User still reports poor recognition after the base.en migration; faster/slower now works.
Errors: No current error text or incorrect transcript supplied. Requested one exact said/heard example and microphone type asynchronously; answer pending.
Timeline: After the local base.en build. Earlier examples were read the form / read the forum / incomplete read the.
Reproduction: Actual user's workstation microphone and hold workflow. Synthetic input does not reproduce the reported recognition error.

## Current Focus

Hypothesis: Wrong/quiet/clipped/processed microphone input and model accuracy are separate candidates. The prior decoder favored speed (base.en, beam=1); that observation is not proof it caused the user's failure. Chrome remains the raw microphone capture surface even though recognition is outside Chrome.
Next action: Obtain the exact caption plus current capture duration/level and selected microphone from one real hold. Compare filtering on/off if the selected microphone is correct. Keep phase/device acceptance open.

## Evidence

- Live main never instantiates Chrome SpeechRecognition; real Chrome AudioWorklet/native model test passes with both Chrome recognition constructors replaced by throwing constructors. This does not eliminate a real device, driver, permissions, or Chrome processing problem.
- Reproducible model comparison: five fictional synthetic phrases, clean and deterministic 6 dB noise, ten cases per model. All three returned zero normalized word errors (48 reference words each). Base median 1097 ms; small median 3806 ms; quantized medium median 11332 ms. These samples do not establish improved accuracy on the user or their accent.
- Medium's 10–13 second inference alone conflicts with the existing capture freshness window; it is installed for comparison but not selected by default. Small.en is the practical larger-model candidate, with five-beam decoding, explicit English and no command/confirmation prompt bias.
- Actual Chrome test on small.en: recorded 3.6 seconds, nonquiet signal, one finalized Read the form voice frame after release, no invented confidence. Microphone selector populated three entries including default. Installed output choices: Microsoft David, Mark and Zira.
- Automated suite: 126 files / 1315 tests passed, 16 files / 28 tests skipped. Typecheck passed. Final focused HTTP metadata check passed (four tests) after the model-selection refinement. Output voice selection preserves the rate and voice of an active item and changes only the next item.

## Changes

- Prefer installed small.en; keep base.en as the explicit small-runtime fallback, with BLIP_STT_MODEL allowing controlled comparisons. Installer defaults to small.en with pinned hashes.
- Expose microphone selection, live level/quiet/clipping feedback and recorded duration/level summary. Disable automatic gain pumping; filtering can be toggled for direct comparison. No device IDs or recordings are logged.
- Distinguish changed page/connection and busy inference from a generic recognition error.
- Add installed English output voice selection while preserving the working speed controls and tracked speech queue. No external voice extension or cloud service installed.

## Resolution

Root cause: Not yet established for the user's physical microphone.
Status: Implementation and synthetic regression checks pass; actual user accuracy remains unverified. Do not mark this debug session resolved or Phase 4 complete from synthetic tests.
Last known runtime before this follow-up: b6de2d3-2026-10-18T05:58:58.810Z, tool session 32329. Demo reported local small.en, global hold ready, extension and voice connected, DEMO_READY. Selectable output voices are restricted to local English voices; the final voice-selection regression passed five tests. Current physical microphone evidence remains pending.
Research: ../workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-ACCURACY-RESEARCH.md

## Latest implementation follow-up — 2026-10-18

- The current rebuilt voice page now offers a five-second local recognition check. It transcribes through the local loopback Whisper endpoint and displays the words without sending an utterance to the dialogue runner or action gate.
- The live level meter now reports a 200 ms aggregate instead of one render block. Capture summaries include the effective channel count, source/context sample rates, echo cancellation, noise suppression, and automatic gain control from `MediaStreamTrack.getSettings()`; no device ID, raw audio, or transcript is written to diagnostics.
- AudioWorklet now mixes every input channel to mono rather than taking only `inputs[0][0]`. This fixes a code-level loss risk, but there is no evidence yet that the user's selected microphone returns multiple channels.
- Echo cancellation, noise suppression, and automatic gain are now independent controls. Automatic gain starts enabled; a real capture can compare each setting. Final captions remain visible for eight seconds.
- The repository still contains an older public voice client that uses Chrome `SpeechRecognition`. The current built page identifies local Whisper in its microphone panel. Confirm the current page/build before attributing behavior to Chrome's recognition service.
- Root cause remains unconfirmed. TypeScript typecheck and the production voice build pass. No physical microphone capture has been supplied or performed, so do not mark recognition accuracy resolved based on these changes or synthetic coverage.
