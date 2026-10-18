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
Research: ../workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-ACCURACY-RESEARCH.md
