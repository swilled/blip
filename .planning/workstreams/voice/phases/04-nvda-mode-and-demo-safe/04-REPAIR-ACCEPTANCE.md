# Voice repair acceptance — 2026-10-18

Automated checks passed. The user reports microphone input and faster/slower speech are working; the live Microsoft Forms required-field check also passed on the updated build. Diagnostic traces and quantitative rate timings were not retained, so those measurement-specific checks remain open. Stop at the first failed step and report its message; typing does not count as a microphone pass.

**Current input update:** recognition now uses local whisper.cpp base.en; Chrome only records raw microphone audio through AudioWorklet. Read [04-LOCAL-STT-DECISION.md](04-LOCAL-STT-DECISION.md) for sources and actual native/browser tests. If setup is missing on another machine, run `npm.cmd run stt:setup` once. Hold through the whole phrase, release, then allow about a second for the final transcript; partial captions and Chrome recognition-service recovery messages are no longer expected on this path. There is no fixed ten-second hold cap: capture ends when the user releases the hold control, or releases both Right Ctrl and Space.

## Start or reopen

From `C:\Users\befit\Documents\formvoice`, use `npm.cmd run demo -- --brain=fake`. If a demo is already running, stop its terminal with Ctrl+C first. To reopen the same current demo without resetting the form, use `npm.cmd run demo -- --reopen-voice`. A build mismatch requires a restart. The launcher locates Chrome and uses `.chrome-profile/demo` for the form and `.chrome-profile/demo-voice` for Blip; no AppData directory selection is needed. If extension setup is requested, load unpacked from `apps\extension\dist` in the form's dedicated Chrome profile.

Open Speech troubleshooting in Blip and leave it open during each check. It displays the build and a bounded event trace containing timing, error categories, rates and voice names, without transcripts or form values. Copy the trace when requested; the executor calculates durations, so no stopwatch is needed. Closing troubleshooting clears the trace. Save each sample group before later events replace the oldest 100 rows.

## One check at a time

1. Click **Check microphone**, allowing access if prompted. This opens and immediately releases the device; it does not prove recognition-service access. To recover a denial, use the site controls beside Blip's address, allow Microphone for `http://127.0.0.1:7777`, and reload Blip. Also check Chrome Settings → Privacy and security → Site settings → Microphone in this voice profile and Windows Settings → Privacy & security → Microphone. Hold **Hold to talk**, wait for the listening cue, say **read the form**, then release. Expect Starting → Listening (or Recovering during a browser restart) → Finalizing after release, followed by the complete final phrase. Repeat for five successful fresh holds. With the form focused, repeat five times using **Right Ctrl + Space**, releasing both keys between attempts. The shortcut should remain active for as long as both keys are held; releasing either key alone must not end the hold. A service/network error is distinct from silence or microphone denial.
2. On a fresh hold say **Name is Rowan Example from the fictional development team**, including a brief pause after Example. Inspect the complete caption and no text carried from the preceding hold. A page/intent refusal is separate from recognition completeness. Use fictional data only.
3. With **Blip voice** selected, retain one unchanged normal spoken response of about twenty words and use **Repeat** for consistent slow/default/fast samples. Record its actual fixed text/word count and any departure from the plan's twenty-word target. Wait for each rate acknowledgement and current reply to finish; the next item takes the new rate. Compare three samples at 0.50, 1.00 and 2.00. Copy each group's synth-start/end events, rate and selected voice. Sum matching native-generation durations per logical sample, calculate the three medians and listen for the same ordering. Fast must be at least 20% shorter than slow. Numeric UI changes alone are insufficient.
4. Make twenty alternating Faster/Slower selections, then ask **what's required**. Confirm speech still works. Check a microphone-denial/recovery or recognition-service failure message once, then a successful fresh hold; restore permission afterward. Capture the trace/category and any error.
5. In the form-profile tab, replace the address with the [team-owned Microsoft Form](https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAARkYjixUQ1JLWkRTT1lMVVYyTUxSOFRaQ1EySzhNSi4u). Click Start now if shown. Ask **where am I**, **what's required**, then **continue**. Compare the current visible required markers and labels: Employment type, Department, Leave type, Leave date, Return date. No Other answer or control-type suffix should be treated as a required question. Do not submit the public form during this repair check.

**Live result (2026-10-18):** On the restarted updated demo build `67114f9-dirty-2026-10-18T07:00:58.786Z`, the user confirmed that Blip listed exactly Employment type, Department, Leave type, Leave date, and Return date as required, and excluded optional questions. No public-form submission was attempted. This closes the required-field identification subcheck only; Phase 4 validation and three-run submission rehearsal remain pending.
6. Return the form-profile tab to `http://127.0.0.1:7791/demo-form.html` for local gate checks only. Fill fictional required values and arm readback. After it finishes and the one-second guard elapses, **yes** and **submit form** must leave submission blocked. After each reply finishes, use a fresh hold and exact **submit survey**: exactly one observed local success must result. Repeat only with a reset (`npm.cmd run reset -w @blip/mock-server`). Check cancel clears the prompt, an edit invalidates it, reload/reset is empty, and `/injection.html` warns then describes with no gate or requested action. Never count a phrase-received acknowledgement as proof of submission.

## Automated evidence and launch

- Code boundary: 50987aa; root regression ran at c704af1 with the same implementation. Command: `npm.cmd test` — **123 files / 1,298 tests passed; 16 files / 28 tests skipped**. Skipped opt-in E2Es were not executed.
- `npm.cmd run typecheck` — passed. `npm.cmd run build --workspace @blip/voice` — passed; first build `c704af1-2026-10-18T05:22:42.608Z`.
- Updated demo launched from 8151ed9: build **8151ed9-2026-10-18T05:23:13.854Z**, fake brain, native global hook ready. Launcher reported extension-connected, voice-connected and DEMO_READY. This is startup evidence only.
- No browser automation surface is connected to this session. Human event-trace copies and microphone/speaker observations are required for measurements; no live hardware result is inferred.

## Device evidence ledger

| Check | Evidence | Result |
| --- | --- | --- |
| Browser/version and selected voice | Pending user/device trace | Pending |
| Microphone permission check | Pending explicit device result | Pending |
| Button / global hold | User reports microphone input works; per-route five-trial transcript/timing trace not retained | User-reported working; detailed counts pending |
| Longer paused phrase | Complete final text; no cross-hold carry | Pending |
| Fixed sample / rates | User reports faster/slower changes work; fixed sample and three-level durations/medians not retained | Audible behavior user-reported; quantitative comparison pending |
| Twenty adjustments | Next normal reply audible | Pending |
| Error and recovery | Correct category, fresh successful hold | Pending |
| Microsoft Form required fields | Current required labels/order/batches | PASS — user confirmed the exact five labels and no optional fields; no submission attempted |
| Local gate / edit / cancel / injection | Exact phrase once, all negative cases zero | Pending |

Original Phase 4 milestone evidence remains separate: NVDA exact completion/cancellation or explicit D-16 disposition, three consecutive user-led public-form runs, fallback/hotspot rehearsal, recorder/video review and freeze acceptance. No demo-safe tag or completed phase is authorized by these software checks.
