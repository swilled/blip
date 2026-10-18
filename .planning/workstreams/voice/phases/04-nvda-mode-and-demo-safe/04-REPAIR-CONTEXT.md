# Phase 4 repair context

User request: “Plan all of the fixes Ive asked using deep research and utlize any existing repositories to confirm”.

This supplement is authoritative for repair plans 04-04 through 04-08. Existing plans 04-01 through 04-03 and their implementation history remain intact.

## Required outcomes

- Speech capture works through the hold button and Right Ctrl + Space, including complete multiword commands and pauses.
- Capture cannot silently end merely because a browser recognition session ended.
- Actual microphone/service failures get distinct, actionable messages; Ready/Listening reflects observed lifecycle.
- Faster/slower produces audible changes and normal speech still works after repeated adjustments.
- Blip consistently opens the current built UI in Chrome using the correct isolated voice profile; restarting/reopening is easy.
- Previously verified form reading, field filling/echo, required fields, cancellation, injection warning, and exact-phrase submission continue working.
- Phase 4 completion still requires the existing human rehearsal, NVDA/fallback disposition, video, and freeze evidence.

## Design updates

- Supersede the old one-start-per-press/no-restart assumption with one logical command per physical hold. Browser recognition sessions may recover within that hold, no faster than once per second, with generation-scoped cleanup.
- User instruction supersedes the initial 10-second watchdog decision: do not end capture on a fixed hold duration. End only when the user releases the button, or releases both Right Ctrl and Space. Device loss, cancellation, replacement, and capture/flush failure still discard incomplete audio; no partial utterance may execute.
- Supersede D-05's original 0.8–1.5 linear steps, and the later unverified 0.5–2.0 linear-step patch, with source-informed presets 0.50, 0.63, 0.79, 1.00, 1.26, 1.59, 2.00. Both controls and exact voice commands share them. Device validation decides whether the selected voice makes those levels useful.
- D-06 means one rate snapshot for the whole logical speech item, including every sentence. An active item finishes at its existing rate; queued items use the newly selected rate.
- No fuzzy confirmation matching, no global “forum” -> “form” text replacement, and no execution of interim speech. A read-only command alias is optional only if an actual full final transcript demonstrates that particular misrecognition; it cannot alter values or confirm phrases.
- Route audible rate acknowledgements through ordinary server speech tracking using the already-existing optional settings.rate. Do not add an external STT/TTS service or dependency as the first repair.
- Diagnostic capture is opt-in, bounded, and value-free. A microphone check is an explicit action and releases any temporary tracks.
- Respect the native application's permission prompts. Do not edit Chrome preference files, disable browser safeguards, or promise background capture until observed on this workstation.
- Before implementing 04-05, reconcile the dirty stt.ts draft and update its tests. It must not be staged as a finished fix by the documentation/planning commit.

## Review contract

No code tests or live audio checks were run during planning. The plan review is inline plus deterministic GSD checks; no independent agent-checker pass is claimed. All runtime success criteria remain pending.
